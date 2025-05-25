const { app, globalShortcut, BrowserWindow, clipboard, ipcMain, screen, systemPreferences } = require('electron');
const path = require('path');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const mic = require('mic');

// Get paths for packaged app
const getResourcePath = (relativePath) => {
    if (app.isPackaged) {
        // In a packaged app, 'extraResources' (like 'transcriber') are
        // copied to 'process.resourcesPath' (e.g., YourApp.app/Contents/Resources)
        return path.join(process.resourcesPath, relativePath);
    } else {
        // In development mode (e.g., running with 'electron .' or 'pnpm dlx electron .'),
        // 'app.getAppPath()' returns the path to the application's current directory,
        // which should be your project root.
        return path.join(app.getAppPath(), relativePath);
    }
};

const getUserDataPath = (filename) => {
    return path.join(app.getPath('userData'), filename);
};

// Configuration
const MAX_RECORDING_TIME = 2700; // Maximum recording time in seconds (45 minutes)
const AUTO_HIDE_DELAY = 3000; // Time in ms to auto-hide after transcription

// Application state
let win;
let isRecording = false;
let micInstance = null;
let recordingTimeout = null;
let previousApp = null;

function createWindow() {
    // Get the screen dimensions for proper positioning
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    win = new BrowserWindow({
        width: 300,
        height: 300,
        x: width - 320, // Position near the top right corner
        y: 40,
        frame: false,
        transparent: true,
        show: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile('index.html');

    // Hide window when it loses focus (unless in recording mode)
    win.on('blur', () => {
        if (!isRecording) {
            win.hide();
        }
    });

    // Handle IPC messages from renderer
    ipcMain.on('hide-window', () => {
        win.hide();
    });

    // Handle manual stop recording request
    ipcMain.on('stop-recording', () => {
        console.log('Manual stop recording requested');
        if (isRecording) {
            console.log('Recording in progress, stopping...');
            if (micInstance) {
                stopRecording();
            } else {
                console.warn('No active mic instance found');
                clearRecordingState();
            }
        } else {
            console.log('No recording in progress');
        }
    });

    // Handle window errors
    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Window failed to load:', errorDescription);
    });
}

app.whenReady().then(async () => {
    // Request microphone permission on startup
    console.log('App is ready, requesting microphone permission...');
    try {
        const hasPermission = await systemPreferences.askForMediaAccess('microphone');
        console.log('Microphone permission status:', hasPermission ? 'GRANTED' : 'DENIED');
    } catch (err) {
        console.error('Error requesting microphone permission:', err);
    }

    // Create the application window
    createWindow();

    // Register global shortcut
    const registered = globalShortcut.register('Cmd+Shift+Space', () => {
        if (isRecording) {
            console.log('🎙️ Hotkey pressed to STOP recording');
            if (micInstance) {
                stopRecording();
            } else {
                console.warn('Stop requested by shortcut, but no mic instance found.');
                clearRecordingState();
            }
        } else {
            console.log('🎙️ Hotkey pressed to START recording');
            win.show();
            try {
                // Get the name of the frontmost application using AppleScript
                previousApp = execSync('osascript -e "tell application \\"System Events\\" to get name of first application process whose frontmost is true"').toString().trim();
                console.log('Active application:', previousApp);
            } catch (err) {
                console.error('Error getting active application:', err);
                previousApp = '';
            }
            startRecording();
        }
    });

    if (!registered) {
        console.error('Failed to register global shortcut');
    } else {
        console.log('Global shortcut registered successfully');
    }
});
function startRecording() {
    if (isRecording) return;
    console.log('Starting recording process...');

    // Check microphone permission status
    try {
        const hasPermission = systemPreferences.getMediaAccessStatus('microphone');
        console.log('Current microphone permission status:', hasPermission);
    } catch (err) {
        console.error('Error checking microphone permission:', err);
    }

    isRecording = true;

    try {
        console.log('Notifying renderer process...');
        win.webContents.send('recording-started');

        console.log('Creating mic instance...');
        micInstance = mic({
            rate: '16000',
            channels: '1',
            fileType: 'wav'
        });
        console.log('Mic instance created successfully');

        const filePath = getUserDataPath('audio.wav');
        console.log('Audio will be saved to:', filePath);

        // Make sure the directory exists
        if (!fs.existsSync(path.dirname(filePath))) {
            console.log('Creating directory:', path.dirname(filePath));
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
        }

        // Set up error handlers for audio stream
        try {
            console.log('Getting audio stream...');
            const micInput = micInstance.getAudioStream();
            console.log('Audio stream obtained successfully');
            const output = fs.createWriteStream(filePath);

            // Handle microphone errors
            micInput.on('error', (err) => {
                console.error('Microphone Error:', err);
                console.error('Error details:', JSON.stringify(err, null, 2));
                win.webContents.send('error', 'Microphone error');
                clearRecordingState();
            });

            // Handle file write errors
            output.on('error', (err) => {
                console.error('File Write Error:', err);
                console.error('Write Error details:', JSON.stringify(err, null, 2));
                win.webContents.send('error', 'File write error');
                clearRecordingState();
            });

            // Handle file close event
            output.on('close', () => {
                console.log('Output file has been closed');
                console.log('Checking if file exists:', filePath);
                if (fs.existsSync(filePath)) {
                    const stats = fs.statSync(filePath);
                    console.log('File size:', stats.size, 'bytes');
                }
            });

            // Handle microphone close event
            micInput.on('close', () => {
                console.log('Microphone input has been closed');
            });

            console.log('Setting up audio pipe...');
            // Pipe audio data to file
            micInput.pipe(output);
            console.log('Audio pipe setup complete');

            // Start recording
            console.log('Starting mic instance...');
            micInstance.start();
            console.log('Recording started successfully');

            // Set timeout to automatically stop recording after MAX_RECORDING_TIME
            recordingTimeout = setTimeout(() => {
                if (isRecording) {
                    console.log(`Maximum recording time (${MAX_RECORDING_TIME}s) reached`);
                    stopRecording();
                }
            }, MAX_RECORDING_TIME * 1000);

        } catch (err) {
            console.error('Error setting up audio stream:', err);
            win.webContents.send('error', 'Failed to access microphone');
            clearRecordingState();
        }
    } catch (err) {
        console.error('Error in startRecording function:', err);
        win.webContents.send('error', 'Recording initialization failed');
        clearRecordingState();
    }
}

// Function to stop recording and process the audio
function stopRecording() {
    console.log('Stop recording called. Current state:', {
        isRecording,
        hasMicInstance: !!micInstance,
        hasTimeout: !!recordingTimeout
    });

    if (!isRecording || !micInstance) {
        console.log('Cannot stop recording - no active recording or mic instance');
        return;
    }

    try {
        // Clear the automatic timeout if it exists
        if (recordingTimeout) {
            console.log('Clearing recording timeout...');
            clearTimeout(recordingTimeout);
            recordingTimeout = null;
        }

        console.log('Attempting to stop microphone recording...');
        // Stop the microphone recording
        micInstance.stop();
        win.webContents.send('recording-stopped');
        console.log('Recording stopped');

        const filePath = getUserDataPath('audio.wav');

        // Process the audio file after a short delay to ensure it's written
        setTimeout(async () => {
            try {
                await transcribeAndPaste(filePath);
                // Only clear recording state after transcription is complete
                clearRecordingState();
            } catch (err) {
                console.error('Error in transcription:', err);
                win.webContents.send('error', 'Transcription failed');
                clearRecordingState();
            }
        }, 500);
    } catch (err) {
        console.error('Error stopping recording:', err);
        win.webContents.send('error', 'Failed to stop recording');
        clearRecordingState();
    }
}

// Helper function to clear recording state
function clearRecordingState() {
    isRecording = false;
    micInstance = null;
    if (recordingTimeout) {
        clearTimeout(recordingTimeout);
        recordingTimeout = null;
    }
}
async function transcribeAndPaste(audioFilePath) {
    return new Promise((resolve, reject) => {
        try {
            // Check if file exists and has content
            if (!fs.existsSync(audioFilePath)) {
                console.error('Audio file does not exist');
                win.webContents.send('error', 'No audio recorded');
                reject(new Error('Audio file does not exist'));
                return;
            }

            const stats = fs.statSync(audioFilePath);
            if (stats.size === 0) {
                console.error('Audio file is empty');
                win.webContents.send('error', 'Empty audio recording');
                reject(new Error('Empty audio recording'));
                return;
            }

            // Run transcription using Python and the Parakeet model
            console.log('Transcribing audio...');
            
            // Use the full path to the Python interpreter
            const pythonScript = getResourcePath('transcriber/run.py');
            const modelScript = `python3 "${pythonScript}" "${audioFilePath}"`;
            console.log('Executing Python script:', modelScript); // Log the exact command

            // Use exec instead of execSync for better error handling
            exec(modelScript, async (error, stdout, stderr) => {
                // Always log both stdout and stderr
                console.log('Python stdout:', stdout);
                if (stderr) {
                    console.warn('Python stderr:', stderr);
                }

                if (error) {
                    console.error('Transcription exec error:', error);
                    win.webContents.send('error', 'Transcription failed');
                    reject(error);
                    return;
                }

                // Process successful transcription
                const text = stdout.trim();
                processTranscriptionResult(text);

                // Cleanup audio file after successful transcription
                try {
                    fs.unlinkSync(audioFilePath);
                    console.log('Cleaned up audio file');
                } catch (err) {
                    console.warn('Failed to cleanup audio file:', err);
                }

                resolve();
            });
        } catch (err) {
            console.error('Error in transcription process:', err);
            win.webContents.send('error', 'Processing error');
            reject(err);
        }
    });
}

// Helper function to process the transcription result
function processTranscriptionResult(text) {
    console.log('📝 Transcribed:', text);

    if (!text) {
        console.warn('Transcription is empty');
        win.webContents.send('error', 'No speech detected');
        return;
    }

    // Send transcription to renderer for display
    win.webContents.send('transcription-complete', text);

    // Copy to clipboard
    clipboard.writeText(text);

    // Paste using AppleScript (macOS specific) and handle window cleanup
    pasteTextToApp(text, previousApp)
        .then(() => {
            // Hide window after successful paste
            win.hide();
        })
        .catch(err => {
            console.error('Error during paste operation:', err);
            win.webContents.send('error', 'Paste failed');
            // Still hide the window after error
            setTimeout(() => win.hide(), 2000);
        });
}

async function pasteTextToApp(text, previousApp) {
    // Reset recording state immediately
    isRecording = false;

    return new Promise(async (resolve, reject) => {
        try {
            // Re-activate the previous application if known
            if (previousApp && previousApp.toLowerCase() !== 'speakit') {
                try {
                    const activateScript = `osascript -e 'tell application "${previousApp}" to activate'`;
                    execSync(activateScript);
                    console.log(`Activated previous app: ${previousApp}`);
                } catch (err) {
                    console.error('Error activating previous app:', err);
                    reject(err);
                    return;
                }
            }

            // Wait briefly for app to focus
            await new Promise(resolve => setTimeout(resolve, 300)); // Wait for app to focus

            // Execute paste command via AppleScript
            try {
                const pasteScript = `osascript -e 'tell application "System Events" to keystroke "v" using command down'`;
                execSync(pasteScript);
                console.log('Paste command executed successfully');
                resolve();
            } catch (err) {
                console.error('Error executing paste command:', err);
                reject(err);
            }
        } catch (err) {
            console.error('Error in paste function:', err);
            reject(err);
        }
    });
}

// Cleanup when app is about to quit
app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    console.log('Unregistered all shortcuts');
});

// macOS specific window behavior
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Handle uncaught exceptions to prevent crashes
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});
