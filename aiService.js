const fs = require('fs').promises;
const path = require('path');

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

module.exports = {
    initializeOpenAI,
    getChatResponse,
    appendToConversation,
    processAIResponseCommands,
    updateMemorySummary
};
