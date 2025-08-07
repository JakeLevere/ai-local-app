// Test script to verify TTS auto-play functionality
const { ipcMain } = require('electron');

// Mock test to simulate what happens when an AI response is generated
async function testTTSAutoPlay() {
    console.log('\n=== Testing TTS Auto-Play ===\n');
    
    // Test message
    const testMessage = "Hello! This is a test of the automatic text-to-speech system.";
    
    try {
        // Load TTS service
        const ttsService = require('./services/ttsService');
        
        console.log('1. Generating TTS for test message...');
        const ttsResult = await ttsService.speak(testMessage);
        
        console.log('2. TTS Result:', JSON.stringify(ttsResult, null, 2));
        
        if (ttsResult.provider === 'elevenlabs' && ttsResult.filepath) {
            console.log('3. ElevenLabs TTS generated successfully');
            console.log('   File path:', ttsResult.filepath);
            
            // Check if file exists
            const fs = require('fs').promises;
            try {
                const stats = await fs.stat(ttsResult.filepath);
                console.log('   File size:', stats.size, 'bytes');
            } catch (err) {
                console.log('   WARNING: File does not exist!');
            }
        } else if (ttsResult.provider === 'browser') {
            console.log('3. Browser TTS fallback will be used');
            console.log('   Text:', ttsResult.text);
        }
        
        console.log('\n4. In normal operation, this would trigger:');
        console.log('   sendToRenderer("auto-play-tts", ttsResult)');
        console.log('\n5. The renderer should then:');
        console.log('   - Receive the auto-play-tts event');
        console.log('   - Check if autoSpeak is enabled (should be true by default)');
        console.log('   - Play the audio automatically');
        
    } catch (error) {
        console.error('ERROR:', error.message);
        console.error('Stack:', error.stack);
    }
    
    console.log('\n=== Test Complete ===\n');
}

// Run the test
testTTSAutoPlay();
