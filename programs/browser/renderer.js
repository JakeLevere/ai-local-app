// renderer.js - Renderer Process

// --- DOM ELEMENTS ---
const tabsContainer = document.getElementById('tabs-container');
const addTabBtn = document.getElementById('add-tab-btn');
const addressBar = document.getElementById('address-bar');
const backBtn = document.getElementById('back-btn');
const forwardBtn = document.getElementById('forward-btn');
const reloadBtn = document.getElementById('reload-btn');
const webview = document.getElementById('webview');

// Detect if we're running embedded (no electron API available)
const isEmbedded = !window.electronAPI;

// --- STATE MANAGEMENT ---
let tabs = {}; // Store tab data, mapping tabId to its info
let activeTabId = null;

// --- CORE FUNCTIONS ---

function createNewTab() {
    const tabId = `tab-${Date.now()}`;
    const newTab = {
        id: tabId,
        title: 'New Tab',
        url: '',
        el: null,
    };

    const tabEl = document.createElement('div');
    tabEl.id = tabId;
    tabEl.className = 'tab flex items-center justify-between p-2 text-gray-300 cursor-pointer border-r border-gray-900/50 max-w-xs';
    tabEl.innerHTML = `
        <span class="truncate text-sm">${newTab.title}</span>
        <button class="tab-close ml-3 p-1 rounded-full text-gray-400">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
    `;
    newTab.el = tabEl;
    tabs[tabId] = newTab;

    tabEl.addEventListener('click', (e) => {
        if (!e.target.closest('.tab-close')) {
            switchToTab(tabId);
        }
    });
    tabEl.querySelector('.tab-close').addEventListener('click', () => closeTab(tabId));

    tabsContainer.insertBefore(tabEl, addTabBtn);
    
    // Tell the main process to create the corresponding BrowserView
    const initialUrl = 'https://www.google.com';
    window.electronAPI.newTab(tabId, initialUrl);
    
    switchToTab(tabId);
}

function switchToTab(tabId) {
    if (!tabs[tabId]) return;

    activeTabId = tabId;
    // Update active class on tab elements
    for (const id in tabs) {
        tabs[id].el.classList.toggle('active', id === tabId);
    }
    
    // Update address bar
    addressBar.value = tabs[tabId].url;

    // Tell the main process to show the correct BrowserView
    window.electronAPI.switchTab(tabId);
}

function closeTab(tabId) {
    if (!tabs[tabId]) return;

    // Remove tab from DOM
    tabs[tabId].el.remove();
    
    // Tell the main process to destroy the BrowserView
    window.electronAPI.closeTab(tabId);

    // Remove from our state
    delete tabs[tabId];

    // If we closed the active tab, switch to another one
    if (activeTabId === tabId) {
        const remainingTabIds = Object.keys(tabs);
        if (remainingTabIds.length > 0) {
            switchToTab(remainingTabIds[0]);
        } else {
            createNewTab();
        }
    }
}

function navigate() {
    if (isEmbedded) {
        let url = addressBar.value.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            if (url.includes('.') && !url.includes(' ')) {
                url = 'https://' + url;
            } else {
                url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
            }
        }
        if (webview) {
            webview.src = url;
            addressBar.value = url;
        }
    } else {
        if (!activeTabId) return;
        let url = addressBar.value.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            if (url.includes('.') && !url.includes(' ')) {
                url = 'https://' + url;
            } else {
                url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
            }
        }
        window.electronAPI.navigate(activeTabId, url);
    }
}

// --- EVENT LISTENERS from UI ---
if (!isEmbedded) {
    addTabBtn.addEventListener('click', createNewTab);
} else {
    // Hide tab UI when embedded
    tabsContainer.style.display = 'none';
    addTabBtn.style.display = 'none';
}
addressBar.addEventListener('keyup', (e) => e.key === 'Enter' && navigate());
reloadBtn.addEventListener('click', () => {
    if (isEmbedded && webview) {
        webview.contentWindow.location.reload();
    } else {
        window.electronAPI.reload(activeTabId);
    }
});
backBtn.addEventListener('click', () => {
    if (isEmbedded && webview) {
        webview.contentWindow.history.back();
    } else {
        window.electronAPI.goBack(activeTabId);
    }
});
forwardBtn.addEventListener('click', () => {
    if (isEmbedded && webview) {
        webview.contentWindow.history.forward();
    } else {
        window.electronAPI.goForward(activeTabId);
    }
});

// --- LISTENERS from Main Process (via preload) ---
if (!isEmbedded) {
    window.electronAPI.onURLUpdated((tabId, url) => {
        if (tabs[tabId]) {
            tabs[tabId].url = url;
            if (tabId === activeTabId) {
                addressBar.value = url;
            }
        }
    });

    window.electronAPI.onTitleUpdated((tabId, title) => {
        if (tabs[tabId]) {
            tabs[tabId].title = title;
            tabs[tabId].el.querySelector('span').textContent = title;
        }
    });
}

// --- INITIALIZATION ---
if (isEmbedded) {
    if (webview) {
        webview.src = 'https://www.google.com';
    }
} else {
    createNewTab();
}
