// personaService.js (Corrected: Discovery + Data Loading, NO AI)
const fs = require('fs').promises;
const path = require('path'); // Ensure path is required
const sharedDataService = require('./sharedDataService.js');

// --- Constants ---
const PRIMARY_CONVO_FILE = 'Stored_Conversations_Aggregated.md';
const PRE_PROMPT_FILE = 'Pre-Prompt.md';
const MEMORY_PROMPT_FILE = 'Memory-Prompt.md';
const MEMORY_FILE = 'Memory.md';
const ICON_DIR_RELATIVE = 'images';

// --- Helper Functions ---
function sanitizeFolderName(name) { return name?.toLowerCase().replace(/[^a-z0-9_-]/gi, '_') ?? ''; } // Added nullish check
function getPersonaFolderPath(identifier, vaultPath) {
    if (!identifier || !vaultPath) {
        throw new Error('Persona identifier and vaultPath cannot be empty.');
    }
    return path.join(vaultPath, sanitizeFolderName(identifier));
}

function getPrimaryPersonaFolderPath(primaryName, vaultPath) {
    if (!primaryName || !vaultPath) throw new Error('Primary name and vaultPath cannot be empty.');
    return path.join(vaultPath, sanitizeFolderName(primaryName));
}
async function ensureDirectoryExists(dirPath) { try { await fs.mkdir(dirPath, { recursive: true }); } catch (error) { console.error(`Error ensuring directory exists at ${dirPath}:`, error); throw error; } }
async function readFileSafe(filePath, defaultContent = '') { try { return await fs.readFile(filePath, 'utf-8'); } catch (error) { if (error.code === 'ENOENT') { return defaultContent; } console.error(`Error reading file ${filePath}:`, error); throw error; } }

// --- Persona Discovery ---
async function discoverPersonas(vaultPath, baseDir) {
    console.log(`[Persona Service - Discovery] Starting in: ${vaultPath}`);
    const personas = [];
    try {
        const entries = await fs.readdir(vaultPath, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const primaryName = entry.name;
            const primarySanitizedId = sanitizeFolderName(primaryName);
            if (!primarySanitizedId) continue; // Skip if name leads to empty ID

            const primaryIconPath = path.join(baseDir, ICON_DIR_RELATIVE, `${primarySanitizedId}.png`);
            const primaryIconExists = await fs.access(primaryIconPath).then(() => true).catch(() => false);

            const primaryPersona = {
                id: primarySanitizedId,
                name: primaryName,
                type: 'primary',
                icon: primaryIconExists ? `${ICON_DIR_RELATIVE}/${primarySanitizedId}.png` : `${ICON_DIR_RELATIVE}/placeholder.png`
            };
           personas.push(primaryPersona);
        }
    } catch (error) {
        console.error("[Persona Service - Discovery] Error:", error);
        return [];
    }
    console.log("[Persona Service - Discovery] Finished successfully.");
    return personas; // No need for Array.isArray check here
}

// --- Basic Data Loading ---
async function loadPersonaContent(identifier, vaultPath) {
    console.log(`[Persona Service] Loading content for: ${identifier}`);
    const personaFolderPath = getPersonaFolderPath(identifier, vaultPath);
    let content = { prePrompt: '', memoryPrompt: null, memory: null, conversations: '' };
    try {
        content.prePrompt = await readFileSafe(
            path.join(personaFolderPath, PRE_PROMPT_FILE),
            'Respond as appropriate.'
        );
        content.memoryPrompt = await readFileSafe(path.join(personaFolderPath, MEMORY_PROMPT_FILE), '');
        content.memory = await readFileSafe(path.join(personaFolderPath, MEMORY_FILE), '');
        content.conversations = await readFileSafe(path.join(personaFolderPath, PRIMARY_CONVO_FILE), '');
    } catch (err) {
        console.error(`Error loading content files for ${identifier}:`, err);
    }
    return content;
}

async function loadPersonaEntries(identifier, vaultPath) {
    console.log(`[Persona Service] Loading entries for: ${identifier}`);
    const filePath = path.join(getPersonaFolderPath(identifier, vaultPath), PRIMARY_CONVO_FILE);
    try {
        const content = await readFileSafe(filePath, '');
        const pairs = content.trim().split(/\n\s*\n/).filter(b => b.trim());
        const recentPairs = pairs.slice(-10);
        const result = [];
        const target = identifier;
        for (const pair of recentPairs) {
            const lines = pair.split('\n');
            for (const raw of lines) {
                const line = raw.trim();
                if (
                    line.startsWith('- You:') ||
                    line.startsWith('- [') ||
                    line.startsWith(`- ${target}:`) ||
                    line.startsWith('- Error:')
                ) {
                    result.push({ content: line.substring(2).trim() });
                }
            }
        }
        return result;
    } catch (err) {
        console.error(`Error loading entries from ${filePath} for ${identifier}:`, err);
        return [{ content: `Error: Could not load conversations. ${err.message}` }];
    }
}

async function getPersonaStatus(identifier, vaultPath) {
    console.log(`[Persona Service - Status] Getting status for: ${identifier}`);
    const filePath = path.join(getPersonaFolderPath(identifier, vaultPath), PRIMARY_CONVO_FILE);
    let personaMarkerForLog = `[${identifier}]:`;
    try {
        const [fileStats, content] = await Promise.all([
            fs.stat(filePath),
            readFileSafe(filePath, "")
        ]);
        const regex = new RegExp(`^- ${personaMarkerForLog}\s+(?!Error:)`, "gm");
        const matches = content.match(regex);
        return {
            convCount: matches ? matches.length : 0,
            lastInteraction: fileStats.mtime.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "numeric", hour12: true })
        };
    } catch (err) {
        if (err.code !== "ENOENT") {
            console.error(`[Status] Error getting status for ${identifier}:`, err.message);
        }
        return { convCount: 0, lastInteraction: null };
    }
}


async function loadDecks(decksPath) {
    const decks = {};
    try {
        const files = await fs.readdir(decksPath, { withFileTypes: true });
        for (const entry of files) {
            if (entry.isFile() && entry.name.endsWith('.json')) {
                const name = path.basename(entry.name, '.json');
                try {
                    const content = await fs.readFile(
                        path.join(decksPath, entry.name),
                        'utf-8'
                    );
                    decks[name] = JSON.parse(content);
                } catch (err) {
                    console.error(`[Decks] Failed to parse deck ${entry.name}:`, err);
                }
            }
        }
    } catch (err) {
        console.error('[Decks] Error reading decks directory:', err);
    }
    return decks;
}

async function loadDeck(deckName, decksPath) {
    const filePath = path.join(decksPath, `${sanitizeFolderName(deckName)}.json`);
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch (err) {
        console.error(`[Decks] Error loading deck ${deckName}:`, err);
        return null;
    }
}

async function saveDeck(deckName, deckData, decksPath) {
    const filePath = path.join(decksPath, `${sanitizeFolderName(deckName)}.json`);
    const data = { label: deckData.label || deckName, icon: deckData.icon || '', slides: deckData.slides || {} };
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return data;
}

async function renameDeck(oldName, newName, decksPath) {
    const oldPath = path.join(decksPath, `${sanitizeFolderName(oldName)}.json`);
    const newPath = path.join(decksPath, `${sanitizeFolderName(newName)}.json`);
    await fs.rename(oldPath, newPath);
    try {
        const deck = await loadDeck(newName, decksPath);
        if (deck) {
            deck.label = newName;
            await fs.writeFile(newPath, JSON.stringify(deck, null, 2), 'utf-8');
        }
    } catch (err) {
        console.error('[Decks] Error updating renamed deck:', err);
    }
}

async function deleteDeck(deckName, decksPath) {
    const filePath = path.join(decksPath, `${sanitizeFolderName(deckName)}.json`);
    await fs.unlink(filePath).catch(() => {});
}

async function duplicateDeck(originalName, newName, decksPath) {
    const original = await loadDeck(originalName, decksPath);
    if (!original) throw new Error('Original deck not found');
    const copy = { ...original, label: newName };
    await saveDeck(newName, copy, decksPath);
}

async function savePersonaFileContent(identifier, fileName, content, vaultPath) {
    const folder = getPersonaFolderPath(identifier, vaultPath);
    await ensureDirectoryExists(folder);
    const filePath = path.join(folder, fileName);
    await fs.writeFile(filePath, content, 'utf-8');
    console.log(`[Persona Service] Saved ${fileName} for ${identifier}`);
}

// --- Shared Data Access ---
async function getCalendarEvents() {
    return sharedDataService.getCalendarEvents();
}

async function saveCalendarEvents(events) {
    await sharedDataService.setCalendarEvents(events);
}

async function getHealthMetrics() {
    return sharedDataService.getHealthMetrics();
}

async function saveHealthMetrics(metrics) {
    await sharedDataService.setHealthMetrics(metrics);
}

// --- Exports ---
module.exports = {
    discoverPersonas,
    loadPersonaContent,
    loadPersonaEntries,
    getPersonaStatus,
    loadDecks,
    loadDeck,
    saveDeck,
    renameDeck,
    deleteDeck,
    duplicateDeck,
    savePersonaFileContent, // Keep basic save here
    getCalendarEvents,
    saveCalendarEvents,
    getHealthMetrics,
    saveHealthMetrics,
    // Exported for testing utilities
    sanitizeFolderName,
    getPersonaFolderPath,
    getPrimaryPersonaFolderPath,
    // Still excluded: getSubPersonasFor, appendToConversation, AI functions...
};
