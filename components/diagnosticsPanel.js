// Developer diagnostics panel for monitoring memory and performance
class DiagnosticsPanel {
    constructor() {
        this.enabled = localStorage.getItem('devMode') === 'true';
        this.container = null;
        this.updateInterval = null;
        this.metricsHistory = [];
        this.maxHistorySize = 50;
    }

    /**
     * Initialize the diagnostics panel
     */
    init() {
        if (!this.enabled) return;
        
        // Create panel container
        this.createPanel();
        
        // Start metrics collection
        this.startMetricsCollection();
        
        // Add keyboard shortcut (Ctrl+Shift+D)
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                this.toggle();
            }
        });
    }

    /**
     * Create the diagnostics panel UI
     */
    createPanel() {
        this.container = document.createElement('div');
        this.container.id = 'diagnostics-panel';
        this.container.className = 'diagnostics-panel';
        this.container.innerHTML = `
            <div class="diagnostics-header">
                <h3>Developer Diagnostics</h3>
                <button class="close-btn" onclick="diagnosticsPanel.hide()">×</button>
            </div>
            <div class="diagnostics-tabs">
                <button class="tab-btn active" data-tab="memory">Memory</button>
                <button class="tab-btn" data-tab="retrieval">Retrieval</button>
                <button class="tab-btn" data-tab="performance">Performance</button>
                <button class="tab-btn" data-tab="config">Config</button>
            </div>
            <div class="diagnostics-content">
                <div id="memory-tab" class="tab-content active">
                    <h4>Memory Tiers</h4>
                    <div class="memory-stats">
                        <div class="stat-group">
                            <label>Short-term:</label>
                            <span id="short-term-count">0</span> messages
                        </div>
                        <div class="stat-group">
                            <label>Mid-term:</label>
                            <span id="mid-term-count">0</span> slots
                        </div>
                        <div class="stat-group">
                            <label>Long-term:</label>
                            <span id="long-term-count">0</span> items
                        </div>
                    </div>
                    <div class="memory-details">
                        <h5>Short-term Queue (Last 5)</h5>
                        <div id="short-term-queue" class="queue-display"></div>
                        
                        <h5>Recent Mid-term Slots</h5>
                        <div id="mid-term-slots" class="slots-display"></div>
                    </div>
                </div>
                
                <div id="retrieval-tab" class="tab-content">
                    <h4>Last Retrieval</h4>
                    <div class="retrieval-stats">
                        <div class="stat-group">
                            <label>Retrieved Mid-term:</label>
                            <span id="retrieved-mid">0</span>
                        </div>
                        <div class="stat-group">
                            <label>Retrieved Long-term:</label>
                            <span id="retrieved-long">0</span>
                        </div>
                        <div class="stat-group">
                            <label>Similarity Threshold:</label>
                            <span id="similarity-threshold">0.5</span>
                        </div>
                    </div>
                    <div class="retrieval-details">
                        <h5>Retrieved Summaries</h5>
                        <div id="retrieved-summaries" class="summaries-display"></div>
                    </div>
                </div>
                
                <div id="performance-tab" class="tab-content">
                    <h4>Performance Metrics</h4>
                    <div class="performance-stats">
                        <div class="stat-group">
                            <label>Token Estimate:</label>
                            <span id="token-estimate">0</span> / 3500
                        </div>
                        <div class="stat-group">
                            <label>TTFA (Time to First Audio):</label>
                            <span id="ttfa">-</span> ms
                        </div>
                        <div class="stat-group">
                            <label>Total Response Time:</label>
                            <span id="response-time">-</span> ms
                        </div>
                        <div class="stat-group">
                            <label>Cache Hit Rate:</label>
                            <span id="cache-hit-rate">0</span>%
                        </div>
                    </div>
                    <div class="performance-graph">
                        <h5>Response Time History</h5>
                        <canvas id="perf-graph" width="400" height="100"></canvas>
                    </div>
                </div>
                
                <div id="config-tab" class="tab-content">
                    <h4>Configuration</h4>
                    <div class="config-settings">
                        <div class="config-group">
                            <label>TOPK_MID:</label>
                            <input type="number" id="config-topk-mid" min="1" max="10" value="3">
                        </div>
                        <div class="config-group">
                            <label>TOPK_LONG:</label>
                            <input type="number" id="config-topk-long" min="1" max="10" value="3">
                        </div>
                        <div class="config-group">
                            <label>Stream Chunk Size:</label>
                            <input type="number" id="config-chunk-size" min="50" max="500" value="160">
                        </div>
                        <div class="config-group">
                            <label>Decay Rate:</label>
                            <input type="number" id="config-decay-rate" min="0.9" max="1.0" step="0.01" value="0.98">
                        </div>
                        <button class="apply-config-btn" onclick="diagnosticsPanel.applyConfig()">Apply</button>
                    </div>
                </div>
            </div>
        `;
        
        // Add styles
        this.addStyles();
        
        // Add to document
        document.body.appendChild(this.container);
        
        // Setup tab switching
        this.setupTabs();
        
        // Initially hidden
        this.container.style.display = 'none';
    }

    /**
     * Add CSS styles for the panel
     */
    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .diagnostics-panel {
                position: fixed;
                right: 20px;
                top: 20px;
                width: 450px;
                max-height: 80vh;
                background: rgba(30, 30, 30, 0.95);
                border: 1px solid #444;
                border-radius: 8px;
                color: #fff;
                font-family: 'Consolas', 'Monaco', monospace;
                font-size: 12px;
                z-index: 10000;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            }
            
            .diagnostics-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 15px;
                background: #222;
                border-bottom: 1px solid #444;
            }
            
            .diagnostics-header h3 {
                margin: 0;
                font-size: 14px;
                color: #0ef;
            }
            
            .close-btn {
                background: transparent;
                border: none;
                color: #999;
                font-size: 20px;
                cursor: pointer;
                padding: 0;
                width: 20px;
                height: 20px;
            }
            
            .close-btn:hover {
                color: #fff;
            }
            
            .diagnostics-tabs {
                display: flex;
                background: #1a1a1a;
                border-bottom: 1px solid #444;
            }
            
            .tab-btn {
                flex: 1;
                padding: 8px;
                background: transparent;
                border: none;
                color: #999;
                cursor: pointer;
                font-size: 11px;
                transition: all 0.2s;
            }
            
            .tab-btn:hover {
                background: #2a2a2a;
                color: #fff;
            }
            
            .tab-btn.active {
                background: #333;
                color: #0ef;
                border-bottom: 2px solid #0ef;
            }
            
            .diagnostics-content {
                flex: 1;
                overflow-y: auto;
                padding: 15px;
                max-height: 500px;
            }
            
            .tab-content {
                display: none;
            }
            
            .tab-content.active {
                display: block;
            }
            
            .tab-content h4 {
                margin: 0 0 15px 0;
                color: #0ef;
                font-size: 13px;
            }
            
            .tab-content h5 {
                margin: 15px 0 10px 0;
                color: #999;
                font-size: 11px;
                text-transform: uppercase;
            }
            
            .stat-group {
                display: flex;
                justify-content: space-between;
                margin-bottom: 8px;
                padding: 5px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 3px;
            }
            
            .stat-group label {
                color: #999;
            }
            
            .stat-group span {
                color: #0ef;
                font-weight: bold;
            }
            
            .queue-display, .slots-display, .summaries-display {
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid #333;
                border-radius: 4px;
                padding: 10px;
                margin-top: 10px;
                max-height: 150px;
                overflow-y: auto;
            }
            
            .queue-item, .slot-item, .summary-item {
                margin-bottom: 8px;
                padding: 5px;
                background: rgba(255, 255, 255, 0.05);
                border-left: 2px solid #0ef;
                font-size: 11px;
            }
            
            .queue-item .role {
                color: #0ef;
                font-weight: bold;
            }
            
            .slot-item .score {
                color: #0f0;
                float: right;
            }
            
            .config-group {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }
            
            .config-group input {
                width: 100px;
                padding: 4px;
                background: #222;
                border: 1px solid #444;
                color: #fff;
                border-radius: 3px;
            }
            
            .apply-config-btn {
                width: 100%;
                padding: 8px;
                background: #0ef;
                color: #000;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
                margin-top: 10px;
            }
            
            .apply-config-btn:hover {
                background: #0df;
            }
            
            #perf-graph {
                width: 100%;
                height: 100px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid #333;
                border-radius: 4px;
                margin-top: 10px;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Setup tab switching functionality
     */
    setupTabs() {
        const tabs = this.container.querySelectorAll('.tab-btn');
        const contents = this.container.querySelectorAll('.tab-content');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.dataset.tab;
                
                // Update active states
                tabs.forEach(t => t.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));
                
                tab.classList.add('active');
                document.getElementById(`${targetTab}-tab`).classList.add('active');
            });
        });
    }

    /**
     * Start collecting metrics
     */
    startMetricsCollection() {
        this.updateInterval = setInterval(() => {
            if (this.container.style.display !== 'none') {
                this.updateMetrics();
            }
        }, 2000);
    }

    /**
     * Update all metrics displays
     */
    async updateMetrics() {
        // Get current persona data if available
        const currentPersona = window.currentPersonaId;
        if (!currentPersona) return;
        
        try {
            // Update memory counts
            const memoryStats = await this.fetchMemoryStats(currentPersona);
            this.updateMemoryDisplay(memoryStats);
            
            // Update retrieval info
            if (window.lastRetrievalInfo) {
                this.updateRetrievalDisplay(window.lastRetrievalInfo);
            }
            
            // Update performance metrics
            if (window.lastPerformanceMetrics) {
                this.updatePerformanceDisplay(window.lastPerformanceMetrics);
            }
        } catch (error) {
            console.error('[Diagnostics] Error updating metrics:', error);
        }
    }

    /**
     * Fetch memory statistics
     */
    async fetchMemoryStats(personaId) {
        try {
            const response = await fetch(`http://localhost:3000/debug/persona/${personaId}/short-term`);
            const shortTerm = await response.json();
            
            const response2 = await fetch(`http://localhost:3000/debug/persona/${personaId}/mid-term`);
            const midTerm = await response2.json();
            
            const response3 = await fetch(`http://localhost:3000/debug/persona/${personaId}/long-term`);
            const longTerm = await response3.json();
            
            return { shortTerm, midTerm, longTerm };
        } catch (error) {
            return null;
        }
    }

    /**
     * Update memory display
     */
    updateMemoryDisplay(stats) {
        if (!stats) return;
        
        // Update counts
        document.getElementById('short-term-count').textContent = stats.shortTerm.count || 0;
        document.getElementById('mid-term-count').textContent = stats.midTerm.count || 0;
        document.getElementById('long-term-count').textContent = stats.longTerm.count || 0;
        
        // Update short-term queue
        const queueEl = document.getElementById('short-term-queue');
        if (stats.shortTerm.messages) {
            queueEl.innerHTML = stats.shortTerm.messages
                .slice(-5)
                .map(msg => `
                    <div class="queue-item">
                        <span class="role">${msg.role}:</span>
                        ${msg.content.substring(0, 100)}...
                    </div>
                `).join('');
        }
        
        // Update mid-term slots
        const slotsEl = document.getElementById('mid-term-slots');
        if (stats.midTerm.slots) {
            slotsEl.innerHTML = stats.midTerm.slots
                .slice(0, 3)
                .map(slot => `
                    <div class="slot-item">
                        <span class="score">${slot.priority.toFixed(2)}</span>
                        ${slot.summary.substring(0, 80)}...
                    </div>
                `).join('');
        }
    }

    /**
     * Update retrieval display
     */
    updateRetrievalDisplay(info) {
        document.getElementById('retrieved-mid').textContent = info.midTermCount || 0;
        document.getElementById('retrieved-long').textContent = info.longTermCount || 0;
        document.getElementById('similarity-threshold').textContent = info.threshold || 0.5;
        
        const summariesEl = document.getElementById('retrieved-summaries');
        if (info.summaries) {
            summariesEl.innerHTML = info.summaries
                .map(s => `
                    <div class="summary-item">
                        <span class="score">${s.score.toFixed(3)}</span>
                        ${s.text}
                    </div>
                `).join('');
        }
    }

    /**
     * Update performance display
     */
    updatePerformanceDisplay(metrics) {
        document.getElementById('token-estimate').textContent = metrics.tokens || 0;
        document.getElementById('ttfa').textContent = metrics.ttfa || '-';
        document.getElementById('response-time').textContent = metrics.responseTime || '-';
        document.getElementById('cache-hit-rate').textContent = metrics.cacheHitRate || 0;
        
        // Add to history
        this.metricsHistory.push(metrics.responseTime || 0);
        if (this.metricsHistory.length > this.maxHistorySize) {
            this.metricsHistory.shift();
        }
        
        // Draw graph
        this.drawPerformanceGraph();
    }

    /**
     * Draw performance graph
     */
    drawPerformanceGraph() {
        const canvas = document.getElementById('perf-graph');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, width, height);
        
        if (this.metricsHistory.length < 2) return;
        
        // Draw graph
        const max = Math.max(...this.metricsHistory, 1000);
        const step = width / (this.metricsHistory.length - 1);
        
        ctx.strokeStyle = '#0ef';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        this.metricsHistory.forEach((value, i) => {
            const x = i * step;
            const y = height - (value / max) * height;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
    }

    /**
     * Apply configuration changes
     */
    applyConfig() {
        const config = {
            TOPK_MID: parseInt(document.getElementById('config-topk-mid').value),
            TOPK_LONG: parseInt(document.getElementById('config-topk-long').value),
            STREAM_CHARS_PER_CHUNK: parseInt(document.getElementById('config-chunk-size').value),
            DECAY_RATE: parseFloat(document.getElementById('config-decay-rate').value)
        };
        
        // Send to backend
        if (window.audioStreamClient) {
            window.audioStreamClient.updateConfig(config);
        }
        
        console.log('[Diagnostics] Config updated:', config);
        
        // Show confirmation
        const btn = document.querySelector('.apply-config-btn');
        const originalText = btn.textContent;
        btn.textContent = 'Applied!';
        btn.style.background = '#0f0';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '#0ef';
        }, 1000);
    }

    /**
     * Toggle panel visibility
     */
    toggle() {
        if (this.container.style.display === 'none') {
            this.show();
        } else {
            this.hide();
        }
    }

    /**
     * Show the panel
     */
    show() {
        this.container.style.display = 'flex';
        this.updateMetrics();
    }

    /**
     * Hide the panel
     */
    hide() {
        this.container.style.display = 'none';
    }

    /**
     * Enable/disable dev mode
     */
    setDevMode(enabled) {
        this.enabled = enabled;
        localStorage.setItem('devMode', enabled ? 'true' : 'false');
        
        if (enabled && !this.container) {
            this.init();
        } else if (!enabled && this.container) {
            this.hide();
        }
    }

    /**
     * Clean up
     */
    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        if (this.container) {
            this.container.remove();
        }
    }
}

// Create global instance
window.diagnosticsPanel = new DiagnosticsPanel();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DiagnosticsPanel;
}
