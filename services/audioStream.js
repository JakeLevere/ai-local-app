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

            // After completion, request animation plan and send to client
            try {
                const { requestAnimationPlan } = require('../animation/requestAnimationPlan');
                const agg = this.activeStreams.get(clientId)?.agg || { durationMs: 0, words: [], phonemes: [] };
                const timings = {
                    durationMs: Math.max(0, Math.round(agg.durationMs || 0)),
                    words: (agg.words || []).slice(0, 60),
                    phonemes: (agg.phonemes || []).slice(0, 120)
                };
                const plan = await requestAnimationPlan({ persona: { id: personaId }, text: fullResponse, timings, context: null });
                ws.send(JSON.stringify({ type: 'animation_plan', plan }));
                console.log('[AudioStream] Sent animation_plan');
            } catch (e) {
                console.warn('[AudioStream] Animation plan fetch failed:', e.message);
                // Fallback: generate a local minimal plan using available timings
                try {
                    const agg = this.activeStreams.get(clientId)?.agg || { durationMs: 0, words: [], phonemes: [] };
                    const fallback = this._buildFallbackPlan({
                        durationMs: Math.max(0, Math.round(agg.durationMs || 0)),
                        words: agg.words || [],
                        phonemes: agg.phonemes || []
                    }, fullResponse);
                    ws.send(JSON.stringify({ type: 'animation_plan', plan: fallback }));
                    console.log('[AudioStream] Sent local fallback animation_plan');
                } catch (ee) {
                    console.warn('[AudioStream] Local fallback plan failed:', ee.message);
                }
            }

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

            // Minimal forced alignment (heuristic) per chunk
            const estDurationMs = this._estimateDurationMs(text);
            const alignment = this._generateAlignment(text, estDurationMs);
            try {
                console.log('[AudioStream] Alignment:', JSON.stringify({
                    durationMs: alignment.durationMs,
                    wordsLen: alignment.words.length,
                    phonemesLen: alignment.phonemes.length
                }));
            } catch (_) {}

            // Aggregate timings for plan request later
            try {
                const entry = this.activeStreams.get(clientId);
                if (entry) {
                    entry.agg = entry.agg || { durationMs: 0, words: [], phonemes: [] };
                    entry.agg.durationMs += alignment.durationMs || 0;
                    // Keep a reduced set to bound payload size
                    if (alignment.words?.length) entry.agg.words.push(...alignment.words.slice(0, 20));
                    if (alignment.phonemes?.length) entry.agg.phonemes.push(...alignment.phonemes.slice(0, 40));
                }
            } catch (_) {}

            // Send audio chunk to client
            ws.send(JSON.stringify({
                type: 'audio_chunk',
                audio: audioBuffer.toString('base64'),
                text: text,
                alignment,
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

    _estimateDurationMs(text) {
        const words = String(text || '').trim().split(/\s+/).filter(Boolean);
        const wordsPerSecond = 3.2; // ~192 WPM
        const dur = Math.max(0.3, words.length / wordsPerSecond) * 1000;
        return Math.round(dur);
    }

    _generateAlignment(text, durationMs) {
        const content = String(text || '').trim();
        const wordsRaw = content.split(/\s+/).filter(Boolean);
        const words = [];
        const phonemes = [];
        if (wordsRaw.length === 0) {
            return { durationMs: 0, words: [], phonemes: [] };
        }
        // Distribute duration proportional to word length
        const lens = wordsRaw.map(w => Math.max(1, w.replace(/[^a-zA-Z]/g, '').length));
        const total = lens.reduce((a, b) => a + b, 0);
        let t = 0;
        for (let i = 0; i < wordsRaw.length; i++) {
            const w = wordsRaw[i];
            const seg = Math.round((lens[i] / total) * durationMs);
            const t0 = t;
            const t1 = Math.min(durationMs, t + seg);
            words.push({ w, t0, t1 });
            // naive letter->phoneme mapping across the span
            const pseq = this._lettersToArpabet(w);
            const step = pseq.length > 0 ? Math.max(1, Math.floor((t1 - t0) / pseq.length)) : (t1 - t0);
            let tp = t0;
            for (const p of pseq) {
                phonemes.push({ p, t: tp });
                tp += step;
            }
            t = t1;
        }
        // Ensure last phoneme timestamp <= duration
        if (phonemes.length > 0) {
            phonemes[phonemes.length - 1].t = Math.min(durationMs, phonemes[phonemes.length - 1].t);
        }
        return { durationMs, words, phonemes };
    }

    _lettersToArpabet(word) {
        const s = String(word || '').toUpperCase();
        const res = [];
        let i = 0;
        while (i < s.length) {
            const ch2 = s.slice(i, i + 2);
            if (ch2 === 'CH') { res.push('CH'); i += 2; continue; }
            if (ch2 === 'TH') { res.push('TH'); i += 2; continue; }
            const ch = s[i];
            switch (ch) {
                case 'A': res.push('AE'); break;
                case 'E': res.push('EH'); break;
                case 'I': res.push('IY'); break;
                case 'O': res.push('OW'); break;
                case 'U': res.push('UW'); break;
                case 'B': res.push('BMP'); break; // approximate
                case 'P': res.push('BMP'); break;
                case 'M': res.push('BMP'); break;
                case 'F': res.push('FV'); break;
                case 'V': res.push('FV'); break;
                case 'L': res.push('L'); break;
                case 'R': res.push('R'); break;
                case 'N': res.push('N'); break;
                case 'S': res.push('S'); break;
                case 'Z': res.push('S'); break;
                case 'H': res.push('HH'); break;
                case 'W': res.push('UW'); break;
                case 'Y': res.push('IY'); break;
                case 'T': res.push('TH'); break; // crude
                case 'D': res.push('CH'); break; // crude
                case 'J': res.push('CH'); break;
                case 'K': res.push('CH'); break; // crude stop
                case 'G': res.push('CH'); break;
                case 'C': res.push('CH'); break;
                case 'Q': res.push('CH'); break;
                case 'X': res.push('S'); break;
                default: break;
            }
            i += 1;
        }
        if (res.length === 0) res.push('SIL');
        return res;
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

// Build minimal local fallback animation plan when GPT plan unavailable
AudioStreamService.prototype._buildFallbackPlan = function(timings, text){
    const durationMs = Number(timings?.durationMs) || 0;
    const phonemes = Array.isArray(timings?.phonemes) ? timings.phonemes : [];
    const words = Array.isArray(timings?.words) ? timings.words : [];

    // Mouth track from phonemes (map to viseme labels and simple opening)
    const mouth = [];
    const map = (p)=>{
        const P = String(p||'').toUpperCase();
        const M = { BMP:'BMP', F:'FV', V:'FV', FV:'FV', L:'L', AA:'AA', AE:'AE', AO:'AO', IY:'IY', UW:'UW', TH:'TH', CH:'CH', R:'R', N:'N', S:'S', Z:'S', HH:'S', OW:'AO', EH:'AE', UW0:'UW', IY0:'IY', SIL:'SIL' };
        return M[P] || 'SIL';
    };
    if (phonemes.length>0) {
        for (const ph of phonemes) {
            const t = Math.max(0, Math.min(durationMs, Math.round(ph.t||0)));
            mouth.push({ t, viseme: map(ph.p), open: 0.5, width: 0.3, round: 0.3 });
        }
    } else if (words.length>0) {
        for (const w of words) {
            const t = Math.max(0, Math.min(durationMs, Math.round(w.t0||0)));
            mouth.push({ t, viseme: 'S', open: 0.45, width: 0.35, round: 0.2 });
        }
    } else {
        // Minimal two-key mouth
        mouth.push({ t: 0, viseme:'SIL', open:0.2, width:0.2, round:0.2 });
        mouth.push({ t: durationMs, viseme:'SIL', open:0.0, width:0.2, round:0.2 });
    }

    // Neutral tracks with subtle motion; small intensity pulse by pseudo amplitude derived from word cadence
    const eyes = [];
    const brows = [];
    const headTilt = [];
    const shoulders = [];
    const style = { intensity: 0.05 };

    // Add occasional blinks every ~900ms
    for (let t=500; t<durationMs; t+=900) eyes.push({ t, blink: true });

    // Pulse with words
    const pulses = words.length>0 ? words.map(w=>({ t: w.t0||0 })) : mouth.map(m=>({ t: m.t||0 }));
    for (const p of pulses) {
        const tt = Math.max(0, Math.min(durationMs, Math.round(p.t)));
        brows.push({ t: tt, y: 0.6 });
        shoulders.push({ t: tt, y: 0.4 });
    }
    // Head tilt gentle sway start/end
    headTilt.push({ t: 0, deg: -2 });
    headTilt.push({ t: Math.max(0, durationMs-1), deg: 2 });

    return { tracks: { mouth, eyes, brows, headTilt, shoulders, style } };
};

module.exports = new AudioStreamService();
