// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose a controlled API to the renderer process (browser.html).
// We are creating a global 'window.electron' object in the renderer.
contextBridge.exposeInMainWorld('electron', {
    // Function to send data from renderer to main
    send: (channel, data) => {
        // Whitelist channels to prevent sending on arbitrary channels
        const validChannels = ['navigate-to-url', 'set-browser-zoom', 'browser-go-back', 'browser-go-forward', 'open-extension-options'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    // Function to receive data from main to renderer
    receive: (channel, func) => {
        const validChannels = ['page-did-finish-load', 'extension-install-start', 'extension-install-complete', 'extension-install-failed', 'extension-uninstalled'];
        if (validChannels.includes(channel)) {
            // Deliberately strip event as it includes `sender`
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    },
    invoke: (channel, data) => {
        const validChannels = ['install-extension', 'get-installed-extensions', 'show-extension-menu'];
        if (validChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, data);
        }
    }
});
