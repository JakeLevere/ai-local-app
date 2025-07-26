export const domElements = {};

export function cacheDomElements() {
    Object.assign(domElements, {
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
    });
}

export function autoResizeTextarea(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

export function setupTextareaAutoResize() {
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
