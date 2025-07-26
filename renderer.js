import { domElements, cacheDomElements, setupTextareaAutoResize } from './src/renderer/domCache.js';
import { state, startScrollSync, updateAllBrowserBounds } from './src/renderer/uiState.js';
import { sendMessage, fetchFavoritePersona, loadInitialContent, updateFavoriteCheckbox } from './src/renderer/chat.js';
import { createInitialDeckIcons, handleDeckOptionClick, handleAddDeck } from './src/renderer/deckManager.js';

console.log('--- Renderer Script Loading ---');

function setupBasicListeners() {
    domElements.sendButton?.addEventListener('click', sendMessage);
    domElements.userInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendMessage();
        }
    });
    domElements.personaSelect?.addEventListener('change', (e) => {
        state.selectedIdentifier = e.target.value;
        loadInitialContent(state.selectedIdentifier);
        updateFavoriteCheckbox();
    });
    domElements.personaListContainer?.addEventListener('click', (e) => {
        const item = e.target.closest('.persona-item');
        if (!item) return;
        domElements.personaListContainer.querySelectorAll('.persona-item.selected').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        state.selectedIdentifier = item.dataset.personaId;
        loadInitialContent(state.selectedIdentifier);
        updateFavoriteCheckbox();
    });
    domElements.favoriteStarOverlay?.addEventListener('click', updateFavoriteCheckbox);
    domElements.deckIconsContainer?.addEventListener('click', (e) => {
        if (e.target.classList.contains('deck-option')) handleDeckOptionClick(e);
        if (e.target.id === 'add-deck-icon') handleAddDeck();
    });
    domElements.displaysContainer?.addEventListener('scroll', () => startScrollSync(domElements));
    window.addEventListener('resize', () => updateAllBrowserBounds(domElements));
}

document.addEventListener('DOMContentLoaded', async () => {
    cacheDomElements();
    setupTextareaAutoResize();
    await fetchFavoritePersona();
    createInitialDeckIcons();
    setupBasicListeners();
    if (domElements.personaSelect?.value) {
        state.selectedIdentifier = domElements.personaSelect.value;
        loadInitialContent(state.selectedIdentifier);
    }
    console.log('--- Renderer Initialization Complete ---');
});
