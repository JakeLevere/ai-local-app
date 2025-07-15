// main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs').promises; // Needed for initial dir creation
const initializeIpcHandlers = require('./ipcHandlers');
const express = require('express'); // <--- Add this
const http = require('http'); // <--- Add this

let mainWindow;
const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3000;
let port = DEFAULT_PORT; // Choose an available port

// Define user data paths (accessible to other modules if needed, e.g., passed during init)
const userDataPath = app.getPath('userData');
const dataDir = path.join(app.getPath('documents'), 'ai-local-data');
const vaultPath = path.join(dataDir, 'ObsidianVault');
const decksPath = path.join(dataDir, 'Decks');
const imagesPath = path.join(dataDir, 'Images');
const videosPath = path.join(dataDir, 'Videos');

// Global error handlers for more verbose logging
process.on('uncaughtException', (err) => {
    console.error('!!! Uncaught Exception in main process:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('!!! Unhandled Rejection in main process:', reason);
});

// --- Express Local Server Setup ---
let server;
const MAX_PORT_RETRIES = 10;

function startLocalServer() {
    const expressApp = express();
    // Serve static files from the project directory
    expressApp.use(express.static(path.join(__dirname)));
    // Serve user images from the persistent data directory
    expressApp.use('/images', express.static(imagesPath));
    // Serve user videos from the persistent data directory
    expressApp.use('/videos', express.static(videosPath));

    // Optional: Add specific routes if needed, but static should cover it

    return new Promise((resolve, reject) => {
        const attempt = (retries) => {
            server = http.createServer(expressApp);

            server.once('error', (err) => {
                if (err.code === 'EADDRINUSE' && retries < MAX_PORT_RETRIES) {
                    console.error(`Port ${port} in use, trying ${port + 1}...`);
                    port += 1;
                    attempt(retries + 1);
                } else {
                    console.error('!!! Failed to start local server:', err);
                    reject(err);
                }
            });

            server.once('listening', () => {
                console.log(`>>> Local server listening on http://localhost:${port}`);
                resolve(`http://localhost:${port}`);
            });

            server.listen(port, 'localhost');
        };

        attempt(0);
    });
}
// --- End Express Setup ---


// Function to create initial directories (Unchanged)
async function createUserDataDirectories() {
    try {
        await fs.mkdir(dataDir, { recursive: true });
    } catch (err) {
        console.error('Error creating data directory:', err);
    }

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
    try {
        await fs.mkdir(imagesPath, { recursive: true });
        const srcImages = path.join(__dirname, 'images');
        try {
            await fs.access(srcImages);
            await fs.cp(srcImages, imagesPath, { recursive: true, errorOnExist: false });
        } catch (copyErr) {
            console.log('No bundled images found at', srcImages);
        }
        console.log('Images directory ensured:', imagesPath);
    } catch (err) {
        console.error('Error preparing images directory:', err);
    }
    try {
        await fs.mkdir(videosPath, { recursive: true });
        const srcVideos = path.join(__dirname, 'videos');
        try {
            await fs.access(srcVideos);
            await fs.cp(srcVideos, videosPath, { recursive: true, errorOnExist: false });
        } catch (copyErr) {
            console.log('No bundled videos found at', srcVideos);
        }
        console.log('Videos directory ensured:', videosPath);
    } catch (err) {
        console.error('Error preparing videos directory:', err);
    }
}

async function createWindow(serverUrl) { // <--- Modified to accept URL
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

             // IMPORTANT: Allow localhost content if webSecurity is strict
            // This might not be strictly needed if served via HTTP,
            // but good to be aware of if issues arise loading local resources.
            // It depends on exact security settings and Chromium version.
        },
        show: false, // Don't show until ready
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error('!!! Window failed to load', validatedURL, errorDescription, errorCode);
    });
    mainWindow.on('unresponsive', () => {
        console.error('!!! Browser window became unresponsive');
    });
    mainWindow.on('crashed', (e) => {
        console.error('!!! Browser window crashed', e);
    });

    // Relay console messages from the renderer to the main process console
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`Renderer console (${sourceId}:${line}):`, message);
    });

    const targetUrl = `${serverUrl}/index.html`;
    console.log('>>> Loading renderer from', targetUrl);

    // Ensure the window will be shown when the content is ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.maximize();
        mainWindow.show();
        // Initial data load triggered from renderer ('DOMContentLoaded') now
    });

    // Load the URL from the local server (e.g., http://localhost:PORT/index.html)
    await mainWindow.loadURL(targetUrl); // <--- CHANGE: Load URL

    // Initialize IPC handlers, passing necessary context (Unchanged)
    initializeIpcHandlers(mainWindow, { vaultPath, decksPath, userDataPath, dataDir, imagesPath, videosPath });

    // Clean up window object on close (Unchanged)
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

     // Open DevTools (optional, for development)
     // mainWindow.webContents.openDevTools();
}

// App initialization (Modified)
app.whenReady().then(async () => {
    console.log('>>> Preparing user data directories...');
    await createUserDataDirectories(); // Ensure directories exist first
    console.log('>>> Directories ready. Images:', imagesPath, 'Videos:', videosPath);

    try {
        const serverUrl = await startLocalServer(); // Start server
        console.log('>>> Server started at', serverUrl);
        await createWindow(serverUrl); // Create window using server URL
    } catch (error) {
        console.error("!!! CRITICAL: Failed to initialize server or window. Quitting.", error);
        app.quit();
        return;
    }


    // macOS specific activation handling (Unchanged)
    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) {
             // Need to ensure server is running or restart if needed on activate
             // For simplicity, assume server is still running; might need more robust handling
            if (server && server.listening) {
                 await createWindow(`http://localhost:${port}`);
            } else {
                 console.error("Cannot reactivate window: Server not running.");
                 // Optionally try restarting server:
                 // try {
                 //    const serverUrl = await startLocalServer();
                 //    await createWindow(serverUrl);
                 // } catch { app.quit(); }
            }
        }
    });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Ensure server is closed when app quits
app.on('will-quit', () => {
    if (server) {
        console.log(">>> Stopping local server...");
        server.close();
    }
});


// --- Utility (can be used by ipcHandlers if passed or required) --- (Unchanged)
function sendToRenderer(channel, ...args) {
    // ... (keep existing code)
    if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        try { mainWindow.webContents.send(channel, ...args); }
        catch (error) { console.error(`Main Process: Error sending on channel ${channel}:`, error); }
    } else {
        console.warn(`Main Process: Attempted to send on channel '${channel}' but mainWindow is not available.`);
    }
}