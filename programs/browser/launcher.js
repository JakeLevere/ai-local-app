const path = require('path');

function buildBrowserURL(baseURL = `http://localhost:${process.env.PORT || 3000}`) {
    return `${baseURL.replace(/\/$/, '')}/programs/browser/index.html`;
}

function openBrowser(displayId, sendToRenderer, baseURL) {
    const url = buildBrowserURL(baseURL);
    if (typeof sendToRenderer === 'function') {
        sendToRenderer('load-display', { displayId, url });
    }
}

module.exports = { buildBrowserURL, openBrowser };
