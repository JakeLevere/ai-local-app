import { domElements } from './domCache.js';
import { state } from './uiState.js';

export async function fetchFavoritePersona() {
    try {
        state.favoritePersonaId = await window.electronAPI.invoke('get-favorite-persona');
    } catch (err) {
        console.error('Failed to fetch favorite persona:', err);
        state.favoritePersonaId = null;
    }
    updateFavoriteStars();
}

export function updateFavoriteStars() {
    if (domElements.personaListContainer) {
        domElements.personaListContainer.querySelectorAll('.persona-item').forEach(item => {
            const star = item.querySelector('.favorite-star');
            if (!star) return;
            if (item.dataset.personaId === state.favoritePersonaId) {
                star.textContent = '★';
                star.classList.add('active');
            } else {
                star.textContent = '☆';
                star.classList.remove('active');
            }
        });
    }
    const overlay = domElements.favoriteStarOverlay;
    if (overlay) {
        if (state.selectedIdentifier && state.selectedIdentifier === state.favoritePersonaId) {
            overlay.textContent = '★';
            overlay.classList.add('active');
        } else {
            overlay.textContent = '☆';
            overlay.classList.remove('active');
        }
    }
}

export function appendMessageToChatLog(entry, isStatus = false, isUser = false) {
    if (!domElements.chatLog) return;
    const p = document.createElement('p');
    const messageContent = entry?.content || '...';
    if (isStatus) {
        p.className = 'status-message';
        p.textContent = messageContent;
    } else {
        let speaker = 'AI';
        let message = messageContent;
        if (isUser) {
            speaker = 'You';
            p.className = 'user-message';
        } else {
            p.className = 'ai-message';
            if (messageContent.startsWith('Error:')) {
                speaker = 'Error';
                message = messageContent.substring(6).trim();
                p.classList.add('error-message');
                p.style.color = '#FF6B6B';
                p.style.backgroundColor = 'rgba(255, 107, 107, 0.1)';
            }
            state.latestAIMessageElement = p;
        }
        p.innerHTML = `<strong>${speaker}:<span class="thinking-bar"></span></strong> <span class="message-text"></span>`;
        const messageTextElement = p.querySelector('.message-text');
        if (messageTextElement) messageTextElement.textContent = message;
        else p.textContent = message;
    }
    domElements.chatLog.appendChild(p);
    requestAnimationFrame(() => {
        domElements.chatLog.scrollTop = domElements.chatLog.scrollHeight;
    });
}

export function sendMessage() {
    if (!domElements.userInput || !domElements.chatLog || !state.selectedIdentifier) {
        appendMessageToChatLog({ content: 'Please select a Persona or Sub-Persona first.' }, true);
        return;
    }
    const content = domElements.userInput.value.trim();
    if (!content) return;
    appendMessageToChatLog({ content }, false, true);
    window.electronAPI.send('add-entry', { userContent: content, personaIdentifier: state.selectedIdentifier });
    domElements.userInput.value = '';
}

export function loadInitialContent(identifier) {
    if (identifier) {
        window.electronAPI.send('load-initial-data', identifier);
    }
}

export function updateFavoriteCheckbox() {
    updateFavoriteStars();
}
