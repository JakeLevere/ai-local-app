// memoryDecayService.js - Service for periodic memory decay and maintenance
const personaService = require('./personaService');
const { decayMidTermSlots, getMidTermDecayStats } = require('./utils/memory');
const path = require('path');
const fs = require('fs').promises;

class MemoryDecayService {
    constructor() {
        this.intervalId = null;
        this.decayIntervalMs = 2 * 60 * 1000; // 2 minutes
        this.decayRate = 0.98; // 2% decay per minute
        this.minPriority = 0.2; // Remove slots below this priority
        this.maxAgeMinutes = 30; // Remove slots older than 30 minutes with low priority
        this.isRunning = false;
        this.lastDecayTime = null;
        this.stats = {
            totalDecayRuns: 0,
            totalSlotsRemoved: 0,
            lastRunTime: null
        };
    }

    /**
     * Start the periodic decay process
     * @param {Object} config - Configuration options
     */
    start(config = {}) {
        if (this.isRunning) {
            console.log('[Memory Decay Service] Already running');
            return;
        }

        // Apply configuration
        if (config.intervalMinutes) {
            this.decayIntervalMs = config.intervalMinutes * 60 * 1000;
        }
        if (config.decayRate !== undefined) {
            this.decayRate = config.decayRate;
        }
        if (config.minPriority !== undefined) {
            this.minPriority = config.minPriority;
        }
        if (config.maxAgeMinutes !== undefined) {
            this.maxAgeMinutes = config.maxAgeMinutes;
        }

        console.log('[Memory Decay Service] Starting with configuration:');
        console.log(`  - Interval: ${this.decayIntervalMs / 60000} minutes`);
        console.log(`  - Decay rate: ${this.decayRate} per minute`);
        console.log(`  - Min priority: ${this.minPriority}`);
        console.log(`  - Max age: ${this.maxAgeMinutes} minutes`);

        // Run initial decay
        this.runDecay();

        // Set up periodic decay
        this.intervalId = setInterval(() => {
            this.runDecay();
        }, this.decayIntervalMs);

        this.isRunning = true;
        console.log('[Memory Decay Service] Started successfully');
    }

    /**
     * Stop the periodic decay process
     */
    stop() {
        if (!this.isRunning) {
            console.log('[Memory Decay Service] Not running');
            return;
        }

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.isRunning = false;
        console.log('[Memory Decay Service] Stopped');
        console.log(`  - Total runs: ${this.stats.totalDecayRuns}`);
        console.log(`  - Total slots removed: ${this.stats.totalSlotsRemoved}`);
    }

    /**
     * Run a single decay operation
     */
    async runDecay() {
        const startTime = Date.now();
        console.log(`[Memory Decay Service] Running decay cycle #${this.stats.totalDecayRuns + 1}`);

        try {
            // Get vault path from app configuration
            const vaultPath = global.appPaths?.vaultPath;
            if (!vaultPath) {
                console.log('[Memory Decay Service] Vault path not available, skipping decay');
                return;
            }

            // Discover all personas
            const personas = await personaService.discoverPersonas(vaultPath, __dirname);
            if (!personas || personas.length === 0) {
                console.log('[Memory Decay Service] No personas found');
                return;
            }

            let totalSlotsRemoved = 0;
            let personasProcessed = 0;

            // Process each persona
            for (const persona of personas) {
                try {
                    // Load persona data
                    const personaData = await personaService.loadPersonaData(
                        persona.id,
                        vaultPath
                    );

                    if (!personaData.midTermSlots || personaData.midTermSlots.length === 0) {
                        continue;
                    }

                    const beforeCount = personaData.midTermSlots.length;
                    const beforeStats = getMidTermDecayStats(personaData);

                    // Apply decay
                    decayMidTermSlots(
                        personaData,
                        this.decayRate,
                        this.minPriority,
                        this.maxAgeMinutes
                    );

                    const afterCount = personaData.midTermSlots.length;
                    const afterStats = getMidTermDecayStats(personaData);
                    const slotsRemoved = beforeCount - afterCount;

                    if (slotsRemoved > 0 || beforeStats.avgPriority !== afterStats.avgPriority) {
                        // Save updated persona data
                        await personaService.savePersonaData(
                            persona.id,
                            personaData,
                            vaultPath
                        );

                        console.log(`[Memory Decay Service] ${persona.name}:`);
                        console.log(`  - Slots: ${beforeCount} → ${afterCount} (removed: ${slotsRemoved})`);
                        console.log(`  - Avg priority: ${beforeStats.avgPriority.toFixed(3)} → ${afterStats.avgPriority.toFixed(3)}`);
                        
                        totalSlotsRemoved += slotsRemoved;
                        personasProcessed++;
                    }
                } catch (error) {
                    console.error(`[Memory Decay Service] Error processing persona ${persona.id}:`, error);
                }
            }

            const elapsedMs = Date.now() - startTime;
            this.stats.totalDecayRuns++;
            this.stats.totalSlotsRemoved += totalSlotsRemoved;
            this.stats.lastRunTime = new Date().toISOString();
            this.lastDecayTime = Date.now();

            if (personasProcessed > 0 || totalSlotsRemoved > 0) {
                console.log(`[Memory Decay Service] Decay cycle completed:`);
                console.log(`  - Personas processed: ${personasProcessed}`);
                console.log(`  - Slots removed: ${totalSlotsRemoved}`);
                console.log(`  - Time taken: ${elapsedMs}ms`);
            }
        } catch (error) {
            console.error('[Memory Decay Service] Error during decay cycle:', error);
        }
    }

    /**
     * Get service statistics
     */
    getStats() {
        return {
            ...this.stats,
            isRunning: this.isRunning,
            config: {
                intervalMinutes: this.decayIntervalMs / 60000,
                decayRate: this.decayRate,
                minPriority: this.minPriority,
                maxAgeMinutes: this.maxAgeMinutes
            },
            lastDecayTime: this.lastDecayTime ? new Date(this.lastDecayTime).toISOString() : null,
            nextDecayTime: this.lastDecayTime ? 
                new Date(this.lastDecayTime + this.decayIntervalMs).toISOString() : null
        };
    }

    /**
     * Manually trigger a decay cycle
     */
    async triggerDecay() {
        console.log('[Memory Decay Service] Manual decay triggered');
        await this.runDecay();
    }
}

// Create singleton instance
const memoryDecayService = new MemoryDecayService();

module.exports = memoryDecayService;
