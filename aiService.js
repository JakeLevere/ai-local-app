const fs = require('fs').promises;
const path = require('path');
const { computeEmbedding, findSimilarSlot } = require('./embeddingService');
const { addOrUpdateMidTermSlot } = require('./utils/memory');
const { addToLongTermStore, topK } = require('./utils/vector');

const PRIMARY_CONVO_FILE = 'Stored_Conversations_Aggregated.md';
const PRE_PROMPT_FILE = 'Pre-Prompt.md';
const MEMORY_PROMPT_FILE = 'Memory-Prompt.md';
const MEMORY_FILE = 'Memory.md';

const MAX_CONVO_PAIRS = 10;

function parseConversationPairs(content) {
    if (!content) return [];
    return content
        .trim()
        .split(/\n\s*\n/)
        .filter(block => block.trim());
}

function buildConversationContent(pairs) {
    return pairs.map(p => p.trim()).join('\n\n') + '\n';
}

function sanitizeFolderName(name) {
    return name?.toLowerCase().replace(/[^a-z0-9_-]/gi, '_') ?? '';
}

function getPersonaFolderPath(identifier, vaultPath) {
    if (!identifier || !vaultPath) {
        throw new Error('Persona identifier and vaultPath cannot be empty.');
    }
    return path.join(vaultPath, sanitizeFolderName(identifier));
}

function getPrimaryPersonaFolderPath(primaryName, vaultPath) {
    return path.join(vaultPath, sanitizeFolderName(primaryName));
}

async function readFileSafe(filePath, defaultContent = '') {
    try {
        return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
        if (error.code === 'ENOENT') return defaultContent;
        throw error;
    }
}

let openai;

async function initializeOpenAI() {
    if (openai) return;
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API key is not set');
    }
    const { OpenAI } = await import('openai');
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function getChatResponse(identifier, messages, vaultPath) {
    await initializeOpenAI();

    const prePrompt = await readFileSafe(
        path.join(getPersonaFolderPath(identifier, vaultPath), PRE_PROMPT_FILE),
        'Respond appropriately.'
    );

    const history = Array.isArray(messages)
        ? messages
        : [{ role: 'user', content: messages }];
    const finalMessages = [{ role: 'system', content: prePrompt }, ...history];

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: finalMessages,
        max_tokens: 500,
        temperature: 0.7
    });

    let text = response.choices?.[0]?.message?.content?.trim() ?? '';
    if (text.length > 500) {
        text = text.slice(0, 497) + '...';
    }

    return { identifier, text };
}

/**
 * Get streaming chat response with chunked output
 * @param {string} message - User message
 * @param {string} personaId - Persona identifier  
 * @param {Function} onChunk - Callback for each text chunk
 * @param {AbortSignal} signal - Abort signal for interruption
 */
async function getChatResponseStreaming(message, personaId, onChunk, signal) {
    await initializeOpenAI();
    
    // For now, using a simple implementation that chunks the response
    // In production, you'd use OpenAI's streaming API
    const response = await getChatResponse(personaId, message, process.env.PERSONAS_PATH || './personas');
    
    // Simulate streaming by chunking the response
    const text = response.text;
    const chunkSize = 160;
    let buffer = '';
    
    for (let i = 0; i < text.length; i += chunkSize) {
        if (signal && signal.aborted) {
            throw new Error('Stream interrupted');
        }
        
        const chunk = text.slice(i, Math.min(i + chunkSize, text.length));
        buffer += chunk;
        
        // Send complete sentences when possible
        const lastPeriod = buffer.lastIndexOf('.');
        const lastQuestion = buffer.lastIndexOf('?');
        const lastExclaim = buffer.lastIndexOf('!');
        const lastSentence = Math.max(lastPeriod, lastQuestion, lastExclaim);
        
        if (lastSentence > 0 && buffer.length > chunkSize / 2) {
            const toSend = buffer.slice(0, lastSentence + 1);
            buffer = buffer.slice(lastSentence + 1);
            const remaining = await onChunk(toSend.trim());
            if (remaining) buffer = remaining + buffer;
        }
        
        // Small delay to simulate streaming
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Send any remaining buffer
    if (buffer.trim()) {
        await onChunk(buffer.trim());
    }
    
    return text;
}

/**
 * Build retrieval-augmented prompt with context from all memory tiers
 * @param {string} identifier - Persona identifier
 * @param {string} userMessage - Current user message
 * @param {Object} personaData - Persona data with memory tiers
 * @param {string} vaultPath - Path to vault
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<Array>} Array of messages for the LLM
 */
async function buildAugmentedPrompt(identifier, userMessage, personaData, vaultPath, debug = false) {
    await initializeOpenAI();
    
    // Get system prompt
    const prePrompt = await readFileSafe(
        path.join(getPersonaFolderPath(identifier, vaultPath), PRE_PROMPT_FILE),
        'Respond appropriately.'
    );

    // Start with system message
    const messages = [];
    
    // Embed the user message for retrieval
    let userEmbedding = null;
    let retrievedMidTerm = [];
    let retrievedLongTerm = [];
    
    try {
        userEmbedding = await computeEmbedding(userMessage);
        
        // Retrieve top 3 from midTermSlots
        if (personaData.midTermSlots && personaData.midTermSlots.length > 0) {
            retrievedMidTerm = topK(userEmbedding, personaData.midTermSlots, 3);
            if (debug) {
                console.log('\n[RAG] Retrieved Mid-Term Slots:');
                retrievedMidTerm.forEach((slot, idx) => {
                    console.log(`  ${idx + 1}. (score: ${slot.score.toFixed(3)}) ${slot.summary.substring(0, 60)}...`);
                });
            }
        }
        
        // Retrieve top 3 from longTermStore
        if (personaData.longTermStore?.items && personaData.longTermStore.items.length > 0) {
            retrievedLongTerm = topK(userEmbedding, personaData.longTermStore.items, 3);
            if (debug) {
                console.log('\n[RAG] Retrieved Long-Term Items:');
                retrievedLongTerm.forEach((item, idx) => {
                    console.log(`  ${idx + 1}. (score: ${item.score.toFixed(3)}) ${item.summary.substring(0, 60)}...`);
                });
            }
        }
    } catch (error) {
        console.error('[RAG] Error during retrieval:', error);
    }
    
    // Build augmented system prompt with retrieved context
    let augmentedSystemPrompt = prePrompt;
    
    // Add retrieved context if available
    const contextParts = [];
    
    if (retrievedMidTerm.length > 0) {
        const midTermContext = retrievedMidTerm
            .filter(slot => slot.score > 0.5) // Only include relevant context (threshold 0.5)
            .map(slot => `- ${slot.summary}`)
            .join('\n');
        if (midTermContext) {
            contextParts.push(`Recent Topics:\n${midTermContext}`);
        }
    }
    
    if (retrievedLongTerm.length > 0) {
        const longTermContext = retrievedLongTerm
            .filter(item => item.score > 0.5) // Only include relevant context (threshold 0.5)
            .map(item => `- ${item.summary}`)
            .join('\n');
        if (longTermContext) {
            contextParts.push(`Historical Context:\n${longTermContext}`);
        }
    }
    
    if (contextParts.length > 0) {
        augmentedSystemPrompt += `\n\n[Context Notes]\n${contextParts.join('\n\n')}`;
        if (debug) {
            console.log('\n[RAG] Context added to prompt');
        }
    }
    
    messages.push({ role: 'system', content: augmentedSystemPrompt });
    
    // Add short-term history (last 10 messages)
    const shortTermMessages = personaData.shortTermHistory || [];
    let tokensUsed = augmentedSystemPrompt.length / 4; // Rough token estimation
    const maxTokens = 3500; // Leave room for response
    
    // Add messages from short-term history (most recent first, then reverse)
    const messagesToAdd = [];
    for (let i = shortTermMessages.length - 1; i >= 0; i--) {
        const msg = shortTermMessages[i];
        const msgLength = msg.content.length / 4; // Rough token estimation
        
        if (tokensUsed + msgLength < maxTokens) {
            messagesToAdd.unshift({
                role: msg.role,
                content: msg.content
            });
            tokensUsed += msgLength;
        } else if (debug) {
            console.log(`[RAG] Truncating short-term history at message ${i} (token limit)`);
            break;
        }
    }
    
    // Add the conversation history
    messages.push(...messagesToAdd);
    
    // Add the current user message
    messages.push({ role: 'user', content: userMessage });
    
    if (debug) {
        console.log(`\n[RAG] Final prompt structure:`);
        console.log(`  - System prompt: ${augmentedSystemPrompt.length} chars`);
        console.log(`  - Context notes: ${contextParts.length} sections`);
        console.log(`  - Short-term history: ${messagesToAdd.length} messages`);
        console.log(`  - Estimated tokens: ${Math.round(tokensUsed)}`);
    }
    
    return messages;
}

/**
 * Enhanced chat response with retrieval-augmented generation
 * @param {string} identifier - Persona identifier  
 * @param {string} userMessage - User's message
 * @param {Object} personaData - Persona data with memory tiers
 * @param {string} vaultPath - Path to vault
 * @param {boolean} enableRAG - Enable retrieval-augmented generation
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<Object>} Response object with text
 */
async function getChatResponseWithRAG(identifier, userMessage, personaData, vaultPath, enableRAG = true, debug = false) {
    await initializeOpenAI();
    
    let messages;
    
    if (enableRAG && personaData) {
        // Use retrieval-augmented prompt construction
        messages = await buildAugmentedPrompt(identifier, userMessage, personaData, vaultPath, debug);
    } else {
        // Fallback to simple prompt
        const prePrompt = await readFileSafe(
            path.join(getPersonaFolderPath(identifier, vaultPath), PRE_PROMPT_FILE),
            'Respond appropriately.'
        );
        messages = [
            { role: 'system', content: prePrompt },
            { role: 'user', content: userMessage }
        ];
    }
    
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: messages,
        max_tokens: 500,
        temperature: 0.7
    });
    
    let text = response.choices?.[0]?.message?.content?.trim() ?? '';
    if (text.length > 500) {
        text = text.slice(0, 497) + '...';
    }
    
    return { identifier, text };
}

async function appendToConversation(identifier, userContent, aiContent, vaultPath, isError = false) {
    const folder = getPersonaFolderPath(identifier, vaultPath);
    const filePath = path.join(folder, PRIMARY_CONVO_FILE);

    await fs.mkdir(folder, { recursive: true });

    const newPair = `- You: ${userContent}\n- ${identifier}${isError ? ' (Error)' : ''}: ${aiContent}`;

    const existingContent = await readFileSafe(filePath, '');
    const pairs = parseConversationPairs(existingContent);
    pairs.push(newPair);
    const recentPairs = pairs.slice(-MAX_CONVO_PAIRS);
    const finalContent = buildConversationContent(recentPairs);

    await fs.writeFile(filePath, finalContent, 'utf-8');
    console.log(`[AI Service] Appended conversation to ${filePath}`);
}

async function processAIResponseCommands(identifier, aiResponse, vaultPath, baseDir) {
    if (typeof aiResponse !== 'string' && typeof aiResponse !== 'object') {
        return {
            action: 'error',
            chatResponse: 'Error: Invalid AI response format.',
            displayId: null
        };
    }

    if (typeof aiResponse === 'object' && aiResponse.text && aiResponse.identifier) {
        return {
            action: 'none',
            chatResponse: aiResponse.text,
            identifier: aiResponse.identifier,
            displayId: null
        };
    }

    return {
        action: 'none',
        chatResponse: aiResponse,
        identifier,
        displayId: null
    };
}

async function updateMemorySummary(identifier, vaultPath, options = {}) {
    await initializeOpenAI();

    const { truncateLength = 2000, convoLength = 4000 } = options;
    const folder = getPersonaFolderPath(identifier, vaultPath);
    const convPath = path.join(folder, PRIMARY_CONVO_FILE);
    const memoryPromptPath = path.join(folder, MEMORY_PROMPT_FILE);
    const memoryPath = path.join(folder, MEMORY_FILE);

    const convContent = await readFileSafe(convPath, '');
    const memoryPrompt = await readFileSafe(
        memoryPromptPath,
        'Summarize the key points, open questions, and action items from the conversation history provided below. Format using Markdown headings and be concise.'
    );

    if (!convContent.trim()) {
        const defaultMem = '# Memory\n\n## Key Insights\n- None yet\n\n## Open Questions\n- None yet\n\n## Action Items\n- None yet';
        await fs.writeFile(memoryPath, defaultMem, 'utf-8');
        return defaultMem;
    }

    const recentConvo = convContent.slice(-convoLength);
    const prompt = `${memoryPrompt}\n\nCONVERSATION HISTORY (recent portion):\n${recentConvo}`;

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
    });

    let summary = response.choices?.[0]?.message?.content?.trim() ?? '';
    if (truncateLength && summary.length > truncateLength) summary = summary.slice(0, truncateLength);
    await fs.writeFile(memoryPath, summary, 'utf-8');
    return summary;
}

async function generateProgramFiles(description) {
    await initializeOpenAI();
    const systemPrompt = 'Generate a simple program based on the user description. Respond with JSON {"files":[{"name":"file.ext","content":"..."}]}';
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: description }
        ],
        temperature: 0.2
    });
    const text = response.choices?.[0]?.message?.content?.trim() ?? '';
    try {
        const json = JSON.parse(text);
        return json.files || [];
    } catch (err) {
        return [{ name: 'output.txt', content: text }];
    }
}

/**
 * Summarize recent conversation turns into a compact summary
 * @param {Array} recentMessages - Array of recent messages to summarize
 * @returns {Promise<string>} The summary text
 */
async function summarizeConversation(recentMessages) {
    await initializeOpenAI();
    
    if (!recentMessages || recentMessages.length === 0) {
        return '';
    }

    // Format messages for summarization
    const formattedMessages = recentMessages.map(msg => 
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
    ).join('\n');

    // Enhanced prompt with strict guardrails
    const prompt = `Summarize the following conversation in EXACTLY 1-3 sentences (max 400 characters total).
Include: key entities, main topic, important tasks or decisions.
Exclude: pleasantries, filler words, meta-discussion.
Be specific and factual.

${formattedMessages}

Summary:`;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini', // Use mini model for cost-effective summarization
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 150,
            temperature: 0.3
        });

        let summary = response.choices?.[0]?.message?.content?.trim() ?? '';
        
        // Enforce 400 character limit
        if (summary.length > 400) {
            summary = summary.substring(0, 397) + '...';
        }
        
        return summary;
    } catch (error) {
        console.error('[AI Service] Error summarizing conversation:', error);
        return '';
    }
}

/**
 * Process conversation for mid-term memory after each turn
 * @param {Object} personaData - The persona data object
 * @param {Array} recentMessages - Recent messages from short-term history
 * @returns {Promise<Object>} Updated persona data
 */
async function processMidTermMemory(personaData, recentMessages) {
    try {
        // Take last 2-4 messages for summarization
        const messagesToSummarize = recentMessages.slice(-4);
        
        if (messagesToSummarize.length < 2) {
            // Not enough messages to summarize
            return personaData;
        }

        // Generate summary
        const summary = await summarizeConversation(messagesToSummarize);
        if (!summary) {
            console.log('[AI Service] No summary generated, skipping mid-term update');
            return personaData;
        }

        console.log('[AI Service] Generated summary:', summary);

        // Compute embedding for the summary
        const embedding = await computeEmbedding(summary);
        console.log('[AI Service] Computed embedding vector (length:', embedding.length, ')');

        // Check for similar existing slots
        const similarSlot = findSimilarSlot(embedding, personaData.midTermSlots || []);
        
        // Add or update the slot
        addOrUpdateMidTermSlot(personaData, {
            summary,
            embedding,
            priority: 1.0,
            ts: Date.now()
        }, similarSlot);

        console.log('[AI Service] Mid-term slots count:', personaData.midTermSlots.length);
        
        return personaData;
    } catch (error) {
        console.error('[AI Service] Error processing mid-term memory:', error);
        return personaData;
    }
}

/**
 * Process conversation for long-term memory storage
 * @param {Object} personaData - The persona data object
 * @param {string} summary - The conversation summary
 * @param {Array} embedding - The embedding vector for the summary
 * @returns {Object} Updated persona data
 */
function processLongTermMemory(personaData, summary, embedding) {
    try {
        if (!summary || !embedding) {
            return personaData;
        }

        // Ensure longTermStore exists
        if (!personaData.longTermStore) {
            personaData.longTermStore = { items: [] };
        }

        // Create metadata for the item
        const meta = {
            timestamp: Date.now(),
            messageCount: personaData.shortTermHistory?.length || 0,
            date: new Date().toISOString()
        };

        // Add to long-term store
        personaData.longTermStore = addToLongTermStore(
            personaData.longTermStore,
            {
                id: `lt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                summary,
                embedding,
                meta
            },
            100 // Keep max 100 items in long-term store
        );

        console.log('[AI Service] Long-term store items:', personaData.longTermStore.items.length);
        
        return personaData;
    } catch (error) {
        console.error('[AI Service] Error processing long-term memory:', error);
        return personaData;
    }
}

/**
 * Process all memory tiers after a conversation turn
 * @param {Object} personaData - The persona data object
 * @param {Array} recentMessages - Recent messages from short-term history
 * @returns {Promise<Object>} Updated persona data
 */
async function processAllMemoryTiers(personaData, recentMessages) {
    try {
        // Take last 2-4 messages for summarization
        const messagesToSummarize = recentMessages.slice(-4);
        
        if (messagesToSummarize.length < 2) {
            // Not enough messages to summarize
            return personaData;
        }

        // Generate summary
        const summary = await summarizeConversation(messagesToSummarize);
        if (!summary) {
            console.log('[AI Service] No summary generated, skipping memory updates');
            return personaData;
        }

        console.log('[AI Service] Generated summary:', summary);

        // Compute embedding for the summary
        const embedding = await computeEmbedding(summary);
        console.log('[AI Service] Computed embedding vector (length:', embedding.length, ')');

        // Process mid-term memory
        const similarSlot = findSimilarSlot(embedding, personaData.midTermSlots || []);
        addOrUpdateMidTermSlot(personaData, {
            summary,
            embedding,
            priority: 1.0,
            ts: Date.now()
        }, similarSlot);
        console.log('[AI Service] Mid-term slots count:', personaData.midTermSlots.length);

        // Process long-term memory
        personaData = processLongTermMemory(personaData, summary, embedding);
        
        return personaData;
    } catch (error) {
        console.error('[AI Service] Error processing memory tiers:', error);
        return personaData;
    }
}

module.exports = {
    initializeOpenAI,
    getChatResponse,
    getChatResponseStreaming,
    getChatResponseWithRAG,
    buildAugmentedPrompt,
    appendToConversation,
    processAIResponseCommands,
    updateMemorySummary,
    processMidTermMemory,
    processAllMemoryTiers,
    // Exported for testing utilities
    sanitizeFolderName,
    getPersonaFolderPath,
    getPrimaryPersonaFolderPath,
    parseConversationPairs,
    generateProgramFiles,
    summarizeConversation
};
