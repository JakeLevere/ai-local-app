// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Send message from renderer to main
    send: (channel, ...args) => {
        ipcRenderer.send(channel, ...args);
    },
    // Receive message from main to renderer
    on: (channel, func) => {
        // Deliberately strip event as it includes `sender`
        const subscription = (event, ...args) => func(...args);
        ipcRenderer.on(channel, subscription);
        // Return a function to remove the listener
        return () => ipcRenderer.removeListener(channel, subscription);
    },
    // One-time message from main to renderer
    once: (channel, func) => {
         const subscription = (event, ...args) => func(...args);
         ipcRenderer.once(channel, subscription);
         // Optional: Return cleanup, though 'once' usually doesn't need it
         return () => ipcRenderer.removeListener(channel, subscription);
    },
    // Invoke an IPC handler and get a promise back
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
});

console.log('Preload script loaded.');
