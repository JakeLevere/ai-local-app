# Speed Optimization Guide

## Current Bottlenecks

1. **Model Choice**: Using `gpt-4o` (slower but smarter)
2. **Embedding Generation**: Every message generates embeddings for memory
3. **Memory Retrieval**: Searching through all memories on each request
4. **Sequential Processing**: Text → TTS happens sequentially
5. **No Real Streaming**: Simulated streaming with delays

## Immediate Optimizations

### 1. Switch to Faster Model for Casual Chat
```javascript
// In aiService.js, create a fast response option
async function getChatResponseFast(identifier, messages, vaultPath) {
    // ... existing setup ...
    
    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini', // MUCH faster, still very capable
        messages: finalMessages,
        max_tokens: 300,      // Shorter responses = faster
        temperature: 0.7,
        stream: true          // Enable real streaming
    });
    
    // Handle streaming response
    for await (const chunk of response) {
        // Process chunks immediately
    }
}
```

### 2. Implement Real OpenAI Streaming
Replace the simulated streaming with actual OpenAI streaming:

```javascript
async function getChatResponseStreaming(message, personaId, onChunk, signal) {
    await initializeOpenAI();
    
    const messages = await buildAugmentedPrompt(personaId, message, ...);
    
    const stream = await openai.chat.completions.create({
        model: 'gpt-4o-mini',  // Use faster model
        messages: messages,
        max_tokens: 300,
        temperature: 0.7,
        stream: true           // Real streaming
    });
    
    let buffer = '';
    for await (const chunk of stream) {
        if (signal?.aborted) break;
        
        const delta = chunk.choices[0]?.delta?.content || '';
        buffer += delta;
        
        // Send complete sentences immediately for TTS
        if (buffer.match(/[.!?]\s/)) {
            await onChunk(buffer.trim());
            buffer = '';
        }
    }
    
    if (buffer) await onChunk(buffer.trim());
}
```

### 3. Parallel TTS Processing
Start TTS as soon as first sentence arrives:

```javascript
// In your main handler
async function handleChatWithVoice(message, personaId) {
    const ttsQueue = [];
    let audioPlaying = false;
    
    // Start streaming text response
    getChatResponseStreaming(message, personaId, async (chunk) => {
        // Queue TTS immediately
        ttsQueue.push(generateTTS(chunk));
        
        // Play audio as soon as available
        if (!audioPlaying) {
            audioPlaying = true;
            processAudioQueue(ttsQueue);
        }
    });
}
```

### 4. Conditional Memory Operations
Skip expensive operations for simple queries:

```javascript
async function shouldUseFullMemory(userMessage) {
    // Quick heuristics - no embeddings needed
    const simpleQueries = ['hello', 'hi', 'thanks', 'bye', 'ok', 'yes', 'no'];
    const isSimple = simpleQueries.some(q => 
        userMessage.toLowerCase().includes(q) && userMessage.length < 20
    );
    
    return !isSimple;
}

async function getChatResponseOptimized(identifier, userMessage, personaData, vaultPath) {
    const useMemory = await shouldUseFullMemory(userMessage);
    
    if (!useMemory) {
        // Skip embeddings and memory retrieval for simple messages
        return getChatResponseFast(identifier, userMessage, vaultPath);
    }
    
    // Full memory-enhanced response for complex queries
    return getChatResponseWithRAG(identifier, userMessage, personaData, vaultPath);
}
```

### 5. Cache Embeddings
Avoid recomputing embeddings for the same content:

```javascript
// Simple in-memory cache
const embeddingCache = new Map();
const CACHE_SIZE = 100;

async function computeEmbeddingCached(text) {
    // Create cache key
    const key = crypto.createHash('md5').update(text).digest('hex');
    
    if (embeddingCache.has(key)) {
        return embeddingCache.get(key);
    }
    
    const embedding = await computeEmbedding(text);
    
    // Maintain cache size
    if (embeddingCache.size >= CACHE_SIZE) {
        const firstKey = embeddingCache.keys().next().value;
        embeddingCache.delete(firstKey);
    }
    
    embeddingCache.set(key, embedding);
    return embedding;
}
```

### 6. Reduce Token Usage
Optimize prompt size for faster responses:

```javascript
// In buildAugmentedPrompt
const MAX_CONTEXT_ITEMS = 2;  // Reduce from 3
const MAX_HISTORY_MESSAGES = 6;  // Reduce from 10

// Only include most relevant context
const topRelevant = retrievedMidTerm
    .filter(item => item.relevanceScore > 0.7)  // Higher threshold
    .slice(0, MAX_CONTEXT_ITEMS);
```

## Quick Implementation Script

Here's a script to apply the key optimizations:

```javascript
// optimize-speed.js
const fs = require('fs').promises;
const path = require('path');

async function applySpeedOptimizations() {
    const aiServicePath = path.join(__dirname, 'aiService.js');
    let content = await fs.readFile(aiServicePath, 'utf-8');
    
    // 1. Add model selection based on message complexity
    const modelSelection = `
    // Determine model based on query complexity
    const selectModel = (message) => {
        const simplePatterns = /^(hi|hello|thanks|bye|ok|yes|no|sure)\\b/i;
        const isSimple = simplePatterns.test(message) || message.length < 30;
        return isSimple ? 'gpt-4o-mini' : 'gpt-4o';
    };`;
    
    // 2. Replace model in chat completions
    content = content.replace(
        "model: 'gpt-4o',",
        "model: selectModel(userMessage || messages[0]?.content || ''),"
    );
    
    // 3. Reduce max tokens for faster responses
    content = content.replace(
        "max_tokens: 500,",
        "max_tokens: 300,"
    );
    
    // 4. Add streaming flag
    content = content.replace(
        "temperature: 0.7\n    });",
        "temperature: 0.7,\n        stream: false // TODO: Implement streaming\n    });"
    );
    
    await fs.writeFile(aiServicePath, content, 'utf-8');
    console.log('✅ Speed optimizations applied!');
}

applySpeedOptimizations();
```

## Performance Targets

After optimization:
- **Simple queries**: < 1 second response time
- **Complex queries with memory**: < 2 seconds
- **Time to first audio**: < 1.5 seconds
- **Complete audio response**: < 3 seconds

## Testing Performance

```javascript
// test-performance.js
async function measureResponseTime() {
    const start = Date.now();
    
    // Test simple query
    const response = await getChatResponse('test', 'Hello!', vaultPath);
    
    const elapsed = Date.now() - start;
    console.log(`Response time: ${elapsed}ms`);
    
    return elapsed;
}

// Run multiple tests
async function benchmark() {
    const times = [];
    for (let i = 0; i < 10; i++) {
        times.push(await measureResponseTime());
    }
    
    const avg = times.reduce((a, b) => a + b) / times.length;
    console.log(`Average response time: ${avg}ms`);
}
```

## Additional Optimizations

### Pre-warm Connections
```javascript
// On app start
async function prewarm() {
    await initializeOpenAI();
    await openai.models.list(); // Pre-establish connection
}
```

### Batch Memory Updates
```javascript
// Process memory updates asynchronously after response
async function respondThenProcess(message, personaId) {
    // 1. Get and send response immediately
    const response = await getChatResponseFast(personaId, message);
    sendToUser(response);
    
    // 2. Process memory in background
    setImmediate(async () => {
        await processMidTermMemory(personaData, recentMessages);
    });
}
```

### Use Edge Functions for Embeddings
Consider using a local embedding model to eliminate API latency:
```bash
npm install @xenova/transformers
```

```javascript
// Use local embeddings
const { pipeline } = require('@xenova/transformers');
const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

async function computeEmbeddingLocal(text) {
    const output = await embedder(text);
    return Array.from(output.data);
}
```

## Monitoring

Add performance tracking:
```javascript
// Track response times
const metrics = {
    responseTimes: [],
    
    track(operation, time) {
        this.responseTimes.push({ operation, time, timestamp: Date.now() });
        if (this.responseTimes.length > 100) {
            this.responseTimes.shift();
        }
    },
    
    getAverage(operation) {
        const times = this.responseTimes
            .filter(m => m.operation === operation)
            .map(m => m.time);
        return times.reduce((a, b) => a + b, 0) / times.length;
    }
};

// Wrap functions with timing
async function timedOperation(name, fn) {
    const start = Date.now();
    const result = await fn();
    metrics.track(name, Date.now() - start);
    return result;
}
```

## Priority Implementation Order

1. **Switch to gpt-4o-mini for simple queries** (Biggest impact)
2. **Implement real streaming** (Better perceived speed)
3. **Cache embeddings** (Reduce API calls)
4. **Parallel TTS processing** (Faster voice responses)
5. **Reduce context size** (Smaller prompts)
6. **Batch memory updates** (Background processing)

Each optimization can reduce response time by 20-50%, with cumulative improvements bringing total response time down by 60-80%.
