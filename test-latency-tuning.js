// Latency tuning test script
const { MEMORY_CONFIG } = require('./config/memory');

console.log('=== Latency Budget & Chunk Size Tuning Test ===\n');

// Test different chunk sizes
const testSizes = MEMORY_CONFIG.CHUNK_SIZE_OPTIONS;
const sampleText = "This is a sample text that will be used to test different chunk sizes for optimal time-to-first-audio performance. The goal is to find the best balance between low latency and smooth playback.";

console.log('Testing chunk sizes:', testSizes);
console.log('Target TTFA:', MEMORY_CONFIG.TARGET_TTFA, 'ms');
console.log('Max Response Time:', MEMORY_CONFIG.MAX_RESPONSE_TIME, 'ms\n');

// Simulate different chunk sizes
testSizes.forEach(chunkSize => {
    console.log(`\nChunk Size: ${chunkSize} characters`);
    console.log('------------------------');
    
    // Calculate chunks
    const numChunks = Math.ceil(sampleText.length / chunkSize);
    console.log(`Number of chunks: ${numChunks}`);
    
    // Simulate TTS time (150ms base + 2ms per character)
    const ttsTimePerChunk = 150 + (chunkSize * 2);
    console.log(`Est. TTS time per chunk: ${ttsTimePerChunk}ms`);
    
    // Calculate TTFA (time to synthesize first chunk)
    const ttfa = ttsTimePerChunk;
    const meetsTarget = ttfa <= MEMORY_CONFIG.TARGET_TTFA;
    console.log(`Est. TTFA: ${ttfa}ms ${meetsTarget ? '✓ MEETS TARGET' : '✗ EXCEEDS TARGET'}`);
    
    // Calculate total time
    const totalTime = ttsTimePerChunk * numChunks;
    const withinBudget = totalTime <= MEMORY_CONFIG.MAX_RESPONSE_TIME;
    console.log(`Est. Total time: ${totalTime}ms ${withinBudget ? '✓ WITHIN BUDGET' : '✗ EXCEEDS BUDGET'}`);
    
    // Rate the configuration
    let rating = 0;
    if (meetsTarget) rating += 2;
    if (withinBudget) rating += 1;
    if (chunkSize >= 120 && chunkSize <= 200) rating += 1; // Prefer middle range
    
    console.log(`Rating: ${'★'.repeat(rating)}${'☆'.repeat(4 - rating)}`);
});

// Recommend optimal chunk size
console.log('\n=== RECOMMENDATION ===');
console.log(`Current setting: ${MEMORY_CONFIG.STREAM_CHARS_PER_CHUNK} chars/chunk`);

// Simple scoring based on latency targets
const optimalSize = testSizes.find(size => {
    const ttsTime = 150 + (size * 2);
    return ttsTime <= MEMORY_CONFIG.TARGET_TTFA && size >= 120;
}) || 160;

console.log(`Recommended: ${optimalSize} chars/chunk`);
console.log('\nTo apply: Set STREAM_CHARS_PER_CHUNK=${optimalSize} in .env or use diagnostics panel');

// Test with current config
console.log('\n=== CURRENT CONFIGURATION TEST ===');
const currentChunkSize = MEMORY_CONFIG.STREAM_CHARS_PER_CHUNK;
const currentTTFA = 150 + (currentChunkSize * 2);
const currentChunks = Math.ceil(500 / currentChunkSize); // Assuming 500 char response
const currentTotal = currentTTFA * currentChunks;

console.log(`Chunk size: ${currentChunkSize} characters`);
console.log(`Expected TTFA: ${currentTTFA}ms`);
console.log(`Expected chunks for 500 char response: ${currentChunks}`);
console.log(`Expected total time: ${currentTotal}ms`);

if (currentTTFA <= MEMORY_CONFIG.TARGET_TTFA) {
    console.log('✅ Configuration meets TTFA target');
} else {
    console.log(`⚠️ TTFA exceeds target by ${currentTTFA - MEMORY_CONFIG.TARGET_TTFA}ms`);
    console.log(`   Consider reducing STREAM_CHARS_PER_CHUNK to ${optimalSize}`);
}

console.log('\n✓ Latency tuning test complete!');
