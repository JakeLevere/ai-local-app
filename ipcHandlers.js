const { ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const personaService = require('./personaService.js');
const sharedDataService = require('./sharedDataService.js');
const { addToShortTerm, runMemoryMaintenance } = require('./utils/memory.js');
let aiService = null;
let isAIServiceInitialized = false;
let mainWindow = null;
let appPaths = {};
let baseDir = __dirname;

function sendToRenderer(channel, ...args) {
    if (mainWindow?.webContents && !mainWindow.webContents.isDestroyed()) {
        try { mainWindow.webContents.send(channel, ...args); }
        catch (error) { console.error(`IPC Handler: Error sending on channel ${channel}:`, error); }
    }
}

function appendChatLog(message, isStatus = true, isUser = false) {
    sendToRenderer('append-chat-log', message, isStatus, isUser);
}

async function ensureAIService() {
    if (aiService && isAIServiceInitialized) return aiService;
    if (!aiService) aiService = require('./aiService.js');
    if (!isAIServiceInitialized) {
        await aiService.initializeOpenAI();
        isAIServiceInitialized = true;
    }
    return aiService;
}

function initialize(windowInstance, paths) {
    mainWindow = windowInstance;
    appPaths = paths;
    if (!appPaths.serverUrl) {
        appPaths.serverUrl = `http://localhost:${process.env.PORT || 3000}`;
    }
    baseDir = __dirname;
    // sharedDataService is now initialized in main.js

    ipcMain.on('discover-personas', async () => {
        try {
            const personasResult = await personaService.discoverPersonas(appPaths.vaultPath, baseDir);
            sendToRenderer('personas-loaded', Array.isArray(personasResult) ? personasResult : []);
        } catch (error) {
            console.error("IPC Error discovering personas:", error);
            sendToRenderer('main-process-error', `Failed to discover personas: ${error.message}`);
            sendToRenderer('personas-loaded', []);
        }
    });

    ipcMain.on('load-initial-data', async (event, identifier) => {
        if (!identifier) return sendToRenderer('main-process-error', 'No Persona identifier provided.');
        try {
            const [status, content, entries, decks] = await Promise.all([
                personaService.getPersonaStatus(identifier, appPaths.vaultPath),
                personaService.loadPersonaContent(identifier, appPaths.vaultPath),
                personaService.loadPersonaEntries(identifier, appPaths.vaultPath),
                personaService.loadDecks(appPaths.decksPath)
            ]);
            sendToRenderer('initial-data-loaded', { identifier, status, content, entries, decks });
        } catch (error) {
            sendToRenderer('main-process-error', `Failed to load data for "${identifier}". ${error.message}`);
            sendToRenderer('initial-data-loaded', {
                identifier,
                status: { convCount: 0, lastInteraction: null },
                content: {},
                entries: [{ content: `Error loading conversation: ${error.message}` }],
                decks: {}
            });
        }
    });

    ipcMain.on('add-entry', async (event, { userContent, personaIdentifier }) => {
        if (!personaIdentifier || !userContent) {
            appendChatLog('Error: Missing data.', true);
            return;
        }

        sendToRenderer('start-thinking');
        let finalChatResponse = '';
        let finalIdentifier = personaIdentifier;

        try {
            // Load persona data to update short-term history
            const primaryOnly = personaIdentifier.split('/')[0];
            let personaData = await personaService.loadPersonaData(primaryOnly, appPaths.vaultPath);
            
            // Add user message to short-term history
            addToShortTerm(personaData, {
                role: 'user',
                content: userContent,
                ts: Date.now()
            });
            
            const currentAIService = await ensureAIService();
            // Use retrieval-augmented generation with debug enabled via environment variable
            const enableDebug = process.env.RAG_DEBUG === 'true';
            const aiResult = await currentAIService.getChatResponseWithRAG(
                personaIdentifier, 
                userContent, 
                personaData,
                appPaths.vaultPath,
                true, // Enable RAG
                enableDebug // Debug based on env var
            );

            if (!aiResult || typeof aiResult !== 'object') throw new Error('AI routing returned invalid result.');
            finalIdentifier = aiResult.identifier;
            finalChatResponse = aiResult.text;

            const commandResult = await currentAIService.processAIResponseCommands(finalIdentifier, aiResult, appPaths.vaultPath, baseDir);
            finalChatResponse = commandResult.chatResponse ?? finalChatResponse;

            appendChatLog(finalChatResponse, false);
            
            // Add AI response to short-term history
            addToShortTerm(personaData, {
                role: 'assistant',
                content: finalChatResponse,
                ts: Date.now()
            });
            
            // Auto-play TTS for AI response
            try {
                console.log('[IPC] Generating TTS for AI response...');
                const ttsService = require('./services/ttsService');
                const ttsResult = await ttsService.speak(finalChatResponse);
                console.log('[IPC] TTS Result:', ttsResult);
                // Send TTS result to renderer for playback
                sendToRenderer('auto-play-tts', ttsResult);
                console.log('[IPC] Sent auto-play-tts event to renderer');
            } catch (ttsError) {
                console.error('[IPC] Failed to generate TTS for response:', ttsError);
            }
            
            // Process all memory tiers (mid-term and long-term) with summarization and embeddings
            personaData = await currentAIService.processAllMemoryTiers(
                personaData,
                personaData.shortTermHistory || []
            );
            
            // Run memory maintenance (decay and promotion)
            personaData = runMemoryMaintenance(personaData);
            
            // Save updated persona data with all memory tiers
            await personaService.savePersonaData(primaryOnly, personaData, appPaths.vaultPath);

            await currentAIService.appendToConversation(finalIdentifier, userContent, finalChatResponse, appPaths.vaultPath, commandResult.action === 'error');

            // Always also log into the primary persona
            if (finalIdentifier !== primaryOnly) {
                await currentAIService.appendToConversation(primaryOnly, userContent, finalChatResponse, appPaths.vaultPath);
            }

            const status = await personaService.getPersonaStatus(finalIdentifier, appPaths.vaultPath);
            sendToRenderer('status-updated', { identifier: finalIdentifier, status });

        } catch (error) {
            console.error(`[IPC add-entry] Error:`, error);
            finalChatResponse = `Error: ${error.message || 'Unknown error.'}`;
            appendChatLog(finalChatResponse, false);
            try {
                if (aiService?.appendToConversation) {
                    await aiService.appendToConversation(personaIdentifier, userContent, finalChatResponse, appPaths.vaultPath, true);
                }
            } catch (logError) {
                console.error("IPC: Failed to write error entry:", logError);
            }
        } finally {
            sendToRenderer('stop-thinking');
        }
    });

    ipcMain.on('load-display', (event, { displayId, url }) => {
        sendToRenderer('load-display', { displayId, url });
    });

    ipcMain.on('open-program', async (event, { program, displayId, state = {} }) => {
        if (!program || !displayId) return;

        // Sanitize program name to prevent path traversal, but allow spaces and hyphens
        // 1) Remove anything that's not a word char, space, or hyphen
        // 2) Collapse multiple spaces and trim
        const raw = String(program);
        const name = raw.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim();
        if (!name) return;

        const base = appPaths.serverUrl || `http://localhost:${process.env.PORT || 3000}`;

        // Candidate file locations, in priority order:
        // - programs/<name>/index.html
        // - programs/<name>.html
        // - programs/<name>/<name>.html (handles folders where the html matches the folder name)
        const indexPath = path.join(baseDir, 'programs', name, 'index.html');
        const filePath = path.join(baseDir, 'programs', `${name}.html`);
        const namedInsideFolderPath = path.join(baseDir, 'programs', name, `${name}.html`);

        let relativePath = null;
        try {
            await fs.access(indexPath);
            relativePath = `programs/${name}/index.html`;
        } catch {
            try {
                await fs.access(filePath);
                relativePath = `programs/${name}.html`;
            } catch {
                try {
                    await fs.access(namedInsideFolderPath);
                    relativePath = `programs/${name}/${name}.html`;
                } catch {
                    // no file found
                }
            }
        }

        if (relativePath) {
            const url = `${base.replace(/\/$/, '')}/${relativePath}`;
            sendToRenderer('load-display', { displayId, url });
            try {
                const current = await sharedDataService.getOpenDisplays();
                current[displayId] = { ...current[displayId], program: name, ...state };
                await sharedDataService.setOpenDisplays(current);
            } catch (err) {
                console.error('IPC: Failed to persist open display state:', err);
            }
        } else {
            sendToRenderer('append-chat-log', `No program '${name}' found.`, true);
        }
    });

    ipcMain.on('load-image-path', (event, { displayId, imagePath }) => {
        sendToRenderer('load-image', { displayId, imagePath });
    });

    ipcMain.on('load-display-url', (event, { displayId, url }) => {
        sendToRenderer('load-display', { displayId, url });
    });

    ipcMain.on('create-deck', async (event, deckInfo) => {
        try {
            await personaService.saveDeck(deckInfo.name, deckInfo, appPaths.decksPath);
            const decks = await personaService.loadDecks(appPaths.decksPath);
            sendToRenderer('decks-updated', decks);
        } catch (err) {
            sendToRenderer('main-process-error', `Failed to create deck: ${err.message}`);
        }
    });

    ipcMain.on('load-deck', async (event, deckName) => {
        const deck = await personaService.loadDeck(deckName, appPaths.decksPath);
        if (deck) sendToRenderer('load-deck-displays', deck.slides || {});
        else sendToRenderer('main-process-error', `Deck "${deckName}" not found.`);
    });

    ipcMain.on('rename-deck', async (event, { oldName, newName }) => {
        try {
            await personaService.renameDeck(oldName, newName, appPaths.decksPath);
            const decks = await personaService.loadDecks(appPaths.decksPath);
            sendToRenderer('decks-updated', decks);
        } catch (err) {
            sendToRenderer('main-process-error', `Failed to rename deck: ${err.message}`);
        }
    });

    ipcMain.on('delete-deck', async (event, deckName) => {
        try {
            await personaService.deleteDeck(deckName, appPaths.decksPath);
            const decks = await personaService.loadDecks(appPaths.decksPath);
            sendToRenderer('decks-updated', decks);
        } catch (err) {
            sendToRenderer('main-process-error', `Failed to delete deck: ${err.message}`);
        }
    });

    ipcMain.on('duplicate-deck', async (event, { originalName, newName }) => {
        try {
            await personaService.duplicateDeck(originalName, newName, appPaths.decksPath);
            const decks = await personaService.loadDecks(appPaths.decksPath);
            sendToRenderer('decks-updated', decks);
        } catch (err) {
            sendToRenderer('main-process-error', `Failed to duplicate deck: ${err.message}`);
        }
    });

    ipcMain.on('update-memory-summary', async (event, identifier) => {
        if (!identifier) return;
        try {
            const currentAIService = await ensureAIService();
            const summary = await currentAIService.updateMemorySummary(identifier, appPaths.vaultPath);
            sendToRenderer('memory-summary-updated', { identifier, content: summary });
        } catch (err) {
            sendToRenderer('main-process-error', `Failed to update memory: ${err.message}`);
        }
    });

    ipcMain.on('generate-program', async (event, description) => {
        try {
            const currentAIService = await ensureAIService();
            const files = await currentAIService.generateProgramFiles(description);
            sendToRenderer('program-generated', files);
        } catch (err) {
            sendToRenderer('main-process-error', `Failed to generate program: ${err.message}`);
        }
    });

    ipcMain.on('save-deck-slides', async (event, { deckName, slides }) => {
        try {
            const existing = await personaService.loadDeck(deckName, appPaths.decksPath) || {};
            const deckData = { ...existing, slides };
            await personaService.saveDeck(deckName, deckData, appPaths.decksPath);
            const decks = await personaService.loadDecks(appPaths.decksPath);
            sendToRenderer('decks-updated', decks);
        } catch (err) {
            sendToRenderer('main-process-error', `Failed to save deck: ${err.message}`);
        }
    });

    ipcMain.handle('get-calendar-events', async () => {
        return personaService.getCalendarEvents();
    });

    ipcMain.on('save-calendar-events', async (event, events) => {
        try {
            await personaService.saveCalendarEvents(events);
        } catch (err) {
            sendToRenderer('main-process-error', `Failed to save calendar events: ${err.message}`);
        }
    });

    ipcMain.handle('get-health-metrics', async () => {
        return personaService.getHealthMetrics();
    });


    ipcMain.on('save-health-metrics', async (event, metrics) => {
        try {
            await personaService.saveHealthMetrics(metrics);
        } catch (err) {
            sendToRenderer('main-process-error', `Failed to save health metrics: ${err.message}`);
        }
    });

    ipcMain.handle('get-favorite-persona', async () => {
        try {
            return await sharedDataService.getFavoritePersonaId();
        } catch (err) {
            console.error('Failed to get favorite persona:', err);
            return null;
        }
    });

    ipcMain.handle('set-favorite-persona', async (event, personaId) => {
        try {
            await sharedDataService.setFavoritePersonaId(personaId);
            return true;
        } catch (err) {
            console.error('Failed to set favorite persona:', err);
            return false;
        }
    });

    const calendarStateFile = path.join(appPaths.calendarPath || appPaths.dataDir || baseDir, 'calendar-data.json');
    const calendarHistoryFile = path.join(appPaths.calendarPath || appPaths.dataDir || baseDir, 'calendar-history.md');

    ipcMain.handle('calendar-load-state', async () => {
        try {
            const content = await fs.readFile(calendarStateFile, 'utf-8');
            return JSON.parse(content);
        } catch (err) {
            if (err.code === 'ENOENT') return null;
            throw err;
        }
    });

    ipcMain.handle('calendar-save-state', async (event, state) => {
        try {
            await fs.writeFile(calendarStateFile, JSON.stringify(state, null, 2), 'utf-8');
        } catch (err) {
            sendToRenderer('main-process-error', `Failed to save calendar state: ${err.message}`);
        }
    });

    ipcMain.handle('calendar-save-history', async (event, markdown) => {
        try {
            await fs.writeFile(calendarHistoryFile, markdown, 'utf-8');
        } catch (err) {
            sendToRenderer('main-process-error', `Failed to save calendar history: ${err.message}`);
        }
    });

    ipcMain.on('window-control', (event, action) => {
        if (!mainWindow) return;
        switch (action) {
            case 'minimize':
                mainWindow.minimize();
                break;
            case 'maximize':
                if (mainWindow.isMaximized()) mainWindow.unmaximize();
                else mainWindow.maximize();
                break;
            case 'close':
                mainWindow.close();
                break;
        }
    });

    ipcMain.handle('get-open-displays', async () => {
        try {
            return await sharedDataService.getOpenDisplays();
        } catch (err) {
            console.error('IPC: Failed to get open displays:', err);
            return {};
        }
    });

    // Memory UI handlers
    ipcMain.handle('get-persona-memory', async (event, personaId) => {
        try {
            const data = await personaService.loadPersonaData(personaId, appPaths.vaultPath);
            return data;
        } catch (err) {
            console.error('Failed to get persona memory:', err);
            throw err;
        }
    });

    ipcMain.handle('update-persona-profile', async (event, { personaId, profile }) => {
        try {
            const data = await personaService.loadPersonaData(personaId, appPaths.vaultPath);
            data.profile = profile;
            await personaService.savePersonaData(personaId, data, appPaths.vaultPath);
            return true;
        } catch (err) {
            console.error('Failed to update persona profile:', err);
            throw err;
        }
    });

    ipcMain.handle('clear-short-term-history', async (event, personaId) => {
        try {
            const data = await personaService.loadPersonaData(personaId, appPaths.vaultPath);
            data.shortTermHistory = [];
            await personaService.savePersonaData(personaId, data, appPaths.vaultPath);
            return true;
        } catch (err) {
            console.error('Failed to clear short-term history:', err);
            throw err;
        }
    });

    ipcMain.handle('prune-mid-term-memory', async (event, personaId) => {
        try {
            const data = await personaService.loadPersonaData(personaId, appPaths.vaultPath);
            // Keep only high priority recent slots
            const now = Date.now();
            data.midTermSlots = (data.midTermSlots || []).filter(slot => {
                const age = now - (slot.ts || 0);
                const ageMinutes = age / (60 * 1000);
                return slot.priority > 0.5 && ageMinutes < 20;
            });
            await personaService.savePersonaData(personaId, data, appPaths.vaultPath);
            return true;
        } catch (err) {
            console.error('Failed to prune mid-term memory:', err);
            throw err;
        }
    });

    ipcMain.handle('run-memory-maintenance', async (event, personaId) => {
        try {
            let data = await personaService.loadPersonaData(personaId, appPaths.vaultPath);
            data = runMemoryMaintenance(data);
            await personaService.savePersonaData(personaId, data, appPaths.vaultPath);
            return true;
        } catch (err) {
            console.error('Failed to run memory maintenance:', err);
            throw err;
        }
    });

    // TTS handlers
    ipcMain.handle('tts-speak', async (event, { text, options }) => {
        try {
            const ttsService = require('./services/ttsService');
            const result = await ttsService.speak(text, options);
            return result;
        } catch (err) {
            console.error('Failed to speak text:', err);
            throw err;
        }
    });

    ipcMain.handle('tts-set-voice', async (event, voice) => {
        try {
            const ttsService = require('./services/ttsService');
            ttsService.setVoice(voice);
            return true;
        } catch (err) {
            console.error('Failed to set voice:', err);
            return false;
        }
    });

    ipcMain.handle('tts-set-speed', async (event, speed) => {
        try {
            const ttsService = require('./services/ttsService');
            ttsService.setSpeed(speed);
            return true;
        } catch (err) {
            console.error('Failed to set speed:', err);
            return false;
        }
    });

    ipcMain.handle('tts-get-voices', async () => {
        try {
            const ttsService = require('./services/ttsService');
            return ttsService.getAvailableVoices();
        } catch (err) {
            console.error('Failed to get voices:', err);
            return [];
        }
    });

    ipcMain.handle('tts-test', async () => {
        try {
            const ttsService = require('./services/ttsService');
            return await ttsService.testConnection();
        } catch (err) {
            console.error('Failed to test TTS:', err);
            return { success: false, error: err.message };
        }
    });

    // Visualizer Editor handlers
    ipcMain.handle('visualizer:getPersonasPath', async () => {
        try {
            console.log('[Visualizer] Getting personas path:', appPaths.vaultPath);
            return { path: appPaths.vaultPath };
        } catch (err) {
            console.error('Failed to get personas path:', err);
            return { path: null };
        }
    });

    ipcMain.handle('visualizer:listPersonas', async () => {
        try {
            const personas = [];
            const entries = await fs.readdir(appPaths.vaultPath, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    // Check if it's a valid persona folder (has persona.json)
                    const personaJsonPath = path.join(appPaths.vaultPath, entry.name, 'persona.json');
                    try {
                        await fs.access(personaJsonPath);
                        personas.push(entry.name);
                    } catch {
                        // Not a persona folder, skip
                    }
                }
            }
            
            console.log('[Visualizer] Found personas:', personas);
            return { list: personas };
        } catch (err) {
            console.error('Failed to list personas:', err);
            return { list: [] };
        }
    });

    ipcMain.handle('visualizer:readIndex', async (event, { folder }) => {
        try {
            // Ensure the folder exists
            await fs.mkdir(folder, { recursive: true });
            
            const indexPath = path.join(folder, 'index.json');
            const content = await fs.readFile(indexPath, 'utf-8');
            return JSON.parse(content);
        } catch (err) {
            if (err.code === 'ENOENT') {
                // No index file yet, return default
                return { nextId: 1, frames: {} };
            }
            console.error('Failed to read index:', err);
            return null;
        }
    });

    ipcMain.handle('visualizer:writeIndex', async (event, { folder, index }) => {
        try {
            await fs.mkdir(folder, { recursive: true });
            
            // Read existing index to merge frames
            const indexPath = path.join(folder, 'index.json');
            let existingIndex = { frames: {} };
            
            try {
                const content = await fs.readFile(indexPath, 'utf-8');
                existingIndex = JSON.parse(content);
            } catch {
                // No existing index
            }
            
            // Merge with new data
            const mergedIndex = {
                ...existingIndex,
                ...index,
                frames: { ...existingIndex.frames, ...(index.frames || {}) },
                lastUpdated: new Date().toISOString()
            };
            
            await fs.writeFile(indexPath, JSON.stringify(mergedIndex, null, 2), 'utf-8');
            return true;
        } catch (err) {
            console.error('Failed to write index:', err);
            return false;
        }
    });

    ipcMain.handle('visualizer:saveFrames', async (event, { folder, frames }) => {
        try {
            await fs.mkdir(folder, { recursive: true });
            
            const { images, records } = frames;
            const savedFiles = [];
            
            // Save each image
            for (const img of images) {
                const filePath = path.join(folder, img.filename);
                
                // Convert data URL to buffer
                const base64Data = img.blob.replace(/^data:image\/png;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                
                await fs.writeFile(filePath, buffer);
                savedFiles.push(img.filename);
            }
            
            // Update the index with new frames
            const indexPath = path.join(folder, 'index.json');
            let index = { nextId: 1, frames: {} };
            
            try {
                const content = await fs.readFile(indexPath, 'utf-8');
                index = JSON.parse(content);
            } catch {
                // No existing index
            }
            
            // Add new records to frames
            for (const record of records) {
                index.frames[record.id] = {
                    filename: record.filename,
                    timeMs: record.timeMs,
                    meta: record.meta,
                    createdAt: new Date().toISOString()
                };
            }
            
            // Update nextId
            const maxId = Math.max(...records.map(r => r.id), index.nextId - 1);
            index.nextId = maxId + 1;
            index.lastUpdated = new Date().toISOString();
            
            await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
            
            return true;
        } catch (err) {
            console.error('Failed to save frames:', err);
            return false;
        }
    });

    ipcMain.handle('visualizer:getExistingImages', async (event, { folder }) => {
        try {
            const indexPath = path.join(folder, 'index.json');
            const content = await fs.readFile(indexPath, 'utf-8');
            const index = JSON.parse(content);
            
            const images = [];
            
            // Load image data for each frame
            for (const [id, frame] of Object.entries(index.frames || {})) {
                const imagePath = path.join(folder, frame.filename);
                
                try {
                    // Check if file exists
                    await fs.access(imagePath);
                    
                    // For re-description, we'll need to load the actual image data
                    const imageBuffer = await fs.readFile(imagePath);
                    const base64 = imageBuffer.toString('base64');
                    const dataUrl = `data:image/png;base64,${base64}`;
                    
                    images.push({
                        id: parseInt(id),
                        filename: frame.filename,
                        dataUrl,
                        meta: frame.meta
                    });
                } catch (err) {
                    console.warn(`Image not found: ${frame.filename}`);
                }
            }
            
            return { images };
        } catch (err) {
            console.error('Failed to get existing images:', err);
            return { images: [] };
        }
    });

    ipcMain.handle('visualizer:updateDescriptions', async (event, { folder, descriptions }) => {
        try {
            const indexPath = path.join(folder, 'index.json');
            const content = await fs.readFile(indexPath, 'utf-8');
            const index = JSON.parse(content);
            
            // Update descriptions for specified frames
            for (const desc of descriptions) {
                if (index.frames[desc.id]) {
                    index.frames[desc.id].meta = desc.meta;
                    index.frames[desc.id].updatedAt = new Date().toISOString();
                }
            }
            
            index.lastUpdated = new Date().toISOString();
            
            await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
            return true;
        } catch (err) {
            console.error('Failed to update descriptions:', err);
            return false;
        }
    });

    // LLM handler for describing images (used by visualizer editor)
    ipcMain.handle('llm.describeImages', async (event, { batch }) => {
        try {
            console.log('[Visualizer] Describing', batch.length, 'images via GPT-4o-mini');
            await ensureAIService();
            
            // Import OpenAI directly for vision API
            const { OpenAI } = await import('openai');
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            
            // Process each image in the batch
            const results = [];
            for (const item of batch) {
                try {
                    // Prepare the vision request
                    const messages = [
                        {
                            role: "system",
                            content: "You are analyzing portrait frames for a virtual persona system. Analyze the facial features and return a JSON object with these exact fields: mouthViseme (one of: SIL,BMP,FV,L,AA,AE,AO,IY,UW,TH,CH,R,N,S), mouthOpen (0-1), headYaw (-30 to 30), headPitch (-20 to 20), eyes (one of: left,right,center,down,up), brow (one of: neutral,up,down), mood (one of: neutral,warm,angry,sad,excited), energy (0-1), note (max 12 words describing the expression). Be precise and concise."
                        },
                        {
                            role: "user",
                            content: [
                                {
                                    type: "text",
                                    text: item.prompt || "Analyze this facial expression and return the JSON object."
                                },
                                {
                                    type: "image_url",
                                    image_url: {
                                        url: item.image,
                                        detail: "low" // Use low detail for faster processing
                                    }
                                }
                            ]
                        }
                    ];
                    
                    console.log(`[Visualizer] Processing image ${item.id}...`);
                    
                    const response = await openai.chat.completions.create({
                        model: "gpt-4o-mini", // Using mini model for cost efficiency
                        messages: messages,
                        max_tokens: 150,
                        temperature: 0.3, // Lower temperature for more consistent output
                        response_format: { type: "json_object" } // Request JSON format
                    });
                    
                    const content = response.choices?.[0]?.message?.content || '{}';
                    let desc;
                    
                    try {
                        desc = JSON.parse(content);
                        // Validate and set defaults for missing fields
                        desc = {
                            mouthViseme: desc.mouthViseme || 'SIL',
                            mouthOpen: typeof desc.mouthOpen === 'number' ? desc.mouthOpen : 0,
                            headYaw: typeof desc.headYaw === 'number' ? desc.headYaw : 0,
                            headPitch: typeof desc.headPitch === 'number' ? desc.headPitch : 0,
                            eyes: desc.eyes || 'center',
                            brow: desc.brow || 'neutral',
                            mood: desc.mood || 'neutral',
                            energy: typeof desc.energy === 'number' ? desc.energy : 0.5,
                            note: desc.note || 'neutral expression'
                        };
                    } catch (parseErr) {
                        console.error('Failed to parse LLM response:', content);
                        desc = {
                            mouthViseme: 'SIL',
                            mouthOpen: 0,
                            headYaw: 0,
                            headPitch: 0,
                            eyes: 'center',
                            brow: 'neutral',
                            mood: 'neutral',
                            energy: 0.5,
                            note: 'parse error'
                        };
                    }
                    
                    results.push({
                        id: item.id,
                        desc: desc
                    });
                    
                } catch (err) {
                    console.error(`Failed to describe image ${item.id}:`, err.message);
                    results.push({
                        id: item.id,
                        desc: {
                            mouthViseme: 'SIL',
                            mouthOpen: 0,
                            headYaw: 0,
                            headPitch: 0,
                            eyes: 'center',
                            brow: 'neutral',
                            mood: 'neutral',
                            energy: 0.5,
                            note: 'error: ' + (err.message || 'unknown')
                        }
                    });
                }
                
                // Small delay to avoid rate limiting
                if (results.length < batch.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            console.log('[Visualizer] Completed describing', results.length, 'images');
            return results;
        } catch (err) {
            console.error('Failed to describe images:', err);
            throw err;
        }
    });

    // Notify the renderer once backend initialization is complete
    // Add a small delay to ensure renderer is ready to receive the signal
    setTimeout(() => {
        console.log('[IPC Handlers] Sending backend-ready signal to renderer');
        sendToRenderer('backend-ready');
    }, 1000);
}

module.exports = initialize;
