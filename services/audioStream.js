// WebSocket handler for streaming audio
const WebSocket = require('ws');
const tts = require('./tts');
const aiService = require('../aiService');

class AudioStreamService {
    constructor() {
        this.wss = null;
        this.activeStreams = new Map(); // Track active streams per client
        this.config = {
            STREAM_CHARS_PER_CHUNK: parseInt(process.env.STREAM_CHARS_PER_CHUNK) || 160,
            MAX_TTS_CONCURRENCY: parseInt(process.env.MAX_TTS_CONCURRENCY) || 2,
            TTS_TIMEOUT_MS: parseInt(process.env.TTS_TIMEOUT_MS) || 5000,
            RETRY_ATTEMPTS: parseInt(process.env.TTS_RETRY_ATTEMPTS) || 2
        };
        this.failureLog = [];
        this.failureMetrics = {
            tts: { count: 0, lastError: null },
            llm: { count: 0, lastError: null },
            websocket: { count: 0, lastError: null }
        };
    }

    /**
     * Initialize WebSocket server
     */
    initialize(server) {
        this.wss = new WebSocket.Server({ 
            server,
            path: '/ws/audio'
        });

        this.wss.on('connection', (ws) => {
            console.log('[AudioStream] Client connected');
            const clientId = this._generateClientId();
            
            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message);
                    await this._handleMessage(ws, clientId, data);
                } catch (error) {
                    console.error('[AudioStream] Message handling error:', error);
                    ws.send(JSON.stringify({
                        type: 'error',
                        error: error.message
                    }));
                }
            });

            ws.on('close', () => {
                console.log('[AudioStream] Client disconnected');
                this._cleanupClient(clientId);
            });

            ws.on('error', (error) => {
                console.error('[AudioStream] WebSocket error:', error);
                this._cleanupClient(clientId);
            });

            // Send initial connection confirmation
            ws.send(JSON.stringify({
                type: 'connected',
                clientId
            }));
        });

        console.log('[AudioStream] WebSocket server initialized');
    }

    async _handleMessage(ws, clientId, data) {
        switch (data.type) {
            case 'chat':
                await this._handleChatMessage(ws, clientId, data);
                break;
            
            case 'interrupt':
                await this._handleInterrupt(ws, clientId);
                break;
            
            case 'config':
                this._updateConfig(data.config);
                break;
            
            default:
                console.warn('[AudioStream] Unknown message type:', data.type);
        }
    }

    async _handleChatMessage(ws, clientId, data) {
        const { message, personaId, voiceId } = data;
        
        // Create abort controller for this stream
        const abortController = new AbortController();
        this.activeStreams.set(clientId, {
            abortController,
            isActive: true,
            startTime: Date.now()
        });

        try {
            // Start tracking time to first audio
            const streamStartTime = Date.now();
            let firstChunkSent = false;

            // Get streaming response from AI service
            const streamCallback = async (textChunk) => {
                // Check if stream was interrupted
                const stream = this.activeStreams.get(clientId);
                if (!stream || !stream.isActive) {
                    throw new Error('Stream interrupted');
                }

                // Buffer text into chunks for TTS
                if (textChunk.length >= this.config.STREAM_CHARS_PER_CHUNK) {
                    await this._synthesizeAndSend(
                        ws, 
                        textChunk, 
                        voiceId, 
                        !firstChunkSent ? streamStartTime : null
                    );
                    firstChunkSent = true;
                    return ''; // Clear buffer
                }
                
                return textChunk; // Keep buffering
            };

            // Start streaming LLM response
            const fullResponse = await aiService.getChatResponseStreaming(
                message,
                personaId,
                streamCallback,
                abortController.signal
            );

            // Send completion signal
            ws.send(JSON.stringify({
                type: 'stream_complete',
                fullText: fullResponse,
                duration: Date.now() - streamStartTime
            }));

        } catch (error) {
            if (error.message === 'Stream interrupted') {
                console.log('[AudioStream] Stream interrupted for client:', clientId);
            } else {
                console.error('[AudioStream] Chat handling error:', error);
                ws.send(JSON.stringify({
                    type: 'error',
                    error: error.message
                }));
            }
        } finally {
            this._cleanupClient(clientId);
        }
    }

    async _synthesizeAndSend(ws, text, voiceId, startTime) {
        try {
            const ttsStartTime = Date.now();
            
            // Synthesize audio with retry logic
            const audioBuffer = await this.synthesizeWithRetry(text, voiceId);
            
            // Calculate metrics
            const ttsTime = Date.now() - ttsStartTime;
            const ttfa = startTime ? Date.now() - startTime : null;

            // Send audio chunk to client
            ws.send(JSON.stringify({
                type: 'audio_chunk',
                audio: audioBuffer.toString('base64'),
                text: text,
                metrics: {
                    ttsTime,
                    ttfa, // Time to first audio
                    chunkSize: audioBuffer.length
                }
            }));

            if (ttfa) {
                console.log(`[AudioStream] Time to first audio: ${ttfa}ms`);
            }

        } catch (error) {
            // If TTS fails after retries, send text-only fallback
            console.error('[AudioStream] TTS failed after retries, falling back to text:', error.message);
            
            // Send text fallback with error details
            ws.send(JSON.stringify({
                type: 'text_fallback',
                text: text,
                error: error.message || 'TTS unavailable',
                fallbackReason: error.message?.includes('timeout') ? 'timeout' : 'service_error',
                fallbackMode: 'permanent' // Indicate this is after retries
            }));
            
            // Log for monitoring
            this.logFailure('tts', error);
            
            // Notify user if failure rate is high
            if (this.failureMetrics.tts.count > 5) {
                ws.send(JSON.stringify({
                    type: 'service_degradation',
                    service: 'tts',
                    message: 'Voice synthesis is experiencing issues. Using text-only mode.',
                    failureCount: this.failureMetrics.tts.count
                }));
            }
        }
    }

    async _handleInterrupt(ws, clientId) {
        const stream = this.activeStreams.get(clientId);
        
        if (stream && stream.isActive) {
            // Abort the current stream
            stream.isActive = false;
            stream.abortController.abort();
            
            console.log('[AudioStream] Interrupted stream for client:', clientId);
            
            // Send interrupt confirmation
            ws.send(JSON.stringify({
                type: 'interrupt_confirmed',
                timestamp: Date.now()
            }));
        }
    }

    _updateConfig(config) {
        if (config.STREAM_CHARS_PER_CHUNK) {
            this.config.STREAM_CHARS_PER_CHUNK = config.STREAM_CHARS_PER_CHUNK;
        }
        if (config.MAX_TTS_CONCURRENCY) {
            this.config.MAX_TTS_CONCURRENCY = config.MAX_TTS_CONCURRENCY;
        }
        console.log('[AudioStream] Config updated:', this.config);
    }

    _cleanupClient(clientId) {
        const stream = this.activeStreams.get(clientId);
        if (stream) {
            stream.isActive = false;
            if (stream.abortController) {
                stream.abortController.abort();
            }
            this.activeStreams.delete(clientId);
        }
    }

    _generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Log failures for monitoring and debugging
     */
    logFailure(service, error) {
        const failure = {
            service,
            error: error.message || String(error),
            timestamp: Date.now(),
            stack: error.stack
        };
        
        // Keep last 100 failures
        this.failureLog.push(failure);
        if (this.failureLog.length > 100) {
            this.failureLog.shift();
        }
        
        // Update metrics
        if (this.failureMetrics[service]) {
            this.failureMetrics[service].count++;
            this.failureMetrics[service].lastError = failure;
        }
        
        // Log to console in dev mode
        if (process.env.NODE_ENV === 'development') {
            console.error(`[AudioStream] ${service} failure:`, error);
        }
    }

    /**
     * Get failure metrics for diagnostics
     */
    getFailureMetrics() {
        return {
            metrics: this.failureMetrics,
            recentFailures: this.failureLog.slice(-10)
        };
    }

    /**
     * Attempt TTS with retry logic
     */
    async synthesizeWithRetry(text, voiceId, retries = this.config.RETRY_ATTEMPTS) {
        let lastError;
        
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const audioBuffer = await Promise.race([
                    tts.synthesize(text, voiceId),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('TTS timeout')), this.config.TTS_TIMEOUT_MS)
                    )
                ]);
                
                // Success - reset failure count for this service
                if (this.failureMetrics.tts.count > 0) {
                    console.log('[AudioStream] TTS recovered after failures');
                    this.failureMetrics.tts.count = Math.max(0, this.failureMetrics.tts.count - 1);
                }
                
                return audioBuffer;
            } catch (error) {
                lastError = error;
                if (attempt < retries) {
                    console.log(`[AudioStream] TTS attempt ${attempt} failed, retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 500 * attempt)); // Exponential backoff
                }
            }
        }
        
        throw lastError;
    }
}

module.exports = new AudioStreamService();
