// Memory UI Handler for renderer process
class MemoryUIHandler {
    constructor() {
        this.currentPersona = null;
        this.memoryData = null;
    }

    init() {
        this.setupProfileHandlers();
        this.setupMemoryHandlers();
        this.setupDropdownHandlers();
    }

    setupProfileHandlers() {
        const saveProfileBtn = document.getElementById('save-profile');
        if (saveProfileBtn) {
            saveProfileBtn.addEventListener('click', () => this.saveProfile());
        }
    }

    setupMemoryHandlers() {
        // Clear short-term button
        const clearShortTermBtn = document.getElementById('clear-short-term');
        if (clearShortTermBtn) {
            clearShortTermBtn.addEventListener('click', () => this.clearShortTerm());
        }

        // Prune mid-term button
        const pruneMidTermBtn = document.getElementById('prune-mid-term');
        if (pruneMidTermBtn) {
            pruneMidTermBtn.addEventListener('click', () => this.pruneMidTerm());
        }

        // View long-term button
        const viewLongTermBtn = document.getElementById('view-long-term');
        if (viewLongTermBtn) {
            viewLongTermBtn.addEventListener('click', () => this.toggleLongTermView());
        }

        // Run maintenance button
        const runMaintenanceBtn = document.getElementById('run-maintenance');
        if (runMaintenanceBtn) {
            runMaintenanceBtn.addEventListener('click', () => this.runMaintenance());
        }

        // Export memory button
        const exportMemoryBtn = document.getElementById('export-memory');
        if (exportMemoryBtn) {
            exportMemoryBtn.addEventListener('click', () => this.exportMemory());
        }
    }

    setupDropdownHandlers() {
        // Profile dropdown
        const profileHeader = document.getElementById('profile-header');
        if (profileHeader) {
            profileHeader.addEventListener('click', () => {
                const content = document.getElementById('profile-content');
                if (content) {
                    content.style.display = content.style.display === 'none' ? 'block' : 'none';
                }
            });
        }

        // Memory tiers dropdown
        const memoryHeader = document.getElementById('memory-tiers-header');
        if (memoryHeader) {
            memoryHeader.addEventListener('click', () => {
                const content = document.getElementById('memory-tiers-content');
                if (content) {
                    content.style.display = content.style.display === 'none' ? 'block' : 'none';
                }
            });
        }
    }

    async loadPersonaMemory(personaId) {
        this.currentPersona = personaId;
        try {
            const memoryData = await window.electronAPI.invoke('get-persona-memory', personaId);
            this.memoryData = memoryData;
            this.updateMemoryDisplay(memoryData);
            this.updateProfileDisplay(memoryData.profile);
        } catch (error) {
            console.error('Failed to load persona memory:', error);
        }
    }

    updateProfileDisplay(profile) {
        if (!profile) return;

        const nameInput = document.getElementById('profile-name');
        const descInput = document.getElementById('profile-description');
        const styleSelect = document.getElementById('profile-style');
        const pronounsInput = document.getElementById('profile-pronouns');
        const topicsInput = document.getElementById('profile-topics');

        if (nameInput) nameInput.value = profile.name || '';
        if (descInput) descInput.value = profile.description || '';
        if (styleSelect) styleSelect.value = profile.style || 'conversational';
        if (pronounsInput) pronounsInput.value = profile.pronouns || '';
        if (topicsInput) topicsInput.value = (profile.topics || []).join(', ');
    }

    updateMemoryDisplay(memoryData) {
        if (!memoryData) return;

        // Update counts
        const shortTermCount = document.getElementById('short-term-count');
        const midTermCount = document.getElementById('mid-term-count');
        const longTermCount = document.getElementById('long-term-count');

        if (shortTermCount) {
            shortTermCount.textContent = (memoryData.shortTermHistory || []).length;
        }
        if (midTermCount) {
            midTermCount.textContent = (memoryData.midTermSlots || []).length;
        }
        if (longTermCount) {
            longTermCount.textContent = (memoryData.longTermStore?.items || []).length;
        }

        // Update short-term list
        const shortTermList = document.getElementById('short-term-list');
        if (shortTermList) {
            shortTermList.innerHTML = '';
            const messages = memoryData.shortTermHistory || [];
            messages.slice(-5).forEach(msg => {
                const div = document.createElement('div');
                div.className = 'memory-item';
                div.innerHTML = `
                    <span class="memory-role">${msg.role}:</span>
                    <span class="memory-content">${this.truncate(msg.content, 50)}</span>
                `;
                shortTermList.appendChild(div);
            });
        }

        // Update mid-term list
        const midTermList = document.getElementById('mid-term-list');
        if (midTermList) {
            midTermList.innerHTML = '';
            const slots = memoryData.midTermSlots || [];
            slots.slice(0, 5).forEach(slot => {
                const div = document.createElement('div');
                div.className = 'memory-item';
                const priority = (slot.priority || 0).toFixed(2);
                div.innerHTML = `
                    <span class="memory-priority">[${priority}]</span>
                    <span class="memory-content">${this.truncate(slot.summary, 60)}</span>
                `;
                midTermList.appendChild(div);
            });
        }

        // Update long-term list (initially hidden)
        const longTermList = document.getElementById('long-term-list');
        if (longTermList) {
            longTermList.innerHTML = '';
            const items = memoryData.longTermStore?.items || [];
            items.slice(0, 5).forEach(item => {
                const div = document.createElement('div');
                div.className = 'memory-item';
                div.innerHTML = `
                    <span class="memory-content">${this.truncate(item.summary, 60)}</span>
                `;
                longTermList.appendChild(div);
            });
        }
    }

    async saveProfile() {
        if (!this.currentPersona) return;

        const profile = {
            name: document.getElementById('profile-name')?.value || '',
            description: document.getElementById('profile-description')?.value || '',
            style: document.getElementById('profile-style')?.value || 'conversational',
            pronouns: document.getElementById('profile-pronouns')?.value || '',
            topics: (document.getElementById('profile-topics')?.value || '')
                .split(',')
                .map(t => t.trim())
                .filter(t => t.length > 0)
        };

        try {
            await window.electronAPI.invoke('update-persona-profile', {
                personaId: this.currentPersona,
                profile: profile
            });
            this.showNotification('Profile saved successfully');
        } catch (error) {
            console.error('Failed to save profile:', error);
            this.showNotification('Failed to save profile', 'error');
        }
    }

    async clearShortTerm() {
        if (!this.currentPersona) return;

        if (confirm('Clear all short-term history? This cannot be undone.')) {
            try {
                await window.electronAPI.invoke('clear-short-term-history', this.currentPersona);
                await this.loadPersonaMemory(this.currentPersona);
                this.showNotification('Short-term history cleared');
            } catch (error) {
                console.error('Failed to clear short-term history:', error);
                this.showNotification('Failed to clear history', 'error');
            }
        }
    }

    async pruneMidTerm() {
        if (!this.currentPersona) return;

        try {
            await window.electronAPI.invoke('prune-mid-term-memory', this.currentPersona);
            await this.loadPersonaMemory(this.currentPersona);
            this.showNotification('Mid-term memory pruned');
        } catch (error) {
            console.error('Failed to prune mid-term memory:', error);
            this.showNotification('Failed to prune memory', 'error');
        }
    }

    toggleLongTermView() {
        const longTermList = document.getElementById('long-term-list');
        const viewBtn = document.getElementById('view-long-term');
        
        if (longTermList && viewBtn) {
            if (longTermList.style.display === 'none') {
                longTermList.style.display = 'block';
                viewBtn.textContent = 'Hide Details';
            } else {
                longTermList.style.display = 'none';
                viewBtn.textContent = 'View Details';
            }
        }
    }

    async runMaintenance() {
        if (!this.currentPersona) return;

        try {
            await window.electronAPI.invoke('run-memory-maintenance', this.currentPersona);
            await this.loadPersonaMemory(this.currentPersona);
            this.showNotification('Memory maintenance completed');
        } catch (error) {
            console.error('Failed to run maintenance:', error);
            this.showNotification('Failed to run maintenance', 'error');
        }
    }

    async exportMemory() {
        if (!this.currentPersona || !this.memoryData) return;

        try {
            const exportData = {
                persona: this.currentPersona,
                exportDate: new Date().toISOString(),
                profile: this.memoryData.profile,
                shortTermHistory: this.memoryData.shortTermHistory,
                midTermSlots: this.memoryData.midTermSlots,
                longTermStore: this.memoryData.longTermStore
            };

            const json = JSON.stringify(exportData, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.currentPersona}_memory_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);

            this.showNotification('Memory exported successfully');
        } catch (error) {
            console.error('Failed to export memory:', error);
            this.showNotification('Failed to export memory', 'error');
        }
    }

    truncate(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    showNotification(message, type = 'success') {
        // Simple notification - could be enhanced with a toast library
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 20px;
            background: ${type === 'error' ? '#f44336' : '#4CAF50'};
            color: white;
            border-radius: 4px;
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
        `;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Export for use in renderer.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MemoryUIHandler;
}
