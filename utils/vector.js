// utils/vector.js - Vector utilities for long-term memory search

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Cosine similarity score between -1 and 1
 */
function cosine(a, b) {
    if (!a || !b || a.length !== b.length) {
        return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
        return 0;
    }

    return dotProduct / (normA * normB);
}

/**
 * Find top K most similar items based on embedding similarity
 * @param {number[]} queryEmbedding - The query embedding vector
 * @param {Array} items - Array of items with embeddings {id, summary, embedding, meta}
 * @param {number} k - Number of top matches to return (default: 5)
 * @returns {Array} Top K items with similarity scores, sorted by descending similarity
 */
function topK(queryEmbedding, items, k = 5) {
    if (!queryEmbedding || !Array.isArray(items) || items.length === 0) {
        return [];
    }

    // Calculate similarity scores for all items
    const scoredItems = items
        .filter(item => item && item.embedding && Array.isArray(item.embedding))
        .map(item => ({
            ...item,
            score: cosine(queryEmbedding, item.embedding)
        }));

    // Sort by descending similarity score
    scoredItems.sort((a, b) => b.score - a.score);

    // Return top K items
    return scoredItems.slice(0, Math.min(k, scoredItems.length));
}

/**
 * Search for items similar to a query in long-term memory
 * @param {string} query - The search query text
 * @param {Array} items - Array of items in long-term store
 * @param {Function} embedFn - Function to compute embedding for the query
 * @param {number} k - Number of results to return
 * @param {number} threshold - Minimum similarity threshold (default: 0.3)
 * @returns {Promise<Array>} Top matching items above threshold
 */
async function searchLongTermMemory(query, items, embedFn, k = 5, threshold = 0.3) {
    if (!query || !items || items.length === 0) {
        return [];
    }

    try {
        // Compute embedding for the query
        const queryEmbedding = await embedFn(query);
        
        // Find top K matches
        const matches = topK(queryEmbedding, items, k);
        
        // Filter by threshold
        return matches.filter(item => item.score >= threshold);
    } catch (error) {
        console.error('[Vector] Error searching long-term memory:', error);
        return [];
    }
}

/**
 * Add an item to long-term memory store
 * @param {Object} store - The long-term store object with items array
 * @param {Object} item - The item to add {id, summary, embedding, meta}
 * @param {number} maxItems - Maximum number of items to keep (default: 100)
 * @returns {Object} Updated store
 */
function addToLongTermStore(store, item, maxItems = 100) {
    if (!store) {
        store = { items: [] };
    }
    if (!store.items) {
        store.items = [];
    }

    // Ensure item has required fields
    if (!item.id) {
        item.id = `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    if (!item.meta) {
        item.meta = {};
    }
    if (!item.meta.timestamp) {
        item.meta.timestamp = Date.now();
    }

    // Add the item
    store.items.push({
        id: item.id,
        summary: item.summary,
        embedding: item.embedding,
        meta: item.meta
    });

    // If we exceed maxItems, remove oldest items
    if (store.items.length > maxItems) {
        // Sort by timestamp (oldest first) and keep only the most recent maxItems
        store.items.sort((a, b) => {
            const timeA = a.meta?.timestamp || 0;
            const timeB = b.meta?.timestamp || 0;
            return timeB - timeA; // Descending order (newest first)
        });
        store.items = store.items.slice(0, maxItems);
    }

    return store;
}

/**
 * Get statistics about the long-term store
 * @param {Object} store - The long-term store object
 * @returns {Object} Statistics about the store
 */
function getLongTermStoreStats(store) {
    if (!store || !store.items) {
        return {
            totalItems: 0,
            oldestItem: null,
            newestItem: null,
            averageEmbeddingSize: 0
        };
    }

    const items = store.items;
    if (items.length === 0) {
        return {
            totalItems: 0,
            oldestItem: null,
            newestItem: null,
            averageEmbeddingSize: 0
        };
    }

    // Sort by timestamp
    const sortedItems = [...items].sort((a, b) => {
        const timeA = a.meta?.timestamp || 0;
        const timeB = b.meta?.timestamp || 0;
        return timeA - timeB;
    });

    const totalEmbeddingSize = items.reduce((sum, item) => {
        return sum + (item.embedding?.length || 0);
    }, 0);

    return {
        totalItems: items.length,
        oldestItem: sortedItems[0],
        newestItem: sortedItems[sortedItems.length - 1],
        averageEmbeddingSize: items.length > 0 ? totalEmbeddingSize / items.length : 0
    };
}

module.exports = {
    cosine,
    topK,
    searchLongTermMemory,
    addToLongTermStore,
    getLongTermStoreStats
};
