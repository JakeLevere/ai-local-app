// Audio streaming client for renderer with interruption support
class AudioStreamClient {
    constructor() {
        this.ws = null;
        this.audioQueue = [];
        this.isPlaying = false;
        this.currentAudio = null;
        this.audioContext = null;
        this.clientId = null;
        this.onMessageCallback = null;
        this.onErrorCallback = null;
    }

    /**
     * Connect to WebSocket audio streaming server
     */
    connect(port = 3000) {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(`ws://localhost:${port}/ws/audio`);
                
                this.ws.onopen = () => {
                    console.log('[AudioStream Client] Connected to server');
                };

                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleMessage(data);
                        
                        if (data.type === 'connected') {
                            this.clientId = data.clientId;
                            resolve(this.clientId);
                        }
                    } catch (error) {
                        console.error('[AudioStream Client] Error parsing message:', error);
                    }
                };

                this.ws.onerror = (error) => {
                    console.error('[AudioStream Client] WebSocket error:', error);
                    if (this.onErrorCallback) {
                        this.onErrorCallback(error);
                    }
                    reject(error);
                };

                this.ws.onclose = () => {
                    console.log('[AudioStream Client] Disconnected from server');
                    this.cleanup();
                };

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Send chat message with streaming audio response
     */
    sendChat(message, personaId, voiceId = null) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error('[AudioStream Client] WebSocket not connected');
            return;
        }

        // Clear any existing audio
        this.interrupt();

        this.ws.send(JSON.stringify({
            type: 'chat',
            message,
            personaId,
            voiceId
        }));
    }

    /**
     * Interrupt current stream and audio playback
     */
    interrupt() {
        console.log('[AudioStream Client] Interrupting stream...');
        
        // Stop current audio
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }
        
        // Clear audio queue
        this.audioQueue = [];
        this.isPlaying = false;
        
        // Send interrupt signal to server
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'interrupt'
            }));
        }
    }

    /**
     * Handle incoming WebSocket messages
     */
    handleMessage(data) {
        switch (data.type) {
            case 'audio_chunk':
                this.handleAudioChunk(data);
                break;
                
            case 'text_fallback':
                this.handleTextFallback(data);
                break;
                
            case 'stream_complete':
                this.handleStreamComplete(data);
                break;
                
            case 'interrupt_confirmed':
                console.log('[AudioStream Client] Interrupt confirmed by server');
                break;
                
            case 'error':
                console.error('[AudioStream Client] Server error:', data.error);
                if (this.onErrorCallback) {
                    this.onErrorCallback(data.error);
                }
                break;
                
            default:
                if (this.onMessageCallback) {
                    this.onMessageCallback(data);
                }
        }
    }

    /**
     * Handle incoming audio chunk
     */
    handleAudioChunk(data) {
        const { audio, text, metrics } = data;
        
        // Log metrics
        if (metrics && metrics.ttfa) {
            console.log(`[AudioStream Client] Time to first audio: ${metrics.ttfa}ms`);
        }
        
        // Convert base64 to blob
        const audioBlob = this.base64ToBlob(audio, 'audio/mpeg');
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // Add to queue
        this.audioQueue.push({
            url: audioUrl,
            text: text
        });
        
        // Start playing if not already playing
        if (!this.isPlaying) {
            this.playNextAudio();
        }
        
        // Display text immediately
        if (this.onMessageCallback) {
            this.onMessageCallback({
                type: 'partial_text',
                text: text
            });
        }
    }

    /**
     * Handle text-only fallback when TTS fails
     */
    handleTextFallback(data) {
        console.warn('[AudioStream Client] TTS failed, showing text only');
        
        if (this.onMessageCallback) {
            this.onMessageCallback({
                type: 'text_only',
                text: data.text,
                error: data.error
            });
        }
        
        // Show toast notification
        this.showToast('Voice synthesis unavailable - displaying text only', 'warning');
    }

    /**
     * Handle stream completion
     */
    handleStreamComplete(data) {
        console.log(`[AudioStream Client] Stream complete in ${data.duration}ms`);
        
        if (this.onMessageCallback) {
            this.onMessageCallback({
                type: 'complete',
                fullText: data.fullText,
                duration: data.duration
            });
        }
    }

    /**
     * Play next audio chunk from queue
     */
    playNextAudio() {
        if (this.audioQueue.length === 0) {
            this.isPlaying = false;
            return;
        }
        
        this.isPlaying = true;
        const { url, text } = this.audioQueue.shift();
        
        this.currentAudio = new Audio(url);
        this.currentAudio.play()
            .then(() => {
                console.log('[AudioStream Client] Playing audio chunk');
            })
            .catch(error => {
                console.error('[AudioStream Client] Audio playback failed:', error);
                this.showToast('Audio playback failed', 'error');
            });
        
        this.currentAudio.onended = () => {
            URL.revokeObjectURL(url); // Clean up
            this.currentAudio = null;
            this.playNextAudio(); // Play next chunk
        };
    }

    /**
     * Convert base64 string to Blob
     */
    base64ToBlob(base64, mimeType) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'error' ? '#f44336' : type === 'warning' ? '#ff9800' : '#2196F3'};
            color: white;
            border-radius: 4px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(toast);
        
        // Remove after 3 seconds
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 3000);
    }

    /**
     * Update configuration
     */
    updateConfig(config) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'config',
                config
            }));
        }
    }

    /**
     * Set callback for messages
     */
    onMessage(callback) {
        this.onMessageCallback = callback;
    }

    /**
     * Set callback for errors
     */
    onError(callback) {
        this.onErrorCallback = callback;
    }

    /**
     * Clean up resources
     */
    cleanup() {
        this.interrupt();
        
        if (this.ws) {
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.close();
            }
            this.ws = null;
        }
        
        this.clientId = null;
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        this.cleanup();
    }
}

// Export for use in renderer
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioStreamClient;
}
