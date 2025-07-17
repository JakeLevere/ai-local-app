// main.js
const { app, BrowserWindow, BrowserView, ipcMain } = require('electron'); // <--- Added BrowserView and ipcMain
const path = require('path');
const fs = require('fs').promises; // Needed for initial dir creation
// Load IPC handlers from the project root
const initializeIpcHandlers = require('./ipcHandlers');
const express = require('express');
const http = require('http');

let mainWindow;
// Track browser views keyed by displayId
const browserViews = {};
const CONTROL_AREA_HEIGHT = 60; // Height reserved for browser controls
const DEFAULT_BROWSER_ZOOM = 0.55;
const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3000;
let port = DEFAULT_PORT; // Choose an available port

// Define user data paths (accessible to other modules if needed, e.g., passed during init)
const userDataPath = app.getPath('userData');
const dataDir = path.join(app.getPath('documents'), 'ai-local-data');
const vaultPath = path.join(dataDir, 'Personas');
const decksPath = path.join(dataDir, 'Decks');
const imagesPath = path.join(dataDir, 'Images');
const videosPath = path.join(dataDir, 'Videos');
const calendarPath = path.join(dataDir, 'Calendar');

// Global error handlers for more verbose logging
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception in main process:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection in main process:', reason);
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
        console.log('Personas directory ensured:', vaultPath);
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
    try {
        await fs.mkdir(calendarPath, { recursive: true });
        console.log('Calendar directory ensured:', calendarPath);
    } catch (err) {
        console.error('Error preparing calendar directory:', err);
    }
}

// --- NEW BROWSERVIEW FUNCTION ---
// This function creates a new, separate window for the browser.
async function launchBrowser() {
    // Create the browser window.
    const browserWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'programs', 'browser', 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        show: false,
        autoHideMenuBar: true,
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: '#333333', symbolColor: '#ffffff' },
    });
    browserWindow.removeMenu();

    // Create and attach the BrowserView
    const view = new BrowserView();
    browserWindow.setBrowserView(view);

    // Position and resize the BrowserView dynamically
    const controlAreaHeight = CONTROL_AREA_HEIGHT;
    const updateBounds = () => {
        const [width, height] = browserWindow.getContentSize();
        view.setBounds({ x: 0, y: controlAreaHeight, width: width, height: height - controlAreaHeight });
    };

    // Allow the embedded view to resize with the window so the
    // browser content always fills the available area beneath
    // the control bar.
    view.setAutoResize({ width: true, height: true });
    updateBounds();
    browserWindow.on('resize', updateBounds);

    // Load initial URL and the UI
    view.webContents.loadURL('https://www.google.com');
    view.webContents.setZoomFactor(DEFAULT_BROWSER_ZOOM);
    await browserWindow.loadFile(path.join('programs', 'browser', 'index.html'));

    browserWindow.once('ready-to-show', () => {
        browserWindow.maximize();
        browserWindow.show();
    });

    // --- IPC Communication Scoped to this Browser Window ---
    const navigateHandler = (event, url) => {
        // Ensure the event is coming from our browser window
        if (event.sender === browserWindow.webContents) {
            const prefixedUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
            view.webContents.loadURL(prefixedUrl);
        }
    };
    ipcMain.on('navigate-to-url', navigateHandler);

    const zoomHandler = (event, zoom) => {
        if (event.sender === browserWindow.webContents && typeof zoom === 'number') {
            view.webContents.setZoomFactor(zoom);
        }
    };
    ipcMain.on('set-browser-zoom', zoomHandler);

    const backHandler = (event) => {
        if (event.sender === browserWindow.webContents && view.webContents.canGoBack()) {
            view.webContents.goBack();
        }
    };
    ipcMain.on('browser-go-back', backHandler);

    const forwardHandler = (event) => {
        if (event.sender === browserWindow.webContents && view.webContents.canGoForward()) {
            view.webContents.goForward();
        }
    };
    ipcMain.on('browser-go-forward', forwardHandler);

    view.webContents.on('did-finish-load', () => {
        const url = view.webContents.getURL();
        browserWindow.webContents.send('page-did-finish-load', url);
    });

    // Clean up IPC listener when the browser window is closed
    browserWindow.on('closed', () => {
        ipcMain.removeListener('navigate-to-url', navigateHandler);
        ipcMain.removeListener('set-browser-zoom', zoomHandler);
        ipcMain.removeListener('browser-go-back', backHandler);
        ipcMain.removeListener('browser-go-forward', forwardHandler);
    });
}
// --- END NEW BROWSERVIEW FUNCTION ---

async function createWindow(serverUrl) {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webviewTag: true,
            webSecurity: true,
        },
        show: false,
        autoHideMenuBar: true,
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: '#333333', symbolColor: '#ffffff' },
    });
    mainWindow.removeMenu();

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {});
    mainWindow.on('unresponsive', () => {});
    mainWindow.on('crashed', (e) => {});

    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`Renderer console (${sourceId}:${line}):`, message);
    });

    const targetUrl = `${serverUrl}/index.html`;
    console.log('>>> Loading renderer from', targetUrl);

    mainWindow.once('ready-to-show', () => {
        mainWindow.maximize();
        mainWindow.show();
    });

    await mainWindow.loadURL(targetUrl);

    // Initialize your existing IPC handlers
    initializeIpcHandlers(mainWindow, { vaultPath, decksPath, userDataPath, dataDir, imagesPath, videosPath, calendarPath });
    
    // --- ADDED: IPC Listener to launch the browser ---
    // This listens for a message from your main application to open the browser.
    ipcMain.on('launch-browser', (event, { displayId, bounds }) => {
        console.log('[Main Process] Launching browser view...');
        launchBrowserOverlay(bounds, displayId);
    });

    ipcMain.on('update-browser-bounds', (event, { displayId, bounds }) => {
        updateBrowserOverlayBounds(bounds, displayId);
    });

    ipcMain.on('set-browser-zoom', (event, { displayId, zoom }) => {
        const existing = browserViews[displayId];
        if (existing && typeof zoom === 'number') {
            existing.view.webContents.setZoomFactor(zoom);
        }
    });

    ipcMain.on('browser-go-back', (event, displayId) => {
        const existing = browserViews[displayId];
        if (existing && existing.view.webContents.canGoBack()) {
            existing.view.webContents.goBack();
        }
    });

    ipcMain.on('browser-go-forward', (event, displayId) => {
        const existing = browserViews[displayId];
        if (existing && existing.view.webContents.canGoForward()) {
            existing.view.webContents.goForward();
        }
    });

    ipcMain.on('clear-display', (event, displayId) => {
        const existing = browserViews[displayId];
        if (existing) {
            mainWindow.removeBrowserView(existing.view);
            ipcMain.removeListener('navigate-to-url', existing.navigateHandler);
            existing.view.destroy();
            delete browserViews[displayId];
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Create a BrowserView overlayed on the main window for a given display
function launchBrowserOverlay(bounds, displayId) {
    if (!mainWindow || !bounds) return;

    const existing = browserViews[displayId];
    if (existing) {
        mainWindow.removeBrowserView(existing.view);
        ipcMain.removeListener('navigate-to-url', existing.navigateHandler);
        existing.view.destroy();
    }

    const view = new BrowserView({
        webPreferences: {
            preload: path.join(__dirname, 'programs', 'browser', 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    mainWindow.addBrowserView(view);
    view.setBounds({
        x: bounds.x,
        y: bounds.y + CONTROL_AREA_HEIGHT,
        width: bounds.width,
        height: Math.max(bounds.height - CONTROL_AREA_HEIGHT, 0),
    });
    // Keep the view anchored within the specified bounds. Auto-resize is
    // disabled so the view stays confined to its panel size.
    view.setAutoResize({ width: false, height: false });

    view.webContents.loadURL('https://www.google.com');
    view.webContents.setZoomFactor(DEFAULT_BROWSER_ZOOM);

    const navigateHandler = (event, url) => {
        const prefixed = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
        view.webContents.loadURL(prefixed);
    };
    ipcMain.on('navigate-to-url', navigateHandler);

    view.webContents.on('did-finish-load', () => {
        const url = view.webContents.getURL();
        sendToRenderer('page-did-finish-load', url);
    });

    browserViews[displayId] = { view, navigateHandler };
}

// Update bounds of an existing BrowserView for a display
function updateBrowserOverlayBounds(bounds, displayId) {
    if (!mainWindow || !bounds) return;
    const existing = browserViews[displayId];
    if (!existing) return;
    existing.view.setBounds({
        x: bounds.x,
        y: bounds.y + CONTROL_AREA_HEIGHT,
        width: bounds.width,
        height: Math.max(bounds.height - CONTROL_AREA_HEIGHT, 0),
    });
}

// App initialization (Modified)
app.whenReady().then(async () => {
    console.log('>>> Preparing user data directories...');
    await createUserDataDirectories();
    console.log('>>> Directories ready. Images:', imagesPath, 'Videos:', videosPath);

    try {
        const serverUrl = await startLocalServer();
        console.log('>>> Server started at', serverUrl);
        await createWindow(serverUrl);
    } catch (error) {
        app.quit();
        return;
    }

    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            if (server && server.listening) {
                 await createWindow(`http://localhost:${port}`);
            } else {
                 console.error("Cannot reactivate window: Server not running.");
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

function sendToRenderer(channel, ...args) {
    if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        try { mainWindow.webContents.send(channel, ...args); }
        catch (error) { console.error(`Main Process: Error sending on channel ${channel}:`, error); }
    } else {
        console.warn(`Main Process: Attempted to send on channel '${channel}' but mainWindow is not available.`);
    }
}
