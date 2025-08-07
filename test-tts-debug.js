// TTS Debug Test Script
require('dotenv').config();
const ttsService = require('./services/ttsService');
const path = require('path');
const fs = require('fs').promises;

async function debugTTS() {
    console.log('=== TTS Debug Test ===\n');
    
    // Check environment variables
    console.log('1. Environment Check:');
    console.log(`   ELEVENLABS_API_KEY: ${process.env.ELEVENLABS_API_KEY ? 'Set (' + process.env.ELEVENLABS_API_KEY.substring(0, 10) + '...)' : 'NOT SET'}`);
    console.log(`   ELEVENLABS_DEFAULT_VOICE_ID: ${process.env.ELEVENLABS_DEFAULT_VOICE_ID || 'NOT SET'}\n`);
    
    // Initialize TTS service
    console.log('2. Initializing TTS Service...');
    await ttsService.initialize();
    console.log(`   Provider: ${ttsService.currentProvider}`);
    console.log(`   Voice ID: ${ttsService.voiceSettings.voiceId}`);
    console.log(`   Voice Name: ${ttsService.voiceSettings.voiceName}\n`);
    
    // Test connection
    console.log('3. Testing TTS Connection...');
    const testResult = await ttsService.testConnection();
    console.log(`   Result:`, testResult, '\n');
    
    // Try to speak a test phrase
    console.log('4. Testing Speech Generation...');
    const testText = "Hello! This is a test of the text-to-speech system. The persona should speak automatically when responding.";
    
    try {
        const result = await ttsService.speak(testText);
        console.log('   Speech Result:', result);
        
        if (result.filepath) {
            // Check if file exists
            try {
                const stats = await fs.stat(result.filepath);
                console.log(`   Audio file created: ${result.filepath}`);
                console.log(`   File size: ${stats.size} bytes`);
                
                // Clean up test file
                await fs.unlink(result.filepath);
                console.log('   Test file cleaned up');
            } catch (err) {
                console.error('   Error checking audio file:', err.message);
            }
        }
    } catch (error) {
        console.error('   Speech generation failed:', error);
    }
    
    console.log('\n5. Voice Settings:');
    console.log(`   Available voices:`, ttsService.getAvailableVoices());
    
    // Test with a different voice
    console.log('\n6. Testing Voice Change...');
    ttsService.setVoice('drew');
    console.log(`   Changed voice to: ${ttsService.voiceSettings.voiceName}`);
    
    try {
        const result2 = await ttsService.speak("Testing with a different voice.");
        console.log('   Speech Result with Drew:', result2);
        
        if (result2.filepath) {
            await fs.unlink(result2.filepath);
            console.log('   Test file cleaned up');
        }
    } catch (error) {
        console.error('   Speech generation failed:', error);
    }
    
    console.log('\n=== Debug Test Complete ===');
}

// Run the debug test
debugTTS().catch(console.error);
