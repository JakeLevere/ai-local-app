// main.js - Main Electron Process

const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');
const path = require('path');

let mainWindow;
// We use an object to store BrowserViews, mapping tabId to the view instance
const views = {};

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            // These are important for security
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    mainWindow.loadFile('index.html');
    // mainWindow.webContents.openDevTools(); // Uncomment to debug the renderer (UI)

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- IPC Handlers for BrowserView Management ---

// Create a new tab (BrowserView)
ipcMain.on('new-tab', (event, tabId, initialUrl) => {
    const view = new BrowserView();
    mainWindow.addBrowserView(view);
    views[tabId] = view;

    // Set the view's position and size
    const [width, height] = mainWindow.getContentSize();
    view.setBounds({ x: 0, y: 80, width: width, height: height - 80 });
    view.setAutoResize({ width: true, height: true });
    
    view.webContents.loadURL(initialUrl);

    // Relay updates from the view back to the renderer
    view.webContents.on('did-navigate', (e, url) => {
        event.sender.send('url-updated', tabId, url);
    });

    view.webContents.on('page-title-updated', (e, title) => {
        event.sender.send('title-updated', tabId, title);
    });
});

// Switch to a different tab
ipcMain.on('switch-tab', (event, tabId) => {
    if (views[tabId]) {
        mainWindow.setTopBrowserView(views[tabId]);
    }
});

// Close a tab
ipcMain.on('close-tab', (event, tabId) => {
    if (views[tabId]) {
        mainWindow.removeBrowserView(views[tabId]);
        views[tabId].webContents.destroy();
        delete views[tabId];
    }
});

// Navigate the current tab
ipcMain.on('navigate', (event, tabId, url) => {
    if (views[tabId]) {
        views[tabId].webContents.loadURL(url);
    }
});

// Navigation controls
ipcMain.on('go-back', (event, tabId) => {
    if (views[tabId] && views[tabId].webContents.canGoBack()) {
        views[tabId].webContents.goBack();
    }
});

ipcMain.on('go-forward', (event, tabId) => {
    if (views[tabId] && views[tabId].webContents.canGoForward()) {
        views[tabId].webContents.goForward();
    }
});

ipcMain.on('reload', (event, tabId) => {
    if (views[tabId]) {
        views[tabId].webContents.reload();
    }
});
