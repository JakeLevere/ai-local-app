import { dom } from './domCache.js';
import { state } from './uiState.js';

export function sanitizeFolderName(name) {
    if (!name) return '';
    return String(name).toLowerCase().replace(/[^a-z0-9_-]/gi, '_');
}

export async function fetchFavoritePersona() {
    try {
        state.favoritePersonaId = await window.electronAPI.invoke('get-favorite-persona');
    } catch (err) {
        console.error('Failed to fetch favorite persona:', err);
        state.favoritePersonaId = null;
    }
    updateFavoriteStars();
}

export function autoResizeTextarea(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

export function setupTextareaAutoResize() {
    const areas = [dom.prePromptText, dom.memoryPromptText, dom.memoryText, dom.conversationsText];
    areas.forEach(area => {
        if (area) {
            autoResizeTextarea(area);
            area.addEventListener('input', () => autoResizeTextarea(area));
        }
    });
}

export function updateFavoriteStars() {
    if (dom.personaListContainer) {
        dom.personaListContainer.querySelectorAll('.persona-item').forEach(item => {
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
    const overlay = dom.favoriteStarOverlay;
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

export function updateFavoriteCheckbox() { updateFavoriteStars(); }

export async function handleFavoriteStarClick(e) {
    e.stopPropagation();
    const id = state.selectedIdentifier;
    if (!id) return;
    try {
        if (state.favoritePersonaId === id) {
            state.favoritePersonaId = null;
            await window.electronAPI.invoke('set-favorite-persona', null);
        } else {
            state.favoritePersonaId = id;
            await window.electronAPI.invoke('set-favorite-persona', id);
        }
    } catch (err) {
        console.error('Failed to toggle favorite persona', err);
    }
    updateFavoriteCheckbox();
}

export function renderPersonaList(personas) {
    const container = dom.personaListContainer;
    if (!container) return;
    container.innerHTML = '';
    if (!Array.isArray(personas) || personas.length === 0) {
        container.innerHTML = '<li class="loading-personas">No Personas Found</li>';
        return;
    }
    personas.forEach(p => {
        const li = document.createElement('li');
        li.className = 'persona-item primary-persona';
        li.dataset.personaId = p.id;
        li.innerHTML = ` <img src="${p.icon}" onerror="this.src='./images/placeholder.png'" class="persona-icon"> <span class="persona-name">${p.name}</span>`;
        container.appendChild(li);
    });
    updateFavoriteStars();
}

export function renderPersonaDropdown(personas) {
    const dropdown = dom.personaSelect;
    if (!dropdown) return;
    dropdown.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select Persona';
    dropdown.appendChild(placeholder);

    if (!Array.isArray(personas) || personas.length === 0) {
        placeholder.textContent = 'No Personas Found';
        return;
    }

    personas.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        dropdown.appendChild(opt);
    });

    const defaultId = state.favoritePersonaId || personas[0].id;
    dropdown.value = defaultId;
    handlePersonaSelectChange({ target: dropdown });
}

export function handlePersonaItemClick(event) {
    const item = event.target.closest('.persona-item');
    if (!item) return;
    const identifier = item.dataset.personaId;
    document.querySelectorAll('#persona-list-container .persona-item.selected').forEach(i => i.classList.remove('selected'));
    item.classList.add('selected');
    state.selectedIdentifier = identifier;
    state.activePrimaryIdentifier = identifier;
    loadInitialContent(state.selectedIdentifier);
    document.querySelectorAll('.dropdown-content.active').forEach(ac => {
        ac.classList.remove('active');
        ac.previousElementSibling?.classList.remove('active');
    });
    updateFavoriteCheckbox();
}

export function handlePersonaSelectChange(event) {
    const identifier = event.target.value;
    if (!identifier) return;
    if (dom.personaListContainer) {
        dom.personaListContainer.querySelectorAll('.persona-item.selected').forEach(i => i.classList.remove('selected'));
        const item = dom.personaListContainer.querySelector(`.persona-item[data-persona-id="${identifier}"]`);
        if (item) item.classList.add('selected');
    }
    state.selectedIdentifier = identifier;
    state.activePrimaryIdentifier = identifier;
    loadInitialContent(state.selectedIdentifier);
    document.querySelectorAll('.dropdown-content.active').forEach(ac => {
        ac.classList.remove('active');
        ac.previousElementSibling?.classList.remove('active');
    });
    updateFavoriteCheckbox();
}

export function appendMessageToChatLog(entry, isStatus = false, isUser = false) {
    if (!dom.chatLog) {
        console.error("Renderer Error: chatLog element not found!");
        return;
    }
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
            if (state.selectedIdentifier) {
                const parts = state.selectedIdentifier.split('/');
                const primaryId = parts[0];
                if (parts.length === 1) {
                    speaker = state.primaryPersonaCache[primaryId]?.name || primaryId;
                } else {
                    const subId = parts[1];
                    const subPersona = state.primaryPersonaCache[primaryId]?.subPersonas.find(sub => sanitizeFolderName(sub.name) === subId);
                    speaker = subPersona?.name || subId;
                }
            }
            p.className = 'ai-message';
            if (messageContent.startsWith('Error:')) {
                speaker = 'Error';
                message = messageContent.substring(6).trim();
                p.classList.add('error-message');
                p.style.color = '#FF6B6B';
                p.style.backgroundColor = 'rgba(255, 107, 107, 0.1)';
            }
        }
        p.innerHTML = `<strong>${speaker}:<span class="thinking-bar"></span></strong> <span class="message-text"></span>`;
        const messageTextElement = p.querySelector('.message-text');
        if (messageTextElement) messageTextElement.textContent = message;
        else p.textContent = message;
        if (p.classList.contains('ai-message') && !p.classList.contains('error-message') && !isUser && !isStatus) {
            if (state.latestAIMessageElement) {
                state.latestAIMessageElement.classList.remove('thinking-active');
            }
            state.latestAIMessageElement = p;
        }
    }
    dom.chatLog.appendChild(p);
    requestAnimationFrame(() => {
        if (dom.chatLog) dom.chatLog.scrollTop = dom.chatLog.scrollHeight;
    });
}

export function loadInitialContent(identifier) {
    if (identifier) {
        window.electronAPI.send('load-initial-data', identifier);
    } else {
        console.error('Renderer: Cannot load initial content, identifier is missing.');
    }
}

export function sendMessage() {
    if (!dom.userInput || !dom.chatLog || !state.selectedIdentifier) {
        appendMessageToChatLog({ content: 'Please select a Persona or Sub-Persona first.' }, true);
        return;
    }
    const content = dom.userInput.value.trim();
    if (!content) return;
    const lower = content.toLowerCase();
    const openMatch = lower.match(/open\s+([a-z0-9_-]+)(?:.*?(?:display|slide)\s*(\d+))?/i);
    if (openMatch) {
        const program = openMatch[1];
        if (program === 'browser') {
            let displayNum = openMatch[2];
            if (!displayNum) {
                const available = Object.keys(dom.displays).find(id => {
                    const d = dom.displays[id];
                    return d && !d.image.classList.contains('active') && !d.iframe.classList.contains('active');
                }) || 'display1';
                displayNum = available.replace('display', '');
            }
            const displayId = `display${displayNum}`;
            const elem = dom.displays?.[displayId]?.element;
            const visible = elem ? { x: elem.getBoundingClientRect().left, y: elem.getBoundingClientRect().top, width: elem.getBoundingClientRect().width, height: elem.getBoundingClientRect().height } : { x: 0, y: 0, width: 0, height: 0 };
            window.electronAPI.send('open-program', { program, displayId });
            window.electronAPI.send('launch-browser', { displayId, bounds: { x: Math.round(visible.x), y: Math.round(visible.y), width: Math.round(visible.width), height: Math.round(visible.height) } });
            state.activeBrowserDisplays[displayId] = true;
            const bright2 = elem && elem.querySelector('.display')?.classList.contains('fully-visible') ? 100 : 35;
            if (bright2 === 100) {
                window.electronAPI.send('show-browser-view', displayId);
            } else {
                window.electronAPI.send('hide-browser-view', displayId);
            }
            window.electronAPI.send('set-browser-brightness', { displayId, brightness: bright2 });
            appendMessageToChatLog({ content: `Opening browser in display ${displayNum}.` }, true);
            dom.userInput.value = '';
            return;
        }
        let displayNum = openMatch[2];
        if (!displayNum) {
            const available = Object.keys(dom.displays).find(id => {
                const d = dom.displays[id];
                return d && !d.image.classList.contains('active') && !d.iframe.classList.contains('active');
            }) || 'display1';
            displayNum = available.replace('display', '');
        }
        const displayId = `display${displayNum}`;
        window.electronAPI.send('open-program', { program, displayId });
        appendMessageToChatLog({ content: `Opening ${program} in display ${displayNum}.` }, true);
        dom.userInput.value = '';
        return;
    }
    appendMessageToChatLog({ content }, false, true);
    window.electronAPI.send('add-entry', { userContent: content, personaIdentifier: state.selectedIdentifier });
    dom.userInput.value = '';
}
