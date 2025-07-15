const { contextBridge, ipcRenderer } = require('electron');

// General IPC API exposed to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    on: (channel, func) => {
        const subscription = (event, ...args) => func(...args);
        ipcRenderer.on(channel, subscription);
        return () => ipcRenderer.removeListener(channel, subscription);
    },
    once: (channel, func) => {
        const subscription = (event, ...args) => func(...args);
        ipcRenderer.once(channel, subscription);
        return () => ipcRenderer.removeListener(channel, subscription);
    },
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
});

console.log('Preload script loaded.');
