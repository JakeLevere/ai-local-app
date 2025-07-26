export const state = {
    selectedIdentifier: null,
    activePrimaryIdentifier: null,
    primaryPersonaCache: {},
    favoritePersonaId: null,
    latestAIMessageElement: null,
    eventListenersAttached: false,
    ipcListenersAttached: false,
    activeBrowserDisplays: {},
    scrollAnimationFrame: null,
    scrollStopTimer: null,
    pendingOpenDisplays: null,
    isDomReady: false,
    deckColors: ['#e74c3c', '#3498db', '#27ae60', '#f1c40f', '#9b59b6', '#1abc9c']
};

export function findAvailableDisplayId(dom) {
    if (!dom.displays) return 'display1';
    for (const id in dom.displays) {
        const d = dom.displays[id];
        if (d?.image && d.iframe && !d.image.classList.contains('active') && !d.iframe.classList.contains('active')) {
            return id;
        }
    }
    return 'display1';
}

export function getCurrentSlides(dom) {
    const slides = {};
    if (!dom.displays) return slides;
    Object.keys(dom.displays).forEach(id => {
        const d = dom.displays[id];
        if (!d) return;
        if (d.image.classList.contains('active') && d.image.dataset.path) {
            slides[id] = { type: 'image', src: d.image.dataset.path };
        } else if (d.iframe.classList.contains('active') && d.iframe.src && d.iframe.src !== 'about:blank') {
            slides[id] = { type: 'iframe', src: d.iframe.src };
        }
    });
    return slides;
}

export function calculateVisibleBounds(elem) {
    if (!elem) return { x: 0, y: 0, width: 0, height: 0 };
    const rect = elem.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

export function updateBrowserBoundsForDisplay(displayId, dom) {
    const elem = dom.displays?.[displayId]?.element;
    if (!elem) return;
    const clipped = calculateVisibleBounds(elem);
    const bounds = {
        x: Math.round(clipped.x),
        y: Math.round(clipped.y),
        width: Math.round(clipped.width),
        height: Math.round(clipped.height)
    };
    window.electronAPI.send('update-browser-bounds', { displayId, bounds });
}

export function updateAllBrowserBounds(dom) {
    Object.keys(state.activeBrowserDisplays).forEach(id => updateBrowserBoundsForDisplay(id, dom));
}

export function startScrollSync(dom) {
    if (state.scrollAnimationFrame === null) {
        state.scrollAnimationFrame = requestAnimationFrame(() => scrollSyncLoop(dom));
    }
    if (state.scrollStopTimer) {
        clearTimeout(state.scrollStopTimer);
    }
    state.scrollStopTimer = setTimeout(() => stopScrollSync(), 100);
}

function scrollSyncLoop(dom) {
    updateAllBrowserBounds(dom);
    state.scrollAnimationFrame = requestAnimationFrame(() => scrollSyncLoop(dom));
}

export function stopScrollSync() {
    if (state.scrollAnimationFrame !== null) {
        cancelAnimationFrame(state.scrollAnimationFrame);
        state.scrollAnimationFrame = null;
    }
    if (state.scrollStopTimer) {
        clearTimeout(state.scrollStopTimer);
        state.scrollStopTimer = null;
    }
}

export function clearDisplayUI(displayId, dom) {
    const display = dom.displays?.[displayId];
    if (display?.element && display.iframe && display.image) {
        display.image.classList.remove('active');
        display.iframe.classList.remove('active');
        display.element.classList.remove('loading-active');
        if (display.iframe.src && display.iframe.src !== 'about:blank') {
            display.iframe.src = 'about:blank';
        }
        if (display.image.src) {
            display.image.src = '';
        }
        display.image.removeAttribute('data-path');
        display.element.classList.add('empty');
    }
}

export function updateStatusBarUI(identifier, status, dom, cache) {
    if (!dom.statusTitle || !dom.personaImage || !dom.configPanelHeader || !dom.convCountSpan || !dom.lastInteractionSpan) {
        return;
    }
    let titleToDisplay = 'No Persona Selected';
    let iconToDisplay = './images/placeholder.png';
    let convCountToDisplay = 0;
    let lastInteractionToDisplay = 'N/A';
    let configHeaderToDisplay = 'Configuration';
    if (identifier) {
        const parts = identifier.split('/');
        const primaryData = cache[parts[0]];
        if (primaryData) {
            titleToDisplay = primaryData.name;
            iconToDisplay = primaryData.icon;
            configHeaderToDisplay = `${primaryData.name} Configuration`;
            convCountToDisplay = status?.convCount || 0;
            lastInteractionToDisplay = status?.lastInteraction || 'N/A';
        }
    }
    dom.statusTitle.textContent = titleToDisplay;
    dom.personaImage.src = iconToDisplay;
    dom.configPanelHeader.textContent = configHeaderToDisplay;
    dom.convCountSpan.textContent = `Conversations: ${convCountToDisplay}`;
    dom.lastInteractionSpan.textContent = `Last Interaction: ${lastInteractionToDisplay}`;
}
