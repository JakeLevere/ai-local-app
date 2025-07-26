// renderer.js orchestrator using ES modules
import { dom, cacheDomElements } from './src/renderer/domCache.js';
import * as chat from './src/renderer/chat.js';
import * as deck from './src/renderer/deckManager.js';
import { state, updateAllBrowserBounds, startScrollSync } from './src/renderer/uiState.js';

console.log('--- Renderer Script Loading ---');

function setupEventListeners() {
    if (state.eventListenersAttached) return;
    dom.sendButton?.addEventListener('click', chat.sendMessage);
    dom.personaListContainer?.addEventListener('click', chat.handlePersonaItemClick);
    dom.personaSelect?.addEventListener('change', chat.handlePersonaSelectChange);
    dom.favoriteStarOverlay?.addEventListener('click', chat.handleFavoriteStarClick);
    dom.createDeckBtn?.addEventListener('click', deck.handleAddDeck);
    dom.deckIconsContainer?.addEventListener('click', e => {
        if (e.target.classList.contains('deck-option')) deck.handleDeckOptionClick(e);
    });
    dom.displaysContainer?.addEventListener('scroll', () => startScrollSync(dom));
    state.eventListenersAttached = true;
}

function setupIpcListeners() {
    if (state.ipcListenersAttached) return;
    window.electronAPI.on('personas-loaded', (list) => {
        chat.renderPersonaList(list);
        chat.renderPersonaDropdown(list);
    });
    window.electronAPI.on('entries-loaded', (entries) => {
        entries.forEach(e => chat.appendMessageToChatLog(e, e.type === 'status', e.type === 'user'));
    });
    state.ipcListenersAttached = true;
}

document.addEventListener('DOMContentLoaded', () => {
    state.isDomReady = true;
    cacheDomElements();
    chat.setupTextareaAutoResize();
    deck.createInitialDeckIcons();
    setupEventListeners();
    setupIpcListeners();
    updateAllBrowserBounds(dom);
    console.log('--- Renderer Initialization Complete ---');
});

console.log('--- Renderer Script Loaded ---');
