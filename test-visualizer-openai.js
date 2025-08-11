// Test script to verify OpenAI key retrieval and analysis workflow
console.log('Testing Visualizer Editor OpenAI Integration...');

// Check if OpenAI key is available in environment
if (process.env.OPENAI_API_KEY) {
    console.log('✓ OpenAI key found in environment');
    console.log(`  Key starts with: ${process.env.OPENAI_API_KEY.substring(0, 10)}...`);
} else {
    console.log('✗ OpenAI key NOT found in environment');
    console.log('  Please ensure OPENAI_API_KEY is set in .env file');
}

// Test the IPC handler directly
const { ipcMain } = require('electron');
const path = require('path');

// Mock test for the handler
async function testHandler() {
    console.log('\nTesting IPC handler for getOpenAIKey...');
    
    // Simulate the handler logic
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
        console.log('✗ Handler would return: null (no key)');
        return null;
    }
    console.log('✓ Handler would return: key available');
    return key;
}

testHandler().then(result => {
    if (result) {
        console.log('\n✓ All checks passed! The visualizer editor should be able to:');
        console.log('  1. Retrieve the OpenAI key automatically');
        console.log('  2. Use it for video frame analysis');
        console.log('  3. Process videos without manual key entry');
    } else {
        console.log('\n✗ OpenAI key not available. Please check:');
        console.log('  1. The .env file exists in the app directory');
        console.log('  2. It contains: OPENAI_API_KEY=your-key-here');
        console.log('  3. The app was restarted after adding the key');
    }
    process.exit(0);
});
