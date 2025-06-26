const { ipcMain, shell } = require('electron');
const path = require('path');
const personaService = require('./personaService.js');
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
    baseDir = __dirname;

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
            const getSubPersonasFunc = (pName, vPath) => personaService.getSubPersonasFor(pName, vPath);
            const aiResult = await currentAIService.getRoutedChatResponse(personaIdentifier, userContent, appPaths.vaultPath, getSubPersonasFunc);

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

    sendToRenderer('backend-ready');
}

module.exports = initialize;
