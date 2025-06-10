// services.js
const fs = require('fs').promises;
const path = require('path');
const { OpenAI } = require('openai');
const sharp = require('sharp');
// Use the native fetch available in modern Node versions
const fetch = global.fetch;
const { clipboard, nativeImage } = require('electron');

// --- Configuration ---
// Ensure API key is handled securely (e.g., environment variable)
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // Use environment variable ONLY
});

if (!process.env.OPENAI_API_KEY) {
     console.error("FATAL: OPENAI_API_KEY environment variable not set.");
     // Consider exiting the app or disabling AI features
     // require('electron').app.quit();
}


// --- Helper Functions ---
function sanitizeAiName(aiName) {
    return aiName.toLowerCase().replace(/[^a-z0-9]/gi, '_');
}

function getPersonaFolderPath(aiName, vaultPath) {
     if (!aiName) throw new Error("AI name cannot be empty for path generation.");
     return path.join(vaultPath, sanitizeAiName(aiName));
}

async function ensureDirectoryExists(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
        console.error(`Error ensuring directory exists at ${dirPath}:`, error);
        throw error; // Re-throw to indicate failure
    }
}

async function readFileSafe(filePath, defaultContent = '') {
    try {
        return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
        if (error.code === 'ENOENT') {
            return defaultContent; // File not found, return default
        }
        console.error(`Error reading file ${filePath}:`, error);
        throw error; // Re-throw other errors
    }
}

// --- File System Services ---

async function loadPersonaContent(aiName, vaultPath) {
    const folder = getPersonaFolderPath(aiName, vaultPath);
    const [prePrompt, memoryPrompt, memory, conversations] = await Promise.all([
        readFileSafe(path.join(folder, 'Pre-Prompt.md'), 'Respond as appropriate.'),
        readFileSafe(path.join(folder, 'Memory-Prompt.md'), 'Generate a concise memory summary.'),
        readFileSafe(path.join(folder, 'Memory.md'), '# Memory\n\n## Key Insights\n- None yet\n## Tasks To-Do\n- None yet'),
        readFileSafe(path.join(folder, 'Stored Conversations.md'), '')
    ]);
    return { prePrompt, memoryPrompt, memory, conversations };
}

async function loadPersonaEntries(aiName, vaultPath) {
    const folder = getPersonaFolderPath(aiName, vaultPath);
    const filePath = path.join(folder, 'Stored Conversations.md');
    try {
        const content = await readFileSafe(filePath, '');
        const lines = content.split('\n')
            .map(line => line.trim())
            // Filter for lines starting with known prefixes
            .filter(line => line.startsWith('- You:') || line.startsWith(`- ${aiName}:`) || line.startsWith('- Error:'))
            .map(line => ({
                content: line.substring(2).trim(), // Remove '- '
                // timestamp: new Date().toISOString() // Could parse timestamp if stored in file
            }));
        return lines;
    } catch (err) {
        console.error(`Error loading entries for ${aiName}:`, err);
        // Return error entry for UI display
        return [{ content: `Error: Could not load conversations. ${err.message}` }];
    }
}

async function savePersonaFileContent(aiName, fileName, content, vaultPath) {
    const folder = getPersonaFolderPath(aiName, vaultPath);
    await ensureDirectoryExists(folder);
    const filePath = path.join(folder, fileName);
    await fs.writeFile(filePath, content, 'utf-8');
    console.log(`Saved ${fileName} for ${aiName}`);
}

async function appendToConversation(aiName, userContent, aiContent, vaultPath, isError = false) {
    const folder = getPersonaFolderPath(aiName, vaultPath);
    await ensureDirectoryExists(folder);
    const filePath = path.join(folder, 'Stored Conversations.md');

    const today = new Date().toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    let fileContentToAppend = '';

    // Read existing content to check for today's header
    const existingConversations = await readFileSafe(filePath, '');
    if (!existingConversations.includes(`## ${today}`)) {
        fileContentToAppend += (existingConversations.trim() ? '\n\n' : '') + `## ${today}\n\n`;
    }

    // Append user message only if it's not an error entry being logged
    if (!isError) {
         fileContentToAppend += `- You: ${userContent}\n`;
    }
    // Append AI message or Error message
    fileContentToAppend += isError
        ? `- Error: ${aiContent} (${new Date().toLocaleTimeString()})\n\n` // Add timestamp to errors
        : `- ${aiName}: ${aiContent}\n\n`; // Add extra newline for spacing

    await fs.appendFile(filePath, fileContentToAppend, 'utf-8');
    console.log(`Appended conversation entry for ${aiName}`);
}

async function saveNewPersona(personaData, vaultPath, baseDir) {
    const { name, description, prePrompt, icon } = personaData;
    if (!name || !description || !prePrompt || !icon || !icon.data) {
        throw new Error("Incomplete persona data provided.");
    }
    const sanitizedName = sanitizeAiName(name);
    const folder = getPersonaFolderPath(name, vaultPath); // Use original name for folder path function
    const iconDir = path.join(baseDir, 'images'); // Base dir of main.js
    const iconPath = path.join(iconDir, `${sanitizedName}.png`);

    await ensureDirectoryExists(folder);
    await ensureDirectoryExists(iconDir);

    // Save Pre-Prompt
    await savePersonaFileContent(name, 'Pre-Prompt.md', prePrompt, vaultPath);
    // Optionally save default Memory/Memory-Prompt files here too

    // Save Icon
    const base64Data = icon.data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(iconPath, buffer);

    console.log(`Persona ${name} created successfully at ${folder} with icon at ${iconPath}`);
    return {
        message: "Persona created",
        // Data needed by renderer to update the list
        personaMeta: {
            name,
            description,
            imgBase: `images/${sanitizedName}` // Relative base path for renderer
        }
    };
}


// --- Deck Services ---

async function loadDecks(decksPath) {
    let decks = {};
    try {
        const files = await fs.readdir(decksPath);
        const deckFiles = files.filter(file => file.endsWith('.json'));
        for (const file of deckFiles) {
            const deckName = file.replace('.json', '');
            try {
                const content = await fs.readFile(path.join(decksPath, file), 'utf-8');
                decks[deckName] = JSON.parse(content);
            } catch (parseError) {
                console.error(`Error parsing deck file ${file}:`, parseError);
                // Skip invalid deck file
            }
        }
        console.log('Decks loaded:', Object.keys(decks));
    } catch (err) {
        // Ignore ENOENT (directory not found), otherwise log error
        if (err.code !== 'ENOENT') {
            console.error('Error loading decks:', err);
        }
    }
    return decks;
}

async function loadSpecificDeck(deckName, decksPath) {
     const filePath = path.join(decksPath, `${deckName}.json`);
     try {
         const content = await fs.readFile(filePath, 'utf-8');
         return JSON.parse(content);
     } catch (error) {
         if (error.code === 'ENOENT') {
              console.warn(`Deck file not found: ${filePath}`);
              return null; // Indicate not found
         }
         console.error(`Error loading specific deck ${deckName}:`, error);
         throw error; // Re-throw other errors
     }
}


async function saveDeck(deckName, displaysData, decksPath) {
    if (!deckName || !displaysData) throw new Error("Deck name and display data required.");
    const filePath = path.join(decksPath, `${deckName}.json`);
    await ensureDirectoryExists(decksPath);
    await fs.writeFile(filePath, JSON.stringify(displaysData, null, 2), 'utf-8');
    console.log(`Deck ${deckName} saved successfully.`);
}

// --- Status Service ---

async function getPersonaStatus(aiName, vaultPath) {
    const folder = getPersonaFolderPath(aiName, vaultPath);
    const filePath = path.join(folder, 'Stored Conversations.md');
    let stats = { convCount: 0, lastInteraction: null };
    try {
        const fileStats = await fs.stat(filePath);
        const content = await readFileSafe(filePath, '');
        // Simple line count for AI responses might be inaccurate, but good estimate
        const lines = content.split('\n').filter(line => line.trim().startsWith(`- ${aiName}:`));
        stats.convCount = lines.length;
        stats.lastInteraction = fileStats.mtime.toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true
        });
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error(`Error getting status for ${aiName}:`, err.message);
        } // Ignore file not found, stats remain 0/null
    }
    return stats;
}

// --- OpenAI & Image Services ---

async function getOpenAIChatResponse(aiName, userContent, vaultPath) {
    if (!openai.apiKey) throw new Error("OpenAI API key is not configured.");

    const folder = getPersonaFolderPath(aiName, vaultPath);
    // Read necessary context files
    const prePrompt = await readFileSafe(path.join(folder, 'Pre-Prompt.md'), 'Respond as appropriate.');
    const memory = await readFileSafe(path.join(folder, 'Memory.md'), '');
    const conversations = await readFileSafe(path.join(folder, 'Stored Conversations.md'), '');

    const lines = conversations.split('\n').filter(line => line.trim().startsWith('- '));
    // Get last 7 turns (14 lines: 7 user, 7 AI)
    const recentChatLines = lines.slice(-14);
    const recentChatsStr = recentChatLines.join('\n') || 'No recent conversations found.';

    const systemMessage = `You are ${aiName}. ${prePrompt} Respond concisely within 400 characters unless generating an image or program. For image requests, use format [IMAGE <display_num>: <prompt>]. For web content, use [DISPLAY <display_num>: <url>]. For programs, use [PROGRAM <display_num>: <type>].\n\nCURRENT MEMORY:\n${memory}\n\nRECENT CHAT HISTORY (up to last 7 turns):\n${recentChatsStr}`;

    console.log("--- Sending Prompt to OpenAI ---");
    console.log("System:", systemMessage); // Be careful logging sensitive data if memory contains it
    console.log("User:", userContent);
    console.log("-------------------------------");

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o', // Or your preferred model
            messages: [
                { role: 'system', content: systemMessage },
                { role: 'user', content: userContent }
            ],
            max_tokens: 150, // Adjust as needed
            temperature: 0.7
        });

        const aiResponse = response.choices[0]?.message?.content?.trim() || 'AI did not provide a response.';
        console.log("AI Raw Response:", aiResponse);
        return aiResponse;

    } catch (error) {
         console.error('OpenAI API Error:', error.response ? error.response.data : error.message);
         throw new Error(`OpenAI API request failed: ${error.message}`); // Throw a more specific error
    }
}

async function generateOpenAIImage(prompt) {
     if (!openai.apiKey) throw new Error("OpenAI API key is not configured.");
     console.log(`Generating image with prompt: ${prompt}`);
     try {
         const imageResponse = await openai.images.generate({
             model: 'dall-e-3',
             prompt: prompt,
             n: 1,
             size: '1792x1024', // DALL-E 3 size for 16:9 aspect ratio
             response_format: 'url' // Get URL to download from
         });
         const imageUrl = imageResponse.data[0]?.url;
         if (!imageUrl) throw new Error("Image generation succeeded but no URL was returned.");
         console.log("Generated Image URL:", imageUrl);
         return imageUrl;
     } catch (error) {
          console.error('OpenAI Image Generation Error:', error.response ? error.response.data : error.message);
          throw new Error(`OpenAI image generation failed: ${error.message}`);
     }
}

async function downloadAndProcessImage(imageUrl, savePath) {
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
        // Use arrayBuffer() with the native fetch API
        const arrayBuffer = await response.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);

        // Define target dimensions (16:9 within common display sizes)
        const targetWidth = 1920; // Full HD target, adjust as needed
        const targetHeight = 1080;

        // Resize to fit within target, maintain aspect ratio, add black padding
        await sharp(imageBuffer)
             .resize(targetWidth, targetHeight, {
                 fit: 'contain', // Fit entirely within dimensions
                 background: { r: 0, g: 0, b: 0, alpha: 1 } // Black background
             })
             .png() // Ensure output is PNG
             .toFile(savePath);

        console.log(`Image downloaded and processed successfully to: ${savePath}`);
        return savePath;
    } catch (error) {
         console.error('Error downloading or processing image:', error);
         throw new Error(`Image processing failed: ${error.message}`);
    }
}

async function processAIResponseCommands(aiResponse, aiName, vaultPath, baseDir) {
     const displayMatch = aiResponse.match(/\[DISPLAY (\d+): (.+?)\]/);
     const imageMatch = aiResponse.match(/\[IMAGE (\d+): (.+?)\]/);
     const programMatch = aiResponse.match(/\[PROGRAM (\d+): (.+?)\]/);

     let chatResponse = aiResponse; // Default to original response
     let action = 'none';
     let resultData = {};

     if (displayMatch) {
         const displayNum = displayMatch[1];
         const url = displayMatch[2].trim();
         action = 'load-display';
         resultData = { displayId: `display${displayNum}`, url };
         // Modify chat response
         chatResponse = `${aiName === 'Engineer AI' ? 'Deployed' : 'Showing'} web content in Display ${displayNum}.`;
         console.log(`Command: Load Display ${displayNum} with URL ${url}`);
     } else if (imageMatch) {
         const displayNum = imageMatch[1];
         const imagePrompt = imageMatch[2].trim();
         action = 'load-image'; // Final action is load-image
         const displayId = `display${displayNum}`;
         resultData = { displayId, action: 'start-loading' }; // Initial action: start loading UI

         try {
             const imageUrl = await generateOpenAIImage(imagePrompt);
             const imageFileName = `generated-image-${Date.now()}.png`;
             const folder = getPersonaFolderPath(aiName, vaultPath);
             await ensureDirectoryExists(folder); // Ensure persona folder exists
             const savePath = path.join(folder, imageFileName);

             await downloadAndProcessImage(imageUrl, savePath);

             // Update result data for the final action
             resultData = { displayId, imagePath: savePath };
             chatResponse = `${aiName === 'Engineer AI' ? 'Engineered' : 'Generated'} image in Display ${displayNum}.`;
             console.log(`Command: Generated Image ${displayNum} for prompt: ${imagePrompt}`);

         } catch (imageError) {
              console.error("Image generation/processing failed:", imageError);
              chatResponse = `Sorry, I couldn't generate the image for Display ${displayNum}. ${imageError.message}`;
              action = 'error'; // Mark action as error
              resultData = { displayId, action: 'stop-loading' }; // Stop loading indicator on error
         }

     } else if (programMatch) {
         const displayNum = programMatch[1];
         const programType = programMatch[2].trim();
         action = 'load-display'; // Assume program loading uses the display action
         const displayId = `display${displayNum}`;

         if (programType === 'persona-creator') {
             const programPath = path.join(baseDir, 'programs', 'persona-creator.html');
             // Check existence (async is better, but sync is simpler here)
             try {
                  await fs.access(programPath); // Check if file exists and is readable
                  resultData = { displayId, url: `file://${programPath}` };
                  chatResponse = `Loading Persona Creator in Display ${displayNum}.`;
                  console.log(`Command: Load Program ${programType} in Display ${displayNum}`);
             } catch (err) {
                  console.error(`Program file not found: ${programPath}`);
                  chatResponse = `Error: Program file '${programType}' not found.`;
                  action = 'error';
                  resultData = { displayId };
             }
         } else {
             chatResponse = `Program type '${programType}' is not recognized.`;
             action = 'error';
             resultData = { displayId };
             console.warn(`Command: Unknown Program type ${programType}`);
         }
     }

     return {
         action, // 'none', 'load-display', 'load-image', 'error', 'start-loading'
         chatResponse, // The text to display in the chat log
         ...resultData // Contains displayId, url/imagePath etc. based on action
     };
}

// --- Auto-Population Services ---

async function generateAutoPrePrompt(aiName, vaultPath) {
     if (!openai.apiKey) throw new Error("OpenAI API key is not configured.");
     const folder = getPersonaFolderPath(aiName, vaultPath);
     const convPath = path.join(folder, 'Stored Conversations.md');
     const convContent = await readFileSafe(convPath, '');

     if (!convContent.trim()) {
         throw new Error(`No conversations found for ${aiName} to generate pre-prompt.`);
     }

     // Use a recent portion of conversations
     const recentConversations = convContent.slice(-2000);
     const prompt = `Analyze the following conversation excerpts involving '${aiName}'. Generate a concise (max 150 characters), insightful pre-prompt that captures the core function or style of '${aiName}' based *only* on these conversations. Output *only* the pre-prompt text itself, without any introduction or explanation.\n\nCONVERSATIONS (recent portion):\n${recentConversations}`;

     try {
         const response = await openai.chat.completions.create({
             model: 'gpt-3.5-turbo', // Cheaper/faster model for summarization
             messages: [{ role: 'user', content: prompt }],
             max_tokens: 50,
             temperature: 0.5
         });
         const generatedPrePrompt = response.choices[0]?.message?.content?.trim();
         if (!generatedPrePrompt) throw new Error("AI failed to generate pre-prompt.");
         console.log(`Auto-generated pre-prompt for ${aiName}: ${generatedPrePrompt}`);
         return generatedPrePrompt;
     } catch (error) {
          console.error('OpenAI Error during auto pre-prompt generation:', error.response ? error.response.data : error.message);
          throw new Error(`OpenAI request failed during pre-prompt generation: ${error.message}`);
     }
}


async function updatePersonaMemory(aiName, vaultPath) {
     if (!openai.apiKey) throw new Error("OpenAI API key is not configured.");
     const folder = getPersonaFolderPath(aiName, vaultPath);
     const convPath = path.join(folder, 'Stored Conversations.md');
     const memoryPromptPath = path.join(folder, 'Memory-Prompt.md');
     const memoryPath = path.join(folder, 'Memory.md');

     const convContent = await readFileSafe(convPath, '');
     const memoryPrompt = await readFileSafe(memoryPromptPath, 'Summarize the key points, open questions, and action items from the conversation history provided below. Format using Markdown headings (e.g., ## Key Insights, ## Open Questions, ## Action Items). Be concise.');

     if (!convContent.trim()) {
         console.log(`No conversations found for ${aiName}, writing default memory.`);
         const defaultMemory = '# Memory\n\n## Key Insights\n- None yet\n\n## Open Questions\n- None yet\n\n## Action Items\n- None yet';
         await fs.writeFile(memoryPath, defaultMemory, 'utf-8');
         return defaultMemory; // Return default memory content
     }

     // Use a larger recent portion for memory update
     const recentConversations = convContent.slice(-4000);
     const prompt = `${memoryPrompt}\n\nCONVERSATION HISTORY (recent portion):\n${recentConversations}`;

     try {
         const response = await openai.chat.completions.create({
             model: 'gpt-4o', // Use a capable model for summarization
             messages: [{ role: 'user', content: prompt }],
             temperature: 0.3 // Lower temp for more factual summary
         });
         const memoryContent = response.choices[0]?.message?.content?.trim();
         if (!memoryContent) throw new Error("AI failed to generate memory summary.");

         await fs.writeFile(memoryPath, memoryContent, 'utf-8');
         console.log(`Memory updated for ${aiName}`);
         return memoryContent; // Return the new memory content

     } catch (error) {
          console.error('OpenAI Error during memory update:', error.response ? error.response.data : error.message);
          throw new Error(`OpenAI request failed during memory update: ${error.message}`);
     }
}

// --- Clipboard Service ---
async function copyImageToClipboard(imagePath) {
    try {
        // Check if file exists first (fs.access is async)
        await fs.access(imagePath);
        const image = nativeImage.createFromPath(imagePath);
        if (image.isEmpty()) {
            throw new Error(`Failed to create nativeImage from path: ${imagePath}`);
        }
        clipboard.writeImage(image);
        console.log(`Image copied to clipboard from: ${imagePath}`);
    } catch (error) {
        console.error('Error copying image to clipboard:', error);
        throw new Error(`Failed to copy image: ${error.message}`); // Re-throw for handler
    }
}


// --- Exports ---
module.exports = {
    loadPersonaContent,
    loadPersonaEntries,
    savePersonaFileContent,
    appendToConversation,
    saveNewPersona,
    loadDecks,
    loadSpecificDeck,
    saveDeck,
    getPersonaStatus,
    getOpenAIChatResponse,
    processAIResponseCommands, // Handles calling image gen/processing internally
    generateAutoPrePrompt,
    updatePersonaMemory,
    copyImageToClipboard,
};