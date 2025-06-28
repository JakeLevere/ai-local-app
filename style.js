const { app, BrowserWindow, ipcMain, clipboard } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { OpenAI } = require('openai');
const sharp = require('sharp');
const fetch = require('node-fetch');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here' // Replace with your actual key or env var setup
});

const vaultPath = path.join(app.getPath('documents'), 'ObsidianVault');
fs.mkdir(vaultPath, { recursive: true }).catch(err => console.error('Error creating vault directory:', err));

const decksPath = path.join(app.getPath('userData'), 'Decks');
fs.mkdir(decksPath, { recursive: true }).catch(err => console.error('Error creating decks directory:', err));

let mainWindow;
let selectedAI = 'Memo';
let decks = {};

const imageBasePath = path.join(__dirname, 'images').replace(/\\/g, '/');

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Personal AI Dashboard</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      :root { --baby-blue: #87CEFA; --baby-blue-darker: #6495ED; --bg-very-dark: #0e0e10; --bg-dark-grey: #18181b; --bg-sidebar: #1f1f23; --text-off-white: #efeff1; --text-grey: #adadb8; --text-dark-grey: #888; --border-color: #444; --input-bg: #3a3a3d; --user-green: #00FF00; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: var(--bg-very-dark); color: var(--text-off-white); height: 100vh; overflow: hidden; }
      .app-container { display: grid; grid-template-columns: minmax(50px, 260px) 1fr minmax(50px, 340px); grid-template-rows: 1fr; height: 100vh; background-color: var(--bg-dark-grey); gap: 1px; background-color: var(--border-color); transition: grid-template-columns 0.3s ease-in-out; }
      .app-container.collapsed { grid-template-columns: 50px 1fr minmax(50px, 340px); }
      .app-container.chat-collapsed { grid-template-columns: minmax(50px, 260px) 1fr 50px; }
      .app-container.collapsed.chat-collapsed { grid-template-columns: 50px 1fr 50px; }
      #left-sidebar { 
        background-color: var(--bg-sidebar); 
        padding: 10px; 
        overflow-y: hidden; 
        width: 260px; 
        transition: width 0.3s ease-in-out; 
        position: relative; 
        display: flex; 
        flex-direction: column; 
      }
      #left-sidebar.collapsed { width: 50px; padding: 10px 0px 10px 5px; }
      #left-sidebar.collapsed .persona-name, #left-sidebar.collapsed h2, #left-sidebar.collapsed #create-persona, #left-sidebar.collapsed #deck-controls, #left-sidebar.collapsed #deck-dropdown, #left-sidebar.collapsed #create-slide, #left-sidebar.collapsed .slide-name { display: none; }
      #left-sidebar.collapsed .persona-item, #left-sidebar.collapsed .slide-item { padding: 6px 5px; margin-right: 0; }
      #collapse-arrow { position: absolute; top: 10px; right: 10px; width: 20px; height: 20px; cursor: pointer; fill: var(--text-off-white); transition: transform 0.3s ease-in-out; }
      #left-sidebar.collapsed #collapse-arrow { transform: rotate(180deg); }
      #persona-section { 
        flex: 0 0 40%; 
        display: flex; 
        flex-direction: column; 
        overflow-y: auto; 
      }
      #slide-section { 
        flex: 0 0 60%; 
        display: flex; 
        flex-direction: column; 
        overflow-y: auto; 
      }
      #create-persona, #create-deck, #create-slide { 
        width: 100%; 
        padding: 5px 10px; 
        background-color: var(--baby-blue); 
        color: #111; 
        border: none; 
        border-radius: 4px; 
        cursor: pointer; 
        margin-bottom: 5px; 
        font-size: 0.9em; 
        text-align: center; 
      }
      #create-persona:hover, #create-deck:hover, #create-slide:hover { background-color: var(--baby-blue-darker); }
      #deck-controls { 
        margin-bottom: 10px; 
      }
      #deck-dropdown { 
        width: 100%; 
        padding: 5px; 
        background-color: var(--input-bg); 
        color: var(--text-off-white); 
        border: 1px solid #555; 
        border-radius: 4px; 
        margin-bottom: 5px; 
        font-size: 0.9em; 
      }
      #slide-section hr { 
        border: 0; 
        height: 1px; 
        background: var(--border-color); 
        margin: 10px 0; 
      }
      #main-content { background-color: var(--bg-very-dark); padding: 0; position: relative; overflow: hidden; }
      #central-display { position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; }

      #persona-status-bar {
        width: 100%;
        background-color: var(--bg-sidebar);
        border-bottom: 1px solid var(--border-color);
        position: relative;
        z-index: 10;
        transition: height 0.3s ease-in-out, padding 0.3s ease-in-out, border-color 0.3s ease-in-out;
        height: 100px;
        padding: 10px;
        overflow: hidden;
        flex-shrink: 0;
      }

      #persona-status-bar.collapsed {
        height: 0;
        padding-top: 0;
        padding-bottom: 0;
        border-color: transparent;
        overflow: visible;
      }

      #status-header {
        display: flex;
        align-items: center;
        height: 80px;
        position: relative;
        overflow: hidden;
      }

      #persona-image {
        width: 80px;
        height: 80px;
        object-fit: cover;
        border-radius: 8px;
        border: 2px solid rgba(135, 206, 250, 0.6);
        background-color: #333;
        box-shadow: 0 0 10px rgba(0,0,0,0.7);
        margin-right: 15px;
        flex-shrink: 0;
        position: relative;
        top: 0;
        left: 0;
        opacity: 1;
        z-index: 11;
        transition: top 0.3s ease-in-out, left 0.3s ease-in-out, opacity 0.2s ease-in-out, z-index 0s 0.3s;
      }

      #persona-status-bar.collapsed #persona-image {
        position: absolute;
        top: 10px;
        left: 10px;
        opacity: 1;
        z-index: 15;
        transition: top 0.3s ease-in-out, left 0.3s ease-in-out, opacity 0.2s ease-in-out, z-index 0s 0s;
      }

      #status-text-content {
          display: flex;
          flex-direction: column;
          justify-content: center;
          overflow: hidden;
          flex-grow: 1;
          opacity: 1;
          transition: opacity 0.2s ease-in-out 0.1s;
      }

      #persona-status-bar.collapsed #status-text-content {
           opacity: 0;
           pointer-events: none;
           transition: opacity 0.1s ease-in-out;
       }

      #status-title {
        font-size: 1.2em;
        font-weight: bold;
        text-decoration: underline;
        color: var(--text-off-white);
        white-space: nowrap;
      }

      #status-info {
        font-size: 0.9em;
        color: var(--text-grey);
        margin-top: 5px;
        white-space: nowrap;
      }

      #status-info span {
        margin-right: 15px;
      }

      #status-collapse-arrow {
        position: absolute;
        bottom: 5px;
        right: 10px;
        width: 20px;
        height: 20px;
        cursor: pointer;
        fill: var(--text-off-white);
        z-index: 12;
        transition: transform 0.3s ease-in-out, bottom 0.3s ease-in-out;
      }

      #persona-status-bar.collapsed #status-collapse-arrow {
        transform: rotate(180deg);
        bottom: -25px;
      }

      #displays-container {
        flex-grow: 1;
        overflow-y: auto;
        padding: 10px;
        position: relative;
        z-index: 5;
        transition: padding-top 0.3s ease-in-out;
      }

      #persona-status-bar.collapsed + #displays-container {
        padding-top: 100px;
      }

      .display-wrapper {
        width: 100%;
        position: relative;
        aspect-ratio: 16 / 9;
        margin-bottom: 10px;
      }

      .display {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: #222;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        overflow: hidden;
      }

      .display img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: none;
      }

      .display webview {
        width: 100%;
        height: 100%;
        border: none;
        display: none;
      }

      .display .loading {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 40px;
        height: 40px;
        border: 4px solid var(--text-grey);
        border-top: 4px solid var(--baby-blue);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        transform: translate(-50%, -50%);
        display: none;
      }

      .display.loading-active .loading {
        display: block;
      }

      .display img.active, .display webview.active {
        display: block;
      }

      .display-number {
        position: absolute;
        top: 5px;
        left: 5px;
        background-color: rgba(0, 0, 0, 0.7);
        color: var(--text-off-white);
        padding: 2px 5px;
        border-radius: 3px;
        font-size: 0.8em;
        z-index: 10;
      }

      .clear-button {
        position: absolute;
        top: 5px;
        right: 5px;
        width: 16px;
        height: 16px;
        background-color: red;
        color: white;
        text-align: center;
        line-height: 16px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 0.8em;
        z-index: 10;
      }

      .clear-button:hover {
        background-color: darkred;
      }

      @keyframes spin {
        0% { transform: translate(-50%, -50%) rotate(0deg); }
        100% { transform: translate(-50%, -50%) rotate(360deg); }
      }

      #right-chat { 
        background-color: var(--bg-dark-grey); 
        padding: 0; 
        height: 100vh; 
        border-left: 1px solid var(--border-color); 
        transition: width 0.3s ease-in-out; 
        width: 340px; 
        position: relative; 
        display: flex; 
        flex-direction: column; 
      }
      #right-chat.collapsed { width: 50px; padding: 0; }
      #right-chat.collapsed #chat-log-container h2, #right-chat.collapsed #chat-log-container #chat-log, #right-chat.collapsed #chat-input-area { display: none; }
      #right-chat.collapsed #chat-collapse-arrow { transform: rotate(180deg); }
      h2 { font-size: 0.85em; margin-bottom: 10px; color: var(--text-grey); padding: 5px 0px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
      #left-sidebar h2 { padding-left: 0; border: none; color: var(--text-off-white); }
      .persona-list, .slide-list { list-style: none; padding: 0; margin: 0; }
      .persona-item, .slide-item { display: flex; align-items: center; padding: 6px 10px; margin-right: 10px; margin-bottom: 2px; cursor: pointer; border-radius: 4px; transition: background-color 0.15s ease; }
      .persona-item:hover, .slide-item:hover { background-color: rgba(135, 206, 250, 0.1); }
      .persona-item.selected, .slide-item.selected { background-color: rgba(135, 206, 250, 0.2); }
      .persona-icon, .slide-icon { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; margin-right: 8px; border: 1px solid #555; flex-shrink: 0; background-color: #444; }
      .persona-name, .slide-name { flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.9em; color: var(--text-off-white); }
      #info-panels { position: absolute; bottom: 0; left: 0; right: 0; background-color: var(--bg-dark-grey); z-index: 20; border-top: 1px solid var(--border-color); }
      #config-header { background-color: var(--bg-sidebar); padding: 10px; cursor: pointer; border: 1px solid var(--border-color); border-radius: 4px 4px 0 0; font-size: 0.9em; color: var(--text-off-white); text-align: center; }
      #config-header:hover { background-color: rgba(135, 206, 250, 0.1); }
      #config-content { max-height: 0; overflow-y: auto; padding: 0 15px; transition: max-height 0.3s ease-in-out, padding 0.1s ease-in-out; }
      #info-panels.active #config-content { max-height: 400px; padding: 15px; }
      .dropdown { margin-bottom: 5px; }
      .dropdown-header { background-color: var(--bg-sidebar); padding: 10px; cursor: pointer; border: 1px solid var(--border-color); border-radius: 4px; font-size: 0.9em; color: var(--text-off-white); }
      .dropdown-header:hover { background-color: rgba(135, 206, 250, 0.1); }
      .dropdown-content { max-height: 0; overflow: hidden; padding: 0 10px; background-color: var(--input-bg); border: 1px solid var(--border-color); border-top: none; border-radius: 0 0 4px 4px; transition: max-height 0.3s ease-in-out, padding 0.1s ease-in-out; }
      .dropdown-content.active { max-height: 200px; padding: 10px; overflow-y: auto; }
      textarea { width: 100%; min-height: 100px; background-color: var(--input-bg); color: var(--text-off-white); border: 1px solid #555; padding: 8px; font-size: 0.9em; resize: vertical; }
      .dropdown-buttons { margin-top: 10px; }
      .dropdown-buttons button { padding: 8px 15px; border: none; background-color: var(--baby-blue); color: #111; border-radius: 4px; cursor: pointer; margin-right: 10px; font-size: 0.9em; font-weight: 600; }
      .dropdown-buttons button:hover { background-color: var(--baby-blue-darker); }
      #chat-log-container { 
        flex-grow: 1; 
        display: flex; 
        flex-dire

ction: column; 
        overflow: hidden; 
        padding: 10px 15px 0 15px; 
        position: relative; 
      }
      #chat-log-container h2 { margin-bottom: 10px; flex-shrink: 0; border: none; padding-left: 0; padding-bottom: 5px; border-bottom: 1px solid var(--border-color); }
      #chat-log { 
        flex-grow: 1; 
        overflow-y: auto; 
        padding-right: 5px; 
        margin-bottom: 10px; 
        line-height: 1.5; 
        font-size: 0.9em; 
        color: #ccc; 
        display: flex; 
        flex-direction: column; 
        justify-content: flex-end; 
      }
      #chat-log p { margin-bottom: 8px; padding-left: 5px; word-wrap: break-word; }
      #chat-log p strong { margin-right: 5px; font-weight: 600; color: var(--text-dark-grey); position: relative; }
      #chat-log p.ai-message strong { color: var(--baby-blue); }
      #chat-log p.user-message strong { color: var(--user-green); }
      #chat-log p.ai-message strong .thinking-bar {
        display: none;
        position: absolute;
        bottom: -2px;
        left: 0;
        width: 0;
        height: 2px;
        background-color: var(--baby-blue);
        animation: thinking 2s linear infinite;
      }
      #chat-log p.ai-message.thinking-active strong .thinking-bar { display: inline-block; }
      @keyframes thinking {
        0% { width: 0; }
        50% { width: 100%; }
        100% { width: 0; }
      }
      #chat-input-area { 
        display: flex; 
        padding: 15px; 
        border-top: 1px solid var(--border-color); 
        background-color: var(--bg-sidebar); 
        flex-shrink: 0; 
      }
      #chat-input-area input[type="text"] { flex-grow: 1; padding: 8px 10px; border: 1px solid #555; background-color: var(--input-bg); color: var(--text-off-white); border-radius: 4px; margin-right: 10px; font-size: 0.9em; }
      #chat-input-area input[type="text"]::placeholder { color: var(--text-dark-grey); }
      #chat-input-area button { padding: 8px 15px; border: none; background-color: var(--baby-blue); color: #111; border-radius: 4px; cursor: pointer; transition: background-color 0.2s ease; font-size: 0.9em; font-weight: 600; }
      #chat-input-area button:hover { background-color: var(--baby-blue-darker); }
      #chat-collapse-arrow { position: absolute; top: 10px; right: 10px; width: 20px; height: 20px; cursor: pointer; fill: var(--text-off-white); transition: transform 0.3s ease-in-out; z-index: 10; }
      ::-webkit-scrollbar { width: 8px; } ::-webkit-scrollbar-track { background: var(--bg-sidebar); } ::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; } ::-webkit-scrollbar-thumb:hover { background: #666; }
    </style>
</head>
<body>
    <div class="app-container">
      <aside id="left-sidebar">
        <svg id="collapse-arrow" viewBox="0 0 24 24">
          <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div id="persona-section">
          <button id="create-persona">Create New Persona</button>
          <h2>AI Personas</h2>
          <ul class="persona-list">
            <li class="persona-item selected" data-ai-name="Memo" data-img-base="images/Memo" data-description="Solves technical problems.">
              <img src="file://${imageBasePath}/Memo.png" onerror="this.src='file://${imageBasePath}/placeholder.png'" alt="Memo Icon" class="persona-icon">
              <span class="persona-name">Memo</span>
            </li>
            <li class="persona-item" data-ai-name="Mental Health AI" data-img-base="images/Mental" data-description="Provides emotional support.">
              <img src="file://${imageBasePath}/Mental.png" onerror="this.src='file://${imageBasePath}/placeholder.png'" alt="Mental Health AI Icon" class="persona-icon">
              <span class="persona-name">Mental Health AI</span>
            </li>
            <li class="persona-item" data-ai-name="Physical Health AI" data-img-base="images/Physical" data-description="Offers fitness advice.">
              <img src="file://${imageBasePath}/Physical.png" onerror="this.src='file://${imageBasePath}/placeholder.png'" alt="Physical Health AI Icon" class="persona-icon">
              <span class="persona-name">Physical Health AI</span>
            </li>
            <li class="persona-item" data-ai-name="Entertainment AI" data-img-base="images/Entertainer" data-description="Generates fun content.">
              <img src="file://${imageBasePath}/Entertainer.png" onerror="this.src='file://${imageBasePath}/placeholder.png'" alt="Entertainment AI Icon" class="persona-icon">
              <span class="persona-name">Entertainment AI</span>
            </li>
          </ul>
        </div>
        <div id="slide-section">
          <div id="deck-controls">
            <button id="create-deck">Create New Deck</button>
            <select id="deck-dropdown">
              <option value="">Select a Deck</option>
            </select>
          </div>
          <hr>
          <h2>Slides</h2>
          <button id="create-slide">Create New Slide</button>
          <ul class="slide-list">
            <li class="slide-item" data-display-id="display1">
              <img src="file://${imageBasePath}/placeholder.png" alt="Slide 1" class="slide-icon">
              <span class="slide-name">Empty</span>
            </li>
            <li class="slide-item" data-display-id="display2">
              <img src="file://${imageBasePath}/placeholder.png" alt="Slide 2" class="slide-icon">
              <span class="slide-name">Empty</span>
            </li>
            <li class="slide-item" data-display-id="display3">
              <img src="file://${imageBasePath}/placeholder.png" alt="Slide 3" class="slide-icon">
              <span class="slide-name">Empty</span>
            </li>
          </ul>
        </div>
      </aside>

      <main id="main-content">
        <div id="central-display">
          <div id="persona-status-bar">
             <div id="status-header">
                <img id="persona-image" src="file://${imageBasePath}/Memo.png" alt="Current AI Persona">
                <div id="status-text-content">
                  <div id="status-title">Memo</div>
                  <div id="status-info">
                    <span id="conv-count">Conversations: 0</span>
                    <span id="last-interaction">Last Interaction: N/A</span>
                  </div>
                </div>
             </div>
             <svg id="status-collapse-arrow" viewBox="0 0 24 24">
               <path d="M6 15L12 9L18 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
             </svg>
          </div>
          <div id="displays-container">
            <div class="display-wrapper">
              <div class="display" id="display1">
                <span class="display-number">1</span>
                <span class="clear-button" onclick="clearDisplay('display1')">X</span>
                <webview id="webview1" allowpopups></webview>
                <img id="image1" alt="Generated Image">
                <div class="loading"></div>
              </div>
            </div>
            <div class="display-wrapper">
              <div class="display" id="display2">
                <span class="display-number">2</span>
                <span class="clear-button" onclick="clearDisplay('display2')">X</span>
                <webview id="webview2" allowpopups></webview>
                <img id="image2" alt="Generated Image">
                <div class="loading"></div>
              </div>
            </div>
            <div class="display-wrapper">
              <div class="display" id="display3">
                <span class="display-number">3</span>
                <span class="clear-button" onclick="clearDisplay('display3')">X</span>
                <webview id="webview3" allowpopups></webview>
                <img id="image3" alt="Generated Image">
                <div class="loading"></div>
              </div>
            </div>
          </div>
        </div>
        <div id="info-panels">
          <div id="config-header">Memo Configuration</div>
          <div id="config-content">
            <div class="dropdown">
              <div class="dropdown-header" id="pre-prompt-header">Pre Prompt</div>
              <div class="dropdown-content" id="pre-prompt-content">
                <textarea id="pre-prompt-text"></textarea>
                <div class="dropdown-buttons">
                  <button id="save-pre-prompt">Save</button>
                  <button id="auto-pre-prompt">Auto-Populate</button>
                </div>
              </div>
            </div>
            <div class="dropdown">
              <div class="dropdown-header" id="memory-prompt-header">Memory Prompt</div>
              <div class="dropdown-content" id="memory-prompt-content">
                <textarea id="memory-prompt-text"></textarea>
                <div class="dropdown-buttons">
                  <button id="save-memory-prompt">Save</button>
                </div>
              </div>
            </div>
            <div class="dropdown">
              <div class="dropdown-header" id="memory-header">Memory</div>
              <div class="dropdown-content" id="memory-content">
                <textarea id="memory-text"></textarea>
                <div class="dropdown-buttons">
                  <button id="save-memory">Save</button>
                  <button id="update-memory">Update</button>
                </div>
              </div>
            </div>
            <div class="dropdown">
              <div class="dropdown-header" id="conversations-header">Stored Conversations</div>
              <div class="dropdown-content" id="conversations-content">
                <textarea id="conversations-text"></textarea>
                <div class="dropdown-buttons">
                  <button id="save-conversations">Save</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <aside id="right-chat">
        <div id="chat-log-container">
          <svg id="chat-collapse-arrow" viewBox="0 0 24 24">
            <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <h2>Chat</h2>
          <div id="chat-log"></div>
        </div>
        <div id="chat-input-area">
          <input type="text" id="user_input" placeholder="Send a message...">
          <button type="button" id="send_button">Chat</button>
        </div>
      </aside>
    </div>

    <script>
      const { ipcRenderer, Menu } = require('electron');
      const path = require('path');

      let selectedAI = 'Memo';
      let latestAIMessage = null;

      document.addEventListener('DOMContentLoaded', () => {
        const configHeader = document.getElementById('config-header');
        const infoPanels = document.getElementById('info-panels');
        const leftSidebar = document.getElementById('left-sidebar');
        const collapseArrow = document.getElementById('collapse-arrow');
        const appContainer = document.querySelector('.app-container');
        const statusBar = document.getElementById('persona-status-bar');
        const statusCollapseArrow = document.getElementById('status-collapse-arrow');
        const displaysContainer = document.getElementById('displays-container');
        const sendButton = document.getElementById('send_button');
        const userInput = document.getElementById('user_input');
        const chatLog = document.getElementById('chat-log');
        const personaImage = document.getElementById('persona-image');
        const statusTitle = document.getElementById('status-title');
        const configPanelHeader = document.getElementById('config-header');
        const convCountSpan = document.getElementById('conv-count');
        const lastInteractionSpan = document.getElementById('last-interaction');
        const prePromptText = document.getElementById('pre-prompt-text');
        const memoryPromptText = document.getElementById('memory-prompt-text');
        const memoryText = document.getElementById('memory-text');
        const conversationsText = document.getElementById('conversations-text');
        const rightChat = document.getElementById('right-chat');
        const chatCollapseArrow = document.getElementById('chat-collapse-arrow');
        const createPersonaBtn = document.getElementById('create-persona');
        const createDeckBtn = document.getElementById('create-deck');
        const deckDropdown = document.getElementById('deck-dropdown');
        const createSlideBtn = document.getElementById('create-slide');
        const displays = {
          'display1': {
            webview: document.getElementById('webview1'),
            image: document.getElementById('image1'),
            element: document.getElementById('display1')
          },
          'display2': {
            webview: document.getElementById('webview2'),
            image: document.getElementById('image2'),
            element: document.getElementById('display2')
          },
          'display3': {
            webview: document.getElementById('webview3'),
            image: document.getElementById('image3'),
            element: document.getElementById('display3')
          }
        };

        console.log('DOM fully loaded, attaching event listeners');

        configHeader.

addEventListener('click', () => {
          console.log('Config header clicked');
          infoPanels.classList.toggle('active');
        });

        collapseArrow.addEventListener('click', () => {
          console.log('Collapse arrow clicked');
          leftSidebar.classList.toggle('collapsed');
          appContainer.classList.toggle('collapsed');
        });

        statusCollapseArrow.addEventListener('click', () => {
          console.log('Status collapse arrow clicked');
          statusBar.classList.toggle('collapsed');
        });

        chatCollapseArrow.addEventListener('click', () => {
          console.log('Chat collapse arrow clicked');
          rightChat.classList.toggle('collapsed');
          appContainer.classList.toggle('chat-collapsed');
        });

        document.querySelectorAll('.dropdown-header').forEach(header => {
          header.addEventListener('click', () => {
            console.log('Dropdown header clicked:', header.id);
            const content = header.nextElementSibling;
            document.querySelectorAll('.dropdown-content.active').forEach(activeContent => {
              if (activeContent !== content) {
                activeContent.classList.remove('active');
                activeContent.previousElementSibling.classList.remove('active');
              }
            });
            content.classList.toggle('active');
            header.classList.toggle('active');
          });
        });

        document.querySelectorAll('.persona-item').forEach(item => {
          item.addEventListener('click', () => {
            console.log('Persona item clicked:', item.dataset.aiName);
            document.querySelectorAll('.persona-item.selected').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');

            const aiName = item.dataset.aiName;
            const imgBase = item.dataset.imgBase;
            selectedAI = aiName;

            personaImage.src = \`file://\${path.join(__dirname, imgBase + '.png')}\`;
            statusTitle.textContent = aiName;
            configPanelHeader.textContent = \`\${aiName} Configuration\`;

            ipcRenderer.send('select-ai', aiName);
            loadContent(aiName);
            updateStatusBar(aiName);
          });
        });

        document.querySelectorAll('.slide-item').forEach(item => {
          item.addEventListener('click', () => {
            console.log('Slide item clicked:', item.dataset.displayId);
            document.querySelectorAll('.slide-item.selected').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            const displayId = item.dataset.displayId;
            console.log(\`Selected slide: \${displayId}\`);
          });
        });

        sendButton.addEventListener('click', sendMessage);
        userInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            console.log('Enter key pressed in chat input');
            e.preventDefault();
            sendMessage();
          }
        });

        document.getElementById('save-pre-prompt').addEventListener('click', () => {
          console.log('Save pre-prompt clicked');
          ipcRenderer.send('save-pre-prompt', prePromptText.value);
        });
        document.getElementById('auto-pre-prompt').addEventListener('click', () => {
          console.log('Auto pre-prompt clicked');
          ipcRenderer.send('auto-pre-prompt');
        });
        document.getElementById('save-memory-prompt').addEventListener('click', () => {
          console.log('Save memory prompt clicked');
          ipcRenderer.send('save-memory-prompt', memoryPromptText.value);
        });
        document.getElementById('save-memory').addEventListener('click', () => {
          console.log('Save memory clicked');
          ipcRenderer.send('save-memory', memoryText.value);
        });
        document.getElementById('update-memory').addEventListener('click', () => {
          console.log('Update memory clicked');
          ipcRenderer.send('update-memory');
        });
        document.getElementById('save-conversations').addEventListener('click', () => {
          console.log('Save conversations clicked');
          ipcRenderer.send('save-conversations', conversationsText.value);
        });

        createPersonaBtn.addEventListener('click', () => {
          console.log('Create New Persona button clicked');
          const availableDisplay = Object.keys(displays).find(id => 
            !displays[id].image.classList.contains('active') && 
            !displays[id].webview.classList.contains('active')
          ) || 'display1';
          const programPath = path.join(__dirname, 'programs', 'persona-creator.html');
          console.log(\`Attempting to load persona-creator at: \${programPath} into \${availableDisplay}\`);
          ipcRenderer.send('load-display', { displayId: availableDisplay, url: \`file://\${programPath}\` });
          console.log('IPC message sent: load-display');
        });

        createDeckBtn.addEventListener('click', () => {
          console.log('Create New Deck button clicked');
          const deckName = prompt('Enter deck name:');
          if (deckName) {
            console.log(\`Creating deck: \${deckName}\`);
            const currentDisplays = {};
            Object.keys(displays).forEach(displayId => {
              const display = displays[displayId];
              if (display.image.classList.contains('active')) {
                currentDisplays[displayId] = { type: 'image', src: display.image.src };
              } else if (display.webview.classList.contains('active')) {
                currentDisplays[displayId] = { type: 'webview', src: display.webview.src };
              }
            });
            ipcRenderer.send('create-deck', deckName, currentDisplays);
            console.log('IPC message sent: create-deck');
          } else {
            console.log('Deck creation cancelled or no name provided');
          }
        });

        deckDropdown.addEventListener('change', (e) => {
          const deckName = e.target.value;
          console.log('Deck dropdown changed, selected:', deckName);
          if (deckName) {
            ipcRenderer.send('load-deck', deckName);
            console.log('IPC message sent: load-deck');
          }
        });

        createSlideBtn.addEventListener('click', () => {
          console.log('Create New Slide button clicked');
          const availableDisplay = Object.keys(displays).find(id => 
            !displays[id].image.classList.contains('active') && 
            !displays[id].webview.classList.contains('active')
          ) || 'display1';
          console.log(\`Clearing display \${availableDisplay} as a new slide\`);
          ipcRenderer.send('clear-display', availableDisplay);
          console.log('IPC message sent: clear-display');
        });

        function sendMessage() {
          console.log('Send message button clicked');
          const content = userInput.value.trim();
          if (content) {
            ipcRenderer.send('add-entry', content);
            userInput.value = '';
            console.log('IPC message sent: add-entry');
          }
        }

        function loadContent(aiName) {
          console.log('Loading content for:', aiName || selectedAI);
          ipcRenderer.send('load-content', aiName);
        }

        function updateStatusBar(aiName) {
          console.log('Updating status bar for:', aiName || selectedAI);
          ipcRenderer.send('get-status', aiName);
        }

        function clearDisplay(displayId) {
          console.log('Clearing display:', displayId);
          ipcRenderer.send('clear-display', displayId);
        }

        function appendMessageToChatLog(entry, isStatus = false, isUser = false) {
          console.log('Appending message to chat log:', entry.content);
          const p = document.createElement('p');
          if (isStatus) {
            p.style.color = 'var(--text-grey)';
            p.style.fontStyle = 'italic';
            p.textContent = entry.content;
          } else if (entry.content) {
            const parts = entry.content.split(': ');
            const speaker = isUser ? 'You' : parts[0];
            const message = isUser ? entry.content : parts.slice(1).join(': ');

            if (speaker.toLowerCase() === 'error') {
              p.style.color = '#FF6B6B';
              p.innerHTML = \`<strong>\${speaker}:</strong> \${message}\`;
            } else {
              p.className = speaker === 'You' ? 'user-message' : 'ai-message';
              p.innerHTML = \`<strong>\${speaker}:<span class="thinking-bar"></span></strong> \${message}\`;
              if (!isUser) latestAIMessage = p;
            }
          } else {
            p.textContent = 'Received empty entry.';
            p.style.color = 'var(--text-grey)';
          }
          chatLog.appendChild(p);
          chatLog.scrollTop = chatLog.scrollHeight;
        }

        ipcRenderer.on('entries-loaded', (event, entries) => {
          console.log('Entries loaded:', entries.length);
          chatLog.innerHTML = '';
          entries.forEach(entry => appendMessageToChatLog(entry, false));
          updateStatusBar(selectedAI);
        });

        ipcRenderer.on('content-loaded', (event, { prePrompt, memoryPrompt, memory, conversations }) => {
          console.log('Content loaded');
          prePromptText.value = prePrompt || 'Respond as appropriate.';
          memoryPromptText.value = memoryPrompt || 'Generate a concise memory summary.';
          memoryText.value = memory || '# Memory\\n\\n## Key Insights\\n- None yet\\n## Tasks To-Do\\n- None yet';
          conversationsText.value = conversations || '';
        });

        ipcRenderer.on('status-updated', (event, { convCount, lastInteraction }) => {
          console.log('Status updated:', { convCount, lastInteraction });
          convCountSpan.textContent = \`Conversations: \${convCount}\`;
          lastInteractionSpan.textContent = \`Last Interaction: \${lastInteraction || 'N/A'}\`;
        });

        ipcRenderer.on('append-chat-log', (event, message) => {
          appendMessageToChatLog({ content: message }, true);
        });

        ipcRenderer.on('append-user-entry', (event, message) => {
          appendMessageToChatLog({ content: message }, false, true);
        });

        ipcRenderer.on('load-display', (event, { displayId, url }) => {
          const display = displays[displayId];
          if (display) {
            console.log(\`Renderer: Loading \${url} into \${displayId}\`);
            display.webview.classList.add('active');
            display.image.classList.remove('active');
            display.element.classList.remove('loading-active');
            display.webview.src = url;
            display.webview.addEventListener('did-fail-load', (e) => {
              console.error(\`Failed to load \${url} in \${displayId}: \${e.errorDescription}\`);
            });
            display.webview.addEventListener('did-finish-load', () => {
              console.log(\`Successfully loaded \${url} in \${displayId}\`);
              display.webview.executeJavaScript(\`
                window.addEventListener('message', (event) => {
                  if (event.data && event.data.type === 'save-persona') {
                    require('electron').ipcRenderer.send('save-persona', event.data.payload);
                  }
                });
              \`);
            });
            updateSlideIcon(displayId, 'webview', url);
          } else {
            console.error(\`Display \${displayId} not found\`);
          }
        });

        ipcRenderer.on('load-image', (event, { displayId, imagePath }) => {
          const display = displays[displayId];
          if (display) {
            console.log(\`Loading image \${imagePath} in \${displayId}\`);
            display.image.classList.add('active');
            display.webview.classList.remove('active');
            display.element.classList.remove('loading-active');
            const fileUrl = \`file://\${imagePath.replace(/\\\\/g, '/')}\`;
            display.image.src = fileUrl;
            display.image.dataset.path = imagePath;
            display.image.onerror = () => {
              console.error(\`Failed to load image at \${fileUrl}\`);
              display.image.src = 'file://${imageBasePath}/placeholder.png';
            };
            updateSlideIcon(displayId, 'image', fileUrl);
          } else {
            console.error(\`Display \${displayId} not found\`);
          }
        });

        ipcRenderer.on('start-loading', (event, { displayId }) => {
          const display = displays[displayId];
          if (display) {
            display.element.classList.add('loading-active');
            display.image.classList.remove('active');
            display.webview.classList.remove('active');
          }
        });

        ipcRenderer.on('stop-loading', (event, { displayId }) => {
          const display = displays[displayId];
          if (display) {
            display.element.classList.remove('loading-active');
          }
        });

        ipcRenderer.on('start-thinking', () => {
          if (latestAIMessage) {
            latestAIMessage.classList.add('thinking-active');
          }
        });

        ipcRenderer.on('stop-thinking', () => {
          if (latestAIMessage) {
            latestAIMessage.classList.remove('thinking-active');
          }
        });


    ipcRenderer.on('clear-display', (event, { displayId }) => {
          const display = displays[displayId];
          if (display) {
            display.image.classList.remove('active');
            display.webview.classList.remove('active');
            display.element.classList.remove('loading-active');
            display.image.src = '';
            display.webview.src = '';
            display.image.dataset.path = '';
            updateSlideIcon(displayId, 'empty', null);
            console.log(\`Cleared \${displayId}\`);
          } else {
            console.error(\`Display \${displayId} not found\`);
          }
        });

        ipcRenderer.on('decks-updated', (event, updatedDecks) => {
          console.log('Decks updated:', Object.keys(updatedDecks));
          deckDropdown.innerHTML = '<option value="">Select a Deck</option>';
          Object.keys(updatedDecks).forEach(deckName => {
            const option = document.createElement('option');
            option.value = deckName;
            option.textContent = deckName;
            deckDropdown.appendChild(option);
          });
        });

        ipcRenderer.on('load-deck-displays', (event, deckDisplays) => {
          console.log('Loading deck displays:', deckDisplays);
          Object.keys(deckDisplays).forEach(displayId => {
            const display = displays[displayId];
            const content = deckDisplays[displayId];
            if (display && content) {
              if (content.type === 'image') {
                display.image.classList.add('active');
                display.webview.classList.remove('active');
                display.image.src = content.src;
                display.image.dataset.path = content.src.replace('file://', '');
                updateSlideIcon(displayId, 'image', content.src);
              } else if (content.type === 'webview') {
                display.webview.classList.add('active');
                display.image.classList.remove('active');
                display.webview.src = content.src;
                updateSlideIcon(displayId, 'webview', content.src);
              }
            }
          });
        });

        ipcRenderer.on('add-persona', (event, { name, description, imgBase }) => {
          console.log(\`Adding new persona: \${name}\`);
          const personaList = document.querySelector('.persona-list');
          const newItem = document.createElement('li');
          newItem.className = 'persona-item';
          newItem.dataset.aiName = name;
          newItem.dataset.imgBase = imgBase;
          newItem.dataset.description = description;
          newItem.innerHTML = \`
            <img src="file://\${path.join(__dirname, imgBase + '.png')}" onerror="this.src='file://${imageBasePath}/placeholder.png'" alt="\${name} Icon" class="persona-icon">
            <span class="persona-name">\${name}</span>
          \`;
          newItem.addEventListener('click', () => {
            document.querySelectorAll('.persona-item.selected').forEach(i => i.classList.remove('selected'));
            newItem.classList.add('selected');
            selectedAI = name;
            personaImage.src = \`file://\${path.join(__dirname, imgBase + '.png')}\`;
            statusTitle.textContent = name;
            configPanelHeader.textContent = \`\${name} Configuration\`;
            ipcRenderer.send('select-ai', name);
            loadContent(name);
            updateStatusBar(name);
          });
          personaList.appendChild(newItem);
          console.log(\`Added new persona: \${name} with icon at \${imgBase}.png\`);
        });

        function updateSlideIcon(displayId, type, src) {
          const slideItem = document.querySelector(\`.slide-item[data-display-id="\${displayId}"]\`);
          const slideIcon = slideItem.querySelector('.slide-icon');
          const slideName = slideItem.querySelector('.slide-name');
          if (type === 'image') {
            slideIcon.src = src;
            slideName.textContent = 'Generated Image';
          } else if (type === 'webview') {
            if (src.includes('youtube.com') || src.includes('youtu.be')) {
              slideIcon.src = 'file://${imageBasePath}/youtube-icon.png';
              slideName.textContent = 'YouTube Video';
            } else if (src.includes('persona-creator.html')) {
              slideIcon.src = 'file://${imageBasePath}/persona-creator-icon.png';
              slideName.textContent = 'Persona Creator';
            } else {
              slideIcon.src = 'file://${imageBasePath}/webview-icon.png';
              slideName.textContent = 'Web Content';
            }
          } else {
            slideIcon.src = '';
            slideIcon.style.backgroundColor = '#444';
            slideName.textContent = 'Empty';
          }
        }

        const contextMenu = Menu.buildFromTemplate([
          {
            label: 'Copy Image',
            click: (menuItem, browserWindow, event) => {
              const target = event.target;
              if (target.tagName === 'IMG' && target.classList.contains('active')) {
                const imagePath = target.dataset.path;
                if (imagePath) {
                  ipcRenderer.send('copy-image', imagePath);
                  console.log('IPC message sent: copy-image');
                }
              }
            }
          }
        ]);

        displaysContainer.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const target = e.target;
          if (target.tagName === 'IMG' && target.classList.contains('active')) {
            contextMenu.popup({ window: BrowserWindow.getFocusedWindow() });
          }
        });

        ipcRenderer.send('load-entries');
        updateStatusBar(selectedAI);

        const defaultItem = document.querySelector('.persona-item.selected');
        if (defaultItem) {
          const aiName = defaultItem.dataset.aiName;
          const imgBase = defaultItem.dataset.imgBase;
          selectedAI = aiName;
          personaImage.src = \`file://\${path.join(__dirname, imgBase + '.png')}\`;
          statusTitle.textContent = aiName;
          configPanelHeader.textContent = \`\${aiName} Configuration\`;
        }
      });
    </script>
</body>
</html>
`;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
      webSecurity: false
    },
    show: false,
  });

  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;
  mainWindow.loadURL(dataUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
    loadContent();
    loadEntries();
    sendStatusUpdate(selectedAI);
    loadDecks();

  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

function sendToRenderer(channel, ...args) {
  if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
    console.log(`Main process: Sent ${channel} to renderer with args:`, args);
  } else {
    console.warn(`Main process: Attempted to send to renderer on channel '${channel}' but mainWindow is not available or destroyed.`);
  }
}

ipcMain.on('select-ai', (event, aiName) => {
  console.log(`Main process: Received select-ai with aiName: ${aiName}`);
  selectedAI = aiName;
  loadContent();
  loadEntries();
  sendStatusUpdate(aiName);
});

ipcMain.on('add-entry', async (event, userContent) => {
  console.log(`Main process: Received add-entry with userContent: ${userContent}`);
  if (!selectedAI) {
    console.error('Main process: No AI selected, cannot add entry.');
    appendChatLog('Error: No AI Persona selected.');
    return;
  }
  const sanitizedAiName = selectedAI.toLowerCase().replace(/[^a-z0-9]/gi, '_');
  const folder = path.join(vaultPath, sanitizedAiName);
  const conversationsFilePath = path.join(folder, 'Stored Conversations.md');

  sendToRenderer('append-user-entry', userContent);

  try {
    await fs.mkdir(folder, { recursive: true });

    let existingConversations = await fs.readFile(conversationsFilePath, 'utf-8').catch(() => '');
    const prePromptPath = path.join(folder, 'Pre-Prompt.md');
    const prePrompt = await fs.readFile(prePromptPath, 'utf-8').catch(() => 'Respond as appropriate.');
    const memoryPath = path.join(folder, 'Memory.md');
    const memory = await fs.readFile(memoryPath, 'utf-8').catch(() => '');

    const lines = existingConversations.split('\n').filter(line => line.trim().startsWith('- '));
    const recentChatLines = lines.slice(-14);
    const recentChatsStr = recentChatLines.join('\n') || 'No recent conversations found.';

    const systemMessage = `You are ${selectedAI}. ${prePrompt} Respond concisely within 400 characters unless generating an image or program. For image requests, use format [IMAGE <display_num>: <prompt>]. For web content, use [DISPLAY <display_num>: <url>]. For programs, use [PROGRAM <display_num>: <type>].\n\nCURRENT MEMORY:\n${memory}\n\nRECENT CHAT HISTORY (up to last 7 turns):\n${recentChatsStr}`;

    console.log("Main process: --- Sending Prompt to OpenAI ---");
    console.log("Main process: User Message:", userContent);
    console.log("Main process: -------------------------------");

    sendToRenderer('start-thinking');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userContent }
      ],
      max_tokens: 150,
      temperature: 0.7
    });

    const aiResponse = response.choices[0]?.message?.content?.trim() || 'No response received.';
    console.log("Main process: AI Response:", aiResponse);

    const displayMatch = aiResponse.match(/\[DISPLAY (\d+): (.+?)\]/);
    const imageMatch = aiResponse.match(/\[IMAGE (\d+): (.+?)\]/);
    const programMatch = aiResponse.match(/\[PROGRAM (\d+): (.+?)\]/);

    let chatResponse = aiResponse;

    if (displayMatch) {
      const displayNum = displayMatch[1];
      const url = displayMatch[2];
      sendToRenderer('load-display', { displayId: `display${displayNum}`, url });
      chatResponse = `${selectedAI === 'Memo' ? 'Deployed' : 'Here’s'} your web content in Display ${displayNum}!`;
    } else if (imageMatch) {
      const displayNum = imageMatch[1];
      const imagePrompt = imageMatch[2];
      sendToRenderer('start-loading', { displayId: `display${displayNum}` });
      const imageResponse = await openai.images.generate({
        model: 'dall-e-3',
        prompt: imagePrompt,
        n: 1,
        size: '1792x1024',
        response_format: 'url'
      });
      const imageUrl = imageResponse.data[0].url;
      const imageFileName = `generated-image-${Date.now()}.png`;
      const imagePath = path.join(folder, imageFileName);

      const imageFetch = await fetch(imageUrl);
      const imageBuffer = await imageFetch.arrayBuffer();
      await sharp(Buffer.from(imageBuffer))
        .resize(1728, 972, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
        .extend({
          top: 54,
          bottom: 54,
          left: 96,
          right: 96,
          background: { r: 0, g: 0, b: 0, alpha: 1 }
        })
        .toFile(imagePath);

      sendToRenderer('load-image', { displayId: `display${displayNum}`, imagePath });
      sendToRenderer('stop-loading', { displayId: `display${displayNum}` });
      chatResponse = `${selectedAI === 'Memo' ? 'Engineered' : 'Generated'} your image in Display ${displayNum}!`;
    } else if (programMatch) {
      const displayNum = programMatch[1];
      const programType = programMatch[2];
      if (programType === 'persona-creator') {
        const programPath = path.join(__dirname, 'programs', 'persona-creator.html');
        console.log(`Main process: Chatbox trigger: Loading persona-creator at: ${programPath}`);
        if (fs.existsSync(programPath)) {
          sendToRenderer('load-display', { displayId: `display${displayNum}`, url: `file://${programPath}` });
          chatResponse = `Loaded Persona Creator in Display ${displayNum}!`;
        } else {
          chatResponse = `Error: persona-creator.html not found at ${programPath}`;
          console.error(`Main process: File not found: ${programPath}`);
        }
      } else {
        chatResponse = `Program type '${programType}' not recognized.`;
      }
    }

    sendToRenderer('stop-thinking');
    appendChatLog(chatResponse);

    const today = new Date().toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    let fileContentToAppend = '';
    if (!existingConversations.includes(`## ${today}`)) {
      fileContentToAppend += (existingConversations.trim() ? '\n\n' : '') + `## ${today}\n\n`;
    }
    fileContentToAppend += `- You: ${userContent}\n- ${selectedAI}: ${chatResponse}\n\n`;

    await fs.appendFile(conversationsFilePath, fileContentToAppend, 'utf-8');

    loadEntries();
    loadContent();
    sendStatusUpdate(selectedAI);

  } catch (error) {
    console.error('Main process: Error adding entry or calling OpenAI:', error);
// ----------- END OF BLOCK 4 -----------


// ----------- START OF BLOCK 5 -----------
    sendToRenderer('stop-thinking');
    const errorMsg = error.response?.data?.error?.message || error.message || 'Unknown error';
    const errorEntry = `\n- Error: Failed to get response or save entry. Details: ${errorMsg} (${new Date().toLocaleTimeString()})\n`;
    try {
      await fs.appendFile(conversationsFilePath, errorEntry, 'utf-8');
    } catch (writeError) {
      console.error("Main process: Failed to write error to conversation file:", writeError);
    }
    appendChatLog(`Error: ${errorMsg}`);
    loadEntries();
    loadContent();
  }
});

ipcMain.on('load-display', (event, { displayId, url }) => {
  console.log(`Main process: Received load-display for displayId: ${displayId}, url: ${url}`);
  sendToRenderer('load-display', { displayId, url });
});

ipcMain.on('clear-display', (event, displayId) => {
  console.log(`Main process: Received clear-display for displayId: ${displayId}`);
  sendToRenderer('clear-display', { displayId });
});

ipcMain.on('create-deck', (event, deckName, displays) => {
  console.log(`Main process: Received create-deck for deckName: ${deckName}, displays:`, displays);
  const deckFilePath = path.join(decksPath, `${deckName}.json`);
  decks[deckName] = displays;
  fs.writeFile(deckFilePath, JSON.stringify(displays, null, 2), 'utf-8')
    .then(() => {
      sendToRenderer('decks-updated', decks);
      console.log(`Main process: Deck ${deckName} created successfully`);
    })
    .catch(err => console.error(`Main process: Error saving deck ${deckName}:`, err));
});

ipcMain.on('load-deck', (event, deckName) => {
  console.log(`Main process: Received load-deck for deckName: ${deckName}`);
  if (decks[deckName]) {
    sendToRenderer('load-deck-displays', decks[deckName]);
  } else {
    console.error(`Main process: Deck ${deckName} not found`);
  }
});

ipcMain.on('load-entries', () => {
  console.log('Main process: Received load-entries');
  loadEntries();
});

ipcMain.on('load-content', () => {
  console.log('Main process: Received load-content');
  loadContent();
});

ipcMain.on('get-status', (event, aiName) => {
  console.log(`Main process: Received get-status for aiName: ${aiName}`);
  sendStatusUpdate(aiName);
});

ipcMain.on('copy-image', async (event, imagePath) => {
  console.log(`Main process: Received copy-image for imagePath: ${imagePath}`);
  try {
    const imageBuffer = await fs.readFile(imagePath);
    const nativeImage = require('electron').nativeImage.createFromBuffer(imageBuffer);
    clipboard.writeImage(nativeImage);
    console.log(`Main process: Copied image from ${imagePath} to clipboard`);
  } catch (error) {
    console.error('Main process: Error copying image to clipboard:', error);
  }
});

ipcMain.on('save-persona', async (event, personaData) => {
  console.log('Main process: Received save-persona with data:', personaData);
  const { name, description, prePrompt, icon } = personaData;
  const sanitizedName = name.toLowerCase().replace(/[^a-z0-9]/gi, '_');
  const folder = path.join(vaultPath, sanitizedName);
  const iconPath = path.join(__dirname, 'images', `${sanitizedName}.png`);

  try {
    await fs.mkdir(folder, { recursive: true });

    await fs.writeFile(path.join(folder, 'Pre-Prompt.md'), prePrompt, 'utf-8');

    const base64Data = icon.data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(iconPath, buffer);

    sendToRenderer('add-persona', {
      name,
      description,
      imgBase: `images/${sanitizedName}`
    });

    console.log(`Main process: Persona ${name} created successfully at ${folder} with icon at ${iconPath}`);
    appendChatLog(`Persona ${name} created successfully!`);
  } catch (error) {
    console.error('Main process: Error saving persona:', error);
    appendChatLog(`Error creating persona: ${error.message}`);
  }
});

async function loadDecks() {
  try {
    const files = await fs.readdir(decksPath);
    const deckFiles = files.filter(file => file.endsWith('.json'));
    for (const file of deckFiles) {
      const deckName = file.replace('.json', '');
      const content = await fs.readFile(path.join(decksPath, file), 'utf-8');
      decks[deckName] = JSON.parse(content);
    }
    sendToRenderer('decks-updated', decks);
    console.log('Main process: Decks loaded:', Object.keys(decks));
  } catch (err) {
    console.error('Main process: Error loading decks:', err);
    sendToRenderer('decks-updated', decks);
  }
}

async function saveFileContent(fileName, content, successMessage) {
  if (!selectedAI) {
    appendChatLog('Error: Cannot save, no AI Persona selected.');
    return;
  }
  const sanitizedAiName = selectedAI.toLowerCase().replace(/[^a-z0-9]/gi, '_');
  const folder = path.join(vaultPath, sanitizedAiName);
  try {
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, fileName), content, 'utf-8');
    appendChatLog(successMessage);
    loadContent();
  } catch (error) {
    console.error(`Main process: Error saving ${fileName}:`, error);
    appendChatLog(`Error saving ${fileName}: ${error.message}`);
  }
}

ipcMain.on('save-pre-prompt', (event, text) => {
  console.log('Main process: Received save-pre-prompt');
  saveFileContent('Pre-Prompt.md', text, 'Pre-Prompt saved.');
});

ipcMain.on('save-memory-prompt', (event, text) => {
  console.log('Main process: Received save-memory-prompt');
  saveFileContent('Memory-Prompt.md', text, 'Memory Prompt saved.');
});

ipcMain.on('save-memory', (event, text) => {
  console.log('Main process: Received save-memory');
  saveFileContent('Memory.md', text, 'Memory saved.');
});

ipcMain.on('save-conversations', async (event, text) => {
  console.log('Main process: Received save-conversations');
  await saveFileContent('Stored Conversations.md', text, 'Conversations saved.');
  loadEntries();
  sendStatusUpdate(selectedAI);
});

ipcMain.on('auto-pre-prompt', async (event) => {
  console.log('Main process: Received auto-pre-prompt');
  if (!selectedAI) { appendChatLog('Error: No AI selected.'); return; }
  const sanitizedAiName = selectedAI.toLowerCase().replace(/[^a-z0-9]/gi, '_');
  const folder = path.join(vaultPath, sanitizedAiName);
  const convPath = path.join(folder, 'Stored Conversations.md');
  const prePromptPath = path.join(folder, 'Pre-Prompt.md');
  try {
    const convContent = await fs.readFile(convPath, 'utf-8').catch(() => '');
    if (!convContent.trim()) {
      appendChatLog(`No conversations found for ${selectedAI} to generate pre-prompt.`);
      return;
    }
    const prompt = `Analyze the following conversation excerpts involving '${selectedAI}'. Generate a concise (max 150 characters), insightful pre-prompt that captures the core function or style of '${selectedAI}' based *only* on these conversations. Output *only* the pre-prompt text itself, without any introduction or explanation.\n\nCONVERSATIONS (recent portion):\n${convContent.slice(-2000)}`;

    appendChatLog('Generating pre-prompt...');
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 50,
      temperature: 0.5
    });
    const generatedPrePrompt = response.choices[0]?.message?.content?.trim() || 'Could not generate pre-prompt.';
    await fs.writeFile(prePromptPath, generatedPrePrompt, 'utf-8');
    loadContent();
    appendChatLog('Pre-Prompt auto-populated.');
  } catch (error) {
    console.error('Main process: Error auto-populating pre-prompt:', error);
    appendChatLog(`Error auto-populating pre-prompt: ${error.message}`);
  }
});

ipcMain.on('update-memory', async (event) => {
  console.log('Main process: Received update-memory');
  if (!selectedAI) { appendChatLog('Error: No AI selected.'); return; }
  const sanitizedAiName = selectedAI.toLowerCase().replace(/[^a-z0-9]/gi, '_');
  const folder = path.join(vaultPath, sanitizedAiName);
  const convPath = path.join(folder, 'Stored Conversations.md');
  const memoryPromptPath = path.join(folder, 'Memory-Prompt.md');
  const memoryPath = path.join(folder, 'Memory.md');
  try {
    const convContent = await fs.readFile(convPath, 'utf-8').catch(() => '');
    const memoryPrompt = await fs.readFile(memoryPromptPath, 'utf-8').catch(() => 'Summarize the key points, open questions, and action items from the conversation history provided below. Format using Markdown headings (e.g., ## Key Insights, ## Open Questions, ## Action Items). Be concise.');

    if (!convContent.trim()) {
      appendChatLog(`No conversations found for ${selectedAI} to update memory.`);
      await fs.writeFile(memoryPath, '# Memory\n\n## Key Insights\n- None yet\n\n## Open Questions\n- None yet\n\n## Action Items\n- None yet', 'utf-8').catch(e => console.error("Main process: Failed to write default memory:", e));
      loadContent();
      return;
    }

    const recentConversations = convContent.slice(-4000);
    const prompt = `${memoryPrompt}\n\nCONVERSATION HISTORY (recent portion):\n${recentConversations}`;

    appendChatLog(`Updating memory for ${selectedAI}...`);
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    });
    const memoryContent = response.choices[0]?.message?.content?.trim() || '# Memory Update Failed\n\nCould not generate memory summary.';
    await fs.writeFile(memoryPath, memoryContent, 'utf-8');
    loadContent();
    appendChatLog(`Memory updated for ${selectedAI}.`);
  } catch (error) {
    console.error(`Main process: Error updating memory for ${selectedAI}:`, error);
    appendChatLog(`Error updating memory: ${error.message}`);
  }
});

async function loadEntries() {
  if (!selectedAI) return;
  const sanitizedAiName = selectedAI.toLowerCase().replace(/[^a-z0-9]/gi, '_');
  const folder = path.join(vaultPath, sanitizedAiName);
  const filePath = path.join(folder, 'Stored Conversations.md');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n')
                         .map(line => line.trim())
                         .filter(line => line.startsWith('- You:') || line.startsWith(`- ${selectedAI}:`) || line.startsWith('- Error:'))
                         .map(line => ({
                             content: line.substring(2).trim(),
                             created_at: new Date().toISOString()
                         }));
    sendToRenderer('entries-loaded', lines);
  } catch (err) {
    if (err.code === 'ENOENT') {
      sendToRenderer('entries-loaded', []);
    } else {
      console.error('Main process: Error loading entries:', err);
      sendToRenderer('entries-loaded', [{ content: `Error: Could not load conversations. ${err.message}`, created_at: new Date().toISOString() }]);
    }
  }
}

async function loadContent() {
  if (!selectedAI) return;
  const sanitizedAiName = selectedAI.toLowerCase().replace(/[^a-z0-9]/gi, '_');
  const folder = path.join(vaultPath, sanitizedAiName);
  try {
    const results = await Promise.allSettled([
      fs.readFile(path.join(folder, 'Pre-Prompt.md'), 'utf-8'),
      fs.readFile(path.join(folder, 'Memory-Prompt.md'), 'utf-8'),
      fs.readFile(path.join(folder, 'Memory.md'), 'utf-8'),
      fs.readFile(path.join(folder, 'Stored Conversations.md'), 'utf-8')
    ]);

    const prePrompt = results[0].status === 'fulfilled' ? results[0].value : 'Respond as appropriate.';
    const memoryPrompt = results[1].status === 'fulfilled' ? results[1].value : 'Generate a concise memory summary.';
    const memory = results[2].status === 'fulfilled' ? results[2].value : '# Memory\n\n## Key Insights\n- None yet\n## Tasks To-Do\n- None yet';
    const conversations = results[3].status === 'fulfilled' ? results[3].value : '';

    sendToRenderer('content-loaded', { prePrompt, memoryPrompt, memory, conversations });

    results.forEach((result, index) => {
      if (result.status === 'rejected' && result.reason.code !== 'ENOENT') {
        const filenames = ['Pre-Prompt.md', 'Memory-Prompt.md', 'Memory.md', 'Stored Conversations.md'];
        console.error(`Main process: Error loading content file ${filenames[index]}:`, result.reason);
      }
    });

  } catch (error) {
    console.error("Main process: Unexpected error loading content files:", error);
    sendToRenderer('content-loaded', {
      prePrompt: 'Error loading.', memoryPrompt: 'Error loading.', memory: 'Error loading.', conversations: 'Error loading.'
    });
  }
}

async function sendStatusUpdate(aiName) {
  if (!aiName) return;
  const sanitizedAiName = aiName.toLowerCase().replace(/[^a-z0-9]/gi, '_');
  const folder = path.join(vaultPath, sanitizedAiName);
  const filePath = path.join(folder, 'Stored Conversations.md');
  let stats = { convCount: 0, lastInteraction: null };

  try {
    const fileStats = await fs.stat(filePath);
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim().startsWith(`- ${aiName}:`));
    stats.convCount = lines.length;
    stats.lastInteraction = fileStats.mtime.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true });
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`Main process: Error getting status for ${aiName}:`, err.message);
    }
  } finally {
    sendToRenderer('status-updated', stats);
  }
}

function appendChatLog(message) {
  sendToRenderer('append-chat-log', message);
}