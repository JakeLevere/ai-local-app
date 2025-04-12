// ipcHandlers.js (Load persona-creator.html into iframe)
const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises; // Use promises version of fs
const services = require('./services'); // Import your services module

let mainWindow = null;
let appPaths = {}; // To store { vaultPath, decksPath }

// --- Utility Functions within this Module ---
function sendToRenderer(channel, ...args) {
    if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        try { mainWindow.webContents.send(channel, ...args); }
        catch (error) { console.error(`IPC Handler: Error sending on channel ${channel}:`, error); }
    } else { console.warn(`IPC Handler: Attempted to send on channel '${channel}' but mainWindow is not available.`); }
}
function appendChatLog(message, isStatus = true) { sendToRenderer('append-chat-log', message, isStatus, false); }

// --- Main Initialization Function ---
function initialize(windowInstance, paths) {
    console.log('Initializing IPC Handlers...');
    mainWindow = windowInstance;
    appPaths = paths;
    if (!appPaths || !appPaths.vaultPath || !appPaths.decksPath) {
         console.error("FATAL: vaultPath and decksPath must be provided to initialize IPC Handlers.");
         return;
    }

    // --- Register All IPC Event Listeners ---

    ipcMain.on('load-initial-data', async (event, aiName) => { /* ... handler unchanged ... */
        console.log(`IPC: Received load-initial-data for "${aiName}"`);
        if (!aiName) { console.error('IPC Error: load-initial-data called without aiName'); sendToRenderer('main-process-error', 'Cannot load data: No AI Name provided.'); return; }
        try {
            const [status, content, entries, decks] = await Promise.all([
                services.getPersonaStatus(aiName, appPaths.vaultPath),
                services.loadPersonaContent(aiName, appPaths.vaultPath),
                services.loadPersonaEntries(aiName, appPaths.vaultPath),
                services.loadDecks(appPaths.decksPath)
            ]);
            console.log(`IPC: Sending initial-data-loaded for "${aiName}"`);
            sendToRenderer('initial-data-loaded', { aiName, status, content, entries, decks });
        } catch (error) {
            console.error(`IPC Error loading initial data for "${aiName}":`, error);
            sendToRenderer('main-process-error', `Failed to load data for "${aiName}". ${error.message}`);
            sendToRenderer('initial-data-loaded', { aiName, status: { convCount: 0, lastInteraction: null }, content: {}, entries: [{ content: `Error loading conversation: ${error.message}` }], decks: {} });
        }
     });

    ipcMain.on('add-entry', async (event, { userContent, aiName }) => { /* ... handler unchanged ... */
        console.log(`IPC: Received add-entry for "${aiName}"`);
        if (!aiName) { appendChatLog('Error: No AI Persona selected.', true); return; }
        if (!userContent) { appendChatLog('Error: Cannot send an empty message.', true); return; }
        sendToRenderer('start-thinking');
        try {
            const rawAiResponse = await services.getOpenAIChatResponse(aiName, userContent, appPaths.vaultPath);
            const commandResult = await services.processAIResponseCommands(rawAiResponse, aiName, appPaths.vaultPath, __dirname);
            // NOTE: processAIResponseCommands might need adjustment if it specifically
            // targets webview vs iframe for program loading, but currently it just returns the path/URL.
            if (commandResult.action === 'load-image') { sendToRenderer('load-image', { displayId: commandResult.displayId, imagePath: commandResult.imagePath }); }
            else if (commandResult.action === 'load-display') { sendToRenderer('load-display', { displayId: commandResult.displayId, url: commandResult.url }); }
            else if (commandResult.action === 'start-loading') { sendToRenderer('start-loading', { displayId: commandResult.displayId }); }
            else if (commandResult.action === 'error') { appendChatLog(commandResult.chatResponse, false); if (commandResult.displayId) { sendToRenderer('stop-loading', { displayId: commandResult.displayId }); } }
            appendChatLog(commandResult.chatResponse, false);
            await services.appendToConversation(aiName, userContent, commandResult.chatResponse, appPaths.vaultPath);
            const status = await services.getPersonaStatus(aiName, appPaths.vaultPath);
            sendToRenderer('status-updated', { aiName, status });
        } catch (error) {
            console.error(`IPC Error processing entry for "${aiName}":`, error);
            const errorMsg = error.message || 'An unknown error occurred.';
            appendChatLog(`Error: ${errorMsg}`, false);
            try { await services.appendToConversation(aiName, userContent, errorMsg, appPaths.vaultPath, true); }
            catch (logError) { console.error("IPC: Failed to write error entry to conversation file:", logError); }
        } finally { sendToRenderer('stop-thinking'); }
     });

    ipcMain.on('save-config', async (event, { aiName, file, content }) => { /* ... handler unchanged ... */
        console.log(`IPC: Received save-config for "${aiName}", file: ${file}`);
        if (!aiName || !file) { console.error('IPC Error: save-config called without aiName or file'); sendToRenderer('main-process-error', 'Cannot save configuration: Missing AI Name or filename.'); return; }
        try {
            await services.savePersonaFileContent(aiName, file, content, appPaths.vaultPath);
            sendToRenderer('config-saved', { file, content });
            appendChatLog(`${file.split('.')[0]} saved.`, true);
            if (file === 'Stored Conversations.md') {
                const entries = await services.loadPersonaEntries(aiName, appPaths.vaultPath);
                sendToRenderer('entries-loaded', entries);
                const status = await services.getPersonaStatus(aiName, appPaths.vaultPath);
                sendToRenderer('status-updated', { aiName, status });
            }
        } catch (error) { console.error(`IPC Error saving config ${file} for "${aiName}":`, error); sendToRenderer('main-process-error', `Failed to save ${file}. ${error.message}`); }
     });

    ipcMain.on('auto-populate-config', async (event, { aiName, type }) => { /* ... handler unchanged ... */
        console.log(`IPC: Received auto-populate-config for "${aiName}", type: ${type}`);
        if (!aiName || !type) { console.error('IPC Error: auto-populate-config called without aiName or type'); sendToRenderer('main-process-error', 'Cannot auto-populate: Missing AI Name or type.'); return; }
        appendChatLog(`Auto-populating ${type}...`, true); sendToRenderer('start-thinking');
        try {
            let populatedContent;
            if (type === 'pre-prompt') { populatedContent = await services.generateAutoPrePrompt(aiName, appPaths.vaultPath); await services.savePersonaFileContent(aiName, 'Pre-Prompt.md', populatedContent, appPaths.vaultPath); }
            else if (type === 'memory') { populatedContent = await services.updatePersonaMemory(aiName, appPaths.vaultPath); }
            else { throw new Error(`Unknown auto-populate type: ${type}`); }
            sendToRenderer('config-populated', { type, content: populatedContent });
            appendChatLog(`${type === 'memory' ? 'Memory' : 'Pre-Prompt'} auto-populated successfully.`, true);
        } catch (error) { console.error(`IPC Error auto-populating ${type} for "${aiName}":`, error); sendToRenderer('main-process-error', `Failed to auto-populate ${type}. ${error.message}`); appendChatLog(`Error auto-populating ${type}: ${error.message}`, true); }
        finally { sendToRenderer('stop-thinking'); }
     });

    // --- Display & Program Loading ---

    // ***** MODIFIED THIS LISTENER *****
    ipcMain.on('load-program', async (event, { displayId, programType }) => {
        console.log(`IPC: Received load-program for ${displayId}, type: ${programType}`);
        if (!displayId || !programType) {
            sendToRenderer('main-process-error', 'Cannot load program: Missing display ID or type.');
            return;
        }

        // --- Load persona-creator.html again ---
        if (programType === 'persona-creator') {
            // Construct the correct path to the local HTML file
            const programPath = path.join(__dirname, 'programs', 'persona-creator.html'); // <<< CHANGED PATH BACK
            try {
                await fs.access(programPath); // Check if file exists
                const fileUrl = `file://${programPath}`; // Create the file URL
                console.log(`IPC: Loading local program file: ${fileUrl}`);
                sendToRenderer('start-loading', { displayId }); // Show loading indicator
                sendToRenderer('load-display', { displayId, url: fileUrl }); // Send file URL to renderer
                appendChatLog(`Loading Persona Creator in display ${displayId}...`, true); // Update chat message
            } catch (err) {
                console.error(`IPC Error: Persona Creator HTML file access failed for path "${programPath}"`, err);
                sendToRenderer('main-process-error', `Persona Creator program file not found or inaccessible.`);
                appendChatLog('Error: Persona Creator program file not found.', true);
            }
        } else {
            console.warn(`IPC: Unknown program type requested: ${programType}`);
            sendToRenderer('main-process-error', `Unknown program type: ${programType}`);
            appendChatLog(`Error: Unknown program type "${programType}".`, true);
        }
        // --- End of change ---
    });
    // ***** END OF MODIFICATION *****

    ipcMain.on('load-display-url', (event, { displayId, url }) => { /* ... handler unchanged ... */
         console.log(`IPC: Received load-display-url for ${displayId}`);
         if (!displayId || !url) { sendToRenderer('main-process-error', 'Cannot load URL: Missing display ID or URL.'); return; }
         sendToRenderer('load-display', { displayId, url });
     });

    ipcMain.on('load-image-path', async (event, { displayId, imagePath }) => { /* ... handler unchanged ... */
        console.log(`IPC: Received load-image-path for ${displayId}`);
        if (!displayId || !imagePath) { sendToRenderer('main-process-error', 'Cannot load image: Missing display ID or path.'); return; }
        try { await fs.access(imagePath); sendToRenderer('load-image', { displayId, imagePath }); }
        catch (err) { console.error(`IPC Error: Image file not found at ${imagePath}`, err); sendToRenderer('main-process-error', `Image file not found for display ${displayId}.`); appendChatLog(`Error: Image file for display ${displayId} is missing.`, true); sendToRenderer('clear-display', { displayId }); }
     });

    ipcMain.on('clear-display', (event, displayId) => { /* ... handler unchanged ... */
        console.log(`IPC: Received clear-display for ${displayId}`);
        if (!displayId) { console.warn('IPC Warning: clear-display called without displayId'); return; }
        sendToRenderer('clear-display', { displayId });
    });


    // --- Deck Management ---
    ipcMain.on('create-deck', async (event, { deckName, displays }) => { /* ... handler unchanged ... */
        console.log(`IPC: Received create-deck for "${deckName}"`);
        if (!deckName || !displays) { sendToRenderer('main-process-error', 'Cannot create deck: Missing name or display data.'); return; }
        try {
            // Adjust display data if needed for iframe vs webview before saving
            const displaysToSave = {};
            Object.keys(displays).forEach(id => {
                displaysToSave[id] = displays[id];
                // If type was 'webview', maybe change it to 'iframe' or keep generic 'web'
                if (displaysToSave[id].type === 'webview') {
                     displaysToSave[id].type = 'iframe'; // Or just 'web'
                }
            });
            await services.saveDeck(deckName, displaysToSave, appPaths.decksPath);
            appendChatLog(`Deck "${deckName}" created.`, true);
            const decks = await services.loadDecks(appPaths.decksPath);
            sendToRenderer('decks-updated', decks);
        } catch (error) { console.error(`IPC Error creating deck "${deckName}":`, error); sendToRenderer('main-process-error', `Failed to create deck "${deckName}". ${error.message}`); }
     });

    ipcMain.on('load-deck', async (event, deckName) => { /* ... handler unchanged ... */
        console.log(`IPC: Received load-deck for "${deckName}"`);
        if (!deckName) { sendToRenderer('main-process-error', 'Cannot load deck: No deck name provided.'); return; }
        try {
            const deckData = await services.loadSpecificDeck(deckName, appPaths.decksPath);
            if (deckData) { sendToRenderer('load-deck-displays', deckData); } // Renderer now handles iframe type
            else { throw new Error(`Deck "${deckName}" not found or is invalid.`); }
        } catch (error) { console.error(`IPC Error loading deck "${deckName}":`, error); sendToRenderer('main-process-error', `Failed to load deck "${deckName}". ${error.message}`); appendChatLog(`Error loading deck "${deckName}".`, true); }
     });

    // --- Persona Creation ---
    ipcMain.on('save-persona', async (event, personaData) => { /* ... handler unchanged ... */
         console.log('IPC: Received save-persona');
         if (!personaData || !personaData.name) { sendToRenderer('main-process-error', 'Cannot save persona: Invalid data received.'); return; }
         try {
             const result = await services.saveNewPersona(personaData, appPaths.vaultPath, __dirname);
             sendToRenderer('add-persona', result.personaMeta);
             appendChatLog(`Persona "${personaData.name}" created successfully!`, true);
         } catch (error) { console.error('IPC Error saving persona:', error); sendToRenderer('main-process-error', `Failed to save persona: ${error.message}`); appendChatLog(`Error creating persona: ${error.message}`, true); }
     });

    // --- Context Menu Actions ---
     ipcMain.on('context-menu-command', async (event, { command, path: targetPath }) => { /* ... handler unchanged ... */
          console.log(`IPC: Received context-menu-command: ${command}`);
          if (command === 'copy-image') {
              if (!targetPath) { sendToRenderer('main-process-error', 'Cannot copy image: Path not provided.'); return; }
              try { await services.copyImageToClipboard(targetPath); console.log(`IPC: Image copied to clipboard: ${targetPath}`); appendChatLog('Image copied to clipboard.', true); }
              catch (error) { console.error(`IPC Error copying image ${targetPath}:`, error); sendToRenderer('main-process-error', `Failed to copy image. ${error.message}`); }
          } else { console.warn(`IPC: Unknown context menu command received: ${command}`); }
     });

    console.log('IPC Handlers Initialized Successfully.');
}

module.exports = initialize; // Export the initialization function
