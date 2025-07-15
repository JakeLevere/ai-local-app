// preload.js

const { contextBridge, ipcRenderer } = require('electron');

// Expose a controlled API to the renderer process (index.html)
contextBridge.exposeInMainWorld('electronAPI', {
    // --- Data Handlers ---
    saveHealthData: (data) => ipcRenderer.send('save-health-data', data),
    loadHealthData: () => ipcRenderer.invoke('load-health-data'),

    // --- Report (PDF) Handlers ---
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    uploadReport: (filePath) => ipcRenderer.invoke('upload-report', filePath),
    getReportList: () => ipcRenderer.invoke('get-report-list'),
    openReport: (fileName) => ipcRenderer.send('open-report', fileName),
});
