// Centralized configuration for memory management and token budgeting

const MEMORY_CONFIG = {
    // Short-term memory settings
    MAX_SHORT: 10,              // Maximum messages in short-term history
    SHORT_TERM_CAPACITY: 20,    // Total capacity before rotation
    SHORT_TERM_LIMIT: 10,       // Alias for backward compatibility
    
    // Mid-term memory settings
    TOPK_MID: 3,                // Number of mid-term slots to retrieve
    MAX_MID_SLOTS: 20,          // Maximum mid-term slots
    MID_TERM_LIMIT: 20,         // Alias for backward compatibility
    MID_TERM_TOP_K: 3,          // Alias for backward compatibility
    MID_SIMILARITY_THRESHOLD: 0.85, // Threshold for merging similar mid-term slots
    
    // Long-term memory settings
    TOPK_LONG: 3,               // Number of long-term items to retrieve
    MAX_LONG_ITEMS: 100,        // Maximum long-term items
    LONG_TERM_LIMIT: 100,       // Alias for backward compatibility
    LONG_TERM_TOP_K: 3,         // Alias for backward compatibility
    
    // Decay and pruning settings
    DECAY_RATE: 0.98,           // Priority decay rate per minute
    PRUNE_THRESHOLD: 0.2,       // Minimum priority to keep
    MAX_AGE_MINUTES: 30,        // Maximum age before pruning
    DECAY_INTERVAL_MINUTES: 2,  // How often to run decay
    
    // Token budget settings
    MAX_PROMPT_TOKENS: 3500,    // Maximum tokens for prompt (leaving room for response)
    MAX_RESPONSE_TOKENS: 500,   // Maximum tokens for response
    TOKEN_ESTIMATION_FACTOR: 4, // Characters per token (rough estimate)
    
    // Retrieval settings
    RETRIEVAL_SIMILARITY_THRESHOLD: 0.5, // Minimum similarity for including retrieved content
    SIMILARITY_THRESHOLD: 0.5,   // Alias for backward compatibility
    
    // Summarization settings
    MAX_SUMMARY_LENGTH: 400,    // Maximum characters for summaries
    MIN_MESSAGES_TO_SUMMARIZE: 2, // Minimum messages needed to create summary
    SUMMARY_SENTENCES: 3,        // Target number of sentences in summary
    
    // TTS and streaming settings
    STREAM_CHARS_PER_CHUNK: parseInt(process.env.STREAM_CHARS_PER_CHUNK) || 160, // Characters per TTS chunk
    MAX_TTS_CONCURRENCY: parseInt(process.env.MAX_TTS_CONCURRENCY) || 2,      // Maximum concurrent TTS requests
    TTS_CACHE_SIZE_MEMORY: 50,   // Memory cache size for TTS
    TTS_CACHE_SIZE_DISK: 500,    // Disk cache size for TTS
    
    // Latency budget settings
    TARGET_TTFA: 1500,           // Target time to first audio (ms)
    MAX_RESPONSE_TIME: 5000,     // Maximum acceptable response time (ms)
    CHUNK_SIZE_OPTIONS: [100, 120, 160, 200, 240], // Options for chunk size tuning
    OPTIMAL_CHUNK_SIZE: 120,     // Optimal chunk size based on testing
    
    // Latency configuration object for structured access
    LATENCY: {
        TARGET_TTFA_MS: 1500,
        MAX_RESPONSE_MS: 5000,
        CHUNK_SIZE_OPTIONS: [100, 120, 160, 200, 240],
        OPTIMAL_CHUNK_SIZE: 120
    },
    
    // Debug settings
    ENABLE_DEBUG_ENDPOINTS: process.env.NODE_ENV !== 'production',
    DEBUG_RAG: process.env.DEBUG_RAG === 'true',
    DEBUG_MEMORY: process.env.DEBUG_MEMORY === 'true'
};

/**
 * Calculate token budget for a prompt
 * @param {string} text - Text to estimate tokens for
 * @returns {number} Estimated token count
 */
function estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / MEMORY_CONFIG.TOKEN_ESTIMATION_FACTOR);
}

/**
 * Truncate messages to fit within token budget
 * @param {Array} messages - Array of message objects
 * @param {number} maxTokens - Maximum token budget
 * @returns {Array} Truncated messages
 */
function truncateToTokenBudget(messages, maxTokens = MEMORY_CONFIG.MAX_PROMPT_TOKENS) {
    if (!messages || messages.length === 0) return [];
    
    const result = [];
    let tokenCount = 0;
    
    // Process messages in reverse order (most recent first)
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        const msgTokens = estimateTokens(msg.content);
        
        if (tokenCount + msgTokens <= maxTokens) {
            result.unshift(msg);
            tokenCount += msgTokens;
        } else {
            // Try to include a truncated version of the message
            const remainingTokens = maxTokens - tokenCount;
            if (remainingTokens > 50) { // Only include if we have reasonable space
                const truncatedLength = remainingTokens * MEMORY_CONFIG.TOKEN_ESTIMATION_FACTOR;
                const truncatedContent = msg.content.substring(0, truncatedLength) + '...';
                result.unshift({
                    ...msg,
                    content: truncatedContent,
                    truncated: true
                });
            }
            break;
        }
    }
    
    return result;
}

/**
 * Filter retrieved items by similarity threshold
 * @param {Array} items - Retrieved items with scores
 * @param {number} threshold - Minimum similarity threshold
 * @returns {Array} Filtered items
 */
function filterBySimilarity(items, threshold = MEMORY_CONFIG.RETRIEVAL_SIMILARITY_THRESHOLD) {
    if (!items) return [];
    return items.filter(item => item.score >= threshold);
}

/**
 * Build token-aware prompt with retrieval
 * @param {Object} components - Prompt components
 * @returns {Object} Token-aware prompt
 */
function buildTokenAwarePrompt(components) {
    const {
        systemPrompt,
        retrievedMidTerm = [],
        retrievedLongTerm = [],
        shortTermHistory = [],
        currentMessage
    } = components;
    
    let tokenBudget = MEMORY_CONFIG.MAX_PROMPT_TOKENS;
    const result = {
        messages: [],
        metadata: {
            tokensUsed: 0,
            truncated: false,
            includedMidTerm: 0,
            includedLongTerm: 0,
            includedShortTerm: 0
        }
    };
    
    // 1. Reserve tokens for system prompt
    const systemTokens = estimateTokens(systemPrompt);
    tokenBudget -= systemTokens;
    result.metadata.tokensUsed += systemTokens;
    
    // 2. Reserve tokens for current message
    const currentTokens = estimateTokens(currentMessage);
    tokenBudget -= currentTokens;
    result.metadata.tokensUsed += currentTokens;
    
    // 3. Add filtered retrieved context
    let contextParts = [];
    
    // Add mid-term context
    const filteredMidTerm = filterBySimilarity(retrievedMidTerm.slice(0, MEMORY_CONFIG.TOPK_MID));
    for (const item of filteredMidTerm) {
        const contextTokens = estimateTokens(item.summary);
        if (tokenBudget >= contextTokens) {
            contextParts.push(`- ${item.summary}`);
            tokenBudget -= contextTokens;
            result.metadata.tokensUsed += contextTokens;
            result.metadata.includedMidTerm++;
        }
    }
    
    // Add long-term context
    const filteredLongTerm = filterBySimilarity(retrievedLongTerm.slice(0, MEMORY_CONFIG.TOPK_LONG));
    for (const item of filteredLongTerm) {
        const contextTokens = estimateTokens(item.summary);
        if (tokenBudget >= contextTokens) {
            contextParts.push(`- ${item.summary}`);
            tokenBudget -= contextTokens;
            result.metadata.tokensUsed += contextTokens;
            result.metadata.includedLongTerm++;
        }
    }
    
    // 4. Build augmented system prompt
    let augmentedSystemPrompt = systemPrompt;
    if (contextParts.length > 0) {
        augmentedSystemPrompt += `\n\n[Context Notes]\n${contextParts.join('\n')}`;
    }
    
    result.messages.push({ role: 'system', content: augmentedSystemPrompt });
    
    // 5. Add short-term history within remaining budget
    const truncatedHistory = truncateToTokenBudget(
        shortTermHistory.slice(-MEMORY_CONFIG.MAX_SHORT),
        tokenBudget
    );
    
    result.messages.push(...truncatedHistory);
    result.metadata.includedShortTerm = truncatedHistory.length;
    result.metadata.tokensUsed += truncatedHistory.reduce(
        (sum, msg) => sum + estimateTokens(msg.content), 0
    );
    
    if (truncatedHistory.some(msg => msg.truncated)) {
        result.metadata.truncated = true;
    }
    
    // 6. Add current message
    result.messages.push({ role: 'user', content: currentMessage });
    
    return result;
}

/**
 * Get current configuration
 */
function getConfig() {
    return { ...MEMORY_CONFIG };
}

/**
 * Update configuration (for runtime adjustments)
 */
function updateConfig(updates) {
    Object.assign(MEMORY_CONFIG, updates);
    console.log('[Config] Memory configuration updated:', updates);
}

// Export both the config object and individual properties for compatibility
module.exports = {
    MEMORY_CONFIG,
    estimateTokens,
    truncateToTokenBudget,
    filterBySimilarity,
    buildTokenAwarePrompt,
    getConfig,
    updateConfig,
    
    // Export individual constants for backward compatibility
    ...MEMORY_CONFIG
};
