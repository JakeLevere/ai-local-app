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
    isDomReady: false
};

export function calculateVisibleBounds(elem) {
    if (!elem) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }
    const rect = elem.getBoundingClientRect();
    return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
    };
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

export function scrollSyncLoop(dom) {
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
