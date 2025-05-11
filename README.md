# SpeakIt

A speech-to-text application for macOS enabling quick transcription via a global hotkey.

## Features

- Global hotkey (`Cmd+Shift+Space`) to toggle recording.
- Audio recording (up to 3 minutes).
- Transcription using `faster-whisper`.
- Automatic pasting of transcribed text into the previously active application.
- User interface for recording status.

## Usage

1.  Ensure all prerequisites are installed and set up.
2.  Run the application.
3.  Press `Cmd+Shift+Space` to start recording. The application window will appear briefly.
4.  Speak.
5.  Press `Cmd+Shift+Space` again to stop recording. The audio will be transcribed, and the text will be pasted into the application that was active when you started recording.

## Prerequisites/Setup (for Development)

- **Node.js and pnpm:** For the Electron application. Install pnpm if you haven't: `npm install -g pnpm`.
- **Python 3:** For the transcription backend.
- **uv:** For Python package management (see [astral.sh/uv](https://astral.sh/uv)).
- **Python Dependencies:**
  - The primary Python dependency is `faster-whisper`.
  - Navigate to the `transcriber` directory.
  - Install dependencies using `uv pip install .` (this will use the `transcriber/pyproject.toml` file).
- **Python Interpreter Path:** The application currently uses `/opt/homebrew/bin/python3` to run the transcription script (see [`main.js`](main.js:317)). If your Python 3 installation is elsewhere, you may need to adjust this path in `main.js`.

## Running the Application (Development)

1.  Install Node.js dependencies:
    ```bash
    pnpm install
    ```
2.  Ensure Python dependencies are installed (see Prerequisites).
3.  Start the application:
    ```bash
    pnpm dlx electron .
    ```

## Building the Application

To create a distributable application package:

```bash
pnpm build
```

This uses `electron-builder` as configured in [`package.json`](package.json).
