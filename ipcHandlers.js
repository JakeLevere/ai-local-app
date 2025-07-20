const { ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const personaService = require('./personaService.js');
const sharedDataService = require('./sharedDataService.js');
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
    const sharedBase = paths.dataDir || paths.userDataPath;
    if (sharedBase) {
        sharedDataService.init({ basePath: sharedBase, vaultPath: paths.vaultPath });
    }

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
            const currentAIService = await ensureAIService();
            const aiResult = await currentAIService.getChatResponse(personaIdentifier, userContent, appPaths.vaultPath);

            if (!aiResult || typeof aiResult !== 'object') throw new Error('AI routing returned invalid result.');
            finalIdentifier = aiResult.identifier;
            finalChatResponse = aiResult.text;

            const commandResult = await currentAIService.processAIResponseCommands(finalIdentifier, aiResult, appPaths.vaultPath, baseDir);
            finalChatResponse = commandResult.chatResponse ?? finalChatResponse;

            appendChatLog(finalChatResponse, false);

            await currentAIService.appendToConversation(finalIdentifier, userContent, finalChatResponse, appPaths.vaultPath, commandResult.action === 'error');

            // Always also log into the primary persona
            const primaryOnly = personaIdentifier.split('/')[0];
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

    ipcMain.on('open-program', async (event, { program, displayId }) => {
        if (!program || !displayId) return;

        // Sanitize program name to prevent path traversal
        const name = String(program).replace(/[^\w-]/g, '');
        if (!name) return;

        const base = appPaths.serverUrl || `http://localhost:${process.env.PORT || 3000}`;
        const indexPath = path.join(baseDir, 'programs', name, 'index.html');
        const filePath = path.join(baseDir, 'programs', `${name}.html`);

        let relativePath = null;
        try {
            await fs.access(indexPath);
            relativePath = `programs/${name}/index.html`;
        } catch {
            try {
                await fs.access(filePath);
                relativePath = `programs/${name}.html`;
            } catch {
                // no file found
            }
        }

        if (relativePath) {
            const url = `${base.replace(/\/$/, '')}/${relativePath}`;
            sendToRenderer('load-display', { displayId, url });
            try {
                const current = await sharedDataService.getOpenDisplays();
                current[displayId] = { program: name };
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

    sharedDataService.getOpenDisplays()
        .then(displays => {
            sendToRenderer('restore-open-displays', displays);
        })
        .catch(err => {
            console.error('IPC: Failed to load open displays:', err);
        })
        .finally(() => {
            sendToRenderer('backend-ready');
        });
}

module.exports = initialize;
