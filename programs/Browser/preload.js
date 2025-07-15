// preload.js

const { contextBridge, ipcRenderer } = require('electron');

// Expose a controlled API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // --- Functions the Renderer can call ---
    newTab: (tabId, url) => ipcRenderer.send('new-tab', tabId, url),
    switchTab: (tabId) => ipcRenderer.send('switch-tab', tabId),
    closeTab: (tabId) => ipcRenderer.send('close-tab', tabId),
    navigate: (tabId, url) => ipcRenderer.send('navigate', tabId, url),
    goBack: (tabId) => ipcRenderer.send('go-back', tabId),
    goForward: (tabId) => ipcRenderer.send('go-forward', tabId),
    reload: (tabId) => ipcRenderer.send('reload', tabId),

    // --- Functions the Main process can call (callbacks) ---
    onURLUpdated: (callback) => ipcRenderer.on('url-updated', (_event, tabId, url) => callback(tabId, url)),
    onTitleUpdated: (callback) => ipcRenderer.on('title-updated', (_event, tabId, title) => callback(tabId, title)),
});
