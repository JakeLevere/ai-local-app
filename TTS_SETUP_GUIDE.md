# TTS (Text-to-Speech) Setup & Troubleshooting Guide

## Current Status
The TTS system is set up and ready, but currently using browser fallback because no ElevenLabs API key is configured.

## Setup Options

### Option 1: Use ElevenLabs TTS (Recommended for quality)
1. **Get an API Key:**
   - Sign up at https://elevenlabs.io
   - Go to your profile settings
   - Copy your API key

2. **Configure the API Key:**
   Add to your `.env` file:
   ```
   ELEVENLABS_API_KEY=your_api_key_here
   ```

3. **Optional: Set Default Voice:**
   Add to your `.env` file (optional):
   ```
   ELEVENLABS_DEFAULT_VOICE_ID=rachel
   ```
   
   Available voices:
   - `rachel` - Calm female (default)
   - `drew` - Well-rounded male
   - `domi` - Strong female
   - `bella` - Soft female
   - `antoni` - Well-rounded male
   - `elli` - Emotional female
   - `josh` - Young male
   - `arnold` - Crisp male
   - `adam` - Deep male
   - `sam` - Raspy male

### Option 2: Use Browser TTS (No API needed)
The app will automatically fall back to browser-based TTS if no ElevenLabs API key is configured. This works but with lower quality.

## How Auto-Play Works

When configured correctly, the persona will automatically speak responses:

1. User sends a message
2. AI generates a response
3. Backend automatically generates TTS audio
4. Audio is sent to the frontend
5. If "Auto-speak responses" is enabled, audio plays automatically

## Troubleshooting

### TTS Not Working Checklist

1. **Check Environment Variables:**
   ```bash
   node test-tts-debug.js
   ```
   This will show if your API key is configured.

2. **Check Auto-Speak Setting:**
   - Click the speaker icon (🔊) in the chat interface
   - Ensure "Auto-speak responses" is checked

3. **Check Browser Console:**
   - Open Developer Tools (F12)
   - Look for messages starting with `[TTS]`
   - Should see:
     ```
     [TTS] Received auto-play-tts event: ...
     [TTS] Auto-playing response from backend
     ```

4. **Reset TTS Preferences:**
   If settings are corrupted, open `reset-tts-prefs.html` in your browser to reset.

### Common Issues

#### Issue: "No sound when persona responds"
**Solutions:**
- Check if ElevenLabs API key is set in `.env`
- Verify "Auto-speak responses" is enabled in TTS settings
- Check browser audio permissions
- Check system volume/audio output

#### Issue: "TTS buttons not appearing"
**Solutions:**
- Enable "Enable TTS buttons" in TTS settings
- Refresh the page

#### Issue: "Browser TTS instead of ElevenLabs"
**Solutions:**
- Add `ELEVENLABS_API_KEY` to `.env` file
- Restart the app after adding the key
- Check API key is valid and has credits

## Testing TTS

### Quick Test
1. Run the test script:
   ```bash
   node test-tts-debug.js
   ```

2. In the app, click the speaker icon and click "Test Voice"

### Manual Test in Chat
1. Send a message to the persona
2. Watch for the auto-play indicator
3. Check if audio plays automatically

## File Locations

- **TTS Service:** `services/ttsService.js`
- **Frontend Handler:** `ttsUIHandler.js`
- **IPC Handlers:** `ipcHandlers.js` (lines 126-137 for auto-play)
- **Environment Config:** `.env`

## Debug Logging

To enable detailed TTS logging, the system already includes debug statements. Check:
- Backend console for `[TTS Service]` and `[IPC]` messages
- Frontend console for `[TTS]` messages

## Current Configuration

Based on the latest test:
- **Provider:** Browser (fallback)
- **API Key:** Not configured
- **Default Voice:** rachel
- **Auto-speak:** Enabled by default

To use high-quality ElevenLabs voices, add your API key to the `.env` file and restart the app.
