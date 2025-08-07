// utils/memory.js - Fixed-size queue utility for short-term history
const crypto = require('crypto');

// Configuration constants
const SIMILARITY_THRESHOLD = 0.85;
const PROMOTION_THRESHOLD = 0.2;
const LONG_TERM_MAX_ITEMS = 100;
const MIN_ACCESS_COUNT_FOR_PROMOTION = 5;
const SEMANTIC_CLUSTER_THRESHOLD = 3;
const MEMORY_IMPORTANCE_WEIGHTS = {
    personal: 2.0,
    technical: 1.8,
    project: 1.7,
    casual: 1.0,
    general: 1.0
};

/**
 * Compute cosine similarity between two embedding vectors
 * @param {number[]} a - First embedding vector
 * @param {number[]} b - Second embedding vector
 * @returns {number} Cosine similarity score [0, 1]
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

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
 * @param {Object} slotData - The slot data {summary, embedding, priority, ts, category, userMarked}
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
            priority: existingSlot.priority || 1.0,
            baseRelevance: existingSlot.baseRelevance || 1.0,
            accessCount: (existingSlot.accessCount || 0) + 1,
            lastAccessed: Date.now(),
            createdAt: existingSlot.createdAt || existingSlot.ts || Date.now(),
            ts: slotData.ts || Date.now(),
            category: slotData.category || existingSlot.category || 'general',
            userMarkedImportant: slotData.userMarkedImportant || existingSlot.userMarkedImportant || false,
            semanticClusterSize: (existingSlot.semanticClusterSize || 1) + 1
        };
        console.log(`[Memory] Updated existing mid-term slot (similarity: ${similarSlot.similarity.toFixed(3)}, access count: ${persona.midTermSlots[similarSlot.index].accessCount})`);
    } else {
        // Add new slot
        persona.midTermSlots.push({
            summary: slotData.summary,
            embedding: slotData.embedding,
            priority: slotData.priority || 1.0,
            baseRelevance: 1.0,
            accessCount: 0,
            lastAccessed: Date.now(),
            createdAt: Date.now(),
            ts: slotData.ts || Date.now(),
            category: slotData.category || 'general',
            userMarkedImportant: slotData.userMarkedImportant || false,
            semanticClusterSize: 1
        });
        console.log(`[Memory] Added new mid-term slot`);
    }

    // Keep only the most relevant slots if we exceed a limit (e.g., 20 slots)
    const maxSlots = 20;
    if (persona.midTermSlots.length > maxSlots) {
        // Update priorities before sorting
        persona.midTermSlots.forEach(slot => {
            slot.priority = calculateMemoryPriority(slot);
        });
        
        // Sort by priority (descending)
        persona.midTermSlots.sort((a, b) => b.priority - a.priority);
        
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
 * Calculate memory priority based on access patterns and relevance
 * @param {Object} memory - Memory slot object
 * @returns {number} Calculated priority
 */
function calculateMemoryPriority(memory) {
    const now = Date.now();
    const ageMs = now - (memory.createdAt || memory.ts || now);
    const daysSinceCreation = Math.max(1, ageMs / (1000 * 60 * 60 * 24));
    const hoursSinceAccess = Math.max(1, (now - (memory.lastAccessed || memory.ts || now)) / (1000 * 60 * 60));
    
    // Calculate access frequency
    const accessFrequency = (memory.accessCount || 0) / daysSinceCreation;
    
    // Get topic importance weight
    const topicWeight = MEMORY_IMPORTANCE_WEIGHTS[memory.category] || 1.0;
    
    // User marked importance
    const importanceMultiplier = memory.userMarkedImportant ? 2.0 : 1.0;
    
    // Recency boost (gradually decreases over 72 hours)
    const recencyBoost = Math.max(0.5, Math.min(1.5, 1.5 - (hoursSinceAccess / 72)));
    
    // Semantic cluster bonus
    const clusterBonus = Math.min(1.5, 1.0 + (memory.semanticClusterSize || 1) * 0.1);
    
    // Base relevance (can be updated based on semantic similarity to recent topics)
    const baseRelevance = memory.baseRelevance || 1.0;
    
    // Calculate final priority
    const priority = baseRelevance * 
                    (1.0 + accessFrequency) * 
                    topicWeight * 
                    importanceMultiplier * 
                    recencyBoost * 
                    clusterBonus;
    
    return Math.min(10.0, priority); // Cap at 10
}

/**
 * Evaluate and organize mid-term memories for promotion or pruning
 * @param {Object} persona - The persona object
 * @returns {Object} The updated persona object with organized memories
 */
function evaluateMemoriesForPromotion(persona) {
    if (!persona.midTermSlots || persona.midTermSlots.length === 0) {
        return persona;
    }

    const now = Date.now();
    const updatedSlots = [];
    const promotedItems = [];
    let removedCount = 0;

    persona.midTermSlots.forEach(slot => {
        // Update priority based on access patterns
        slot.priority = calculateMemoryPriority(slot);
        
        // Check if should be promoted to long-term
        const shouldPromote = 
            (slot.accessCount >= MIN_ACCESS_COUNT_FOR_PROMOTION) ||
            (slot.userMarkedImportant === true) ||
            (slot.semanticClusterSize >= SEMANTIC_CLUSTER_THRESHOLD);
        
        if (shouldPromote) {
            // Promote to long-term
            promotedItems.push({
                id: slot.id || crypto.randomBytes(8).toString('hex'),
                summary: slot.summary,
                embedding: slot.embedding,
                category: slot.category || 'general',
                originalPriority: slot.priority,
                createdAt: slot.createdAt || slot.ts,
                promotedAt: now,
                accessCount: slot.accessCount || 0,
                userMarkedImportant: slot.userMarkedImportant || false,
                semanticClusterSize: slot.semanticClusterSize || 1
            });
            removedCount++;
        } else if (slot.userMarkedImportant) {
            // Always keep user-marked important memories
            updatedSlots.push(slot);
        } else if (slot.priority >= PROMOTION_THRESHOLD) {
            // Keep in mid-term if priority is good
            updatedSlots.push(slot);
        } else if (persona.midTermSlots.length > 15) {
            // Only remove if we're near capacity
            removedCount++;
        } else {
            // Keep for now if under capacity
            updatedSlots.push(slot);
        }
    });

    if (removedCount > 0 || promotedItems.length > 0) {
        console.log(`[Memory Evaluation] Processed ${persona.midTermSlots.length} slots: ${promotedItems.length} promoted, ${removedCount - promotedItems.length} removed`);
    }

    persona.midTermSlots = updatedSlots;
    
    // Add promoted items to long-term store
    if (promotedItems.length > 0) {
        persona.longTermStore = addToLongTermStore(persona.longTermStore, promotedItems);
    }
    
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
 * Add items to long-term store
 * @param {Object} longTermStore - Current long-term store {items: []}
 * @param {Array} newItems - Items to add
 * @param {number} maxItems - Maximum items to keep (default: LONG_TERM_MAX_ITEMS)
 * @returns {Object} Updated long-term store
 */
function addToLongTermStore(longTermStore = { items: [] }, newItems = [], maxItems = LONG_TERM_MAX_ITEMS) {
    const updated = {
        ...longTermStore,
        items: [...(longTermStore.items || []), ...newItems]
    };
    
    // Maintain max size by removing oldest items
    if (updated.items.length > maxItems) {
        // Sort by promotedAt/createdAt and keep most recent
        updated.items.sort((a, b) => {
            const dateA = new Date(a.promotedAt || a.createdAt || 0);
            const dateB = new Date(b.promotedAt || b.createdAt || 0);
            return dateB - dateA;
        });
        updated.items = updated.items.slice(0, maxItems);
    }
    
    return updated;
}

/**
 * Promote items from mid-term to long-term store
 * @param {Object} persona - The persona object
 * @param {Array} itemsToPromote - Items to promote to long-term
 * @returns {Object} Updated persona object
 */
function promoteToLongTerm(persona, itemsToPromote) {
    if (!itemsToPromote || itemsToPromote.length === 0) {
        return persona;
    }
    
    persona.longTermStore = addToLongTermStore(
        persona.longTermStore || { items: [] },
        itemsToPromote
    );
    
    console.log(`[Memory] Promoted ${itemsToPromote.length} items to long-term store`);
    return persona;
}

/**
 * Run complete memory maintenance cycle
 * @param {Object} persona - Persona data with memory tiers
 * @returns {Object} Updated persona data
 */
function runMemoryMaintenance(persona) {
    if (!persona) return persona;
    
    // Evaluate memories for promotion based on access patterns
    persona = evaluateMemoriesForPromotion(persona);
    
    // Ensure all memory structures exist
    if (!persona.shortTermHistory) persona.shortTermHistory = [];
    if (!persona.midTermSlots) persona.midTermSlots = [];
    if (!persona.longTermStore) persona.longTermStore = { items: [] };
    
    return persona;
}

/**
 * Find relevant items from mid-term and long-term memory
 * @param {number[]} queryEmbedding - Embedding of the query
 * @param {Array} midTermSlots - Mid-term memory slots
 * @param {Object} longTermStore - Long-term memory store
 * @param {number} topK - Number of top results to return (default: 3)
 * @param {Object} persona - Optional persona object to update access counts
 * @returns {Object} {midTerm: [], longTerm: []} relevant items
 */
function findRelevantMemories(queryEmbedding, midTermSlots = [], longTermStore = { items: [] }, topK = 3, persona = null) {
    const midTermResults = [];
    const longTermResults = [];
    
    // Score mid-term slots
    for (let i = 0; i < midTermSlots.length; i++) {
        const slot = midTermSlots[i];
        if (slot.embedding) {
            const similarity = cosineSimilarity(queryEmbedding, slot.embedding);
            if (similarity > 0.5) { // Minimum relevance threshold
                midTermResults.push({
                    ...slot,
                    relevanceScore: similarity,
                    index: i
                });
            }
        }
    }
    
    // Score long-term items
    for (let i = 0; i < (longTermStore.items || []).length; i++) {
        const item = longTermStore.items[i];
        if (item.embedding) {
            const similarity = cosineSimilarity(queryEmbedding, item.embedding);
            if (similarity > 0.5) {
                longTermResults.push({
                    ...item,
                    relevanceScore: similarity,
                    index: i
                });
            }
        }
    }
    
    // Sort by relevance and get top K
    midTermResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
    longTermResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    const topMidTerm = midTermResults.slice(0, topK);
    const topLongTerm = longTermResults.slice(0, topK);
    
    // Update access counts if persona provided
    if (persona) {
        // Update mid-term access counts
        topMidTerm.forEach(result => {
            if (persona.midTermSlots && persona.midTermSlots[result.index]) {
                persona.midTermSlots[result.index].accessCount = 
                    (persona.midTermSlots[result.index].accessCount || 0) + 1;
                persona.midTermSlots[result.index].lastAccessed = Date.now();
                // Update base relevance based on actual usage
                persona.midTermSlots[result.index].baseRelevance = 
                    Math.min(2.0, (persona.midTermSlots[result.index].baseRelevance || 1.0) * 1.05);
            }
        });
        
        // Update long-term access counts
        topLongTerm.forEach(result => {
            if (persona.longTermStore?.items && persona.longTermStore.items[result.index]) {
                persona.longTermStore.items[result.index].accessCount = 
                    (persona.longTermStore.items[result.index].accessCount || 0) + 1;
                persona.longTermStore.items[result.index].lastAccessed = Date.now();
            }
        });
    }
    
    return {
        midTerm: topMidTerm,
        longTerm: topLongTerm
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
    // Cosine similarity
    cosineSimilarity,
    // Short-term memory
    addToShortTerm,
    getShortTermHistory,
    clearShortTermHistory,
    getShortTermSize,
    // Mid-term memory
    addOrUpdateMidTermSlot,
    getMidTermSlots,
    calculateMemoryPriority,
    evaluateMemoriesForPromotion,
    getMidTermDecayStats,
    batchDecayMidTermSlots,
    // Long-term memory
    addToLongTermStore,
    promoteToLongTerm,
    // Memory maintenance
    runMemoryMaintenance,
    findRelevantMemories,
    // Export constants for testing
    SIMILARITY_THRESHOLD,
    PROMOTION_THRESHOLD,
    LONG_TERM_MAX_ITEMS,
    MIN_ACCESS_COUNT_FOR_PROMOTION,
    SEMANTIC_CLUSTER_THRESHOLD,
    MEMORY_IMPORTANCE_WEIGHTS
};
