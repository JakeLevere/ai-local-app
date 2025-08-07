// main.js
// Load environment variables first, before any other modules
require('dotenv').config();

const { app, BrowserWindow, BrowserView, ipcMain, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises; // Needed for initial dir creation
// Load IPC handlers from the project root
const initializeIpcHandlers = require('./ipcHandlers');
const express = require('express');
const http = require('http');
const { isUrlSafe } = require('./safeBrowsing');
const sharedDataService = require('./sharedDataService');
const { setupAdBlocker, addAdBlockPatterns, updateAdBlockPatternsFromURL } = require("./adBlocker");
const memoryDecayService = require('./memoryDecayService');
const audioStreamService = require('./services/audioStream');
const ttsCache = require('./services/ttsCache');

let mainWindow;
// Track browser views keyed by displayId
// Each entry: { views: BrowserView[], activeTab, navigateHandler, switchHandler, brightnessKeys, bounds, visible }
const browserViews = {};
const CONTROL_AREA_HEIGHT = 60; // Height reserved for browser controls
const DEFAULT_BROWSER_ZOOM = 0.55;
const MAX_BROWSER_TABS = 5;
const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3000;
let port = DEFAULT_PORT; // Choose an available port

// Define user data paths (populated once the app is ready)
let userDataPath;
let dataDir;
let vaultPath;
let decksPath;
let imagesPath;
let videosPath;
let calendarPath;
let websiteHistoryPath;
let websiteHistoryFile;

    // Global error handlers for more verbose logging
    process.on('uncaughtException', (err) => {
        console.error('Uncaught Exception in main process:', err);
    });
    process.on('unhandledRejection', (reason) => {
        console.error('Unhandled Rejection in main process:', reason);
    });

    // Clean up on exit
    process.on('exit', () => {
        if (memoryDecayService) {
            memoryDecayService.stop();
        }
    });

// --- Express Local Server Setup ---
let server;
let isQuitting = false; // Track quit state to avoid race conditions
const MAX_PORT_RETRIES = 10;

function startLocalServer() {
    const expressApp = express();
    expressApp.use(express.json()); // Add JSON body parser
    
    // Serve static files from the project directory
    expressApp.use(express.static(path.join(__dirname)));
    // Serve user images from the persistent data directory
    expressApp.use('/images', express.static(imagesPath));
    // Serve user videos from the persistent data directory
    expressApp.use('/videos', express.static(videosPath));
    // Serve TTS audio files from temp directory
    const os = require('os');
    const ttsAudioPath = path.join(os.tmpdir(), 'tts-audio');
    expressApp.use('/tts-audio', express.static(ttsAudioPath));
    
    // Add debug endpoints if in development mode
    if (process.env.NODE_ENV !== 'production') {
        const { initializeDebugEndpoints } = require('./services/debugEndpoints');
        const debugRouter = initializeDebugEndpoints(vaultPath);
        expressApp.use(debugRouter);
        console.log('>>> Debug endpoints enabled at /debug/*');
    }

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
                
                // Initialize WebSocket audio streaming
                try {
                    audioStreamService.initialize(server);
                    console.log(`>>> WebSocket audio streaming initialized on ws://localhost:${port}/ws/audio`);
                } catch (wsError) {
                    console.error('Failed to initialize WebSocket audio streaming:', wsError);
                }
                
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
    try {
        await fs.mkdir(websiteHistoryPath, { recursive: true });
        await fs.writeFile(websiteHistoryFile, '', { flag: 'a' });
        console.log('Website history ensured:', websiteHistoryFile);
    } catch (err) {
        console.error('Error preparing website history directory:', err);
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
        titleBarOverlay: { color: '#333333', symbolColor: '#ffffff', height: 30 },
    });
    browserWindow.removeMenu();

    // Create and attach the BrowserView
    const view = new BrowserView();
    browserWindow.setBrowserView(view);

    // Intercept window.open calls from within the BrowserView
    view.webContents.setWindowOpenHandler(({ url }) => {
        if (!isUrlSafe(url)) {
            sendToRenderer('main-process-warning', `Blocked unsafe popup URL: ${url}`);
            return { action: 'deny' };
        }
        const popup = new BrowserWindow({
            width: 800,
            height: 600,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
            },
            autoHideMenuBar: true,
        });
        popup.removeMenu();
        popup.loadURL(url);
        popup.on('closed', () => {
            popup.destroy();
        });
        return { action: 'deny' };
    });

    view.webContents.on('will-navigate', (event, url) => {
        if (!isUrlSafe(url)) {
            event.preventDefault();
            sendToRenderer('main-process-error', `Blocked unsafe URL: ${url}`);
        }
    });

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
    browserWindow.webContents.on('did-finish-load', () => {
        const url = browserWindow.webContents.getURL();
        appendWebsiteHistory(url);
    });

    browserWindow.once('ready-to-show', () => {
        browserWindow.maximize();
        browserWindow.show();
    });

    // --- IPC Communication Scoped to this Browser Window ---
    const navigateHandler = (event, arg) => {
        // Ensure the event is coming from our browser window
        if (event.sender !== browserWindow.webContents) return;
        const targetUrl = typeof arg === 'string' ? arg : (arg && arg.url);
        if (typeof targetUrl === 'string') {
            const prefixedUrl = targetUrl.startsWith('http://') || targetUrl.startsWith('https://') ? targetUrl : `https://${targetUrl}`;
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
        const title = view.webContents.getTitle();
        appendWebsiteHistory(url);
        browserWindow.webContents.send('page-did-finish-load', { url, title });
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

// Helper functions - moved up to be available when needed
function sendToRenderer(channel, ...args) {
    if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        try { mainWindow.webContents.send(channel, ...args); }
        catch (error) { console.error(`Main Process: Error sending on channel ${channel}:`, error); }
    } else {
        console.warn(`Main Process: Attempted to send on channel '${channel}' but mainWindow is not available.`);
    }
}

function sendToWebContents(target, channel, ...args) {
    if (target && !target.isDestroyed()) {
        try { target.send(channel, ...args); }
        catch (error) { console.error(`Main Process: Error sending on channel ${channel}:`, error); }
    }
}

async function appendWebsiteHistory(url) {
    if (!websiteHistoryFile) {
        console.warn('websiteHistoryFile not yet initialized, skipping history append');
        return;
    }
    const timestamp = new Date().toLocaleString();
    const entry = `${timestamp} - ${url}\n`;
    try {
        await fs.appendFile(websiteHistoryFile, entry, 'utf-8');
    } catch (err) {
        console.error('Error appending website history:', err);
    }
}

async function persistBrowserTabUrl(displayId, tabIndex, url) {
    if (!displayId || !url) return;
    console.log(`[Main Process] persistBrowserTabUrl called for ${displayId}, tab ${tabIndex}:`, url);
    try {
        const current = await sharedDataService.getOpenDisplays();
        const entry = current[displayId];
        if (entry && entry.program === 'browser') {
            console.log(`[Main Process] Updating URL for ${displayId} tab ${tabIndex} from '${entry.urls ? entry.urls[tabIndex] : "undefined"}' to '${url}'`);
            entry.urls = entry.urls || [];
            entry.urls[tabIndex] = url;
            if (entry.activeTabIndex === undefined) {
                entry.activeTabIndex = tabIndex;
            }
            if (entry.activeTabIndex === tabIndex) {
                entry.url = url;
            }
            entry.lastUpdated = Date.now();
            await sharedDataService.setOpenDisplays(current);
        } else {
            console.log(`[Main Process] No browser entry found for ${displayId}, entry:`, entry);
        }
    } catch (err) {
        console.error('Error persisting browser URL:', err);
    }
}

async function persistBrowserActiveTab(displayId, tabIndex) {
    try {
        const current = await sharedDataService.getOpenDisplays();
        const entry = current[displayId];
        if (entry && entry.program === 'browser') {
            entry.activeTabIndex = tabIndex;
            if (entry.urls && entry.urls[tabIndex]) {
                entry.url = entry.urls[tabIndex];
            }
            entry.lastUpdated = Date.now();
            await sharedDataService.setOpenDisplays(current);
        }
    } catch (err) {
        console.error('Error persisting active tab index:', err);
    }
}

async function gatherOpenDisplayState() {
    console.log('[Main Process] gatherOpenDisplayState called, collecting browser states...');
    const state = await sharedDataService.getOpenDisplays();
    for (const [id, data] of Object.entries(browserViews)) {
        if (!data) continue;
        const urls = data.views.map(v => (v && !v.webContents.isDestroyed()) ? v.webContents.getURL() : '');
        const activeIndex = data.activeTab;
        state[id] = {
            program: 'browser',
            urls,
            activeTabIndex: activeIndex,
            url: urls[activeIndex],
            lastUpdated: Date.now()
        };
        console.log(`[Main Process] Gathered ${id}:`, state[id]);
    }
    console.log('[Main Process] Final gathered state:', state);
    return state;
}

async function createWindow(serverUrl) {
    console.log('>>> createWindow called with serverUrl:', serverUrl);
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
        titleBarOverlay: { color: '#333333', symbolColor: '#ffffff', height: 30 },
    });
    mainWindow.removeMenu();
    if (mainWindow.setWindowButtonVisibility) {
        mainWindow.setWindowButtonVisibility(false);
    }

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {});
    mainWindow.on('unresponsive', () => {});
    mainWindow.on('crashed', (e) => {});

    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`Renderer console (${sourceId}:${line}):`, message);
    });

    const targetUrl = `${serverUrl}/index.html`;
    console.log('>>> Loading renderer from', targetUrl);

    mainWindow.once('ready-to-show', () => {
        console.log('>>> Window ready-to-show event fired');
        mainWindow.show();
        mainWindow.focus();
        mainWindow.maximize();
        console.log('>>> Window should now be visible');
    });
    
    // Force show after a timeout as fallback
    setTimeout(() => {
        if (mainWindow && !mainWindow.isVisible()) {
            console.log('>>> Force showing window after timeout');
            mainWindow.show();
            mainWindow.focus();
        }
    }, 2000);

    // Define IPC handler initialization function
    const initializeIpcHandlersNow = () => {
        // Initialize your existing IPC handlers
        try {
        console.log('>>> About to initialize IPC handlers...');
        console.log('>>> Type of initializeIpcHandlers:', typeof initializeIpcHandlers);
        console.log('>>> mainWindow exists:', !!mainWindow);
        console.log('>>> Initializing IPC handlers with paths:', {
            vaultPath,
            decksPath,
            userDataPath,
            dataDir,
            imagesPath,
            videosPath,
            calendarPath,
            serverUrl
        });
        
        // Call the initialization function
        const result = initializeIpcHandlers(mainWindow, {
            vaultPath,
            decksPath,
            userDataPath,
            dataDir,
            imagesPath,
            videosPath,
            calendarPath,
            serverUrl
        });
        
        console.log('>>> IPC handlers function returned:', result);
        console.log('>>> IPC handlers initialized successfully');
    } catch (error) {
        console.error('>>> ERROR initializing IPC handlers:', error);
        console.error('>>> Error stack:', error.stack);
    }

    ipcMain.on('add-adblock-patterns', (event, patterns) => {
        addAdBlockPatterns(patterns);
    });

    ipcMain.on('update-adblock-patterns', async (event) => {
        try {
            await updateAdBlockPatternsFromURL('https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts');
        } catch (error) {
            console.error('Failed to update ad block patterns on demand:', error);
        }
    });

    // --- ADDED: IPC Listener to launch the browser ---
    // This listens for a message from your main application to open the browser.
    ipcMain.on('launch-browser', (event, { displayId, bounds, url, urls, activeTabIndex }) => {
        console.log('[Main Process] Launching browser view...');
        console.log('[Main Process] Launch browser params:', { displayId, bounds: !!bounds, url, urls, activeTabIndex });
        launchBrowserOverlay(bounds, displayId, url, urls, activeTabIndex);
    });

    ipcMain.on('update-browser-bounds', (event, { displayId, bounds }) => {
        updateBrowserOverlayBounds(bounds, displayId);
    });

    ipcMain.on('hide-browser-view', (event, displayId) => {
        hideBrowserOverlay(displayId);
    });

    ipcMain.on('show-browser-view', (event, displayId) => {
        showBrowserOverlay(displayId);
    });

    ipcMain.on('set-browser-zoom', (event, { displayId, zoom }) => {
        const existing = browserViews[displayId];
        if (existing && typeof zoom === 'number') {
            existing.views.forEach(v => v.webContents.setZoomFactor(zoom));
        }
    });

    ipcMain.on('set-browser-brightness', (event, { displayId, brightness }) => {
        const existing = browserViews[displayId];
        if (!existing || typeof brightness !== 'number') return;
        const level = Math.max(0, Math.min(brightness, 100));
        existing.brightnessKeys.forEach((key, i) => {
            if (key) {
                try { existing.views[i].webContents.removeInsertedCSS(key); } catch {}
                existing.brightnessKeys[i] = null;
            }
            if (level < 100) {
                existing.views[i].webContents.insertCSS(`html { filter: brightness(${level}%); }`).then(k => {
                    existing.brightnessKeys[i] = k;
                }).catch(err => { console.error('Failed to set browser brightness:', err); });
            }
        });
    });

    ipcMain.on('browser-go-back', (event, displayId) => {
        const existing = browserViews[displayId];
        const view = existing ? existing.views[existing.activeTab] : null;
        if (view && view.webContents.canGoBack()) {
            view.webContents.goBack();
        }
    });

    ipcMain.on('browser-go-forward', (event, displayId) => {
        const existing = browserViews[displayId];
        const view = existing ? existing.views[existing.activeTab] : null;
        if (view && view.webContents.canGoForward()) {
            view.webContents.goForward();
        }
    });

    ipcMain.on('clear-display', async (event, displayId) => {
        const existing = browserViews[displayId];
        if (existing) {
            if (existing.visible) {
                try { mainWindow.removeBrowserView(existing.views[existing.activeTab]); } catch {}
            }
            ipcMain.removeListener('navigate-to-url', existing.navigateHandler);
            ipcMain.removeListener('switch-browser-tab', existing.switchHandler);
            existing.brightnessKeys.forEach((key, i) => {
                if (key) {
                    try { existing.views[i].webContents.removeInsertedCSS(key); } catch {}
                }
            });
            existing.views.forEach(v => v.destroy());
            delete browserViews[displayId];
        }
        try {
            const current = await sharedDataService.getOpenDisplays();
            if (current[displayId]) {
                delete current[displayId];
                await sharedDataService.setOpenDisplays(current);
            }
        } catch (err) {
            console.error('Main: Failed to update open display state:', err);
        }
        // Notify the renderer so it can update UI state
        sendToRenderer('clear-display', { displayId });
    });

    }; // End of initializeIpcHandlersNow function

    // Initialize IPC handlers immediately - don't wait for page load
    console.log('>>> Initializing IPC handlers immediately...');
    initializeIpcHandlersNow();
    
    // Set up listener for when page loads  
    mainWindow.webContents.once('did-finish-load', () => {
        console.log('>>> did-finish-load event fired for initial load');
        const url = mainWindow.webContents.getURL();
        appendWebsiteHistory(url);
    });
    
    console.log('>>> About to load URL:', targetUrl);
    
    // Load the URL
    mainWindow.loadURL(targetUrl).then(() => {
        console.log('>>> URL loaded successfully');
    }).catch(err => {
        console.error('>>> Error loading URL:', err);
    });
    
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Create a BrowserView overlayed on the main window for a given display
async function launchBrowserOverlay(bounds, displayId, initialUrl, savedUrls = null) {
    console.log('[Main Process] launchBrowserOverlay called with:', { displayId, initialUrl, savedUrls });
    console.log('[Main Process] initialUrl type:', typeof initialUrl, 'value:', initialUrl);
    if (!mainWindow || !bounds) return;

    // Try to get saved URLs from persistent storage if not provided
    let tabUrls = savedUrls;
    if (!tabUrls) {
        try {
            const savedDisplays = await sharedDataService.getOpenDisplays();
            const savedDisplay = savedDisplays[displayId];
            if (savedDisplay && savedDisplay.urls && Array.isArray(savedDisplay.urls)) {
                tabUrls = savedDisplay.urls;
                console.log('[Main Process] Restored saved URLs for', displayId, ':', tabUrls);
            }
        } catch (err) {
            console.error('[Main Process] Failed to load saved URLs:', err);
        }
    }

    const existing = browserViews[displayId];
    if (existing) {
        if (existing.visible && existing.views && existing.views[existing.activeTab]) {
            try {
                mainWindow.removeBrowserView(existing.views[existing.activeTab]);
            } catch (err) {
                console.warn('Failed to remove browser view:', err);
            }
        }
        if (existing.navigateHandler) {
            ipcMain.removeListener('navigate-to-url', existing.navigateHandler);
        }
        if (existing.switchHandler) {
            ipcMain.removeListener('switch-browser-tab', existing.switchHandler);
        }
        if (existing.views && Array.isArray(existing.views)) {
            existing.views.forEach(v => {
                try {
                    if (v && typeof v.destroy === 'function') {
                        v.destroy();
                    }
                } catch (err) {
                    console.warn('Failed to destroy browser view:', err);
                }
            });
        }
    }

    let activeTabIndex = typeof activeTabIndexSaved === 'number' ? activeTabIndexSaved : 0;

    const createTabView = (tabIndex) => {
        const v = new BrowserView({
            webPreferences: {
                preload: path.join(__dirname, 'programs', 'browser', 'preload.js'),
                nodeIntegration: false,
                contextIsolation: true,
                backgroundThrottling: false,
            },
        });

        v.webContents.setWindowOpenHandler(({ url }) => {
            if (!isUrlSafe(url)) {
                sendToRenderer('main-process-warning', `Blocked unsafe popup URL: ${url}`);
                return { action: 'deny' };
            }
            const popup = new BrowserWindow({
                width: 800,
                height: 600,
                webPreferences: { nodeIntegration: false, contextIsolation: true },
                autoHideMenuBar: true,
            });
            popup.removeMenu();
            popup.loadURL(url);
            popup.on('closed', () => { popup.destroy(); });
            return { action: 'deny' };
        });

        v.webContents.on('will-navigate', (event, url) => {
            if (!isUrlSafe(url)) {
                event.preventDefault();
                sendToRenderer('main-process-error', `Blocked unsafe URL: ${url}`);
            }
        });

        v.setBounds({
            x: bounds.x,
            y: bounds.y + CONTROL_AREA_HEIGHT,
            width: bounds.width,
            height: Math.max(bounds.height - CONTROL_AREA_HEIGHT, 0),
        });
        v.setAutoResize({ width: false, height: false });
        v.webContents.setZoomFactor(DEFAULT_BROWSER_ZOOM);

        v.webContents.on('did-finish-load', () => {
            const url = v.webContents.getURL();
            const title = v.webContents.getTitle();
            appendWebsiteHistory(url);
            sendToRenderer('page-did-finish-load', { displayId, url, title, tabIndex });
            // Persist URLs for all tabs
            persistBrowserTabUrl(displayId, tabIndex, url);
        });

        // Also listen for navigation-finished to catch URL changes in SPAs
        v.webContents.on('did-navigate-in-page', (event, url) => {
            console.log(`[Main Process] Tab ${tabIndex} navigated within page to:`, url);
            const title = v.webContents.getTitle();
            appendWebsiteHistory(url);
            sendToRenderer('page-did-finish-load', { displayId, url, title, tabIndex });
            // Persist URLs for all tabs
            persistBrowserTabUrl(displayId, tabIndex, url);
        });

        // Pause all videos when page loads or navigates
        const pauseAllVideos = () => {
            v.webContents.executeJavaScript(`
                (() => {
                    const videos = document.querySelectorAll('video');
                    videos.forEach(video => {
                        if (!video.paused) {
                            console.log('Pausing video:', video.src || video.currentSrc);
                            video.pause();
                        }
                    });
                })();
            `).catch(err => console.log('Video pause script executed (may fail if no videos found)'));
        };

        // Pause videos after page loads
        v.webContents.on('dom-ready', () => {
            setTimeout(pauseAllVideos, 1000); // Wait a bit for dynamic content
        });

        return v;
    };

    // Use saved URLs if available, otherwise fall back to initialUrl or Google
    const startUrl = initialUrl || 'https://www.google.com';
    console.log('[Main Process] Browser tab 0 will load URL:', startUrl);
    console.log('[Main Process] Available saved URLs:', tabUrls);
    
    const views = [];
    for (let i = 0; i < MAX_BROWSER_TABS; i++) {
        const v = createTabView(i);
        views.push(v);
        
        // Determine URL for this tab:
        // 1. Use saved URL if available
        // 2. For tab 0, use initialUrl if provided
        // 3. Default to Google
        let url = 'https://www.google.com';
        if (tabUrls && tabUrls[i] && typeof tabUrls[i] === 'string' && tabUrls[i].trim() !== '') {
            url = tabUrls[i];
            console.log(`[Main Process] Tab ${i} using saved URL:`, url);
        } else if (i === 0 && startUrl !== 'https://www.google.com') {
            url = startUrl;
            console.log(`[Main Process] Tab ${i} using initial URL:`, url);
        } else {
            console.log(`[Main Process] Tab ${i} using default URL:`, url);
        }
        
        v.webContents.loadURL(url);
    }

    mainWindow.addBrowserView(views[activeTabIndex]);

    const navigateHandler = (event, arg) => {
        let targetId = null;
        let targetUrl = null;
        let tabIndex = null;
        if (typeof arg === 'string') {
            targetUrl = arg;
        } else if (arg && typeof arg === 'object') {
            targetId = arg.displayId || null;
            targetUrl = arg.url;
            tabIndex = typeof arg.tabIndex === 'number' ? arg.tabIndex : null;
        }
        if (targetId && targetId !== displayId) return;
        const idx = tabIndex != null ? tabIndex : activeTabIndex;
        const view = views[idx];
        if (view && typeof targetUrl === 'string') {
            const prefixed = targetUrl.startsWith('http://') || targetUrl.startsWith('https://') ? targetUrl : `https://${targetUrl}`;
            view.webContents.loadURL(prefixed);
        }
    };
    ipcMain.on('navigate-to-url', navigateHandler);

    const switchHandler = (event, { displayId: targetId, tabIndex }) => {
        if (targetId && targetId !== displayId) return;
        if (tabIndex < 0 || tabIndex >= views.length) return;
        if (activeTabIndex === tabIndex) return;
        if (existingData.visible) {
            try { mainWindow.removeBrowserView(views[activeTabIndex]); } catch {}
            mainWindow.addBrowserView(views[tabIndex]);
            if (existingData.bounds) {
                views[tabIndex].setBounds({
                    x: existingData.bounds.x,
                    y: existingData.bounds.y + CONTROL_AREA_HEIGHT,
                    width: existingData.bounds.width,
                    height: Math.max(existingData.bounds.height - CONTROL_AREA_HEIGHT, 0)
                });
            }
        }
        activeTabIndex = tabIndex;
        existingData.activeTab = tabIndex;
        persistBrowserActiveTab(displayId, tabIndex);
    };
    const existingData = {
        views,
        activeTab: activeTabIndex,
        navigateHandler,
        switchHandler,
        brightnessKeys: Array(MAX_BROWSER_TABS).fill(null),
        bounds,
        visible: true
    };
    browserViews[displayId] = existingData;

    ipcMain.on('switch-browser-tab', switchHandler);
}

// Update bounds of an existing BrowserView for a display
function updateBrowserOverlayBounds(bounds, displayId) {
    if (!mainWindow || !bounds) return;
    const existing = browserViews[displayId];
    if (!existing) return;
    existing.bounds = bounds;
    if (existing.visible) {
        const rect = {
            x: bounds.x,
            y: bounds.y + CONTROL_AREA_HEIGHT,
            width: bounds.width,
            height: Math.max(bounds.height - CONTROL_AREA_HEIGHT, 0),
        };
        existing.views.forEach(v => v.setBounds(rect));
    }
}

function hideBrowserOverlay(displayId) {
    const existing = browserViews[displayId];
    if (!existing || !existing.visible) return;
    try {
        // Pause all videos before hiding
        existing.views.forEach(view => {
            view.webContents.executeJavaScript(`
                (() => {
                    const videos = document.querySelectorAll('video');
                    videos.forEach(video => {
                        if (!video.paused) {
                            console.log('Pausing video on hide:', video.src || video.currentSrc);
                            video.pause();
                        }
                    });
                })();
            `).catch(() => {}); // Ignore errors if no videos
        });
        
        mainWindow.removeBrowserView(existing.views[existing.activeTab]);
        existing.visible = false;
    } catch (err) {
        console.error('Failed to hide browser overlay:', err);
    }
}

function showBrowserOverlay(displayId) {
    const existing = browserViews[displayId];
    if (!existing || existing.visible) return;
    try {
        mainWindow.addBrowserView(existing.views[existing.activeTab]);
        if (existing.bounds) {
            updateBrowserOverlayBounds(existing.bounds, displayId);
        }
        existing.visible = true;
    } catch (err) {
        console.error('Failed to show browser overlay:', err);
    }
}

// App initialization (Modified)
app.whenReady().then(async () => {
    // Now that the app is ready, resolve all user data paths
    userDataPath = app.getPath('userData');
    const documentsPath = app.getPath('documents');
    dataDir = path.join(documentsPath, 'ai-local-data');
    vaultPath = path.join(dataDir, 'Personas');
    decksPath = path.join(dataDir, 'Decks');
    imagesPath = path.join(dataDir, 'Images');
    videosPath = path.join(dataDir, 'Videos');
    calendarPath = path.join(dataDir, 'Calendar');
    websiteHistoryPath = path.join(dataDir, 'WebsiteHistory');
    websiteHistoryFile = path.join(websiteHistoryPath, 'history.md');

    // Initialize shared data service with resolved paths
    sharedDataService.init({ basePath: dataDir, vaultPath });
    
    // Store paths globally for memory decay service
    global.appPaths = {
        vaultPath,
        decksPath,
        userDataPath,
        dataDir,
        imagesPath,
        videosPath,
        calendarPath
    };

    console.log('>>> Preparing user data directories...');
    await createUserDataDirectories();
    console.log('>>> Directories ready. Images:', imagesPath, 'Videos:', videosPath);
    setupAdBlocker();
    
    // Initialize TTS cache
    console.log('>>> Initializing TTS cache...');
    try {
        await ttsCache.initialize(dataDir);
    } catch (error) {
        console.error('Failed to initialize TTS cache:', error);
    }
    
    // Start memory decay service
    console.log('>>> Starting memory decay service...');
    memoryDecayService.start({
        intervalMinutes: 2,      // Run every 2 minutes
        decayRate: 0.98,        // 2% decay per minute
        minPriority: 0.2,       // Remove slots below 0.2 priority
        maxAgeMinutes: 30       // Remove old slots after 30 minutes
    });
    
    try {
        const serverUrl = await startLocalServer();
        console.log('>>> Server started at', serverUrl);
        await createWindow(serverUrl);
        
        // Restore open displays after window is created
        try {
            const savedDisplays = await sharedDataService.getOpenDisplays();
            console.log('>>> Restoring saved displays:', savedDisplays);
            // Proactively send saved display information to the renderer
            sendToRenderer('restore-open-displays', savedDisplays);
        } catch (error) {
            console.error('Failed to load saved displays:', error);
        }
        
        // Now that the window is created, we can safely update the adblocker
        try {
            await updateAdBlockPatternsFromURL('https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts');
        } catch (error) {
            console.error('Could not update ad block patterns from remote source:', error);
        }
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

// Persist display state and stop server before quitting
app.on('before-quit', async (event) => {
    if (isQuitting) return;
    event.preventDefault();
    isQuitting = true;
    try {
        const memory = await gatherOpenDisplayState();
        await sharedDataService.setOpenDisplays(memory);
        await sharedDataService.flushWrites();
    } catch (err) {
        console.error('Main: Failed to persist open display state on quit:', err);
    }
    if (server) {
        console.log('>>> Stopping local server...');
        server.close();
    }
    app.quit();
});
