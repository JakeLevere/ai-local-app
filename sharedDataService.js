const fs = require('fs').promises;
const path = require('path');

let dataFilePath = null;
let favoritePersonaFilePath = null;
let isWriting = false;
let writeQueue = [];
let dataCache = null; // Cache to ensure latest data is available even if writes are pending

function init(basePathOrOptions) {
    if (typeof basePathOrOptions === 'string') {
        dataFilePath = path.join(basePathOrOptions, 'sharedData.json');
        favoritePersonaFilePath = path.join(basePathOrOptions, 'favoritePersona.txt');
    } else if (basePathOrOptions && typeof basePathOrOptions === 'object') {
        const { basePath, vaultPath } = basePathOrOptions;
        dataFilePath = path.join(basePath, 'sharedData.json');
        favoritePersonaFilePath = path.join(vaultPath || basePath, 'favoritePersona.txt');
    } else {
        throw new Error('Invalid init parameters');
    }
    dataCache = null; // reset cache on re-init
}

async function readData() {
    if (!dataFilePath) throw new Error('SharedDataService not initialized');
    if (dataCache) return dataCache;
    try {
        const content = await fs.readFile(dataFilePath, 'utf-8');
        dataCache = JSON.parse(content);
        return dataCache;
    } catch (err) {
        if (err.code === 'ENOENT') {
            dataCache = {};
            return dataCache;
        }
        throw err;
    }
}

async function writeData(data) {
    if (!dataFilePath) throw new Error('SharedDataService not initialized');
    dataCache = data; // update cache immediately
    // Queue writes to prevent concurrent file writes
    return new Promise((resolve, reject) => {
        writeQueue.push({ data, resolve, reject });
        processWriteQueue();
    });
}

// Ensure all queued writes are completed
function flushWrites() {
    return new Promise((resolve) => {
        const check = () => {
            if (!isWriting && writeQueue.length === 0) {
                resolve();
            } else {
                setTimeout(check, 10);
            }
        };
        check();
    });
}

async function processWriteQueue() {
    if (isWriting || writeQueue.length === 0) return;
    
    isWriting = true;
    const { data, resolve, reject } = writeQueue.shift();
    
    try {
        await fs.mkdir(path.dirname(dataFilePath), { recursive: true });
        await fs.writeFile(dataFilePath, JSON.stringify(data, null, 2), 'utf-8');
        resolve();
    } catch (error) {
        reject(error);
    } finally {
        isWriting = false;
        // Process next item in queue
        setTimeout(processWriteQueue, 10);
    }
}

async function getCalendarEvents() {
    const data = await readData();
    return data.calendarEvents || [];
}

async function setCalendarEvents(events) {
    const data = await readData();
    data.calendarEvents = events;
    await writeData(data);
}

async function getHealthMetrics() {
    const data = await readData();
    return data.healthMetrics || {};
}

async function setHealthMetrics(metrics) {
    const data = await readData();
    data.healthMetrics = metrics;
    await writeData(data);
}

async function getFavoritePersonaId() {
    if (!favoritePersonaFilePath) throw new Error('SharedDataService not initialized');
    try {
        const id = await fs.readFile(favoritePersonaFilePath, 'utf-8');
        return id.trim() || null;
    } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}

async function setFavoritePersonaId(id) {
    if (!favoritePersonaFilePath) throw new Error('SharedDataService not initialized');
    await fs.mkdir(path.dirname(favoritePersonaFilePath), { recursive: true });
    if (id) {
        await fs.writeFile(favoritePersonaFilePath, id.toString(), 'utf-8');
    } else {
        await fs.rm(favoritePersonaFilePath, { force: true });
    }
}

async function getOpenDisplays() {
    const data = await readData();
    return data.openDisplays || {};
}

async function setOpenDisplays(displays) {
    const data = await readData();
    data.openDisplays = displays;
    await writeData(data);
}

module.exports = {
    init,
    getCalendarEvents,
    setCalendarEvents,
    getHealthMetrics,
    setHealthMetrics,
    getFavoritePersonaId,
    setFavoritePersonaId,
    getOpenDisplays,
    setOpenDisplays,
    flushWrites
};
