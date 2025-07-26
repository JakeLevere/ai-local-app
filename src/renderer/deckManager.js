import { dom } from './domCache.js';
import { state } from './uiState.js';

export const deckColors = ['#e74c3c', '#3498db', '#27ae60', '#f1c40f', '#9b59b6', '#1abc9c'];

export function getCurrentSlides() {
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

export function createInitialDeckIcons() {
    if (!dom.deckIconsContainer) return;
    for (let i = 1; i <= 5; i++) {
        const wrapper = document.createElement('div');
        wrapper.className = 'deck-icon-wrapper';
        const icon = document.createElement('div');
        icon.className = 'deck-icon deck-option';
        icon.dataset.deck = i;
        icon.textContent = i;
        icon.style.backgroundColor = deckColors[(i - 1) % deckColors.length];
        icon.addEventListener('click', handleDeckOptionClick);
        const saveBtn = document.createElement('button');
        saveBtn.className = 'deck-save-hover';
        saveBtn.innerHTML = '<img src="./images/save-icon.png" alt="save">';
        saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const deckName = `Deck ${icon.dataset.deck}`;
            const slides = getCurrentSlides();
            window.electronAPI.send('save-deck-slides', { deckName, slides });
        });
        wrapper.appendChild(icon);
        wrapper.appendChild(saveBtn);
        dom.deckIconsContainer.appendChild(wrapper);
    }
    const addBtn = document.createElement('div');
    addBtn.id = 'add-deck-icon';
    addBtn.className = 'deck-icon add-deck';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', handleAddDeck);
    dom.deckIconsContainer.appendChild(addBtn);
}

export function handleDeckMainClick() {
    if (dom.deckContainer)
        dom.deckContainer.classList.toggle('expanded');
}

export function handleDeckOptionClick(event) {
    const deckNum = event.currentTarget.dataset.deck;
    if (!deckNum) return;
    const deckName = `Deck ${deckNum}`;
    if (event.shiftKey) {
        const slides = getCurrentSlides();
        window.electronAPI.send('save-deck-slides', { deckName, slides });
    } else {
        window.electronAPI.send('load-deck', deckName);
    }
    if (dom.deckContainer)
        dom.deckContainer.classList.remove('expanded');
}

export function handleAddDeck() {
    const existingCount = dom.deckIconsContainer.querySelectorAll('.deck-option').length;
    if (existingCount >= 10) {
        const addBtn = dom.deckIconsContainer.querySelector('#add-deck-icon');
        if (addBtn) addBtn.style.display = 'none';
        console.warn('Renderer: Maximum deck limit reached (10).');
        window.electronAPI.send && window.electronAPI.send('log-warning', 'Maximum deck limit reached');
        return;
    }
    const count = existingCount + 1;
    const deckName = `Deck ${count}`;
    const slides = getCurrentSlides();
    window.electronAPI.send('create-deck', { name: deckName, slides });
    const wrapper = document.createElement('div');
    wrapper.className = 'deck-icon-wrapper';
    const icon = document.createElement('div');
    icon.className = 'deck-icon deck-option';
    icon.dataset.deck = count;
    icon.textContent = count;
    icon.style.backgroundColor = deckColors[(count - 1) % deckColors.length];
    icon.addEventListener('click', handleDeckOptionClick);
    const saveBtn = document.createElement('button');
    saveBtn.className = 'deck-save-hover';
    saveBtn.innerHTML = '<img src="./images/save-icon.png" alt="save">';
    saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const deckName = `Deck ${icon.dataset.deck}`;
        const slides = getCurrentSlides();
        window.electronAPI.send('save-deck-slides', { deckName, slides });
    });
    wrapper.appendChild(icon);
    wrapper.appendChild(saveBtn);
    const addBtn = dom.deckIconsContainer.querySelector('#add-deck-icon');
    dom.deckIconsContainer.insertBefore(wrapper, addBtn);
    if (count >= 10 && addBtn) addBtn.style.display = 'none';
}
