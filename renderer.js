// renderer.js (Debug Target Display)

console.log("--- Renderer Script Loading ---");

// --- Globals ---
let selectedAI = 'Engineer AI';
let latestAIMessageElement = null;
const imageBasePath = './images';
let eventListenersAttached = false;
let ipcListenersAttached = false;

// --- DOM Element References ---
let domElements = {};
function cacheDomElements() {
    console.log("--- Caching DOM Elements ---");
    domElements = {
        configHeader: document.getElementById('config-header'),
        infoPanels: document.getElementById('info-panels'),
        leftSidebar: document.getElementById('left-sidebar'),
        collapseArrow: document.getElementById('collapse-arrow'),
        appContainer: document.querySelector('.app-container'),
        statusBar: document.getElementById('persona-status-bar'),
        statusCollapseArrow: document.getElementById('status-collapse-arrow'),
        displaysContainer: document.getElementById('displays-container'),
        sendButton: document.getElementById('send_button'),
        userInput: document.getElementById('user_input'),
        chatLog: document.getElementById('chat-log'),
        personaImage: document.getElementById('persona-image'),
        statusTitle: document.getElementById('status-title'),
        configPanelHeader: document.getElementById('config-header'),
        convCountSpan: document.getElementById('conv-count'),
        lastInteractionSpan: document.getElementById('last-interaction'),
        prePromptText: document.getElementById('pre-prompt-text'),
        memoryPromptText: document.getElementById('memory-prompt-text'),
        memoryText: document.getElementById('memory-text'),
        conversationsText: document.getElementById('conversations-text'),
        rightChat: document.getElementById('right-chat'),
        chatCollapseArrow: document.getElementById('chat-collapse-arrow'),
        createPersonaBtn: document.getElementById('create-persona'),
        createDeckBtn: document.getElementById('create-deck'),
        deckDropdown: document.getElementById('deck-dropdown'),
        createSlideBtn: document.getElementById('create-slide'),
        personaList: document.querySelector('.persona-list'),
        slideList: document.querySelector('.slide-list'),
        displays: {
            'display1': {
                iframe: document.getElementById('iframe1'),
                image: document.getElementById('image1'),
                element: document.getElementById('display1')
            },
            'display2': {
                iframe: document.getElementById('iframe2'),
                image: document.getElementById('image2'),
                element: document.getElementById('display2')
            },
            'display3': {
                iframe: document.getElementById('iframe3'),
                image: document.getElementById('image3'),
                element: document.getElementById('display3')
            }
        }
    };
    if (!domElements.displays?.display1?.iframe || !domElements.chatLog || !domElements.createPersonaBtn) {
        console.error("!!! Renderer FATAL: Could not find essential DOM elements. Check HTML IDs.");
    } else {
        console.log("--- DOM Elements Cached Successfully ---");
    }
}


// --- Helper Functions ---

function clearDisplayUI(displayId) { /* ... function unchanged from previous version ... */
    console.log(`--- Clearing Display UI for ${displayId} ---`);
    const display = domElements.displays ? domElements.displays[displayId] : null;
    if (display && display.element && display.iframe && display.image) {
        console.log("   - clearDisplayUI: Elements found.");
        display.image.classList.remove('active');
        display.iframe.classList.remove('active');
        display.element.classList.remove('loading-active');
        console.log("   - clearDisplayUI: Classes removed.");
        if (display.iframe.src && display.iframe.src !== 'about:blank') {
            console.log(`   - clearDisplayUI: Setting iframe src to about:blank for ${displayId}`);
            display.iframe.src = 'about:blank';
        } else {
             console.log(`   - clearDisplayUI: iframe src for ${displayId} already blank or unset.`);
        }
        if (display.image.src && display.image.src !== '') {
            console.log(`   - clearDisplayUI: Clearing image src for ${displayId}`);
            display.image.src = '';
        } else {
             console.log(`   - clearDisplayUI: Image src for ${displayId} already blank or unset.`);
        }
        display.image.removeAttribute('data-path');
        console.log("   - clearDisplayUI: Sources cleared.");
        updateSlideIcon(displayId, 'empty', null);
        console.log(`--- Finished Clearing Display UI for ${displayId} ---`);
    } else {
        console.error(`Renderer Error: Invalid display object or elements missing (iframe?) for ${displayId} in clearDisplayUI`);
    }
}

// ***** ADD LOGGING HERE *****
function findAvailableDisplayId() {
    if (!domElements.displays) return 'display1';
    let foundId = null;
    // --- START Logging ---
    console.log("--- Running findAvailableDisplayId ---");
    for (const id in domElements.displays) {
         const d = domElements.displays[id];
         // Check elements exist before accessing classList
         const isImageActive = d?.image?.classList.contains('active');
         const isIframeActive = d?.iframe?.classList.contains('active');
         console.log(`   - Checking ${id}: ImageActive=${isImageActive}, IframeActive=${isIframeActive}`);
         if (d && d.image && d.iframe && !isImageActive && !isIframeActive) {
             foundId = id;
             console.log(`   - Found available display: ${id}`);
             break; // Found the first available one
         }
    }
    const result = foundId || 'display1'; // Default to display1 if none found
    console.log(`--- findAvailableDisplayId returning: ${result} ---`);
    // --- END Logging ---
    return result;
}
// ***** END LOGGING *****


// --- Other Helper Functions (sendMessage, loadInitialContent, updateStatusBarUI, appendMessageToChatLog, addPersonaToList) remain unchanged ---
function sendMessage() { /* ... no changes ... */
    console.log('Renderer: Send message triggered'); if (!domElements.userInput || !domElements.chatLog) { console.error("Cannot send message, input/log element missing."); return; } const content = domElements.userInput.value.trim(); if (content && selectedAI) { appendMessageToChatLog({ content: content }, false, true); window.electronAPI.send('add-entry', { userContent: content, aiName: selectedAI }); domElements.userInput.value = ''; } else if (!selectedAI) { appendMessageToChatLog({ content: 'Please select an AI persona first.' }, true); }
}
function loadInitialContent(aiName) { /* ... no changes ... */
    console.log('Renderer: Requesting initial content for:', aiName); if (aiName) { window.electronAPI.send('load-initial-data', aiName); } else { console.error("Renderer: Cannot load initial content, aiName is missing."); }
}
function updateStatusBarUI(aiName, status) { /* ... no changes ... */
    console.log('Renderer: Updating status bar UI for:', aiName, status); if (!domElements.statusTitle || !domElements.personaImage || !domElements.configPanelHeader || !domElements.convCountSpan || !domElements.lastInteractionSpan) { console.error("Renderer Error: Status bar elements not found!"); return; } domElements.statusTitle.textContent = aiName; const personaItem = domElements.personaList ? domElements.personaList.querySelector(`.persona-item[data-ai-name="${aiName}"]`) : null; if (personaItem) { const imgBase = personaItem.dataset.imgBase; domElements.personaImage.src = `${imageBasePath}/${imgBase.split('/').pop()}.png`; domElements.personaImage.onerror = () => { if(domElements.personaImage) domElements.personaImage.src = `${imageBasePath}/placeholder.png`; }; } else { domElements.personaImage.src = `${imageBasePath}/placeholder.png`; } domElements.configPanelHeader.textContent = `${aiName} Configuration`; domElements.convCountSpan.textContent = `Conversations: ${status?.convCount || 0}`; domElements.lastInteractionSpan.textContent = `Last Interaction: ${status?.lastInteraction || 'N/A'}`;
}
function appendMessageToChatLog(entry, isStatus = false, isUser = false) { /* ... no changes ... */
    if (!domElements.chatLog) { console.error("Renderer Error: chatLog element not found!"); return; } const p = document.createElement('p'); const messageContent = entry?.content || '...'; if (isStatus) { p.className = 'status-message'; p.textContent = messageContent; } else { let speaker = selectedAI || "AI"; let message = messageContent; const separatorIndex = messageContent.indexOf(': '); if (isUser) { speaker = 'You'; message = messageContent; p.className = 'user-message'; } else if (messageContent.startsWith('Error:')) { speaker = 'Error'; message = messageContent.substring(7); p.className = 'ai-message error-message'; p.style.color = '#FF6B6B'; p.style.backgroundColor = 'rgba(255, 107, 107, 0.1)'; } else if (separatorIndex !== -1 && !messageContent.startsWith('You:')) { speaker = messageContent.substring(0, separatorIndex); message = messageContent.substring(separatorIndex + 2); p.className = 'ai-message'; } else { speaker = selectedAI || "AI"; message = messageContent; p.className = 'ai-message'; } p.innerHTML = `<strong>${speaker}:<span class="thinking-bar"></span></strong> <span class="message-text"></span>`; const messageTextElement = p.querySelector('.message-text'); if (messageTextElement) messageTextElement.textContent = message; else p.textContent = message; if (p.classList.contains('ai-message') && !p.classList.contains('error-message') && !isUser && !isStatus) { latestAIMessageElement = p; } } domElements.chatLog.appendChild(p); requestAnimationFrame(() => { if (domElements.chatLog) domElements.chatLog.scrollTop = domElements.chatLog.scrollHeight; });
}
function addPersonaToList(personaData) { /* ... no changes ... */
    if (!domElements.personaList) { console.error("Renderer Error: personaList element not found!"); return; } const { name, description, imgBase } = personaData; console.log(`Renderer: Adding new persona to list: ${name}`); const newItem = document.createElement('li'); newItem.className = 'persona-item'; newItem.dataset.aiName = name; newItem.dataset.imgBase = imgBase; newItem.dataset.description = description; const iconSrc = `${imageBasePath}/${imgBase.split('/').pop()}.png`; newItem.innerHTML = `<img src="${iconSrc}" onerror="this.src='${imageBasePath}/placeholder.png'" alt="${name} Icon" class="persona-icon"><span class="persona-name">${name}</span>`; newItem.addEventListener('click', handlePersonaItemClick); domElements.personaList.appendChild(newItem);
}
function updateSlideIcon(displayId, type, src) { /* ... no changes ... */
    const slideItem = domElements.slideList ? domElements.slideList.querySelector(`.slide-item[data-display-id="${displayId}"]`) : null; if (!slideItem) { return; } const slideIcon = slideItem.querySelector('.slide-icon'); const slideName = slideItem.querySelector('.slide-name'); if (!slideIcon || !slideName) { console.error(`Renderer Error: Icon or name element missing in slide item ${displayId}`); return; } console.log(`--- Updating slide icon for ${displayId} | type: ${type} | src: ${src}`); slideIcon.style.backgroundColor = 'transparent'; slideIcon.onerror = () => { if (slideIcon) slideIcon.src = `${imageBasePath}/placeholder.png`; if (slideName) slideName.textContent = 'Load Error'; }; if (type === 'image' && src) { slideIcon.src = src.startsWith('file://') ? src : `file://${src}`; slideName.textContent = 'Image'; } else if (type === 'iframe' && src) { if (src.includes('example.com')) { slideIcon.src = `${imageBasePath}/webview-icon.png`; slideName.textContent = 'Example.com'; } else if (src.includes('persona-creator.html')) { slideIcon.src = `${imageBasePath}/persona-creator-icon.png`; slideName.textContent = 'Persona Creator'; } else if (src === 'about:blank' || !src) { slideIcon.src = `${imageBasePath}/placeholder.png`; slideIcon.style.backgroundColor = '#444'; slideName.textContent = 'Empty'; } else { slideIcon.src = `${imageBasePath}/webview-icon.png`; slideName.textContent = 'Web Page'; } } else { slideIcon.src = `${imageBasePath}/placeholder.png`; slideIcon.style.backgroundColor = '#444'; slideName.textContent = type === 'error' ? 'Load Error' : 'Empty'; }
}


// --- Event Handlers --- (No changes needed)
function handlePersonaItemClick(event) { /* ... no changes ... */
    const item = event.currentTarget; const aiName = item.dataset.aiName; console.log('Renderer: Persona item clicked:', aiName); document.querySelectorAll('.persona-item.selected').forEach(i => i.classList.remove('selected')); item.classList.add('selected'); selectedAI = aiName; loadInitialContent(selectedAI); if (domElements.infoPanels) domElements.infoPanels.classList.remove('active'); document.querySelectorAll('.dropdown-content.active').forEach(activeContent => { activeContent.classList.remove('active'); if (activeContent.previousElementSibling) activeContent.previousElementSibling.classList.remove('active'); });
}
function handleSlideItemClick(event) { /* ... no changes ... */
    const item = event.currentTarget; const displayId = item.dataset.displayId; console.log('Renderer: Slide item clicked:', displayId); document.querySelectorAll('.slide-item.selected').forEach(i => i.classList.remove('selected')); item.classList.add('selected'); const displayElement = document.getElementById(displayId); if (displayElement?.scrollIntoView) { displayElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); displayElement.style.transition = 'outline 0.1s ease-in-out'; displayElement.style.outline = '2px solid var(--baby-blue)'; setTimeout(() => { if(displayElement) displayElement.style.outline = 'none'; }, 600); }
}


// --- Setup Functions ---
function setupEventListeners() { /* ... no changes needed ... */
    if (eventListenersAttached) { console.warn("Renderer: Attempted to attach event listeners multiple times."); return; }
    console.log("Renderer: Attaching event listeners..."); const els = domElements;
    els.configHeader?.addEventListener('click', () => els.infoPanels?.classList.toggle('active'));
    els.collapseArrow?.addEventListener('click', () => { els.leftSidebar?.classList.toggle('collapsed'); els.appContainer?.classList.toggle('collapsed'); });
    els.statusCollapseArrow?.addEventListener('click', () => els.statusBar?.classList.toggle('collapsed'));
    els.chatCollapseArrow?.addEventListener('click', () => { els.rightChat?.classList.toggle('collapsed'); els.appContainer?.classList.toggle('chat-collapsed'); });
    document.querySelectorAll('.dropdown-header').forEach(header => { header.addEventListener('click', () => { const content = header.nextElementSibling; if (!content?.classList.contains('dropdown-content')) return; const parentConfig = header.closest('#config-content'); parentConfig?.querySelectorAll('.dropdown-content.active').forEach(activeContent => { if (activeContent !== content) { activeContent.classList.remove('active'); activeContent.previousElementSibling?.classList.remove('active'); } }); content.classList.toggle('active'); header.classList.toggle('active'); }); });
    document.querySelectorAll('.persona-item').forEach(item => item.addEventListener('click', handlePersonaItemClick));
    document.querySelectorAll('.slide-item').forEach(item => item.addEventListener('click', handleSlideItemClick));
    els.sendButton?.addEventListener('click', sendMessage);
    els.userInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    document.getElementById('save-pre-prompt')?.addEventListener('click', () => window.electronAPI.send('save-config', { aiName: selectedAI, file: 'Pre-Prompt.md', content: els.prePromptText?.value }));
    document.getElementById('auto-pre-prompt')?.addEventListener('click', () => window.electronAPI.send('auto-populate-config', { aiName: selectedAI, type: 'pre-prompt' }));
    document.getElementById('save-memory-prompt')?.addEventListener('click', () => window.electronAPI.send('save-config', { aiName: selectedAI, file: 'Memory-Prompt.md', content: els.memoryPromptText?.value }));
    document.getElementById('save-memory')?.addEventListener('click', () => window.electronAPI.send('save-config', { aiName: selectedAI, file: 'Memory.md', content: els.memoryText?.value }));
    document.getElementById('update-memory')?.addEventListener('click', () => window.electronAPI.send('auto-populate-config', { aiName: selectedAI, type: 'memory' }));
    document.getElementById('save-conversations')?.addEventListener('click', () => window.electronAPI.send('save-config', { aiName: selectedAI, file: 'Stored Conversations.md', content: els.conversationsText?.value }));
    if (els.createPersonaBtn) { els.createPersonaBtn.addEventListener('click', () => { console.log('>>> RENDERER: Create New Persona button CLICKED <<<'); const availableDisplay = findAvailableDisplayId(); console.log(`   - Sending 'load-program' for display: ${availableDisplay}`); window.electronAPI.send('load-program', { displayId: availableDisplay, programType: 'persona-creator' }); }); console.log("   - Added click listener to createPersonaBtn."); } else { console.error("Renderer Error: createPersonaBtn not found during listener setup."); }
    els.createDeckBtn?.addEventListener('click', () => { console.log('Renderer: Create New Deck button clicked'); const deckName = prompt('Enter new deck name:'); if (deckName && deckName.trim()) { const currentDisplaysState = {}; if (domElements.displays) { Object.keys(domElements.displays).forEach(displayId => { const display = domElements.displays[displayId]; if (display?.image?.classList.contains('active') && display.image.dataset.path) { currentDisplaysState[displayId] = { type: 'image', src: `file://${display.image.dataset.path}` }; } else if (display?.iframe?.classList.contains('active') && display.iframe.src && display.iframe.src !== 'about:blank') { currentDisplaysState[displayId] = { type: 'iframe', src: display.iframe.src }; } else { currentDisplaysState[displayId] = { type: 'empty' }; } }); } window.electronAPI.send('create-deck', { deckName: deckName.trim(), displays: currentDisplaysState }); } });
    els.deckDropdown?.addEventListener('change', (e) => { const deckName = e.target.value; if (deckName) window.electronAPI.send('load-deck', deckName); });
    els.createSlideBtn?.addEventListener('click', () => { const availableDisplay = findAvailableDisplayId(); window.electronAPI.send('clear-display', availableDisplay); });
    document.querySelectorAll('.clear-button').forEach(button => { button.addEventListener('click', (e) => { const displayId = e.currentTarget.dataset.displayId; if (displayId) window.electronAPI.send('clear-display', displayId); }); });
    els.displaysContainer?.addEventListener('contextmenu', (e) => { const target = e.target; if (target.tagName === 'IMG' && target.classList.contains('active') && target.closest('.display')) { e.preventDefault(); const imagePath = target.dataset.path; if (imagePath) { window.electronAPI.send('context-menu-command', { command: 'copy-image', path: imagePath }); } else { console.warn('Cannot copy image, path data attribute missing.'); } } });
    eventListenersAttached = true; console.log("Renderer: Event listeners attached.");
}

function setupIpcListeners() {
    if (ipcListenersAttached) { console.warn("Renderer: Attempted to attach IPC listeners multiple times."); return; }
    console.log("Renderer: Attaching IPC listeners...");

    console.log("   - Registering listener for 'load-display'");
    window.electronAPI.on('load-display', ({ displayId, url }) => {
         try {
             console.log(`>>> RENDERER: Received 'load-display' for ${displayId} with URL: ${url}`);
             if (!displayId || !url) { console.error(`Invalid args! displayId=${displayId}, url=${url}`); return; }
             if (!domElements?.displays) { console.error(`Global 'displays' object missing!`); return; }
             const display = domElements.displays[displayId];
             if (!display || !display.element || !display.iframe || !display.image) { console.error(`Invalid display object/elements for ${displayId}.`, display); return; }
             const displayElement = display.element;
             const iframeElement = display.iframe;

             // ***** ADD LOGGING BEFORE MANIPULATION *****
             console.log(`>>> TARGETING ELEMENT TO SET SRC/CLASS: ID=${iframeElement.id}, Element=`, iframeElement);
             // ***** END LOGGING *****

             clearDisplayUI(displayId);
             displayElement.classList.remove('loading-active');

             const onIframeLoad = () => {
                 console.log(`>>> IFRAME LOAD FINISH for ${displayId} URL: ${iframeElement?.src}`);
                 displayElement.classList.remove('loading-active');
                 iframeElement.removeEventListener('load', onIframeLoad); // Clean up listener
                 iframeElement.removeEventListener('error', onIframeError);
             };
             const onIframeError = (error) => {
                 console.error(`>>> IFRAME LOAD ERROR for ${displayId} URL: ${url}`, error);
                 appendMessageToChatLog({ content: `Error loading content in display ${displayId}.` }, true);
                 displayElement.classList.remove('loading-active');
                 updateSlideIcon(displayId, 'error', null);
                 iframeElement.removeEventListener('error', onIframeError); // Clean up listener
                 iframeElement.removeEventListener('load', onIframeLoad);
             };

             iframeElement.addEventListener('load', onIframeLoad, { once: true }); // Use once for safety
             iframeElement.addEventListener('error', onIframeError, { once: true }); // Use once for safety
             console.log(`   - Added 'load' and 'error' listeners to iframe ${displayId}.`);

             iframeElement.src = url;
             iframeElement.classList.add('active');
             console.log(`   - Set src and added 'active' class to iframe ${iframeElement.id}.`);

             updateSlideIcon(displayId, 'iframe', url);
             console.log(`   - Called updateSlideIcon for ${displayId}.`);

             console.log(`>>> RENDERER: Finished processing 'load-display' for ${displayId} (async iframe load started).`);

         } catch (error) {
             console.error(`>>> RENDERER CRITICAL ERROR in 'load-display' handler for ${displayId}:`, error);
             appendMessageToChatLog({ content: `Internal Error processing display ${displayId}. See DevTools.` }, true);
             try { domElements?.displays[displayId]?.element?.classList.remove('loading-active'); } catch(e){}
         }
    }); // End of 'load-display' handler


    // ... (register all other IPC listeners using window.electronAPI.on - check if any need iframe adjustments) ...
     window.electronAPI.on('initial-data-loaded', ({ aiName, status, content, entries, decks }) => { /* ... handler ... */ });
     window.electronAPI.on('config-saved', ({ file, content }) => { /* ... handler ... */ });
     window.electronAPI.on('config-populated', ({ type, content }) => { /* ... handler ... */ });
     window.electronAPI.on('status-updated', ({ aiName, status }) => { /* ... handler ... */ });
     window.electronAPI.on('entries-loaded', (entries) => { /* ... handler ... */ });
     window.electronAPI.on('append-chat-log', (message, isStatus = true, isUser = false) => { /* ... handler ... */ });
     window.electronAPI.on('start-loading', ({ displayId }) => { /* ... handler ... */ });
     window.electronAPI.on('stop-loading', ({ displayId }) => { /* ... handler ... */ });
     window.electronAPI.on('start-thinking', () => { /* ... handler ... */ });
     window.electronAPI.on('stop-thinking', () => { /* ... handler ... */ });
     window.electronAPI.on('load-image', ({ displayId, imagePath }) => { /* ... handler ... */ });
     window.electronAPI.on('clear-display', ({ displayId }) => { /* ... handler ... */ });
     window.electronAPI.on('decks-updated', (updatedDecks) => { /* ... handler ... */ });
     window.electronAPI.on('load-deck-displays', (deckDisplays) => { /* ... handler ... */ });
     window.electronAPI.on('add-persona', (personaData) => { /* ... handler ... */ });
     window.electronAPI.on('main-process-error', (errorMessage) => { /* ... handler ... */ });


    ipcListenersAttached = true;
    console.log("Renderer: IPC listeners attached.");
}


// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("--- Renderer: DOMContentLoaded event fired ---");
    cacheDomElements();
    if (!eventListenersAttached) setupEventListeners(); else console.warn("Renderer: Skipping setupEventListeners on subsequent DOMContentLoaded?");
    if (!ipcListenersAttached) setupIpcListeners(); else console.warn("Renderer: Skipping setupIpcListeners on subsequent DOMContentLoaded?");
    // ... (rest of initialization logic) ...
    const defaultItem = document.querySelector('.persona-item.selected'); if (defaultItem) { selectedAI = defaultItem.dataset.aiName; } else { const firstPersona = document.querySelector('.persona-item'); if (firstPersona) { firstPersona.classList.add('selected'); selectedAI = firstPersona.dataset.aiName; } else { selectedAI = null; console.warn("Renderer: No default or available persona found."); } }
    if (selectedAI) { loadInitialContent(selectedAI); } else { if (domElements.statusTitle) domElements.statusTitle.textContent = "No Persona Selected"; if (domElements.personaImage) domElements.personaImage.src = `${imageBasePath}/placeholder.png`; if (domElements.chatLog) domElements.chatLog.innerHTML = '<p class="status-message">Please select or create an AI persona.</p>'; }
    const firstSlide = document.querySelector('.slide-item'); if (firstSlide) firstSlide.classList.add('selected');
    console.log("--- Renderer Initialization Complete ---");
});

console.log("--- Renderer Script Loaded ---");
