// personaService.js (Corrected: Discovery + Data Loading, NO AI)
const fs = require('fs').promises;
const path = require('path'); // Ensure path is required
const sharedDataService = require('./sharedDataService.js');

// Write queue to prevent concurrent writes
const writeQueue = [];
let isProcessingQueue = false;

// --- Constants ---
const PRIMARY_CONVO_FILE = 'Stored_Conversations_Aggregated.md';
const PRE_PROMPT_FILE = 'Pre-Prompt.md';
const MEMORY_PROMPT_FILE = 'Memory-Prompt.md';
const MEMORY_FILE = 'Memory.md';
const ICON_DIR_RELATIVE = 'images';
const PERSONA_DATA_FILE = 'persona.json';
const PROFILE_FILE = 'Profile.md';

// --- Helper Functions ---
function sanitizeFolderName(name) { return name?.toLowerCase().replace(/[^a-z0-9_-]/gi, '_') ?? ''; } // Added nullish check

/**
 * Parse Profile.md content into profile object
 */
function parseProfileMarkdown(content) {
    const profile = {
        name: '',
        description: '',
        style: 'conversational',
        pronouns: 'they/them',
        topics: [],
        traits: [],
        background: '',
        goals: [],
        knowledge: []
    };
    
    if (!content) return profile;
    
    const lines = content.split('\n');
    let currentSection = null;
    let sectionContent = [];
    
    for (const line of lines) {
        // Check for headers
        if (line.startsWith('# ')) {
            // Main name header
            profile.name = line.substring(2).trim();
        } else if (line.startsWith('## ')) {
            // Process previous section if exists
            if (currentSection && sectionContent.length > 0) {
                processSectionContent(profile, currentSection, sectionContent);
                sectionContent = [];
            }
            currentSection = line.substring(3).trim().toLowerCase();
        } else if (currentSection && line.trim()) {
            sectionContent.push(line.trim());
        }
    }
    
    // Process last section
    if (currentSection && sectionContent.length > 0) {
        processSectionContent(profile, currentSection, sectionContent);
    }
    
    return profile;
}

function processSectionContent(profile, section, content) {
    switch(section) {
        case 'description':
        case 'overview':
            profile.description = content.join(' ');
            break;
        case 'style':
        case 'communication style':
            profile.style = content.join(' ');
            break;
        case 'pronouns':
            profile.pronouns = content[0] || 'they/them';
            break;
        case 'topics':
        case 'interests':
        case 'topics of interest':
            profile.topics = content.filter(line => line.startsWith('- '))
                .map(line => line.substring(2).trim());
            break;
        case 'traits':
        case 'personality traits':
            profile.traits = content.filter(line => line.startsWith('- '))
                .map(line => line.substring(2).trim());
            break;
        case 'background':
        case 'backstory':
            profile.background = content.join(' ');
            break;
        case 'goals':
        case 'objectives':
            profile.goals = content.filter(line => line.startsWith('- '))
                .map(line => line.substring(2).trim());
            break;
        case 'knowledge':
        case 'expertise':
        case 'knowledge & expertise':
        case 'knowledge and expertise':
            profile.knowledge = content.filter(line => line.startsWith('- '))
                .map(line => line.substring(2).trim());
            break;
    }
}

/**
 * Generate Profile.md content from profile object
 */
function generateProfileMarkdown(profile) {
    let content = `# ${profile.name || 'Unnamed Persona'}\n\n`;
    
    if (profile.description) {
        content += `## Description\n${profile.description}\n\n`;
    }
    
    if (profile.pronouns) {
        content += `## Pronouns\n${profile.pronouns}\n\n`;
    }
    
    if (profile.style) {
        content += `## Communication Style\n${profile.style}\n\n`;
    }
    
    if (profile.traits && profile.traits.length > 0) {
        content += `## Personality Traits\n`;
        profile.traits.forEach(trait => {
            content += `- ${trait}\n`;
        });
        content += `\n`;
    }
    
    if (profile.background) {
        content += `## Background\n${profile.background}\n\n`;
    }
    
    if (profile.topics && profile.topics.length > 0) {
        content += `## Topics of Interest\n`;
        profile.topics.forEach(topic => {
            content += `- ${topic}\n`;
        });
        content += `\n`;
    }
    
    if (profile.goals && profile.goals.length > 0) {
        content += `## Goals\n`;
        profile.goals.forEach(goal => {
            content += `- ${goal}\n`;
        });
        content += `\n`;
    }
    
    if (profile.knowledge && profile.knowledge.length > 0) {
        content += `## Knowledge & Expertise\n`;
        profile.knowledge.forEach(item => {
            content += `- ${item}\n`;
        });
        content += `\n`;
    }
    
    return content;
}
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

async function loadPersonaData(identifier, vaultPath) {
    const personaFolder = getPersonaFolderPath(identifier, vaultPath);
    const jsonPath = path.join(personaFolder, PERSONA_DATA_FILE);
    const profileMdPath = path.join(personaFolder, PROFILE_FILE);
    
    // Load profile from Profile.md if it exists
    let profile = null;
    try {
        const profileContent = await fs.readFile(profileMdPath, 'utf-8');
        profile = parseProfileMarkdown(profileContent);
        profile.name = profile.name || identifier;
    } catch (err) {
        // Profile.md doesn't exist yet
        profile = null;
    }
    
    // Load memory data from persona.json
    try {
        const content = await fs.readFile(jsonPath, 'utf-8');
        const data = JSON.parse(content);
        
        // Use Profile.md if available, otherwise fall back to JSON profile
        if (!profile) {
            const jsonProfile = data.profile || {};
            profile = {
                name: jsonProfile.name || identifier,
                description: jsonProfile.description || '',
                style: jsonProfile.style || 'conversational',
                pronouns: jsonProfile.pronouns || 'they/them',
                topics: jsonProfile.topics || [],
                traits: jsonProfile.traits || [],
                background: jsonProfile.background || '',
                goals: jsonProfile.goals || [],
                knowledge: jsonProfile.knowledge || []
            };
        }
        
        return {
            profile: profile,
            shortTermHistory: Array.isArray(data.shortTermHistory) ? data.shortTermHistory : [],
            midTermSlots: Array.isArray(data.midTermSlots) ? data.midTermSlots : [],
            longTermStore: data.longTermStore && Array.isArray(data.longTermStore.items) ? data.longTermStore : { items: [] },
            voice: data.voice || {
                provider: 'elevenlabs',
                voiceId: process.env.ELEVEN_VOICE_ID || null,
                speed: 1.0,
                stability: 0.5,
                similarityBoost: 0.75,
                style: 0.5
            }
        };
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error(`[Persona Service] Error loading persona data for ${identifier}:`, err);
        }
        // Return defaults with profile from Profile.md if available
        return { 
            profile: profile || {
                name: identifier,
                description: '',
                style: 'conversational',
                pronouns: 'they/them',
                topics: [],
                traits: [],
                background: '',
                goals: [],
                knowledge: []
            },
            shortTermHistory: [], 
            midTermSlots: [], 
            longTermStore: { items: [] },
            voice: {
                provider: 'elevenlabs',
                voiceId: process.env.ELEVEN_VOICE_ID || null,
                speed: 1.0,
                stability: 0.5,
                similarityBoost: 0.75,
                style: 0.5
            }
        };
    }
}

async function savePersonaData(identifier, data, vaultPath) {
    // Queue the write operation
    return new Promise((resolve, reject) => {
        writeQueue.push({
            type: 'persona',
            identifier,
            data,
            vaultPath,
            resolve,
            reject
        });
        processWriteQueue();
    });
}

async function _doSavePersonaData(identifier, data, vaultPath) {
    const folder = getPersonaFolderPath(identifier, vaultPath);
    await ensureDirectoryExists(folder);
    
    // Save Profile.md if profile exists
    if (data.profile) {
        const profilePath = path.join(folder, PROFILE_FILE);
        const profileContent = generateProfileMarkdown(data.profile);
        await fs.writeFile(profilePath, profileContent, 'utf-8');
        console.log(`[Persona Service] Saved Profile.md for ${identifier}`);
    }
    
    // Save memory data to persona.json (without profile to avoid duplication)
    const filePath = path.join(folder, PERSONA_DATA_FILE);
    const payload = {
        // Don't save profile in JSON anymore, it's in Profile.md
        shortTermHistory: Array.isArray(data.shortTermHistory) ? data.shortTermHistory : [],
        midTermSlots: Array.isArray(data.midTermSlots) ? data.midTermSlots : [],
        longTermStore: data.longTermStore && Array.isArray(data.longTermStore.items) ? data.longTermStore : { items: [] },
        voice: data.voice || {
            provider: 'elevenlabs',
            voiceId: process.env.ELEVEN_VOICE_ID || null,
            speed: 1.0,
            stability: 0.5,
            similarityBoost: 0.75,
            style: 0.5
        }
    };
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

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

            // Check for image in the Images directory (alongside Personas directory)
            const imagesDir = path.join(path.dirname(vaultPath), 'Images');
            // Check for both .png and .PNG extensions
            let primaryIconExists = false;
            let iconFileName = null;
            for (const ext of ['.png', '.PNG', '.jpg', '.JPG']) {
                const testPath = path.join(imagesDir, `${primaryName}${ext}`);
                if (await fs.access(testPath).then(() => true).catch(() => false)) {
                    primaryIconExists = true;
                    iconFileName = `${primaryName}${ext}`;
                    break;
                }
            }
            
            const memoryData = await loadPersonaData(primarySanitizedId, vaultPath);

            const primaryPersona = {
                id: primarySanitizedId,
                name: primaryName,
                type: 'primary',
                icon: primaryIconExists ? `/images/${iconFileName}` : `/images/placeholder_icon.png`,
                ...memoryData
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
    // Queue the write operation
    return new Promise((resolve, reject) => {
        writeQueue.push({
            type: 'file',
            identifier,
            fileName,
            content,
            vaultPath,
            resolve,
            reject
        });
        processWriteQueue();
    });
}

async function _doSavePersonaFileContent(identifier, fileName, content, vaultPath) {
    const folder = getPersonaFolderPath(identifier, vaultPath);
    await ensureDirectoryExists(folder);
    const filePath = path.join(folder, fileName);
    await fs.writeFile(filePath, content, 'utf-8');
    console.log(`[Persona Service] Saved ${fileName} for ${identifier}`);
}

// Process write queue sequentially
async function processWriteQueue() {
    if (isProcessingQueue || writeQueue.length === 0) {
        return;
    }
    
    isProcessingQueue = true;
    
    while (writeQueue.length > 0) {
        const operation = writeQueue.shift();
        
        try {
            if (operation.type === 'persona') {
                await _doSavePersonaData(
                    operation.identifier,
                    operation.data,
                    operation.vaultPath
                );
            } else if (operation.type === 'file') {
                await _doSavePersonaFileContent(
                    operation.identifier,
                    operation.fileName,
                    operation.content,
                    operation.vaultPath
                );
            }
            operation.resolve();
        } catch (error) {
            console.error(`[Write Queue] Error processing ${operation.type}:`, error);
            operation.reject(error);
        }
    }
    
    isProcessingQueue = false;
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
    loadPersonaData,
    savePersonaData,
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