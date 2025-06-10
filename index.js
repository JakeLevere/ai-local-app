<!DOCTYPE html>
<html>
<head>
    <title>Personal AI Dashboard</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' file: data:; webview-src http: https: file:;">
    <link rel="stylesheet" href="style.css">
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
                    <li class="persona-item selected" data-ai-name="Engineer AI" data-img-base="images/Engineer" data-description="Solves technical problems.">
                       <img src="./images/Engineer.png" onerror="this.src='./images/placeholder.png'" alt="Engineer AI Icon" class="persona-icon">
                       <span class="persona-name">Engineer AI</span>
                     </li>
                     <li class="persona-item" data-ai-name="Mental Health AI" data-img-base="images/Mental" data-description="Provides emotional support.">
                       <img src="./images/Mental.png" onerror="this.src='./images/placeholder.png'" alt="Mental Health AI Icon" class="persona-icon">
                       <span class="persona-name">Mental Health AI</span>
                     </li>
                     <li class="persona-item" data-ai-name="Physical Health AI" data-img-base="images/Physical" data-description="Offers fitness advice.">
                       <img src="./images/Physical.png" onerror="this.src='./images/placeholder.png'" alt="Physical Health AI Icon" class="persona-icon">
                       <span class="persona-name">Physical Health AI</span>
                     </li>
                     <li class="persona-item" data-ai-name="Entertainment AI" data-img-base="images/Entertainer" data-description="Generates fun content.">
                       <img src="./images/Entertainer.png" onerror="this.src='./images/placeholder.png'" alt="Entertainment AI Icon" class="persona-icon">
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
                       <img src="./images/placeholder.png" alt="Slide 1" class="slide-icon">
                       <span class="slide-name">Empty</span>
                     </li>
                     <li class="slide-item" data-display-id="display2">
                       <img src="./images/placeholder.png" alt="Slide 2" class="slide-icon">
                       <span class="slide-name">Empty</span>
                     </li>
                     <li class="slide-item" data-display-id="display3">
                       <img src="./images/placeholder.png" alt="Slide 3" class="slide-icon">
                       <span class="slide-name">Empty</span>
                     </li>
                </ul>
            </div>
        </aside>

        <main id="main-content">
            <div id="central-display">
                <div id="persona-status-bar">
                     <div id="status-header">
                       <img id="persona-image" src="./images/Engineer.png" alt="Current AI Persona">
                       <div id="status-text-content">
                           <div id="status-title">Engineer AI</div>
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
                            <span class="clear-button" data-display-id="display1">X</span>
                            <webview id="webview1" allowpopups></webview>
                            <img id="image1" alt="Generated Image">
                            <div class="loading"></div>
                        </div>
                    </div>
                    <div class="display-wrapper">
                        <div class="display" id="display2">
                            <span class="display-number">2</span>
                            <span class="clear-button" data-display-id="display2">X</span>
                            <webview id="webview2" allowpopups></webview>
                            <img id="image2" alt="Generated Image">
                            <div class="loading"></div>
                        </div>
                    </div>
                    <div class="display-wrapper">
                        <div class="display" id="display3">
                            <span class="display-number">3</span>
                            <span class="clear-button" data-display-id="display3">X</span>
                            <webview id="webview3" allowpopups></webview>
                            <img id="image3" alt="Generated Image">
                            <div class="loading"></div>
                        </div>
                    </div>
                </div>
            </div>
            <div id="info-panels">
                <div id="config-header">Engineer AI Configuration</div>
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

    <script defer src="renderer.js"></script>
</body>
</html>