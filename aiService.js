const fs = require('fs').promises;
const path = require('path');
const { OpenAI } = require('openai');

const SUBPERSONAS_DIR = 'subpersonas';
const PRIMARY_CONVO_FILE = 'Stored_Conversations_Aggregated.md';
const SUB_CONVO_FILE = 'Stored_Conversations.md';
const PRE_PROMPT_FILE = 'Pre-Prompt.md';
const MEMORY_PROMPT_FILE = 'Memory-Prompt.md';
const MEMORY_FILE = 'Memory.md';

function sanitizeFolderName(name) {
    return name?.toLowerCase().replace(/[^a-z0-9_-]/gi, '_') ?? '';
}

function getPersonaFolderPath(identifier, vaultPath) {
    const parts = identifier.split('/');
    if (parts.length === 1) {
        return path.join(vaultPath, sanitizeFolderName(parts[0]));
    } else if (parts.length === 2) {
        return path.join(vaultPath, sanitizeFolderName(parts[0]), SUBPERSONAS_DIR, sanitizeFolderName(parts[1]));
    } else {
        throw new Error(`Invalid persona identifier format: ${identifier}`);
    }
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

let openai = null;

async function initializeOpenAI() {
    if (openai) return;
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OpenAI API key is not set in environment variables.");
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function getRoutedChatResponse(initialIdentifier, userContent, vaultPath, getSubPersonasFunc) {
    await initializeOpenAI();

    let routedIdentifier = initialIdentifier;
    const isPrimary = !initialIdentifier.includes('/');
    const primaryId = initialIdentifier.split('/')[0];

    if (isPrimary && typeof getSubPersonasFunc === 'function') {
        try {
            const subPersonas = await getSubPersonasFunc(primaryId, vaultPath);
            if (Array.isArray(subPersonas) && subPersonas.length > 0) {
                const subList = subPersonas.map(sub => `- ${sub.id}`).join('\n');
                const routingPrompt = `You are a router. Given the input, decide which of the following sub-personas or the primary should respond. Respond ONLY with one ID.\n\n${subList}\n\nUser: ${userContent}`;
                const result = await openai.chat.completions.create({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        { role: 'system', content: 'Route this request.' },
                        { role: 'user', content: routingPrompt }
                    ],
                    max_tokens: 10,
                    temperature: 0
                });
                const choice = result.choices?.[0]?.message?.content?.trim();
                const validIds = [primaryId, ...subPersonas.map(s => s.id)];
                if (validIds.includes(choice)) {
                    routedIdentifier = choice;
                }
            }
        } catch (e) {
            console.warn('[Routing Error]:', e.message);
        }
    }

    const contextPrompt = await readFileSafe(
        path.join(getPersonaFolderPath(routedIdentifier, vaultPath), PRE_PROMPT_FILE),
        'Respond appropriately.'
    );

    const messages = [
        { role: 'system', content: contextPrompt },
        { role: 'user', content: userContent }
    ];

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        max_tokens: 500,
        temperature: 0.7
    });

    let text = response.choices?.[0]?.message?.content?.trim() ?? '';
    if (text.length > 500) {
        text = text.slice(0, 497) + '...';
    }

    return { identifier: routedIdentifier, text };
}

async function appendToConversation(identifier, userContent, aiContent, vaultPath, isError = false) {
    const folder = getPersonaFolderPath(identifier, vaultPath);
    const fileName = identifier.includes('/') ? SUB_CONVO_FILE : PRIMARY_CONVO_FILE;
    const filePath = path.join(folder, fileName);

    await fs.mkdir(folder, { recursive: true });

    const lines = [
        `- You: ${userContent}`,
        `- ${identifier}${isError ? ' (Error)' : ''}: ${aiContent}`,
        ''
    ].join('\n');

    await fs.appendFile(filePath, lines, 'utf-8');
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

module.exports = {
    initializeOpenAI,
    getRoutedChatResponse,
    appendToConversation,
    processAIResponseCommands
};
