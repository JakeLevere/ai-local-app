// TTS service wrapper for ElevenLabs API
const https = require('https');
const fs = require('fs').promises;
const path = require('path');
const ttsCache = require('./ttsCache');

class TTSService {
    constructor() {
        this.apiKey = process.env.ELEVEN_API_KEY;
        this.baseUrl = 'api.elevenlabs.io';
        this.retryDelays = [1000, 2000, 4000]; // Exponential backoff delays
    }

    /**
     * Synthesize speech from text using ElevenLabs API
     * @param {string} text - Text to synthesize
     * @param {string} voiceId - ElevenLabs voice ID
     * @param {Object} options - Optional parameters for prosody
     * @returns {Promise<Buffer>} Audio data as Buffer
     */
    async synthesize(text, voiceId, options = {}) {
        // Check cache first
        try {
            const cached = await ttsCache.get(text, voiceId);
            if (cached) {
                console.log(`[TTS] Using cached audio (${cached.length} bytes)`);
                return cached;
            }
        } catch (cacheError) {
            console.warn('[TTS] Cache check failed:', cacheError);
        }
        if (!this.apiKey) {
            throw new Error('ELEVEN_API_KEY not set in environment variables');
        }

        if (!voiceId) {
            voiceId = process.env.ELEVEN_VOICE_ID;
            if (!voiceId) {
                throw new Error('No voiceId provided and ELEVEN_VOICE_ID not set');
            }
        }

        const {
            stability = 0.5,
            similarity_boost = 0.75,
            style = 0.5,
            use_speaker_boost = true
        } = options;

        const requestData = JSON.stringify({
            text,
            model_id: 'eleven_monolingual_v1',
            voice_settings: {
                stability,
                similarity_boost,
                style,
                use_speaker_boost
            }
        });

        // Retry logic with exponential backoff
        for (let attempt = 0; attempt <= this.retryDelays.length; attempt++) {
            try {
                const audioBuffer = await this._makeRequest(voiceId, requestData);
                console.log(`[TTS] Successfully synthesized ${text.length} characters`);
                
                // Store in cache
                try {
                    await ttsCache.set(text, voiceId, audioBuffer);
                } catch (cacheError) {
                    console.warn('[TTS] Failed to cache audio:', cacheError);
                }
                
                return audioBuffer;
            } catch (error) {
                if (attempt === this.retryDelays.length) {
                    throw error; // Max retries reached
                }

                const statusCode = error.statusCode;
                const shouldRetry = statusCode === 429 || (statusCode >= 500 && statusCode < 600);
                
                if (!shouldRetry) {
                    throw error; // Non-retryable error
                }

                const delay = this.retryDelays[attempt];
                console.log(`[TTS] Retrying after ${delay}ms (attempt ${attempt + 1}/${this.retryDelays.length})`);
                await this._sleep(delay);
            }
        }
    }

    async _makeRequest(voiceId, requestData) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: this.baseUrl,
                path: `/v1/text-to-speech/${voiceId}`,
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg',
                    'xi-api-key': this.apiKey,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(requestData)
                }
            };

            const req = https.request(options, (res) => {
                const chunks = [];

                res.on('data', (chunk) => {
                    chunks.push(chunk);
                });

                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        const buffer = Buffer.concat(chunks);
                        resolve(buffer);
                    } else {
                        const error = new Error(`TTS API error: ${res.statusCode}`);
                        error.statusCode = res.statusCode;
                        error.response = Buffer.concat(chunks).toString();
                        reject(error);
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.write(requestData);
            req.end();
        });
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Stream synthesized speech chunks
     * @param {string} text - Text to synthesize
     * @param {string} voiceId - Voice ID
     * @param {Function} onChunk - Callback for each audio chunk
     */
    async synthesizeStream(text, voiceId, onChunk) {
        // For streaming, we'll chunk the text and synthesize each part
        const chunks = this._chunkText(text, 160); // ~160 chars per chunk
        
        for (const chunk of chunks) {
            try {
                const audioBuffer = await this.synthesize(chunk, voiceId);
                await onChunk(audioBuffer);
            } catch (error) {
                console.error('[TTS] Stream chunk failed:', error);
                throw error;
            }
        }
    }

    _chunkText(text, chunkSize = 160) {
        const chunks = [];
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        let currentChunk = '';

        for (const sentence of sentences) {
            if ((currentChunk + sentence).length <= chunkSize) {
                currentChunk += sentence;
            } else {
                if (currentChunk) {
                    chunks.push(currentChunk.trim());
                }
                currentChunk = sentence;
            }
        }

        if (currentChunk) {
            chunks.push(currentChunk.trim());
        }

        return chunks;
    }
}

module.exports = new TTSService();
