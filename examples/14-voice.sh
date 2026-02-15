#!/bin/bash
# Example 14: Voice (Real-Time Speech Translation)
# Translate audio files using the DeepL Voice API with WebSocket streaming

set -e

echo "=== DeepL CLI Example 14: Voice ==="
echo

# Check if API key is configured
if ! deepl auth show &>/dev/null; then
  echo "Error: API key not configured"
  echo "Run: deepl auth set-key YOUR_API_KEY"
  exit 1
fi

echo "API key configured"
echo

# Note: Voice API requires a DeepL Pro account with Voice API access.
# These examples show the command syntax; they will fail without
# a valid audio file and Voice API access.

# 1. Basic audio translation
echo "1. Basic audio translation"
echo "   Translate an OGG audio file to German:"
echo "   deepl voice recording.ogg --to de"
echo
echo "   The Voice API auto-detects the source language and audio format"
echo "   from the file extension."
echo

# 2. Multiple target languages
echo "2. Multiple target languages (up to 5)"
echo "   deepl voice meeting.mp3 --to es,fr,de"
echo
echo "   Each target language produces a separate translation stream."
echo

# 3. Specify source language
echo "3. Explicit source language"
echo "   deepl voice audio.flac --to ja --from en"
echo
echo "   Setting --from skips auto-detection, which can reduce latency."
echo

# 4. Formality control
echo "4. Formality level"
echo "   deepl voice speech.ogg --to de --formality formal"
echo
echo "   Options: default, formal, more, informal, less"
echo

# 5. Source language detection mode
echo "5. Source language detection mode"
echo "   deepl voice audio.flac --to ja --from en --source-language-mode fixed"
echo
echo "   Modes: auto (default), fixed. Use 'fixed' with --from to skip"
echo "   auto-detection entirely, reducing latency for known source languages."
echo

# 6. Reading from stdin with explicit content type
echo "6. Pipe audio from stdin"
echo "   cat audio.pcm | deepl voice - --to es --content-type 'audio/pcm;encoding=s16le;rate=16000'"
echo
echo "   When reading from stdin, --content-type is required because there"
echo "   is no file extension to auto-detect from."
echo

# 7. Collect output (non-streaming mode)
echo "7. Collect all output at end (non-streaming)"
echo "   deepl voice speech.ogg --to de --no-stream"
echo
echo "   By default, translations are printed as they arrive. Use --no-stream"
echo "   to buffer all output and print once the file is fully processed."
echo

# 8. JSON output format
echo "8. JSON output format for scripting"
echo "   deepl voice speech.ogg --to de --format json"
echo
echo "   JSON output includes timestamps and metadata per segment."
echo

# 9. Chunk size and interval tuning
echo "9. Tuning chunk parameters"
echo "   deepl voice large-file.ogg --to de --chunk-size 12800 --chunk-interval 100"
echo
echo "   Larger chunks reduce overhead; smaller intervals provide faster streaming."
echo "   Defaults: --chunk-size 6400, --chunk-interval 200"
echo

# 10. Glossary support
echo "10. Using a glossary with voice translation"
echo "   deepl voice speech.ogg --to de --glossary GLOSSARY_ID"
echo
echo "   Get glossary IDs from: deepl glossary list"
echo

# 11. Reconnection control
echo "11. Controlling reconnection behavior"
echo "    deepl voice speech.ogg --to de --no-reconnect"
echo "    deepl voice speech.ogg --to de --max-reconnect-attempts 5"
echo
echo "    By default, the CLI reconnects up to 3 times on WebSocket drops."
echo

# Supported audio formats
echo "Supported audio formats:"
echo "  - OGG (Opus, FLAC codecs)"
echo "  - WebM (Opus codec)"
echo "  - Matroska/MKA (AAC, FLAC, MP3, Opus codecs)"
echo "  - FLAC"
echo "  - MP3"
echo "  - Raw PCM (requires --content-type)"
echo

echo "=== All examples completed successfully! ==="
