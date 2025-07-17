// main.js

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Define the path for storing health data and reports under the user's Documents folder
// e.g. <Documents>/ai-local-data/Health Data
const HEALTH_DATA_DIR = path.join(app.getPath('documents'), 'ai-local-data', 'Health Data');
const HEALTH_JSON_PATH = path.join(HEALTH_DATA_DIR, 'health-data.json');

// Ensure the health data directory exists.
if (!fs.existsSync(HEALTH_DATA_DIR)) {
    console.log(`Creating health data directory at: ${HEALTH_DATA_DIR}`);
    fs.mkdirSync(HEALTH_DATA_DIR, { recursive: true });
}

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            // Attach the preload script to the renderer process (index.html)
            preload: path.join(__dirname, 'preload.js'),
            // These settings are recommended for security.
            contextIsolation: true,
            nodeIntegration: false,
        },
        autoHideMenuBar: true,
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: '#333333', symbolColor: '#ffffff' },
    });
    mainWindow.removeMenu();

    // Load the application's HTML file.
    mainWindow.loadFile('index.html');
    
    // Optional: uncomment to open DevTools for debugging.
    // mainWindow.webContents.openDevTools();
}

// --- IPC Handlers for File System Operations ---

// Saves the main health data (weight, metrics) to the JSON file.
ipcMain.on('save-health-data', (event, data) => {
    try {
        fs.writeFileSync(HEALTH_JSON_PATH, data, 'utf-8');
        console.log(`Health data saved to: ${HEALTH_JSON_PATH}`);
    } catch (error) {
        console.error('Failed to save health data:', error);
    }
});

// Loads the main health data from the JSON file.
ipcMain.handle('load-health-data', async () => {
    try {
        if (fs.existsSync(HEALTH_JSON_PATH)) {
            const data = fs.readFileSync(HEALTH_JSON_PATH, 'utf-8');
            console.log('Health data loaded successfully.');
            return data;
        }
    } catch (error) {
        console.error('Failed to load health data:', error);
    }
    return null; // Return null if file doesn't exist or an error occurs.
});

// Opens a dialog for the user to select a PDF file.
ipcMain.handle('open-file-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
    });
    if (!canceled) {
        return filePaths[0];
    }
    return null;
});

// Reads the selected PDF file and copies it to the health data directory.
ipcMain.handle('upload-report', async (event, filePath) => {
    if (!filePath) return { success: false, error: 'No file path provided.' };
    try {
        const fileName = path.basename(filePath);
        const destinationPath = path.join(HEALTH_DATA_DIR, fileName);

        fs.copyFileSync(filePath, destinationPath);
        console.log(`Report '${fileName}' copied to health directory.`);
        return { success: true, fileName: fileName };
    } catch (error) {
        console.error(`Failed to upload report:`, error);
        return { success: false, error: error.message };
    }
});

// Reads the health data directory and returns a list of PDF files.
ipcMain.handle('get-report-list', async () => {
    try {
        const files = fs.readdirSync(HEALTH_DATA_DIR);
        const pdfFiles = files.filter(file => path.extname(file).toLowerCase() === '.pdf');
        return pdfFiles;
    } catch (error) {
        console.error('Failed to get report list:', error);
        return [];
    }
});

// Opens a given report file using the system's default PDF viewer.
ipcMain.on('open-report', (event, fileName) => {
    const filePath = path.join(HEALTH_DATA_DIR, fileName);
    if (fs.existsSync(filePath)) {
        shell.openPath(filePath);
    } else {
        console.error(`Attempted to open a non-existent file: ${filePath}`);
    }
});


// --- App Lifecycle ---
app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
