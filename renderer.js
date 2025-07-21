// renderer.js (Revised Default Selection + Removed Diagnostic Logic)

console.log("--- Renderer Script Loading ---");

let selectedIdentifier = null;
let activePrimaryIdentifier = null;
let primaryPersonaCache = {};
let favoritePersonaId = null;
let latestAIMessageElement = null;
let eventListenersAttached = false;
let ipcListenersAttached = false;
const activeBrowserDisplays = {};
let scrollAnimationFrame = null;
let scrollStopTimer = null;

const deckColors = ['#e74c3c', '#3498db', '#27ae60', '#f1c40f', '#9b59b6', '#1abc9c'];

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
        personaPreviewVideo: document.getElementById('persona-preview-video'),
        personaPreviewImage: document.getElementById('persona-preview-image'),
        statusTitle: document.getElementById('status-title'),
        convCountSpan: document.getElementById('conv-count'),
        lastInteractionSpan: document.getElementById('last-interaction'),
        rightChat: document.getElementById('right-chat'),
        chatCollapseArrow: document.getElementById('chat-collapse-arrow'),
        personaSelect: document.getElementById('persona-select'),
        personaListContainer: document.getElementById('persona-list-container'),
        favoriteStarOverlay: document.getElementById('favorite-star-overlay'),
        configPanelHeader: document.getElementById('config-header'),
        prePromptText: document.getElementById('pre-prompt-text'),
        memoryPromptText: document.getElementById('memory-prompt-text'),
        memoryText: document.getElementById('memory-text'),
        conversationsText: document.getElementById('conversations-text'),
        savePrePromptBtn: document.getElementById('save-pre-prompt'),
        autoPrePromptBtn: document.getElementById('auto-pre-prompt'),
        saveMemoryPromptBtn: document.getElementById('save-memory-prompt'),
        saveMemoryBtn: document.getElementById('save-memory'),
        updateMemoryBtn: document.getElementById('update-memory'),
        createDeckBtn: document.getElementById('create-deck'),
        deckList: document.getElementById('deck-list'),
        createSlideBtn: document.getElementById('create-slide'),
        slideTabs: document.getElementById('slide-tabs'),
        deckContainer: document.getElementById('deck-container'),
        deckIconsContainer: document.getElementById('deck-icons'),
        programMaker: document.getElementById('program-maker'),
        programDescription: document.getElementById('program-description'),
        programOutput: document.getElementById('program-output'),
        generateProgramBtn: document.getElementById('generate-program'),
        displays: {
             'display1': { iframe: document.getElementById('iframe1'), image: document.getElementById('image1'), element: document.getElementById('display1') },
             'display2': { iframe: document.getElementById('iframe2'), image: document.getElementById('image2'), element: document.getElementById('display2') },
             'display3': { iframe: document.getElementById('iframe3'), image: document.getElementById('image3'), element: document.getElementById('display3') },
             'display4': { iframe: document.getElementById('iframe4'), image: document.getElementById('image4'), element: document.getElementById('display4') },
             'display5': { iframe: document.getElementById('iframe5'), image: document.getElementById('image5'), element: document.getElementById('display5') },
             'display6': { iframe: document.getElementById('iframe6'), image: document.getElementById('image6'), element: document.getElementById('display6') },
             'display7': { iframe: document.getElementById('iframe7'), image: document.getElementById('image7'), element: document.getElementById('display7') },
             'display8': { iframe: document.getElementById('iframe8'), image: document.getElementById('image8'), element: document.getElementById('display8') },
             'display9': { iframe: document.getElementById('iframe9'), image: document.getElementById('image9'), element: document.getElementById('display9') },
             'display10': { iframe: document.getElementById('iframe10'), image: document.getElementById('image10'), element: document.getElementById('display10') }
        }
    };
    if (!domElements.displays?.display1?.iframe || !domElements.chatLog) {
        console.error("!!! Renderer FATAL: Could not find essential DOM elements (display1 iframe, chatLog). Check HTML IDs.");
    } else {
        console.log("--- DOM Elements Cached Successfully ---");
        console.log(`[Cache] Persona list container found: ${!!domElements.personaListContainer}`);
    }
}

function sanitizeFolderName(name) {
    if (!name) return '';
    return String(name).toLowerCase().replace(/[^a-z0-9_-]/gi, '_');
}

async function fetchFavoritePersona() {
    try {
        favoritePersonaId = await window.electronAPI.invoke('get-favorite-persona');
    } catch (err) {
        console.error('Failed to fetch favorite persona:', err);
        favoritePersonaId = null;
    }
    updateFavoriteStars();
}

function autoResizeTextarea(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

function setupTextareaAutoResize() {
    const areas = [
        domElements.prePromptText,
        domElements.memoryPromptText,
        domElements.memoryText,
        domElements.conversationsText
    ];
    areas.forEach(area => {
        if (area) {
            autoResizeTextarea(area);
            area.addEventListener('input', () => autoResizeTextarea(area));
        }
    });
}

function updateFavoriteStars(){
    if(domElements.personaListContainer){
        domElements.personaListContainer.querySelectorAll('.persona-item').forEach(item=>{
            const star=item.querySelector('.favorite-star');
            if(!star) return;
            if(item.dataset.personaId===favoritePersonaId){
                star.textContent='★';
                star.classList.add('active');
            }else{
                star.textContent='☆';
                star.classList.remove('active');
            }
        });
    }
    const overlay = domElements.favoriteStarOverlay;
    if(overlay){
        if(selectedIdentifier && selectedIdentifier===favoritePersonaId){
            overlay.textContent='★';
            overlay.classList.add('active');
        }else{
            overlay.textContent='☆';
            overlay.classList.remove('active');
        }
    }
}

function clearDisplayUI(displayId) {
    console.log(`--- Clearing Display UI for ${displayId} ---`);
    const display = domElements.displays?.[displayId];
    if (display?.element && display.iframe && display.image) {
        display.image.classList.remove('active'); display.iframe.classList.remove('active'); display.element.classList.remove('loading-active');
        if (display.iframe.src && display.iframe.src !== 'about:blank') { display.iframe.src = 'about:blank'; }
        if (display.image.src) { display.image.src = ''; }
        display.image.removeAttribute('data-path');
        display.element.classList.add('empty');
        updateSlideIcon(displayId, 'empty', null);
    } else { console.error(`Renderer Error: Invalid display object or elements missing for ${displayId} in clearDisplayUI`); }
}

function findAvailableDisplayId() {
    if (!domElements.displays) return 'display1';
    for (const id in domElements.displays) { const d = domElements.displays[id]; if (d?.image && d.iframe && !d.image.classList.contains('active') && !d.iframe.classList.contains('active')) { return id; } }
    return 'display1';
}

function getCurrentSlides() {
    const slides = {};
    if (!domElements.displays) return slides;
    Object.keys(domElements.displays).forEach(id => {
        const d = domElements.displays[id];
        if (!d) return;
        if (d.image.classList.contains('active') && d.image.dataset.path) {
            slides[id] = { type: 'image', src: d.image.dataset.path };
        } else if (d.iframe.classList.contains('active') && d.iframe.src && d.iframe.src !== 'about:blank') {
            slides[id] = { type: 'iframe', src: d.iframe.src };
        }
    });
    return slides;
}

function calculateVisibleBounds(elem) {
    if (!elem) return { x: 0, y: 0, width: 0, height: 0 };
    const rect = elem.getBoundingClientRect();
    const statusRect = domElements.statusBar?.getBoundingClientRect() || { bottom: 0 };
    const infoRect = domElements.infoPanels?.getBoundingClientRect() || { top: window.innerHeight };

    const left = Math.max(rect.left, 0);
    const right = Math.min(rect.right, window.innerWidth);
    const top = Math.max(rect.top, statusRect.bottom);
    const bottom = Math.min(rect.bottom, infoRect.top);

    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);
    return { x: left, y: top, width, height };
}

function updateBrowserBoundsForDisplay(displayId) {
    const elem = domElements.displays?.[displayId]?.element;
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

function updateAllBrowserBounds() {
    Object.keys(activeBrowserDisplays).forEach(id => updateBrowserBoundsForDisplay(id));
}

function startScrollSync() {
    if (scrollAnimationFrame === null) {
        scrollAnimationFrame = requestAnimationFrame(scrollSyncLoop);
    }
    if (scrollStopTimer) {
        clearTimeout(scrollStopTimer);
    }
    scrollStopTimer = setTimeout(stopScrollSync, 100);
}

function scrollSyncLoop() {
    updateAllBrowserBounds();
    scrollAnimationFrame = requestAnimationFrame(scrollSyncLoop);
}

function stopScrollSync() {
    if (scrollAnimationFrame !== null) {
        cancelAnimationFrame(scrollAnimationFrame);
        scrollAnimationFrame = null;
    }
    if (scrollStopTimer) {
        clearTimeout(scrollStopTimer);
        scrollStopTimer = null;
    }
}

// Trigger a bounce-in animation on a collection of elements. When the
// animation completes for all valid elements, the optional callback is
// invoked. This is useful when layout measurements need to occur only
// after the bounce effect has finished.
function applyBounceAnimation(elements, callback) {
    let remaining = 0;
    let called = false;
    const done = () => {
        if (!called && typeof callback === 'function') {
            called = true;
            callback();
        }
    };
    elements.forEach(el => {
        if (!el) return;
        remaining++;
        el.classList.add('bounce-in');
        el.addEventListener('animationend', () => {
            el.classList.remove('bounce-in');
            if (--remaining === 0) done();
        }, { once: true });
    });
    if (remaining === 0) {
        done();
    } else {
        // Fallback in case animation events do not fire (e.g. element hidden)
        setTimeout(done, 700);
    }
}

function createInitialDeckIcons() {
    if (!domElements.deckIconsContainer) return;
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
        domElements.deckIconsContainer.appendChild(wrapper);
    }
    const addBtn = document.createElement('div');
    addBtn.id = 'add-deck-icon';
    addBtn.className = 'deck-icon add-deck';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', handleAddDeck);
    domElements.deckIconsContainer.appendChild(addBtn);
}

function createProgramIcons() {
    const programs = [
        { name: 'browser', symbol: '🌐' },
        { name: 'calendar', symbol: '📅' },
        { name: 'health', symbol: '❤️' },
        { name: 'persona-creator', symbol: '🎭' },
        { name: 'height-test', symbol: '📏' }
    ];
    Object.values(domElements.displays || {}).forEach(({ element }) => {
        if (!element) return;
        element.classList.add('empty');
        const container = document.createElement('div');
        container.className = 'program-icons';
        programs.forEach(p => {
            const icon = document.createElement('span');
            icon.className = 'program-icon';
            icon.dataset.program = p.name;
            icon.textContent = p.symbol;
            container.appendChild(icon);
        });
        element.appendChild(container);
    });
}

function setupProgramIconListeners() {
    document.querySelectorAll('.program-icon').forEach(icon => {
        icon.addEventListener('click', () => {
            const program = icon.dataset.program;
            const display = icon.closest('.display');
            const displayId = display ? display.id : null;
            if (program && displayId) {
                window.electronAPI.send('open-program', { program, displayId });
                if (program === 'browser') {
                    const bounds = calculateVisibleBounds(display);
                    window.electronAPI.send('launch-browser', {
                        displayId,
                        bounds: {
                            x: Math.round(bounds.x),
                            y: Math.round(bounds.y),
                            width: Math.round(bounds.width),
                            height: Math.round(bounds.height)
                        }
                    });
                    activeBrowserDisplays[displayId] = true;
                    updateBrowserBoundsForDisplay(displayId);
                    const bright = display.classList.contains('fully-visible') ? 100 : 35;
                    window.electronAPI.send('set-browser-brightness', { displayId, brightness: bright });
                }
            }
        });
    });
}

function handleGenerateProgram() {
    const desc = domElements.programDescription?.value?.trim();
    if (!desc) return;
    if (domElements.programOutput) domElements.programOutput.textContent = 'Generating...';
    window.electronAPI.send('generate-program', desc);
}

function setupProgramMaker() {
    domElements.generateProgramBtn?.addEventListener('click', handleGenerateProgram);
    if (domElements.programMaker) {
        domElements.programMaker.addEventListener('click', (e) => {
            const maker = domElements.programMaker;
            if (!maker) return;
            if (maker.classList.contains('collapsed')) {
                maker.classList.remove('collapsed');
                updateAllBrowserBounds();
            } else if (e.target.tagName === 'H2') {
                maker.classList.add('collapsed');
                updateAllBrowserBounds();
            }
        });
    }
    window.electronAPI.on('program-generated', (files) => {
        if (!domElements.programOutput) return;
        domElements.programOutput.innerHTML = '';
        if (Array.isArray(files)) {
            files.forEach(f => {
                const pre = document.createElement('pre');
                pre.textContent = `// ${f.name}\n${f.content}`;
                domElements.programOutput.appendChild(pre);
            });
        } else {
            domElements.programOutput.textContent = String(files);
        }
    });
}

function setupDisplayVisibilityObserver() {
    const container = domElements.displaysContainer;
    if (!container) return;
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            const display = entry.target.querySelector('.display');
            if (!display) return;
            const id = display.id;
            if (entry.intersectionRatio >= 1) {
                display.classList.add('fully-visible');
                if (activeBrowserDisplays[id]) {
                    window.electronAPI.send('set-browser-brightness', { displayId: id, brightness: 100 });
                }
            } else {
                display.classList.remove('fully-visible');
                if (activeBrowserDisplays[id]) {
                    window.electronAPI.send('set-browser-brightness', { displayId: id, brightness: 35 });
                }
            }
        });
    }, { root: container, threshold: 1.0 });
    container.querySelectorAll('.display-wrapper').forEach(wrapper => observer.observe(wrapper));
}

function handleDeckMainClick() {
    if (domElements.deckContainer)
        domElements.deckContainer.classList.toggle('expanded');
}

function handleDeckOptionClick(event) {
    const deckNum = event.currentTarget.dataset.deck;
    if (!deckNum) return;
    const deckName = `Deck ${deckNum}`;
    if (event.shiftKey) {
        const slides = getCurrentSlides();
        window.electronAPI.send('save-deck-slides', { deckName, slides });
    } else {
        window.electronAPI.send('load-deck', deckName);
    }
    if (domElements.deckContainer)
        domElements.deckContainer.classList.remove('expanded');
}

function handleAddDeck() {
    const existingCount = domElements.deckIconsContainer.querySelectorAll('.deck-option').length;
    if (existingCount >= 10) {
        const addBtn = domElements.deckIconsContainer.querySelector('#add-deck-icon');
        if (addBtn) addBtn.style.display = 'none';
        console.warn('Renderer: Maximum deck limit reached (10).');
        appendMessageToChatLog({ content: 'Maximum of 10 decks reached.' }, true);
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
    const addBtn = domElements.deckIconsContainer.querySelector('#add-deck-icon');
    domElements.deckIconsContainer.insertBefore(wrapper, addBtn);
    if (count >= 10 && addBtn) addBtn.style.display = 'none';
}

function sendMessage() {
    console.log('Renderer: Send message triggered');
    if (!domElements.userInput || !domElements.chatLog || !selectedIdentifier) { appendMessageToChatLog({ content: 'Please select a Persona or Sub-Persona first.' }, true); return; }
    const content = domElements.userInput.value.trim();
    if (!content) return;
    const lower = content.toLowerCase();
    const openMatch = lower.match(/open\s+([a-z0-9_-]+)(?:.*?(?:display|slide)\s*(\d+))?/i);
    if (openMatch) {
        const program = openMatch[1];
        if (program === 'browser') {
            let displayNum = openMatch[2];
            if (!displayNum) {
                const available = findAvailableDisplayId();
                displayNum = available.replace('display', '');
            }
            const displayId = `display${displayNum}`;
            const elem = domElements.displays?.[displayId]?.element;
            const visible = elem ? calculateVisibleBounds(elem) : { x: 0, y: 0, width: 0, height: 0 };
            window.electronAPI.send('open-program', { program, displayId });
            window.electronAPI.send('launch-browser', {
                displayId,
                bounds: {
                    x: Math.round(visible.x),
                    y: Math.round(visible.y),
                    width: Math.round(visible.width),
                    height: Math.round(visible.height)
                }
            });
            activeBrowserDisplays[displayId] = true;
            updateBrowserBoundsForDisplay(displayId);
            const bright2 = elem && elem.querySelector('.display')?.classList.contains('fully-visible') ? 100 : 35;
            window.electronAPI.send('set-browser-brightness', { displayId, brightness: bright2 });
            appendMessageToChatLog({ content: `Opening browser in display ${displayNum}.` }, true);
            domElements.userInput.value = '';
            return;
        }
        let displayNum = openMatch[2];
        if (!displayNum) {
            const available = findAvailableDisplayId();
            displayNum = available.replace('display', '');
        }
        const displayId = `display${displayNum}`;
        window.electronAPI.send('open-program', { program, displayId });
        appendMessageToChatLog({ content: `Opening ${program} in display ${displayNum}.` }, true);
        domElements.userInput.value = '';
        return;
    }
    appendMessageToChatLog({ content }, false, true);
    window.electronAPI.send('add-entry', { userContent: content, personaIdentifier: selectedIdentifier });
    domElements.userInput.value = '';
}

function loadInitialContent(identifier) {
    console.log('Renderer: Requesting initial content for identifier:', identifier);
    if (identifier) { window.electronAPI.send('load-initial-data', identifier); }
    else { console.error("Renderer: Cannot load initial content, identifier is missing."); }
}

function updateStatusBarUI(identifier, status) {
    console.log(`[Status Bar Update] Called with identifier: ${identifier}`, "Status:", status);
    if (!domElements.statusTitle || !domElements.personaImage || !domElements.configPanelHeader || !domElements.convCountSpan || !domElements.lastInteractionSpan) { console.error("Renderer Error: Status bar elements not found!"); return; }
    let primaryIdToDisplay = null;
    let titleToDisplay = "No Persona Selected";
    let iconToDisplay = './images/placeholder.png';
    let convCountToDisplay = 0;
    let lastInteractionToDisplay = 'N/A';
    let configHeaderToDisplay = 'Configuration';
    let isPrimarySelected = false;
    let isSubSelected = false;
    if (identifier) {
        const parts = identifier.split('/');
        primaryIdToDisplay = parts[0];
        console.log(`[Status Bar Update] Derived primaryIdToDisplay: ${primaryIdToDisplay}`);
        const primaryData = primaryPersonaCache[primaryIdToDisplay];
        console.log(`[Status Bar Update] Cache lookup result for ${primaryIdToDisplay}:`, primaryData);
        if (primaryData) {
            titleToDisplay = primaryData.name;
            iconToDisplay = primaryData.icon;
            configHeaderToDisplay = `${primaryData.name} Configuration`;
            convCountToDisplay = status?.convCount || 0;
            lastInteractionToDisplay = status?.lastInteraction || 'N/A';
            console.log(`[Status Bar Update] Using status for ${identifier}: Count=${convCountToDisplay}, LastInteraction=${lastInteractionToDisplay}`);
             isPrimarySelected = (parts.length === 1);
             isSubSelected = (parts.length > 1);
             console.log(`[Status Bar Update] isPrimarySelected=${isPrimarySelected}, isSubSelected=${isSubSelected}`);
        } else {
             console.warn(`[Status Bar Update] Cache miss for primary ID ${primaryIdToDisplay}. Using identifier as fallback.`);
             titleToDisplay = identifier;
             configHeaderToDisplay = `${identifier} Configuration`;
             convCountToDisplay = status?.convCount || 0;
             lastInteractionToDisplay = status?.lastInteraction || 'N/A';
             isPrimarySelected = (parts.length === 1);
             isSubSelected = (parts.length > 1);
        }
    } else { console.log("[Status Bar Update] No identifier provided."); }
    console.log(`[Status Bar Update] Setting Title: ${titleToDisplay}`);
    domElements.statusTitle.textContent = titleToDisplay;
    console.log(`[Status Bar Update] Setting Image Src: ${iconToDisplay}`);
    domElements.personaImage.src = iconToDisplay;
    domElements.personaImage.onerror = () => { if (domElements.personaImage) domElements.personaImage.src = './images/placeholder.png'; };
    if (domElements.personaPreviewVideo) {
        const sanitizedId = identifier ? sanitizeFolderName(identifier) : null;
        const videoPath = `./videos/${sanitizedId || sanitizeFolderName(primaryIdToDisplay) || 'placeholder'}.mp4`;
        domElements.personaPreviewVideo.onerror = () => {
            console.error(`Video failed to load: ${videoPath}`);
            if (domElements.personaPreviewImage) {
                domElements.personaPreviewVideo.style.display = 'none';
                domElements.personaPreviewImage.style.display = 'block';
            }
        };
        if (domElements.personaPreviewVideo.src !== videoPath) {
            domElements.personaPreviewVideo.style.display = 'block';
            if (domElements.personaPreviewImage) domElements.personaPreviewImage.style.display = 'none';
            domElements.personaPreviewVideo.src = videoPath;
            domElements.personaPreviewVideo.load();
        }
    }
    domElements.configPanelHeader.textContent = configHeaderToDisplay;
    domElements.convCountSpan.textContent = `Conversations: ${convCountToDisplay}`;
    domElements.lastInteractionSpan.textContent = `Last Interaction: ${lastInteractionToDisplay}`;
    if (domElements.infoPanels) {
        domElements.infoPanels.classList.remove('primary-selected', 'sub-selected');
        if (isPrimarySelected) domElements.infoPanels.classList.add('primary-selected');
        else if (isSubSelected) domElements.infoPanels.classList.add('sub-selected');
        console.log(`[Status Bar Update] Set info panel classes. primary=${isPrimarySelected}, sub=${isSubSelected}`);
    }
    console.log("[Status Bar Update] Finished.");
}

function appendMessageToChatLog(entry, isStatus = false, isUser = false) {
    if (!domElements.chatLog) {
        console.error("Renderer Error: chatLog element not found!");
        return;
    }
    const p = document.createElement('p');
    const messageContent = entry?.content || '...';
    if (isStatus) {
        p.className = 'status-message';
        p.textContent = messageContent;
    } else {
        let speaker = "AI";
        let message = messageContent;
        if (isUser) {
            speaker = 'You';
            p.className = 'user-message';
        } else {
            if (selectedIdentifier) {
                const parts = selectedIdentifier.split('/');
                const primaryId = parts[0];
                if (parts.length === 1) {
                    speaker = primaryPersonaCache[primaryId]?.name || primaryId;
                } else {
                    const subId = parts[1];
                    const subPersona = primaryPersonaCache[primaryId]?.subPersonas.find(sub => sanitizeFolderName(sub.name) === subId);
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
            if (latestAIMessageElement) {
                latestAIMessageElement.classList.remove('thinking-active');
            }
            latestAIMessageElement = p;
        }
    }
    domElements.chatLog.appendChild(p);
    requestAnimationFrame(() => {
        if (domElements.chatLog) domElements.chatLog.scrollTop = domElements.chatLog.scrollHeight;
    });
}
function updateSlideIcon(displayId, type, src) { const slideItem = domElements.slideTabs?.querySelector(`.slide-tab[data-display-id="${displayId}"]`); if (!slideItem) return; const slideIcon = slideItem.querySelector('.slide-icon'); const slideName = slideItem.querySelector('.slide-name'); if (!slideIcon || !slideName) return; slideIcon.style.backgroundColor = 'transparent'; slideIcon.onerror = () => { if (slideIcon) slideIcon.src = './images/placeholder.png'; if (slideName) slideName.textContent = 'Load Error'; }; const imageBasePath = './images'; if (type === 'image' && src) { slideIcon.src = src.startsWith('file://') ? src : `file://${src}`; slideName.textContent = 'Image'; } else if (type === 'iframe' && src) { if (src.includes('player.twitch.tv')) { slideIcon.src = `${imageBasePath}/twitch-icon.png`; slideName.textContent = 'Twitch Stream';} else if (src.includes('example.com')) { slideIcon.src = `${imageBasePath}/webview-icon.png`; slideName.textContent = 'Example.com'; } else if (src.includes('persona-creator.html')) { slideIcon.src = `${imageBasePath}/persona-creator-icon.png`; slideName.textContent = 'Persona Creator'; } else if (src === 'about:blank' || !src) { slideIcon.src = `${imageBasePath}/placeholder.png`; slideIcon.style.backgroundColor = '#444'; slideName.textContent = 'Empty'; } else { slideIcon.src = `${imageBasePath}/webview-icon.png`; slideName.textContent = 'Web Page'; } } else { slideIcon.src = `${imageBasePath}/placeholder.png`; slideIcon.style.backgroundColor = '#444'; slideName.textContent = type === 'error' ? 'Load Error' : 'Empty'; } }

function renderPersonaList(personas) {
    const container = domElements.personaListContainer;
    if (!container) {
        return;
    }
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
function renderPersonaDropdown(personas) {
    const dropdown = domElements.personaSelect;
    if (!dropdown) return;
    dropdown.innerHTML = '';
    if (!Array.isArray(personas) || personas.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = 'No Personas Found';
        opt.value = '';
        dropdown.appendChild(opt);
        return;
    }
    personas.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        dropdown.appendChild(opt);
    });
}
function handlePersonaItemClick(event) {
    const item = event.target.closest('.persona-item');
    if (!item) return;
    const identifier = item.dataset.personaId;
    document.querySelectorAll('#persona-list-container .persona-item.selected').forEach(i => i.classList.remove('selected'));
    item.classList.add('selected');
    selectedIdentifier = identifier;
    activePrimaryIdentifier = identifier;
    loadInitialContent(selectedIdentifier);
    document.querySelectorAll('.dropdown-content.active').forEach(ac => {
        ac.classList.remove('active');
        ac.previousElementSibling?.classList.remove('active');
    });
    updateFavoriteCheckbox();
}
async function handleFavoriteStarClick(e){
    e.stopPropagation();
    const id = selectedIdentifier;
    if(!id) return;
    try{
        if(favoritePersonaId===id){
            favoritePersonaId=null;
            await window.electronAPI.invoke('set-favorite-persona',null);
        }else{
            favoritePersonaId=id;
            await window.electronAPI.invoke('set-favorite-persona',id);
        }
    }catch(err){
        console.error('Failed to toggle favorite persona',err);
    }
    updateFavoriteCheckbox();
}
function updateFavoriteCheckbox(){updateFavoriteStars();}
function handlePersonaSelectChange(event) {
    const identifier = event.target.value;
    if (!identifier) return;
    if (domElements.personaListContainer) {
        domElements.personaListContainer.querySelectorAll('.persona-item.selected').forEach(i => i.classList.remove('selected'));
        const item = domElements.personaListContainer.querySelector(`.persona-item[data-persona-id="${identifier}"]`);
        if (item) item.classList.add('selected');
    }
    selectedIdentifier = identifier;
    activePrimaryIdentifier = identifier;
    loadInitialContent(selectedIdentifier);
    document.querySelectorAll('.dropdown-content.active').forEach(ac => {
        ac.classList.remove('active');
        ac.previousElementSibling?.classList.remove('active');
    });
    updateFavoriteCheckbox();
}
function handleSlideItemClick(event) { const item = event.currentTarget; const displayId = item.dataset.displayId; console.log('Renderer: Slide item clicked:', displayId); document.querySelectorAll('.slide-tab.selected').forEach(i => i.classList.remove('selected')); item.classList.add('selected'); const displayElement = domElements.displays[displayId]?.element; if (displayElement?.scrollIntoView) { displayElement.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });  } else { console.warn(`Renderer Warning: Could not find display element for ${displayId} to scroll.`); } }
function handleDeckItemClick(event) { const item = event.currentTarget; const deckName = item.dataset.deckName; if (!deckName) return; domElements.deckList.querySelectorAll('.deck-item.selected').forEach(i => i.classList.remove('selected')); item.classList.add('selected'); window.electronAPI.send('load-deck', deckName); }

function setupEventListeners() { if (eventListenersAttached) { return; } console.log("Renderer: Attaching event listeners..."); const els = domElements; els.collapseArrow?.addEventListener('click', () => { els.leftSidebar?.classList.toggle('collapsed'); els.appContainer?.classList.toggle('collapsed'); }); els.statusCollapseArrow?.addEventListener('click', () => els.statusBar?.classList.toggle('collapsed')); els.chatCollapseArrow?.addEventListener('click', () => { els.rightChat?.classList.toggle('collapsed'); els.appContainer?.classList.toggle('chat-collapsed'); }); document.querySelectorAll('.dropdown-header').forEach(header => { header.addEventListener('click', () => { const content = header.nextElementSibling; if (!content?.classList.contains('dropdown-content')) return; content.classList.toggle('active'); header.classList.toggle('active'); }); }); document.querySelectorAll('.slide-tab').forEach(item => item.addEventListener('click', handleSlideItemClick)); els.sendButton?.addEventListener('click', sendMessage); els.userInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }); document.querySelectorAll('.clear-button').forEach(button => { button.addEventListener('click', (e) => { const displayId = e.currentTarget.dataset.displayId; if (displayId) window.electronAPI.send('clear-display', displayId); }); }); els.displaysContainer?.addEventListener('contextmenu', (e) => { const target = e.target; if (target.tagName === 'IMG' && target.classList.contains('active') && target.closest('.display')) { e.preventDefault(); const imagePath = target.dataset.path; if (imagePath) { window.electronAPI.send('context-menu-command', { command: 'copy-image', path: imagePath }); } } }); els.personaListContainer?.addEventListener('click', handlePersonaItemClick); els.personaSelect?.addEventListener('change', handlePersonaSelectChange); els.favoriteStarOverlay?.addEventListener('click', handleFavoriteStarClick); els.savePrePromptBtn?.addEventListener('click', () => { if(selectedIdentifier && els.prePromptText) window.electronAPI.send('save-config', { personaIdentifier: selectedIdentifier, file: 'Pre-Prompt.md', content: els.prePromptText.value })}); els.autoPrePromptBtn?.addEventListener('click', () => { if(selectedIdentifier) window.electronAPI.send('auto-populate-config', { personaIdentifier: selectedIdentifier, type: 'pre-prompt' })}); els.saveMemoryPromptBtn?.addEventListener('click', () => { if(selectedIdentifier && els.memoryPromptText) window.electronAPI.send('save-config', { personaIdentifier: selectedIdentifier, file: 'Memory-Prompt.md', content: els.memoryPromptText.value })}); els.saveMemoryBtn?.addEventListener('click', () => { if(selectedIdentifier && els.memoryText) window.electronAPI.send('save-config', { personaIdentifier: selectedIdentifier, file: 'Memory.md', content: els.memoryText.value })}); els.updateMemoryBtn?.addEventListener('click', () => { if(selectedIdentifier) window.electronAPI.send('update-memory-summary', selectedIdentifier)}); els.createDeckBtn?.addEventListener('click', () => { const deckName = prompt('Enter new deck name:'); if (deckName?.trim()) { const currentDisplaysState = {}; if (domElements.displays) { Object.keys(domElements.displays).forEach(displayId => { const display = domElements.displays[displayId]; if (display?.image?.classList.contains('active') && display.image.dataset.path) { currentDisplaysState[displayId] = { type: 'image', src: `file://${display.image.dataset.path}` }; } else if (display?.iframe?.classList.contains('active') && display.iframe.src && display.iframe.src !== 'about:blank') { currentDisplaysState[displayId] = { type: 'iframe', src: display.iframe.src }; } else { currentDisplaysState[displayId] = { type: 'empty' }; } }); } window.electronAPI.send('create-deck', { deckName: deckName.trim(), displays: currentDisplaysState }); } }); els.deckList?.addEventListener('click', (e) => { const item = e.target.closest('.deck-item'); if (item) handleDeckItemClick({currentTarget:item}); }); els.createSlideBtn?.addEventListener('click', () => { const availableDisplay = findAvailableDisplayId(); window.electronAPI.send('clear-display', availableDisplay); }); eventListenersAttached = true; console.log("Renderer: Event listeners attached."); }
function setupIpcListeners() {
    if (ipcListenersAttached) { return; }
    console.log("Renderer: Attaching IPC listeners...");
    window.electronAPI.on('backend-ready', async () => {
        console.log("Renderer: Received backend-ready signal.");
        await fetchFavoritePersona();
        console.log("Renderer: Requesting persona list...");
        window.electronAPI.send('discover-personas');
    });
    window.electronAPI.on('restore-open-displays', (displays) => {
        if (!displays) return;
        Object.keys(displays).forEach(id => {
            const info = displays[id];
            if (info && info.program) {
                window.electronAPI.send('open-program', { program: info.program, displayId: id });
                if (info.program === 'browser') {
                    const el = domElements.displays[id]?.element;
                    if (el) {
                        const bounds = calculateVisibleBounds(el);
                        window.electronAPI.send('launch-browser', {
                            displayId: id,
                            bounds: {
                                x: Math.round(bounds.x),
                                y: Math.round(bounds.y),
                                width: Math.round(bounds.width),
                                height: Math.round(bounds.height)
                            }
                        });
                        activeBrowserDisplays[id] = true;
                        const bright3 = el.classList.contains('fully-visible') ? 100 : 35;
                        window.electronAPI.send('set-browser-brightness', { displayId: id, brightness: bright3 });
                    }
                }
            }
        });
    });
    window.electronAPI.on('personas-loaded', (receivedData) => { console.log(`Renderer: Received 'personas-loaded' event.`); console.log(`  -> Type of receivedData: ${typeof receivedData}`); console.log(`  -> receivedData:`, receivedData); if (Array.isArray(receivedData)) { const personas = receivedData; primaryPersonaCache = {}; personas.forEach(p => { primaryPersonaCache[p.id] = p; }); renderPersonaList(personas); renderPersonaDropdown(personas);
        // *** MODIFIED DEFAULT SELECTION LOGIC ***
        if (personas.length > 0) {
            let defaultId = personas[0].id;
            if (favoritePersonaId && personas.some(p => p.id === favoritePersonaId)) {
                defaultId = favoritePersonaId;
            }
            console.log(`Renderer: Setting initial selection to ${defaultId}`);
            const item = domElements.personaListContainer?.querySelector(`.persona-item[data-persona-id="${defaultId}"]`);
            if (item) {
                item.classList.add('selected');
                if (domElements.personaSelect) domElements.personaSelect.value = defaultId;
            }
            selectedIdentifier = defaultId;
            activePrimaryIdentifier = defaultId;
            document.querySelectorAll('.dropdown-content.active').forEach(activeContent => {
                 activeContent.classList.remove('active');
                 if (activeContent.previousElementSibling) activeContent.previousElementSibling.classList.remove('active');
             });
            loadInitialContent(selectedIdentifier); // Load content for the default selection
            updateFavoriteCheckbox();
        }
        // *** END MODIFIED DEFAULT SELECTION LOGIC ***

    } else if (typeof receivedData === 'string' && receivedData.startsWith('DIAGNOSTIC_MESSAGE')) { console.log(`Renderer: Received diagnostic string, skipping list render.`); } else { console.warn(`Renderer: Received unexpected data type on 'personas-loaded': ${typeof receivedData}`); renderPersonaList([]); } });
    window.electronAPI.on('initial-data-loaded', ({ identifier, status, content, entries, decks }) => { console.log(`Renderer: Received initial-data-loaded for ${identifier}`); if (identifier === selectedIdentifier) { updateStatusBarUI(identifier, status); if (domElements.prePromptText) domElements.prePromptText.value = content?.prePrompt || ''; if (domElements.memoryPromptText) domElements.memoryPromptText.value = content?.memoryPrompt ?? ''; if (domElements.memoryText) domElements.memoryText.value = content?.memory ?? ''; if (domElements.conversationsText) domElements.conversationsText.value = content?.conversations || ''; if (domElements.chatLog) { domElements.chatLog.innerHTML = ''; entries?.forEach(entry => appendMessageToChatLog(entry, false, entry?.content?.startsWith('You:'))); } if (domElements.deckList) { const currentDeck = domElements.deckList.querySelector('.deck-item.selected')?.dataset.deckName; domElements.deckList.innerHTML = ''; Object.keys(decks || {}).forEach(deckName => { const li = document.createElement('li'); li.className = 'deck-item'; li.dataset.deckName = deckName; li.innerHTML = `<img src="./images/placeholder.png" class="slide-icon"><span class="slide-name">${deckName}</span>`; li.addEventListener('click', handleDeckItemClick); domElements.deckList.appendChild(li); }); const currentItem = domElements.deckList.querySelector(`.deck-item[data-deck-name="${currentDeck}"]`); if (currentItem) currentItem.classList.add('selected'); } } else { console.log(`Renderer: Received initial data for ${identifier}, but ${selectedIdentifier} is currently selected. Ignoring.`); } });
    window.electronAPI.on('load-display', ({ displayId, url }) => {
        try {
            console.log(`>>> RENDERER: Received 'load-display' for ${displayId} with URL: ${url}`);
            if (!displayId || !url || !domElements?.displays) { return; }
            const display = domElements.displays[displayId];
            if (!display?.element || !display.iframe || !display.image) { return; }
            const displayElement = display.element;
            const iframeElement = display.iframe;
            clearDisplayUI(displayId);
            displayElement.classList.remove('loading-active');
            displayElement.classList.remove('empty');
            const onIframeLoad = () => {
                console.log(`>>> IFRAME LOAD FINISH for ${displayId} URL: ${iframeElement?.src}`);
                displayElement.classList.remove('loading-active');
                iframeElement.removeEventListener('load', onIframeLoad);
                iframeElement.removeEventListener('error', onIframeError);
            };
            const onIframeError = (error) => {
                console.error(`>>> IFRAME LOAD ERROR for ${displayId} URL: ${url}`, error);
                appendMessageToChatLog({ content: `Error loading content in display ${displayId}.` }, true);
                displayElement.classList.remove('loading-active');
                updateSlideIcon(displayId, 'error', null);
                iframeElement.removeEventListener('error', onIframeError);
                iframeElement.removeEventListener('load', onIframeLoad);
            };
            iframeElement.addEventListener('load', onIframeLoad, { once: true });
            iframeElement.addEventListener('error', onIframeError, { once: true });
            iframeElement.dataset.displayId = displayId;
            iframeElement.src = url;
            iframeElement.classList.add('active');
            applyBounceAnimation([displayElement]);
            updateSlideIcon(displayId, 'iframe', url);
        } catch (error) {
            console.error(`>>> RENDERER CRITICAL ERROR in 'load-display' handler for ${displayId}:`, error);
            appendMessageToChatLog({ content: `Internal Error processing display ${displayId}. See DevTools.` }, true);
            try { domElements?.displays[displayId]?.element?.classList.remove('loading-active'); } catch(e){}
        }
    });
    window.electronAPI.on('config-saved', ({ identifier, file, content }) => { if (identifier === selectedIdentifier) { appendMessageToChatLog({ content: `${file?.split('.')[0]} saved for ${identifier}.` }, true); } });
    window.electronAPI.on('config-populated', ({ identifier, type, content }) => { if (identifier === selectedIdentifier) { appendMessageToChatLog({ content: `${type === 'memory' ? 'Memory' : 'Pre-Prompt'} auto-populated for ${identifier}.` }, true); if (type === 'pre-prompt' && domElements.prePromptText) domElements.prePromptText.value = content; else if (type === 'memory' && domElements.memoryText) domElements.memoryText.value = content; } });
    window.electronAPI.on('memory-summary-updated', ({ identifier, content }) => { if (identifier === selectedIdentifier) { appendMessageToChatLog({ content: 'Memory updated for ' + identifier + '.' }, true); if (domElements.memoryText) domElements.memoryText.value = content; } });
    window.electronAPI.on('status-updated', ({ identifier, status }) => { if (identifier === selectedIdentifier || identifier === activePrimaryIdentifier) { updateStatusBarUI(selectedIdentifier || activePrimaryIdentifier, status); } });
    window.electronAPI.on('entries-loaded', (entries) => { console.log('Renderer: Received updated entries for current persona'); if (domElements.chatLog) { domElements.chatLog.innerHTML = ''; entries?.forEach(entry => appendMessageToChatLog(entry, false, entry?.content?.startsWith('You:'))); } });
    window.electronAPI.on('append-chat-log', (message, isStatus = true, isUser = false) => { appendMessageToChatLog({ content: message }, isStatus, isUser); });
    window.electronAPI.on('start-loading', ({ displayId }) => { const d=domElements.displays[displayId]; if(d?.element){d.element.classList.add('loading-active'); if(d.image)d.image.classList.remove('active'); if(d.iframe)d.iframe.classList.remove('active');} });
    window.electronAPI.on('stop-loading', ({ displayId }) => { const d=domElements.displays[displayId]; if(d?.element)d.element.classList.remove('loading-active'); });
    window.electronAPI.on('start-thinking', () => { if (latestAIMessageElement) latestAIMessageElement.classList.add('thinking-active'); requestAnimationFrame(() => { if (domElements.chatLog) domElements.chatLog.scrollTop = domElements.chatLog.scrollHeight; }); });
    window.electronAPI.on('stop-thinking', () => { if (latestAIMessageElement) latestAIMessageElement.classList.remove('thinking-active'); });
    window.electronAPI.on('load-image', ({ displayId, imagePath }) => {
        console.log(`Renderer: Received 'load-image' for ${displayId}`);
        const display = domElements.displays[displayId];
        if (display?.element && display.image && display.iframe) {
            clearDisplayUI(displayId);
            display.element.classList.remove('loading-active');
            display.element.classList.remove('empty');
            const fileUrl = `file://${imagePath}`;
            display.image.src = fileUrl;
            display.image.dataset.path = imagePath;
            display.image.classList.add('active');
            applyBounceAnimation([display.element]);
            display.image.onload = () => {
                console.log(`   - Image loaded successfully for ${displayId}`);
                updateSlideIcon(displayId, 'image', fileUrl);
            };
            display.image.onerror = () => {
                console.error(`Renderer: Failed to load image at ${fileUrl}`);
                appendMessageToChatLog({ content: `Error loading image in display ${displayId}.` }, true);
                updateSlideIcon(displayId, 'error', null);
            };
        } else {
            console.error(`Renderer Error: Invalid display object for ${displayId} in 'load-image' handler.`);
        }
    });
    window.electronAPI.on('clear-display', ({ displayId }) => { console.log(`Renderer: Received 'clear-display' for ${displayId}`); delete activeBrowserDisplays[displayId]; clearDisplayUI(displayId); });
    window.electronAPI.on('decks-updated', (updatedDecks) => { console.log('Renderer: Received updated decks'); if (!domElements.deckList) return; const currentSelection = domElements.deckList.querySelector('.deck-item.selected')?.dataset.deckName; domElements.deckList.innerHTML = ''; Object.keys(updatedDecks || {}).forEach(deckName => { const li = document.createElement('li'); li.className = 'deck-item'; li.dataset.deckName = deckName; li.innerHTML = `<img src="./images/placeholder.png" class="slide-icon"><span class="slide-name">${deckName}</span><button class="deck-save-btn" aria-label="Save Deck"></button>`; li.addEventListener('click', handleDeckItemClick); domElements.deckList.appendChild(li); }); const currentItem = domElements.deckList.querySelector(`.deck-item[data-deck-name="${currentSelection}"]`); if (currentItem) currentItem.classList.add('selected'); });
    window.electronAPI.on('load-deck-displays', (deckDisplays) => { console.log('Renderer: Loading deck displays:', deckDisplays); Object.keys(domElements.displays).forEach(displayId => { const content = deckDisplays?.[displayId]; if (content) { if (content.type === 'image' && content.src) { window.electronAPI.send('load-image-path', { displayId, imagePath: content.src.replace('file://', '') }); } else if ((content.type === 'iframe' || content.type === 'webview') && content.src) { window.electronAPI.send('load-display-url', { displayId, url: content.src }); } else { clearDisplayUI(displayId); } } else { clearDisplayUI(displayId); } }); const selectedDeck = domElements.deckList?.querySelector('.deck-item.selected'); if (selectedDeck) appendMessageToChatLog({ content: `Deck "${selectedDeck.dataset.deckName}" loaded.` }, true); });
    window.electronAPI.on('main-process-error', (errorMessage) => { console.error('Renderer: Received error from main process:', errorMessage); appendMessageToChatLog({ content: `Error: ${errorMessage}` }, true); });

    ipcListenersAttached = true;
    console.log("Renderer: IPC listeners attached.");
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("--- Renderer: DOMContentLoaded event fired ---");
    cacheDomElements();
    setupTextareaAutoResize();
    const overlay = document.getElementById('login-overlay');
    const loginForm = document.getElementById('login-form');
    if (overlay && loginForm) {
        overlay.classList.add('active');
        document.body.classList.add('pre-login');
        const passInput = document.getElementById('login-pass');
        if (passInput) {
            passInput.focus();
            passInput.select();
        }
        const animatePanelReset = (callback) => {
            const left = domElements.leftSidebar;
            const right = domElements.rightChat;
            const status = domElements.statusBar;
            const info = domElements.infoPanels;
            const program = domElements.programMaker;

            [left, right, status, info, program].forEach(el => el.classList.add('vault-open', 'center-glow'));

            const startLeft = left.getBoundingClientRect().width;
            const startRight = right.getBoundingClientRect().width;
            const startStatus = status.getBoundingClientRect().height;
            const startInfo = info.getBoundingClientRect().height;
            const startProgram = program.getBoundingClientRect().height;

            // Lock initial dimensions before layout changes when the logging-in
            // class is applied. This prevents panels from jumping to their final
            // sizes prior to the animation starting.
            left.style.width = `${startLeft}px`;
            right.style.width = `${startRight}px`;
            status.style.height = `${startStatus}px`;
            info.style.height = `${startInfo}px`;
            program.style.height = `${startProgram}px`;

            document.body.classList.add('logging-in');

            const revealedChildren = [];
            info.style.height = 'auto';
            Array.from(info.children).forEach(child => {
                if (getComputedStyle(child).display === 'none') {
                    child.style.display = 'block';
                    child.style.visibility = 'hidden';
                    revealedChildren.push(child);
                }
            });
            const endInfo = info.getBoundingClientRect().height;
            revealedChildren.forEach(child => {
                child.style.display = '';
                child.style.visibility = '';
            });
            info.style.height = `${startInfo}px`;

            const container = domElements.appContainer;
            const containerWidth = container.getBoundingClientRect().width;
            const endLeft = 260;
            const endRight = 340;
            const endStatus = 100;
            const endProgram = parseFloat(getComputedStyle(program).maxHeight) || 40;

            const durationSide = 300;
            const durationTB = 300;

            let completed = 0;
            const finish = () => {
                if (++completed < 2) return;
                left.style.width = '';
                right.style.width = '';
                container.style.gridTemplateColumns = '';
                status.style.height = '';
                info.style.height = '';
                program.style.height = '';
                [left, right, status, info, program].forEach(el => el.classList.remove('vault-open', 'center-glow'));
                applyBounceAnimation([
                    domElements.personaListContainer,
                    domElements.deckList,
                    domElements.chatLog
                ], callback);
            };

            const animateTopBottom = () => {
                const startTimeTB = performance.now();
                const stepTB = (now) => {
                    const progress = Math.min((now - startTimeTB) / durationTB, 1);
                    const statusHeight = startStatus + (endStatus - startStatus) * progress;
                    const infoHeight = startInfo + (endInfo - startInfo) * progress;
                    const programHeight = startProgram + (endProgram - startProgram) * progress;
                    status.style.height = `${statusHeight}px`;
                    info.style.height = `${infoHeight}px`;
                    program.style.height = `${programHeight}px`;
                    if (progress < 1) {
                        requestAnimationFrame(stepTB);
                    } else {
                        finish();
                    }
                };
                requestAnimationFrame(stepTB);
            };

            const startTime = performance.now();
            const stepSide = (now) => {
                const progress = Math.min((now - startTime) / durationSide, 1);
                const leftWidth = startLeft + (endLeft - startLeft) * progress;
                const rightWidth = startRight + (endRight - startRight) * progress;
                left.style.width = `${leftWidth}px`;
                right.style.width = `${rightWidth}px`;
                const middleWidth = containerWidth - leftWidth - rightWidth;
                container.style.gridTemplateColumns = `${leftWidth}px ${middleWidth}px ${rightWidth}px`;

                if (progress < 1) {
                    requestAnimationFrame(stepSide);
                } else {
                    finish();
                }
            };

            animateTopBottom();
            requestAnimationFrame(stepSide);
        };

        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const pass = document.getElementById('login-pass').value;
            if (pass === 'password') {
                animatePanelReset(() => {
                    document.body.classList.remove('pre-login');
                    document.body.classList.remove('logging-in');
                    overlay.classList.add('hidden');
                    applyBounceAnimation([
                        domElements.displaysContainer,
                        domElements.personaListContainer,
                        domElements.deckList,
                        domElements.chatLog
                    ], () => {
                        // Recalculate bounds for any active BrowserViews now that
                        // the layout has expanded after login. Run twice to ensure
                        // measurements occur after the DOM has fully settled.
                        updateAllBrowserBounds();
                        setTimeout(updateAllBrowserBounds, 50);
                    });
                    if (domElements.userInput) {
                        domElements.userInput.focus();
                        domElements.userInput.select();
                    }
                });
            }
        });
    }
    createInitialDeckIcons();
    createProgramIcons();
    setupProgramIconListeners();
    setupProgramMaker();
    setupDisplayVisibilityObserver();
    const mainIcon = document.getElementById('deck-main');
    if (mainIcon) {
        mainIcon.style.backgroundColor = deckColors[0];
        mainIcon.addEventListener('click', handleDeckMainClick);
    }
    if (!eventListenersAttached) setupEventListeners();
    if (!ipcListenersAttached) setupIpcListeners();
    window.addEventListener('resize', updateAllBrowserBounds);
    domElements.displaysContainer?.addEventListener('scroll', startScrollSync);
    domElements.collapseArrow?.addEventListener('click', updateAllBrowserBounds);
    domElements.chatCollapseArrow?.addEventListener('click', updateAllBrowserBounds);
    domElements.statusCollapseArrow?.addEventListener('click', updateAllBrowserBounds);
    domElements.appContainer?.addEventListener('transitionend', (e) => {
        if (e.propertyName === 'grid-template-columns') updateAllBrowserBounds();
    });
    domElements.leftSidebar?.addEventListener('transitionend', (e) => {
        if (e.propertyName === 'width') updateAllBrowserBounds();
    });
    domElements.rightChat?.addEventListener('transitionend', (e) => {
        if (e.propertyName === 'width') updateAllBrowserBounds();
    });
    domElements.statusBar?.addEventListener('transitionend', (e) => {
        if (e.propertyName === 'height') updateAllBrowserBounds();
    });
    selectedIdentifier = null;
    activePrimaryIdentifier = null;
    updateStatusBarUI(null, null); // Initial call with null
    updateAllBrowserBounds();
    const firstSlide = document.querySelector('.slide-tab');
    if (firstSlide) firstSlide.classList.add('selected');
    console.log("--- Renderer Initialization Complete ---");
});

console.log("--- Renderer Script Loaded ---");