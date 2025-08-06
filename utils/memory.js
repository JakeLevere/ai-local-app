// utils/memory.js - Fixed-size queue utility for short-term history

/**
 * Adds a message to the persona's short-term history with a fixed-size queue mechanism.
 * Maintains only the last N messages for top-layer context.
 * 
 * @param {Object} persona - The persona object containing shortTermHistory
 * @param {Object} message - The message to add with {role, content, ts} structure
 * @param {number} maxN - Maximum number of messages to keep (default: 10)
 * @returns {Object} The updated persona object
 */
function addToShortTerm(persona, message, maxN = 10) {
    // Ensure persona has shortTermHistory array
    if (!persona.shortTermHistory) {
        persona.shortTermHistory = [];
    }

    // Ensure message has required fields
    if (!message.role || !message.content) {
        throw new Error('Message must have role and content fields');
    }

    // Add timestamp if not provided
    if (!message.ts) {
        message.ts = Date.now();
    }

    // Add message to the end of the array
    persona.shortTermHistory.push({
        role: message.role,
        content: message.content,
        ts: message.ts
    });

    // Remove from the start if exceeds maxN
    while (persona.shortTermHistory.length > maxN) {
        persona.shortTermHistory.shift();
    }

    return persona;
}

/**
 * Gets the current short-term history for a persona
 * @param {Object} persona - The persona object
 * @returns {Array} The short-term history array
 */
function getShortTermHistory(persona) {
    return persona.shortTermHistory || [];
}

/**
 * Clears the short-term history for a persona
 * @param {Object} persona - The persona object
 * @returns {Object} The updated persona object
 */
function clearShortTermHistory(persona) {
    persona.shortTermHistory = [];
    return persona;
}

/**
 * Gets the size of the short-term history
 * @param {Object} persona - The persona object
 * @returns {number} The number of messages in short-term history
 */
function getShortTermSize(persona) {
    return (persona.shortTermHistory || []).length;
}

/**
 * Add or update a mid-term slot with summary and embedding
 * @param {Object} persona - The persona object
 * @param {Object} slotData - The slot data {summary, embedding, priority, ts}
 * @param {Object} similarSlot - Optional similar slot info {slot, index, similarity}
 * @returns {Object} The updated persona object
 */
function addOrUpdateMidTermSlot(persona, slotData, similarSlot = null) {
    // Ensure persona has midTermSlots array
    if (!persona.midTermSlots) {
        persona.midTermSlots = [];
    }

    if (similarSlot && similarSlot.index >= 0) {
        // Update existing similar slot
        const existingSlot = persona.midTermSlots[similarSlot.index];
        persona.midTermSlots[similarSlot.index] = {
            summary: slotData.summary,
            embedding: slotData.embedding,
            priority: Math.min((existingSlot.priority || 1.0) * 1.1, 10.0), // Increase priority, cap at 10
            ts: slotData.ts || Date.now()
        };
        console.log(`[Memory] Updated existing mid-term slot (similarity: ${similarSlot.similarity.toFixed(3)})`);
    } else {
        // Add new slot
        persona.midTermSlots.push({
            summary: slotData.summary,
            embedding: slotData.embedding,
            priority: slotData.priority || 1.0,
            ts: slotData.ts || Date.now()
        });
        console.log(`[Memory] Added new mid-term slot`);
    }

    // Keep only the most recent/highest priority slots if we exceed a limit (e.g., 20 slots)
    const maxSlots = 20;
    if (persona.midTermSlots.length > maxSlots) {
        // Sort by priority (descending) then by timestamp (descending)
        persona.midTermSlots.sort((a, b) => {
            if (b.priority !== a.priority) {
                return b.priority - a.priority;
            }
            return b.ts - a.ts;
        });
        // Keep only top maxSlots
        persona.midTermSlots = persona.midTermSlots.slice(0, maxSlots);
    }

    return persona;
}

/**
 * Get mid-term slots for a persona
 * @param {Object} persona - The persona object
 * @returns {Array} The mid-term slots array
 */
function getMidTermSlots(persona) {
    return persona.midTermSlots || [];
}

/**
 * Apply time-based decay to mid-term slot priorities
 * @param {Object} persona - The persona object
 * @param {number} decayRate - Decay multiplier per minute (default: 0.98)
 * @param {number} minPriority - Minimum priority threshold for removal (default: 0.2)
 * @param {number} maxAgeMinutes - Maximum age in minutes before removal (default: 30)
 * @returns {Object} The updated persona object with decayed slots
 */
function decayMidTermSlots(persona, decayRate = 0.98, minPriority = 0.2, maxAgeMinutes = 30) {
    if (!persona.midTermSlots || persona.midTermSlots.length === 0) {
        return persona;
    }

    const now = Date.now();
    const maxAgeMs = maxAgeMinutes * 60 * 1000;
    const updatedSlots = [];
    let removedCount = 0;

    persona.midTermSlots.forEach(slot => {
        if (!slot.ts) {
            slot.ts = now; // Set current time if missing
        }

        const ageMs = now - slot.ts;
        const ageMinutes = ageMs / (60 * 1000);
        
        // Apply exponential decay based on age
        const decayFactor = Math.pow(decayRate, ageMinutes);
        const decayedPriority = (slot.priority || 1.0) * decayFactor;
        
        // Check if slot should be removed
        const shouldRemove = decayedPriority < minPriority && ageMs > maxAgeMs;
        
        if (!shouldRemove) {
            // Update the priority with decay
            updatedSlots.push({
                ...slot,
                priority: decayedPriority,
                originalPriority: slot.originalPriority || slot.priority || 1.0,
                lastDecay: now
            });
        } else {
            removedCount++;
        }
    });

    if (removedCount > 0) {
        console.log(`[Memory Decay] Removed ${removedCount} expired mid-term slots`);
    }

    persona.midTermSlots = updatedSlots;
    return persona;
}

/**
 * Get statistics about mid-term memory decay
 * @param {Object} persona - The persona object
 * @returns {Object} Statistics about the mid-term slots
 */
function getMidTermDecayStats(persona) {
    if (!persona.midTermSlots || persona.midTermSlots.length === 0) {
        return {
            totalSlots: 0,
            avgPriority: 0,
            oldestSlotAge: 0,
            newestSlotAge: 0,
            decayedSlots: 0,
            healthySlots: 0
        };
    }

    const now = Date.now();
    let totalPriority = 0;
    let oldestTs = now;
    let newestTs = 0;
    let decayedCount = 0;
    let healthyCount = 0;

    persona.midTermSlots.forEach(slot => {
        const ts = slot.ts || now;
        const priority = slot.priority || 1.0;
        
        totalPriority += priority;
        oldestTs = Math.min(oldestTs, ts);
        newestTs = Math.max(newestTs, ts);
        
        if (priority < 0.5) {
            decayedCount++;
        } else {
            healthyCount++;
        }
    });

    return {
        totalSlots: persona.midTermSlots.length,
        avgPriority: totalPriority / persona.midTermSlots.length,
        oldestSlotAge: Math.round((now - oldestTs) / (60 * 1000)), // in minutes
        newestSlotAge: Math.round((now - newestTs) / (60 * 1000)), // in minutes
        decayedSlots: decayedCount,
        healthySlots: healthyCount
    };
}

/**
 * Batch decay operation for multiple personas
 * @param {Array} personas - Array of persona objects
 * @param {number} decayRate - Decay multiplier per minute
 * @param {number} minPriority - Minimum priority threshold
 * @param {number} maxAgeMinutes - Maximum age in minutes
 * @returns {Array} Updated personas with decayed slots
 */
function batchDecayMidTermSlots(personas, decayRate = 0.98, minPriority = 0.2, maxAgeMinutes = 30) {
    if (!Array.isArray(personas)) {
        return personas;
    }

    console.log(`[Memory Decay] Processing ${personas.length} personas`);
    let totalRemoved = 0;
    
    const updatedPersonas = personas.map(persona => {
        const beforeCount = persona.midTermSlots?.length || 0;
        const updated = decayMidTermSlots(persona, decayRate, minPriority, maxAgeMinutes);
        const afterCount = updated.midTermSlots?.length || 0;
        totalRemoved += (beforeCount - afterCount);
        return updated;
    });

    if (totalRemoved > 0) {
        console.log(`[Memory Decay] Total slots removed across all personas: ${totalRemoved}`);
    }

    return updatedPersonas;
}

module.exports = {
    addToShortTerm,
    getShortTermHistory,
    clearShortTermHistory,
    getShortTermSize,
    addOrUpdateMidTermSlot,
    getMidTermSlots,
    decayMidTermSlots,
    getMidTermDecayStats,
    batchDecayMidTermSlots
};
