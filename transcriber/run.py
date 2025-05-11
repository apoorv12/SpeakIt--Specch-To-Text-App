#!/usr/bin/env python3
import sys
import os
import traceback

# faster-whisper is installed globally, no need to modify sys.path

# Add error handling wrapper to make script more robust
def safe_transcribe(audio_path):
    """
    Safely attempts to transcribe audio using the Parakeet model
    with robust error handling.
    """
    try:
        # Check if the file exists and has content
        if not os.path.exists(audio_path):
            print("Error: Audio file not found.")
            return False
        
        if os.path.getsize(audio_path) == 0:
            print("Error: Audio file is empty.")
            return False
        
        # Import necessary libraries for transcription
        try:
            # Try importing faster-whisper as an alternative to NeMo
            from faster_whisper import WhisperModel
        except ImportError:
            print("Error: faster-whisper package not found. Please install it using: uv pip install faster-whisper", file=sys.stderr)
            sys.exit(1)

        # Load ASR model
        try:
            print("Loading Whisper model...", file=sys.stderr)
            model = WhisperModel("base", device="cpu", compute_type="int8")
            print("ASR model loaded successfully.", file=sys.stderr)
        except Exception as e:
            print(f"Error loading ASR model: {e}")
            traceback.print_exc(file=sys.stderr)
            return False
        
        # Perform transcription
        try:
            print(f"Transcribing audio file: {audio_path}", file=sys.stderr)
            segments, info = model.transcribe(audio_path, beam_size=5)
            
            # Collect all segments into final text
            final_text = " ".join([segment.text for segment in segments]).strip()
            
            if not final_text:
                print("Warning: Transcription yielded empty result.", file=sys.stderr)
                return False
            
            # Print the final result to stdout
            print(final_text)
            return True
            
        except Exception as e:
            print(f"Error during transcription: {e}")
            traceback.print_exc(file=sys.stderr)
            return False
            
    except Exception as e:
        print(f"Unexpected error: {e}")
        traceback.print_exc(file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python run.py [audio_file_path]")
        sys.exit(1)
        
    audio_path = sys.argv[1]
    success = safe_transcribe(audio_path)
    
    if not success:
        # If transcription fails, provide a fallback message
        print("I couldn't transcribe the audio. Please try again with clearer speech.")
        sys.exit(1)
