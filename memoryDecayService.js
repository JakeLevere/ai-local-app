// memoryDecayService.js - Service for periodic memory evaluation and maintenance using access patterns
const personaService = require('./personaService');
const { runMemoryMaintenance, getMidTermDecayStats } = require('./utils/memory');
const path = require('path');
const fs = require('fs').promises;

class MemoryDecayService {
    constructor() {
        this.intervalId = null;
        this.evaluationIntervalMs = 10 * 60 * 1000; // 10 minutes (less frequent since access-based)
        this.isRunning = false;
        this.lastEvaluationTime = null;
        this.stats = {
            totalEvaluationRuns: 0,
            totalSlotsPromoted: 0,
            totalSlotsRemoved: 0,
            lastRunTime: null
        };
    }

    /**
     * Start the periodic memory evaluation process
     * @param {Object} config - Configuration options
     */
    start(config = {}) {
        if (this.isRunning) {
            console.log('[Memory Evaluation Service] Already running');
            return;
        }

        // Apply configuration
        if (config.intervalMinutes) {
            this.evaluationIntervalMs = config.intervalMinutes * 60 * 1000;
        }

        console.log('[Memory Evaluation Service] Starting with configuration:');
        console.log(`  - Evaluation interval: ${this.evaluationIntervalMs / 60000} minutes`);
        console.log(`  - Access-based promotion threshold: 5 accesses`);
        console.log(`  - Semantic cluster threshold: 3 related memories`);

        // Run initial evaluation
        this.runEvaluation();

        // Set up periodic evaluation
        this.intervalId = setInterval(() => {
            this.runEvaluation();
        }, this.evaluationIntervalMs);

        this.isRunning = true;
        console.log('[Memory Evaluation Service] Started successfully');
    }

    /**
     * Stop the periodic evaluation process
     */
    stop() {
        if (!this.isRunning) {
            console.log('[Memory Evaluation Service] Not running');
            return;
        }

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.isRunning = false;
        console.log('[Memory Evaluation Service] Stopped');
        console.log(`  - Total runs: ${this.stats.totalEvaluationRuns}`);
        console.log(`  - Total slots promoted: ${this.stats.totalSlotsPromoted}`);
        console.log(`  - Total slots removed: ${this.stats.totalSlotsRemoved}`);
    }

    /**
     * Run a single evaluation operation
     */
    async runEvaluation() {
        const startTime = Date.now();
        console.log(`[Memory Evaluation Service] Running evaluation cycle #${this.stats.totalEvaluationRuns + 1}`);

        try {
            // Get vault path from app configuration
            const vaultPath = global.appPaths?.vaultPath;
            if (!vaultPath) {
                console.log('[Memory Evaluation Service] Vault path not available, skipping evaluation');
                return;
            }

            // Discover all personas
            const personas = await personaService.discoverPersonas(vaultPath, __dirname);
            if (!personas || personas.length === 0) {
                console.log('[Memory Evaluation Service] No personas found');
                return;
            }

            let totalSlotsPromoted = 0;
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
                    const beforeLongTermCount = personaData.longTermStore?.items?.length || 0;

                    // Apply access-based evaluation and promotion via runMemoryMaintenance
                    const updatedPersona = runMemoryMaintenance(personaData);
                    // Update the personaData reference
                    Object.assign(personaData, updatedPersona);

                    const afterCount = personaData.midTermSlots.length;
                    const afterStats = getMidTermDecayStats(personaData);
                    const afterLongTermCount = personaData.longTermStore?.items?.length || 0;
                    const slotsChanged = beforeCount - afterCount;
                    const itemsPromoted = afterLongTermCount - beforeLongTermCount;

                    if (slotsChanged > 0 || itemsPromoted > 0) {
                        // Save updated persona data
                        await personaService.savePersonaData(
                            persona.id,
                            personaData,
                            vaultPath
                        );

                        console.log(`[Memory Evaluation Service] ${persona.name}:`);
                        console.log(`  - Mid-term slots: ${beforeCount} → ${afterCount}`);
                        console.log(`  - Items promoted to long-term: ${itemsPromoted}`);
                        console.log(`  - Items removed (low priority): ${slotsChanged - itemsPromoted}`);
                        console.log(`  - Avg priority: ${beforeStats.avgPriority.toFixed(3)} → ${afterStats.avgPriority.toFixed(3)}`);
                        
                        totalSlotsPromoted += itemsPromoted;
                        totalSlotsRemoved += Math.max(0, slotsChanged - itemsPromoted);
                        personasProcessed++;
                    }
                } catch (error) {
                    console.error(`[Memory Evaluation Service] Error processing persona ${persona.id}:`, error);
                }
            }

            const elapsedMs = Date.now() - startTime;
            this.stats.totalEvaluationRuns++;
            this.stats.totalSlotsPromoted += totalSlotsPromoted;
            this.stats.totalSlotsRemoved += totalSlotsRemoved;
            this.stats.lastRunTime = new Date().toISOString();
            this.lastEvaluationTime = Date.now();

            if (personasProcessed > 0) {
                console.log(`[Memory Evaluation Service] Evaluation cycle completed:`);
                console.log(`  - Personas processed: ${personasProcessed}`);
                console.log(`  - Slots promoted: ${totalSlotsPromoted}`);
                console.log(`  - Slots removed: ${totalSlotsRemoved}`);
                console.log(`  - Time taken: ${elapsedMs}ms`);
            }
        } catch (error) {
            console.error('[Memory Evaluation Service] Error during evaluation cycle:', error);
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
                intervalMinutes: this.evaluationIntervalMs / 60000,
                accessPromotionThreshold: 5,
                semanticClusterThreshold: 3
            },
            lastEvaluationTime: this.lastEvaluationTime ? new Date(this.lastEvaluationTime).toISOString() : null,
            nextEvaluationTime: this.lastEvaluationTime ? 
                new Date(this.lastEvaluationTime + this.evaluationIntervalMs).toISOString() : null
        };
    }

    /**
     * Manually trigger an evaluation cycle
     */
    async triggerEvaluation() {
        console.log('[Memory Evaluation Service] Manual evaluation triggered');
        await this.runEvaluation();
    }
}

// Create singleton instance
const memoryDecayService = new MemoryDecayService();

module.exports = memoryDecayService;
