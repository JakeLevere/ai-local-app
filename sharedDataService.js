const fs = require('fs').promises;
const path = require('path');

let dataFilePath = null;

function init(basePath) {
    dataFilePath = path.join(basePath, 'sharedData.json');
}

async function readData() {
    if (!dataFilePath) throw new Error('SharedDataService not initialized');
    try {
        const content = await fs.readFile(dataFilePath, 'utf-8');
        return JSON.parse(content);
    } catch (err) {
        if (err.code === 'ENOENT') return {};
        throw err;
    }
}

async function writeData(data) {
    if (!dataFilePath) throw new Error('SharedDataService not initialized');
    await fs.mkdir(path.dirname(dataFilePath), { recursive: true });
    await fs.writeFile(dataFilePath, JSON.stringify(data, null, 2), 'utf-8');
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
    const data = await readData();
    return data.favoritePersonaId || null;
}

async function setFavoritePersonaId(id) {
    const data = await readData();
    if (id) {
        data.favoritePersonaId = id;
    } else {
        delete data.favoritePersonaId;
    }
    await writeData(data);
}

module.exports = {
    init,
    getCalendarEvents,
    setCalendarEvents,
    getHealthMetrics,
    setHealthMetrics,
    getFavoritePersonaId,
    setFavoritePersonaId
};
