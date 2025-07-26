import { domElements } from './domCache.js';
import { state, getCurrentSlides } from './uiState.js';
import { appendMessageToChatLog } from './chat.js';

export function createInitialDeckIcons() {
    if (!domElements.deckIconsContainer) return;
    for (let i = 1; i <= 5; i++) {
        const wrapper = document.createElement('div');
        wrapper.className = 'deck-icon-wrapper';
        const icon = document.createElement('div');
        icon.className = 'deck-icon deck-option';
        icon.dataset.deck = i;
        icon.textContent = i;
        icon.style.backgroundColor = state.deckColors[(i - 1) % state.deckColors.length];
        icon.addEventListener('click', handleDeckOptionClick);
        const saveBtn = document.createElement('button');
        saveBtn.className = 'deck-save-hover';
        saveBtn.innerHTML = '<img src="./images/save-icon.png" alt="save">';
        saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const deckName = `Deck ${icon.dataset.deck}`;
            const slides = getCurrentSlides(domElements);
            window.electronAPI.send('save-deck-slides', { deckName, slides });
        });
        wrapper.appendChild(icon);
        wrapper.appendChild(saveBtn);
        domElements.deckIconsContainer.appendChild(wrapper);
    }
    const addBtn = document.createElement('div');
    addBtn.id = 'add-deck-icon';
    addBtn.className = 'deck-icon add-deck';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', handleAddDeck);
    domElements.deckIconsContainer.appendChild(addBtn);
}

export function handleDeckOptionClick(event) {
    const deckNum = event.currentTarget.dataset.deck;
    if (!deckNum) return;
    const deckName = `Deck ${deckNum}`;
    if (event.shiftKey) {
        const slides = getCurrentSlides(domElements);
        window.electronAPI.send('save-deck-slides', { deckName, slides });
    } else {
        window.electronAPI.send('load-deck', deckName);
    }
    domElements.deckContainer?.classList.remove('expanded');
}

export function handleAddDeck() {
    const existingCount = domElements.deckIconsContainer.querySelectorAll('.deck-option').length;
    if (existingCount >= 10) {
        const addBtn = domElements.deckIconsContainer.querySelector('#add-deck-icon');
        if (addBtn) addBtn.style.display = 'none';
        appendMessageToChatLog({ content: 'Maximum of 10 decks reached.' }, true);
        return;
    }
    const count = existingCount + 1;
    const deckName = `Deck ${count}`;
    const slides = getCurrentSlides(domElements);
    window.electronAPI.send('create-deck', { name: deckName, slides });
    const wrapper = document.createElement('div');
    wrapper.className = 'deck-icon-wrapper';
    const icon = document.createElement('div');
    icon.className = 'deck-icon deck-option';
    icon.dataset.deck = count;
    icon.textContent = count;
    icon.style.backgroundColor = state.deckColors[(count - 1) % state.deckColors.length];
    icon.addEventListener('click', handleDeckOptionClick);
    const saveBtn = document.createElement('button');
    saveBtn.className = 'deck-save-hover';
    saveBtn.innerHTML = '<img src="./images/save-icon.png" alt="save">';
    saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const deckName = `Deck ${icon.dataset.deck}`;
        const slides = getCurrentSlides(domElements);
        window.electronAPI.send('save-deck-slides', { deckName, slides });
    });
    wrapper.appendChild(icon);
    wrapper.appendChild(saveBtn);
    const addBtn = domElements.deckIconsContainer.querySelector('#add-deck-icon');
    domElements.deckIconsContainer.insertBefore(wrapper, addBtn);
    if (count >= 10 && addBtn) addBtn.style.display = 'none';
}
