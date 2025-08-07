// TTS Service with ElevenLabs and browser fallback
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const https = require('https');

// Try to get Electron app, but don't fail if not in Electron environment
let app;
try {
    app = require('electron').app;
} catch (e) {
    // Not in Electron environment
    app = null;
}

class TTSService {
    constructor() {
        this.elevenLabsApiKey = null;
        this.tempDir = null;
        this.isInitialized = false;
        this.currentProvider = 'elevenlabs'; // 'elevenlabs' or 'browser'
        
        // ElevenLabs voice IDs mapping
        this.voiceMap = {
            'rachel': '21m00Tcm4TlvDq8ikWAM', // Rachel - calm female
            'drew': '29vD33N1CtxCmqQRPOHJ', // Drew - well-rounded male
            'domi': 'AZnzlk1XvdvUeBnXmlld', // Domi - strong female
            'bella': 'EXAVITQu4vr4xnSDxMaL', // Bella - soft female
            'antoni': 'ErXwobaYiN019PkySvjV', // Antoni - well-rounded male
            'elli': 'MF3mGyEYCl7XYWbV9V6O', // Elli - emotional female
            'josh': 'TxGEqnHWrfWFTfGW9XjX', // Josh - young male
            'arnold': 'VR6AewLTigWG4xSOukaG', // Arnold - crisp male
            'adam': 'pNInz6obpgDQGcFmaJgB', // Adam - deep male
            'sam': 'yoZ06aMxZJJ28mfd3POQ' // Sam - raspy male
        };
        
        // Get default voice from environment or use rachel
        const defaultVoiceId = process.env.ELEVENLABS_DEFAULT_VOICE_ID;
        let defaultVoiceName = 'rachel';
        let defaultVoiceIdToUse = this.voiceMap['rachel'];
        
        if (defaultVoiceId) {
            // Check if it's a known voice name
            if (this.voiceMap[defaultVoiceId]) {
                defaultVoiceName = defaultVoiceId;
                defaultVoiceIdToUse = this.voiceMap[defaultVoiceId];
            } else {
                // Use it as a direct voice ID
                defaultVoiceIdToUse = defaultVoiceId;
                // Try to find the name
                const foundName = Object.keys(this.voiceMap).find(k => this.voiceMap[k] === defaultVoiceId);
                defaultVoiceName = foundName || 'custom';
            }
        }
        
        this.voiceSettings = {
            voiceId: defaultVoiceIdToUse,
            voiceName: defaultVoiceName,
            modelId: 'eleven_monolingual_v1', // or 'eleven_multilingual_v2'
            stability: 0.5,
            similarityBoost: 0.75,
            style: 0.0, // Only for v2 models
            useSpeakerBoost: true
        };
        
        console.log('[TTS Service] Voice configuration:');
        console.log('  - Voice ID:', this.voiceSettings.voiceId);
        console.log('  - Voice Name:', this.voiceSettings.voiceName);
        console.log('  - From ENV:', defaultVoiceId || 'Not set');
    }

    async initialize() {
        if (this.isInitialized) return;

        // Set up temp directory for audio files
        const tempBase = app ? app.getPath('temp') : os.tmpdir();
        this.tempDir = path.join(tempBase, 'tts-audio');
        await fs.mkdir(this.tempDir, { recursive: true });

        // Initialize ElevenLabs if API key is available
        this.elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
        if (this.elevenLabsApiKey) {
            this.currentProvider = 'elevenlabs';
            console.log('[TTS Service] Initialized with ElevenLabs provider');
        } else {
            console.log('[TTS Service] No ElevenLabs API key, using browser fallback');
            this.currentProvider = 'browser';
        }

        this.isInitialized = true;
    }

    async speak(text, options = {}) {
        await this.initialize();

        const settings = {
            ...this.voiceSettings,
            ...options
        };

        if (this.currentProvider === 'elevenlabs') {
            return await this.speakWithElevenLabs(text, settings);
        } else {
            return await this.speakWithBrowser(text, settings);
        }
    }

    async speakWithElevenLabs(text, settings) {
        if (!this.elevenLabsApiKey) {
            console.warn('[TTS Service] ElevenLabs API key not available, falling back to browser');
            return await this.speakWithBrowser(text, settings);
        }

        return new Promise((resolve, reject) => {
            const voiceId = settings.voiceId || this.voiceSettings.voiceId;
            const modelId = settings.modelId || this.voiceSettings.modelId;
            
            console.log('[TTS Service] Making ElevenLabs API request with voice ID:', voiceId);
            
            const postData = JSON.stringify({
                text: text,
                model_id: modelId,
                voice_settings: {
                    stability: settings.stability || this.voiceSettings.stability,
                    similarity_boost: settings.similarityBoost || this.voiceSettings.similarityBoost,
                    style: settings.style || this.voiceSettings.style,
                    use_speaker_boost: settings.useSpeakerBoost !== undefined ? settings.useSpeakerBoost : this.voiceSettings.useSpeakerBoost
                }
            });

            const options = {
                hostname: 'api.elevenlabs.io',
                path: `/v1/text-to-speech/${voiceId}`,
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg',
                    'Content-Type': 'application/json',
                    'xi-api-key': this.elevenLabsApiKey,
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const filename = `speech_${Date.now()}.mp3`;
            const filepath = path.join(this.tempDir, filename);
            const chunks = [];

            const req = https.request(options, (res) => {
                if (res.statusCode !== 200) {
                    let errorBody = '';
                    res.on('data', chunk => errorBody += chunk);
                    res.on('end', () => {
                        console.error(`[TTS Service] ElevenLabs API error (${res.statusCode}):`, errorBody);
                        // Fallback to browser
                        resolve(this.speakWithBrowser(text, settings));
                    });
                    return;
                }

                res.on('data', chunk => chunks.push(chunk));
                res.on('end', async () => {
                    try {
                        const buffer = Buffer.concat(chunks);
                        await fs.writeFile(filepath, buffer);
                        
                        resolve({
                            provider: 'elevenlabs',
                            filepath: filepath,
                            text: text,
                            voice: settings.voiceName || this.voiceSettings.voiceName,
                            duration: this.estimateDuration(text)
                        });
                    } catch (error) {
                        console.error('[TTS Service] Failed to save audio file:', error);
                        // Fallback to browser
                        resolve(this.speakWithBrowser(text, settings));
                    }
                });
            });

            req.on('error', (error) => {
                console.error('[TTS Service] ElevenLabs request failed:', error);
                // Fallback to browser
                resolve(this.speakWithBrowser(text, settings));
            });

            req.write(postData);
            req.end();
        });
    }

    async speakWithBrowser(text, settings) {
        // Return instructions for browser-side speech synthesis
        return {
            provider: 'browser',
            text: text,
            voice: settings.browserVoice || null,
            rate: settings.speed || 1.0,
            pitch: settings.pitch || 1.0,
            volume: settings.volume || 1.0,
            duration: this.estimateDuration(text, settings.speed)
        };
    }

    estimateDuration(text, speed = 1.0) {
        // Rough estimate: 150 words per minute at normal speed
        const words = text.split(/\s+/).length;
        const baseMinutes = words / 150;
        const adjustedMinutes = baseMinutes / speed;
        return Math.ceil(adjustedMinutes * 60 * 1000); // Return in milliseconds
    }

    async cleanup() {
        // Clean up old temp files
        if (!this.tempDir) return;

        try {
            const files = await fs.readdir(this.tempDir);
            const now = Date.now();
            const maxAge = 60 * 60 * 1000; // 1 hour

            for (const file of files) {
                const filepath = path.join(this.tempDir, file);
                const stats = await fs.stat(filepath);
                if (now - stats.mtimeMs > maxAge) {
                    await fs.unlink(filepath).catch(() => {});
                }
            }
        } catch (error) {
            console.error('[TTS Service] Cleanup error:', error);
        }
    }

    setVoice(voice) {
        // Accept either voice name or voice ID
        if (this.voiceMap[voice]) {
            this.voiceSettings.voiceName = voice;
            this.voiceSettings.voiceId = this.voiceMap[voice];
        } else if (Object.values(this.voiceMap).includes(voice)) {
            // Direct voice ID provided
            this.voiceSettings.voiceId = voice;
            // Find the name for this ID
            const name = Object.keys(this.voiceMap).find(k => this.voiceMap[k] === voice);
            this.voiceSettings.voiceName = name || 'custom';
        } else {
            // Custom voice ID
            this.voiceSettings.voiceId = voice;
            this.voiceSettings.voiceName = 'custom';
        }
    }

    setSpeed(speed) {
        // For ElevenLabs, speed is controlled by the model and voice settings
        // For browser TTS, this would control the rate
        this.voiceSettings.speed = Math.max(0.1, Math.min(10, speed));
    }

    setStability(value) {
        this.voiceSettings.stability = Math.max(0, Math.min(1, value));
    }

    setSimilarityBoost(value) {
        this.voiceSettings.similarityBoost = Math.max(0, Math.min(1, value));
    }

    setModel(modelId) {
        this.voiceSettings.modelId = modelId;
    }

    setProvider(provider) {
        if (provider === 'elevenlabs' && !this.elevenLabsApiKey) {
            console.warn('[TTS Service] Cannot use ElevenLabs provider without API key');
            return false;
        }
        this.currentProvider = provider;
        return true;
    }

    getAvailableVoices() {
        if (this.currentProvider === 'elevenlabs') {
            // Return array of voice objects with name and ID
            return Object.keys(this.voiceMap).map(name => ({
                name: name,
                id: this.voiceMap[name]
            }));
        } else {
            // Browser voices are determined client-side
            return [];
        }
    }

    async testConnection() {
        await this.initialize();
        
        if (this.currentProvider === 'elevenlabs' && this.elevenLabsApiKey) {
            try {
                // Test with a short phrase
                const result = await this.speakWithElevenLabs('Test', this.voiceSettings);
                // Clean up test file
                if (result.filepath) {
                    await fs.unlink(result.filepath).catch(() => {});
                }
                return { success: true, provider: 'elevenlabs' };
            } catch (error) {
                return { success: false, provider: 'elevenlabs', error: error.message };
            }
        } else {
            return { success: true, provider: 'browser' };
        }
    }
}

// Create singleton instance
const ttsService = new TTSService();

module.exports = ttsService;
