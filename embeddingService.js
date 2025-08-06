// embeddingService.js - Service for computing text embeddings
const { OpenAI } = require('openai');

let openaiClient = null;

// Failure tracking
let failureMetrics = {
    count: 0,
    lastError: null,
    consecutiveFailures: 0
};

// Cache for embeddings
const embeddingCache = new Map();
const MAX_CACHE_SIZE = 500;

/**
 * Initialize the OpenAI client for embeddings
 */
async function initializeEmbedding() {
    if (!openaiClient) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY environment variable is not set');
        }
        openaiClient = new OpenAI({ apiKey });
    }
    return openaiClient;
}

/**
 * Compute embedding for a given text using OpenAI's embedding model
 * @param {string} text - The text to embed
 * @returns {Promise<number[]>} The embedding vector
 */
async function computeEmbedding(text) {
    if (!text || typeof text !== 'string') {
        console.warn('[Embedding] Invalid text, returning zero vector');
        return generateFallbackEmbedding('');
    }

    // Check cache first
    const cacheKey = text.substring(0, 200);
    if (embeddingCache.has(cacheKey)) {
        return embeddingCache.get(cacheKey);
    }

    // Retry logic with exponential backoff
    const maxRetries = 3;
    let lastError;
    let delay = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await initializeEmbedding();
            
            const response = await openaiClient.embeddings.create({
                model: 'text-embedding-ada-002', // Using Ada v2 for cost-effectiveness
                input: text.trim()
            });

            if (!response.data || !response.data[0] || !response.data[0].embedding) {
                throw new Error('Invalid embedding response from OpenAI');
            }

            const embedding = response.data[0].embedding;
            
            // Cache the successful result
            addToCache(cacheKey, embedding);
            
            // Reset failure metrics on success
            if (failureMetrics.consecutiveFailures > 0) {
                console.log('[Embedding] Service recovered after', failureMetrics.consecutiveFailures, 'failures');
                failureMetrics.consecutiveFailures = 0;
            }

            return embedding;
            
        } catch (error) {
            lastError = error;
            failureMetrics.count++;
            failureMetrics.consecutiveFailures++;
            failureMetrics.lastError = {
                message: error.message,
                timestamp: Date.now()
            };
            
            if (attempt < maxRetries) {
                console.warn(`[Embedding] Attempt ${attempt} failed, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            }
        }
    }
    
    // All retries failed - use fallback
    console.error('[Embedding] All retries failed, using fallback:', lastError.message);
    
    // Generate deterministic fallback embedding
    const fallback = generateFallbackEmbedding(text);
    
    // Cache even the fallback to avoid repeated failures
    addToCache(cacheKey, fallback);
    
    return fallback;
}

/**
 * Compute cosine similarity between two embedding vectors
 * @param {number[]} embedding1 - First embedding vector
 * @param {number[]} embedding2 - Second embedding vector
 * @returns {number} Cosine similarity score between 0 and 1
 */
function cosineSimilarity(embedding1, embedding2) {
    if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
        return 0;
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
        dotProduct += embedding1[i] * embedding2[i];
        norm1 += embedding1[i] * embedding1[i];
        norm2 += embedding2[i] * embedding2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
        return 0;
    }

    return dotProduct / (norm1 * norm2);
}

/**
 * Find the most similar slot in midTermSlots based on embedding similarity
 * @param {number[]} embedding - The embedding to compare
 * @param {Array} midTermSlots - Array of existing slots with embeddings
 * @param {number} threshold - Similarity threshold (default 0.85)
 * @returns {Object|null} The most similar slot if above threshold, null otherwise
 */
function findSimilarSlot(embedding, midTermSlots, threshold = 0.85) {
    if (!embedding || !Array.isArray(midTermSlots) || midTermSlots.length === 0) {
        return null;
    }

    let maxSimilarity = 0;
    let mostSimilarSlot = null;
    let mostSimilarIndex = -1;

    midTermSlots.forEach((slot, index) => {
        if (slot.embedding && Array.isArray(slot.embedding)) {
            const similarity = cosineSimilarity(embedding, slot.embedding);
            if (similarity > maxSimilarity) {
                maxSimilarity = similarity;
                mostSimilarSlot = slot;
                mostSimilarIndex = index;
            }
        }
    });

    if (maxSimilarity >= threshold) {
        return { slot: mostSimilarSlot, index: mostSimilarIndex, similarity: maxSimilarity };
    }

    return null;
}

/**
 * Generate a fallback embedding when API fails
 * @param {string} text - The text to create fallback embedding for
 * @returns {number[]} A deterministic fallback embedding
 */
function generateFallbackEmbedding(text) {
    // Ada-002 produces 1536-dimensional embeddings
    const dimension = 1536;
    const embedding = new Array(dimension).fill(0);
    
    if (!text) {
        return embedding;
    }
    
    // Simple deterministic hash-based approach
    for (let i = 0; i < text.length && i < dimension; i++) {
        const charCode = text.charCodeAt(i);
        // Distribute character codes across embedding dimensions
        const idx = (charCode * 7 + i * 13) % dimension;
        embedding[idx] = (charCode % 20 - 10) / 100; // Small values similar to real embeddings
    }
    
    // Add text length signal
    embedding[0] = Math.tanh(text.length / 500);
    
    // Normalize to unit length (like real embeddings)
    let norm = 0;
    for (let i = 0; i < dimension; i++) {
        norm += embedding[i] * embedding[i];
    }
    norm = Math.sqrt(norm);
    
    if (norm > 0) {
        for (let i = 0; i < dimension; i++) {
            embedding[i] /= norm;
        }
    }
    
    return embedding;
}

/**
 * Add embedding to cache with LRU eviction
 */
function addToCache(key, embedding) {
    if (embeddingCache.size >= MAX_CACHE_SIZE) {
        // Remove oldest entry (first in map)
        const firstKey = embeddingCache.keys().next().value;
        embeddingCache.delete(firstKey);
    }
    embeddingCache.set(key, embedding);
}

/**
 * Get health status of embedding service
 */
function getEmbeddingHealth() {
    return {
        healthy: failureMetrics.consecutiveFailures < 5,
        totalFailures: failureMetrics.count,
        consecutiveFailures: failureMetrics.consecutiveFailures,
        lastError: failureMetrics.lastError,
        cacheSize: embeddingCache.size,
        cacheUtilization: (embeddingCache.size / MAX_CACHE_SIZE) * 100
    };
}

/**
 * Clear the embedding cache
 */
function clearEmbeddingCache() {
    embeddingCache.clear();
    console.log('[Embedding] Cache cleared');
}

module.exports = {
    initializeEmbedding,
    computeEmbedding,
    cosineSimilarity,
    findSimilarSlot,
    getEmbeddingHealth,
    clearEmbeddingCache
};
