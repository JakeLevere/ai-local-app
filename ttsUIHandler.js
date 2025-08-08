// TTS UI Handler - manages text-to-speech controls in the chat interface
class TTSUIHandler {
    constructor() {
        this.isPlaying = false;
        this.currentAudio = null;
        this.ttsEnabled = true;  // Enable by default
        this.autoSpeak = true;   // Enable auto-speak by default
        this.selectedVoice = 'custom';  // Will be set from env if available
        this.voiceSettings = {
            stability: 0.5,
            similarityBoost: 0.75
        };
        
        this.init();
    }
    
    init() {
        // Load saved preferences
        this.loadPreferences();
        
        // Create TTS controls in the UI
        this.createTTSControls();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Test TTS connection on init
        this.testConnection();
    }
    
    createTTSControls() {
        // Add TTS button to each chat message
        const style = document.createElement('style');
        style.textContent = `
            .tts-controls {
                position: fixed;
                bottom: 80px;
                right: 20px;
                background: var(--bg-secondary, #2a2a2a);
                border: 1px solid var(--border-color, #444);
                border-radius: 8px;
                padding: 10px;
                display: none;
                flex-direction: column;
                gap: 10px;
                z-index: 1000;
                min-width: 200px;
            }
            
            .tts-controls.active {
                display: flex;
            }
            
            .tts-toggle-btn {
                position: fixed;
                bottom: 80px;
                right: 20px;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: var(--accent-color, #4a9eff);
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 20px;
                z-index: 999;
                transition: background 0.3s;
            }
            
            .tts-toggle-btn:hover {
                background: var(--accent-hover, #357abd);
            }
            
            .tts-toggle-btn.settings-open {
                background: var(--danger-color, #ff4444);
            }
            
            .message-tts-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 24px;
                height: 24px;
                margin-left: 8px;
                background: transparent;
                border: 1px solid var(--border-color, #444);
                border-radius: 4px;
                cursor: pointer;
                opacity: 0.6;
                transition: opacity 0.2s, background 0.2s;
            }
            
            .message-tts-btn:hover {
                opacity: 1;
                background: var(--bg-hover, #3a3a3a);
            }
            
            .message-tts-btn.playing {
                background: var(--accent-color, #4a9eff);
                opacity: 1;
            }
            
            .tts-voice-select {
                padding: 5px;
                background: var(--bg-primary, #1a1a1a);
                color: var(--text-primary, #fff);
                border: 1px solid var(--border-color, #444);
                border-radius: 4px;
            }
            
            .tts-slider-group {
                display: flex;
                flex-direction: column;
                gap: 5px;
            }
            
            .tts-slider-label {
                font-size: 12px;
                color: var(--text-secondary, #aaa);
                display: flex;
                justify-content: space-between;
            }
            
            .tts-slider {
                width: 100%;
                height: 4px;
                -webkit-appearance: none;
                appearance: none;
                background: var(--bg-primary, #1a1a1a);
                border-radius: 2px;
                outline: none;
            }
            
            .tts-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 12px;
                height: 12px;
                background: var(--accent-color, #4a9eff);
                border-radius: 50%;
                cursor: pointer;
            }
            
            .tts-checkbox-group {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 14px;
            }
            
            .tts-status {
                font-size: 12px;
                padding: 4px 8px;
                border-radius: 4px;
                text-align: center;
            }
            
            .tts-status.success {
                background: var(--success-bg, #2a4a2a);
                color: var(--success-color, #4ade80);
            }
            
            .tts-status.error {
                background: var(--error-bg, #4a2a2a);
                color: var(--error-color, #ff6b6b);
            }
            
            .tts-status.info {
                background: var(--info-bg, #2a3a4a);
                color: var(--info-color, #60a5fa);
            }
        `;
        document.head.appendChild(style);
        
        // Create TTS toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'tts-toggle-btn';
        toggleBtn.innerHTML = '🔊';
        toggleBtn.title = 'Text-to-Speech Settings';
        document.body.appendChild(toggleBtn);
        
        // Create TTS controls panel
        const controlsPanel = document.createElement('div');
        controlsPanel.className = 'tts-controls';
        controlsPanel.innerHTML = `
            <h4 style="margin: 0 0 10px 0; font-size: 14px;">TTS Settings</h4>
            
            <div class="tts-status info" id="tts-status">Initializing...</div>
            
            <div class="tts-voice-group">
                <label style="font-size: 12px; color: var(--text-secondary, #aaa);">Voice:</label>
                <select class="tts-voice-select" id="tts-voice-select">
                    <option value="rachel">Rachel (Calm Female)</option>
                    <option value="drew">Drew (Male)</option>
                    <option value="domi">Domi (Strong Female)</option>
                    <option value="bella">Bella (Soft Female)</option>
                    <option value="antoni">Antoni (Male)</option>
                    <option value="elli">Elli (Emotional Female)</option>
                    <option value="josh">Josh (Young Male)</option>
                    <option value="arnold">Arnold (Crisp Male)</option>
                    <option value="adam">Adam (Deep Male)</option>
                    <option value="sam">Sam (Raspy Male)</option>
                </select>
            </div>
            
            <div class="tts-slider-group">
                <div class="tts-slider-label">
                    <span>Stability</span>
                    <span id="stability-value">0.5</span>
                </div>
                <input type="range" class="tts-slider" id="tts-stability" 
                       min="0" max="1" step="0.1" value="0.5">
            </div>
            
            <div class="tts-slider-group">
                <div class="tts-slider-label">
                    <span>Similarity</span>
                    <span id="similarity-value">0.75</span>
                </div>
                <input type="range" class="tts-slider" id="tts-similarity" 
                       min="0" max="1" step="0.05" value="0.75">
            </div>
            
            <div class="tts-checkbox-group">
                <input type="checkbox" id="tts-auto-speak">
                <label for="tts-auto-speak">Auto-speak responses</label>
            </div>
            
            <div class="tts-checkbox-group">
                <input type="checkbox" id="tts-enabled" checked>
                <label for="tts-enabled">Enable TTS buttons</label>
            </div>
            
            <button id="tts-test-btn" style="
                padding: 6px 12px;
                background: var(--accent-color, #4a9eff);
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            ">Test Voice</button>
        `;
        document.body.appendChild(controlsPanel);
        
        this.toggleBtn = toggleBtn;
        this.controlsPanel = controlsPanel;
    }
    
    setupEventListeners() {
        // Toggle controls panel
        this.toggleBtn.addEventListener('click', () => {
            const isOpen = this.controlsPanel.classList.contains('active');
            if (isOpen) {
                this.controlsPanel.classList.remove('active');
                this.toggleBtn.classList.remove('settings-open');
            } else {
                this.controlsPanel.classList.add('active');
                this.toggleBtn.classList.add('settings-open');
                this.toggleBtn.style.display = 'none';
            }
        });
        
        // Close panel when clicking outside
        document.addEventListener('click', (e) => {
            if (this.controlsPanel.classList.contains('active') &&
                !this.controlsPanel.contains(e.target) &&
                e.target !== this.toggleBtn) {
                this.controlsPanel.classList.remove('active');
                this.toggleBtn.classList.remove('settings-open');
                this.toggleBtn.style.display = 'flex';
            }
        });
        
        // Voice selection
        const voiceSelect = document.getElementById('tts-voice-select');
        voiceSelect.value = this.selectedVoice;
        voiceSelect.addEventListener('change', async (e) => {
            this.selectedVoice = e.target.value;
            await window.electronAPI.tts.setVoice(this.selectedVoice);
            this.savePreferences();
        });
        
        // Stability slider
        const stabilitySlider = document.getElementById('tts-stability');
        const stabilityValue = document.getElementById('stability-value');
        stabilitySlider.value = this.voiceSettings.stability;
        stabilityValue.textContent = this.voiceSettings.stability;
        stabilitySlider.addEventListener('input', (e) => {
            this.voiceSettings.stability = parseFloat(e.target.value);
            stabilityValue.textContent = e.target.value;
            this.savePreferences();
        });
        
        // Similarity slider
        const similaritySlider = document.getElementById('tts-similarity');
        const similarityValue = document.getElementById('similarity-value');
        similaritySlider.value = this.voiceSettings.similarityBoost;
        similarityValue.textContent = this.voiceSettings.similarityBoost;
        similaritySlider.addEventListener('input', (e) => {
            this.voiceSettings.similarityBoost = parseFloat(e.target.value);
            similarityValue.textContent = e.target.value;
            this.savePreferences();
        });
        
        // Auto-speak checkbox
        const autoSpeakCheckbox = document.getElementById('tts-auto-speak');
        autoSpeakCheckbox.checked = this.autoSpeak;
        autoSpeakCheckbox.addEventListener('change', (e) => {
            this.autoSpeak = e.target.checked;
            this.savePreferences();
        });
        
        // Enable TTS checkbox
        const enabledCheckbox = document.getElementById('tts-enabled');
        enabledCheckbox.checked = this.ttsEnabled;
        enabledCheckbox.addEventListener('change', (e) => {
            this.ttsEnabled = e.target.checked;
            this.toggleTTSButtons(this.ttsEnabled);
            this.savePreferences();
        });
        
        // Test button
        document.getElementById('tts-test-btn').addEventListener('click', () => {
            this.testVoice();
        });
        
        // Listen for new chat messages to add TTS buttons
        this.observeChatMessages();
        
        // Listen for auto-play TTS from main process
        this.setupAutoPlayListener();
    }
    
    setupAutoPlayListener() {
        // Listen for auto-play TTS events from the backend
        if (window.electronAPI && window.electronAPI.on) {
            console.log('[TTS] Setting up auto-play listener');
            window.electronAPI.on('auto-play-tts', (ttsResult) => {
                console.log('[TTS] Received auto-play-tts event:', ttsResult);
                console.log('[TTS] AutoSpeak enabled:', this.autoSpeak);
                
                if (!this.autoSpeak) {
                    console.log('[TTS] Auto-speak is disabled, skipping playback');
                    return;  // Only auto-play if enabled
                }
                
                console.log('[TTS] Auto-playing response from backend');
                
                if (ttsResult.provider === 'elevenlabs' && ttsResult.filepath) {
                    console.log('[TTS] Playing ElevenLabs audio file:', ttsResult.filepath);
                    // Play the audio file directly
                    this.playAudioFile(ttsResult.filepath);
                } else if (ttsResult.provider === 'browser') {
                    console.log('[TTS] Using browser TTS fallback');
                    // Use browser TTS
                    this.speakWithBrowser(ttsResult);
                } else {
                    console.warn('[TTS] Unknown TTS provider or missing filepath:', ttsResult);
                }
            });
        } else {
            console.warn('[TTS] electronAPI not available for auto-play listener');
        }
    }
    
    observeChatMessages() {
        const chatLog = document.getElementById('chat-log');
        if (!chatLog) return;
        
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && node.classList && 
                        (node.classList.contains('user-message') || 
                         node.classList.contains('ai-message'))) {
                        this.addTTSButton(node);
                        
                        // Don't auto-speak here - the backend handles auto-play via 'auto-play-tts' event
                        // This prevents duplicate TTS attempts
                    }
                });
            });
        });
        
        observer.observe(chatLog, { childList: true, subtree: true });
    }
    
    addTTSButton(messageElement) {
        if (!this.ttsEnabled) return;
        if (messageElement.querySelector('.message-tts-btn')) return;
        
        const button = document.createElement('button');
        button.className = 'message-tts-btn';
        button.innerHTML = '🔊';
        button.title = 'Read aloud';
        
        button.addEventListener('click', async () => {
            const text = this.extractTextFromMessage(messageElement);
            if (!text) return;
            
            if (button.classList.contains('playing')) {
                this.stop();
                button.classList.remove('playing');
            } else {
                // Stop any current playback
                this.stop();
                
                // Remove playing class from all buttons
                document.querySelectorAll('.message-tts-btn.playing')
                    .forEach(btn => btn.classList.remove('playing'));
                
                button.classList.add('playing');
                await this.speak(text, () => {
                    button.classList.remove('playing');
                });
            }
        });
        
        // Find a good place to insert the button
        const messageContent = messageElement.querySelector('.message-content') || messageElement;
        messageContent.appendChild(button);
    }
    
    extractTextFromMessage(messageElement) {
        // Clone the element to avoid modifying the original
        const clone = messageElement.cloneNode(true);
        
        // Remove any TTS buttons from the clone
        clone.querySelectorAll('.message-tts-btn').forEach(btn => btn.remove());
        
        // Get text content, handling code blocks specially
        let text = '';
        clone.querySelectorAll('*').forEach(el => {
            if (el.tagName === 'CODE' || el.tagName === 'PRE') {
                text += ' code block ';
            } else if (el.nodeType === 3 || el.innerText) {
                text += el.innerText || el.textContent || '';
            }
        });
        
        // Clean up the text
        text = text.trim().replace(/\s+/g, ' ');
        return text;
    }
    
    async speak(text, onComplete) {
        try {
            this.updateStatus('Speaking...', 'info');
            
            const result = await window.electronAPI.tts.speak(text, {
                voiceName: this.selectedVoice,
                stability: this.voiceSettings.stability,
                similarityBoost: this.voiceSettings.similarityBoost
            });
            
            if (result.provider === 'elevenlabs' && result.filepath) {
                // Play the audio file
                this.playAudioFile(result.filepath, onComplete);
            } else if (result.provider === 'browser') {
                // Use browser TTS
                this.speakWithBrowser(result, onComplete);
            }
            
        } catch (error) {
            console.error('TTS error:', error);
            this.updateStatus('TTS failed', 'error');
            if (onComplete) onComplete();
        }
    }
    
    playAudioFile(filepath, onComplete) {
        // Convert local file path to server URL
        // Extract just the filename from the full path
        const filename = filepath.split(/[\\/]/).pop();
        const audioUrl = `/tts-audio/${filename}`;
        console.log('[TTS] Playing audio from URL:', audioUrl);
        
        // Create an audio element to play the file
        this.currentAudio = new Audio(audioUrl);
        try { if (window._viz) { window._viz.connectAudio(this.currentAudio, null); } } catch(_){}
        this.currentAudio.addEventListener('play', () => { try { window._viz?.speechStart(0); } catch(_){} });
        this.currentAudio.addEventListener('ended', () => {
            this.isPlaying = false;
            this.updateStatus('Ready', 'success');
            if (onComplete) onComplete();
        });
        
        this.currentAudio.addEventListener('error', (e) => {
            console.error('Audio playback error:', e);
            this.updateStatus('Playback failed', 'error');
            this.isPlaying = false;
            try { window._viz?.speechStop(); } catch(_){}
            if (onComplete) onComplete();
        });
        
        this.isPlaying = true;
        this.currentAudio.play().catch(err => {
            console.error('Failed to play audio:', err);
            this.updateStatus('Playback failed', 'error');
            this.isPlaying = false;
            try { window._viz?.speechStop(); } catch(_){}
            if (onComplete) onComplete();
        });
    }
    
    speakWithBrowser(settings, onComplete) {
        if (!window.speechSynthesis) {
            this.updateStatus('Browser TTS not supported', 'error');
            if (onComplete) onComplete();
            return;
        }
        
        const utterance = new SpeechSynthesisUtterance(settings.text);
        try { window._viz?.speechStart(0); } catch(_){}
        utterance.rate = settings.rate || 1.0;
        utterance.pitch = settings.pitch || 1.0;
        utterance.volume = settings.volume || 1.0;
        utterance.onend = () => { try { window._viz?.speechStop(); } catch(_){} if (onComplete) onComplete(); };
        utterance.onerror = () => { try { window._viz?.speechStop(); } catch(_){} if (onComplete) onComplete(); };
        
        if (settings.voice) {
            const voices = window.speechSynthesis.getVoices();
            const voice = voices.find(v => v.name === settings.voice);
            if (voice) utterance.voice = voice;
        }
        
        utterance.addEventListener('end', () => {
            this.isPlaying = false;
            this.updateStatus('Ready (Browser TTS)', 'info');
            if (onComplete) onComplete();
        });
        
        utterance.addEventListener('error', (e) => {
            console.error('Browser TTS error:', e);
            this.updateStatus('Browser TTS failed', 'error');
            this.isPlaying = false;
            if (onComplete) onComplete();
        });
        
        this.isPlaying = true;
        window.speechSynthesis.speak(utterance);
    }
    
    stop() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }
        
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        
        this.isPlaying = false;
        this.updateStatus('Stopped', 'info');
    }
    
    async testVoice() {
        const testText = "Hello! This is a test of the text-to-speech system.";
        await this.speak(testText);
    }
    
    async testConnection() {
        try {
            const result = await window.electronAPI.tts.test();
            if (result.success) {
                this.updateStatus(`Ready (${result.provider})`, 'success');
            } else {
                this.updateStatus(`TTS Error: ${result.error}`, 'error');
            }
        } catch (error) {
            this.updateStatus('TTS not available', 'error');
        }
    }
    
    updateStatus(message, type) {
        const statusEl = document.getElementById('tts-status');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = `tts-status ${type}`;
        }
    }
    
    toggleTTSButtons(enabled) {
        const buttons = document.querySelectorAll('.message-tts-btn');
        buttons.forEach(btn => {
            btn.style.display = enabled ? 'inline-flex' : 'none';
        });
    }
    
    loadPreferences() {
        const prefs = localStorage.getItem('tts-preferences');
        if (prefs) {
            try {
                const parsed = JSON.parse(prefs);
                this.ttsEnabled = parsed.enabled !== undefined ? parsed.enabled : true;
                this.autoSpeak = parsed.autoSpeak !== undefined ? parsed.autoSpeak : true;  // Default to true
                this.selectedVoice = parsed.voice || 'custom';  // Use custom for env-based voice
                this.voiceSettings = parsed.settings || {
                    stability: 0.5,
                    similarityBoost: 0.75
                };
            } catch (e) {
                console.error('Failed to load TTS preferences:', e);
            }
        }
        // If no preferences saved, keep defaults (autoSpeak = true)
    }
    
    savePreferences() {
        const prefs = {
            enabled: this.ttsEnabled,
            autoSpeak: this.autoSpeak,
            voice: this.selectedVoice,
            settings: this.voiceSettings
        };
        localStorage.setItem('tts-preferences', JSON.stringify(prefs));
    }
}

// Export for use in renderer
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TTSUIHandler;
}
