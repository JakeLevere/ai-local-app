// TTS smoke test script
const fs = require('fs').promises;
const path = require('path');

// Load environment variables
require('dotenv').config();

// Import TTS service
const tts = require('../services/tts');

async function testTTS() {
    const text = process.argv[2] || "Hello from Jinx! This is a test of the ElevenLabs text-to-speech system.";
    const outputFile = path.join(__dirname, '..', 'out.mp3');
    
    console.log('=== TTS Smoke Test ===\n');
    console.log(`Text: "${text}"`);
    console.log(`Output: ${outputFile}`);
    
    try {
        // Check for API key
        if (!process.env.ELEVEN_API_KEY) {
            console.error('\n❌ Error: ELEVEN_API_KEY not found in environment');
            console.log('\nPlease create a .env file with:');
            console.log('ELEVEN_API_KEY=your_api_key_here');
            console.log('ELEVEN_VOICE_ID=your_voice_id_here');
            process.exit(1);
        }
        
        console.log('\nSynthesizing speech...');
        const startTime = Date.now();
        
        // Call TTS service
        const audioBuffer = await tts.synthesize(text, process.env.ELEVEN_VOICE_ID);
        
        const duration = Date.now() - startTime;
        console.log(`✓ Synthesis completed in ${duration}ms`);
        console.log(`✓ Audio size: ${(audioBuffer.length / 1024).toFixed(2)} KB`);
        
        // Write to file
        await fs.writeFile(outputFile, audioBuffer);
        console.log(`✓ Audio saved to: ${outputFile}`);
        
        console.log('\n✅ TTS test successful!');
        console.log('You can play the audio file with: start out.mp3 (Windows) or open out.mp3 (Mac)');
        
    } catch (error) {
        console.error('\n❌ TTS test failed:', error.message);
        if (error.response) {
            console.error('API Response:', error.response);
        }
        process.exit(1);
    }
}

// Run test
testTTS();
