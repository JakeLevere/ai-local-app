// main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs').promises; // Needed for initial dir creation
const initializeIpcHandlers = require('./ipcHandlers');

let mainWindow;

// Define user data paths (accessible to other modules if needed, e.g., passed during init)
const userDataPath = app.getPath('userData');
const vaultPath = path.join(userDataPath, 'ObsidianVault');
const decksPath = path.join(userDataPath, 'Decks');

// Function to create initial directories
async function createUserDataDirectories() {
    try {
        await fs.mkdir(vaultPath, { recursive: true });
        console.log('ObsidianVault directory ensured:', vaultPath);
    } catch (err) {
        console.error('Error creating vault directory:', err);
    }
    try {
        await fs.mkdir(decksPath, { recursive: true });
        console.log('Decks directory ensured:', decksPath);
    } catch (err) {
        console.error('Error creating decks directory:', err);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            // --- Security Best Practices ---
            nodeIntegration: false, // Keep Node.js out of renderer
            contextIsolation: true, // Protect main/renderer contexts
            // --- Preload Script ---
            preload: path.join(__dirname, 'preload.js'),
            // --- Other Settings ---
            webviewTag: true, // Allow <webview> tag
            webSecurity: true, // Keep web security enabled (more secure)
            // Consider setting sandbox: true for more security if possible
        },
        show: false, // Don't show until ready
    });

    // Load the HTML file
    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // Maximize and show when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.maximize();
        mainWindow.show();
        // Initial data load triggered from renderer ('DOMContentLoaded') now
    });

    // Initialize IPC handlers, passing necessary context
    initializeIpcHandlers(mainWindow, { vaultPath, decksPath });

    // Clean up window object on close
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

     // Open DevTools (optional, for development)
     // mainWindow.webContents.openDevTools();
}

// App initialization
app.whenReady().then(async () => {
    await createUserDataDirectories(); // Ensure directories exist before creating window
    createWindow();

    // macOS specific activation handling
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- Utility (can be used by ipcHandlers if passed or required) ---
function sendToRenderer(channel, ...args) {
    if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send(channel, ...args);
        // console.log(`Main process: Sent ${channel} to renderer`); // Verbose logging
    } else {
        console.warn(`Main process: Attempted to send to renderer on channel '${channel}' but mainWindow is not available or destroyed.`);
    }
}

// Export utility if needed elsewhere, though ipcHandlers can define its own scope
// module.exports = { sendToRenderer };