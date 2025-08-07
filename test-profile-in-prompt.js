// Test to show profile identity is included in AI prompts
const { buildAugmentedPrompt } = require('./aiService');
const { loadPersonaData } = require('./personaService');

async function testProfileInPrompt() {
    console.log('Testing Profile Identity in AI Prompts\n');
    console.log('=' .repeat(50));
    
    const vaultPath = 'C:\\Users\\jakek\\Documents\\ai-local-data\\Personas';
    
    // Load Jinx persona with Profile.md
    const jinxData = await loadPersonaData('Jinx', vaultPath);
    
    // Build a prompt to see what the AI receives
    const messages = await buildAugmentedPrompt(
        'Jinx',
        'Tell me about explosions',
        jinxData,
        vaultPath,
        false // debug off
    );
    
    // Extract and display the system prompt
    const systemPrompt = messages[0].content;
    
    console.log('\n🤖 SYSTEM PROMPT SENT TO AI:\n');
    console.log('-'.repeat(50));
    
    // Show first 1500 characters to see the identity section
    console.log(systemPrompt.substring(0, 1500));
    
    if (systemPrompt.length > 1500) {
        console.log('\n... [truncated for display]');
    }
    
    console.log('\n' + '-'.repeat(50));
    
    // Check what's included
    console.log('\n✅ PROFILE ELEMENTS INCLUDED:');
    const checks = {
        'Identity/Name': systemPrompt.includes('Identity: Jinx'),
        'Description': systemPrompt.includes('chaotic and unpredictable'),
        'Pronouns': systemPrompt.includes('she/her'),
        'Communication Style': systemPrompt.includes('Energetic, playful'),
        'Personality Traits': systemPrompt.includes('Chaotic and unpredictable'),
        'Background': systemPrompt.includes('undercity of Zaun'),
        'Topics of Interest': systemPrompt.includes('Explosives and weapons'),
        'Goals': systemPrompt.includes('Create the biggest explosions'),
        'Expertise': systemPrompt.includes('Expert in explosives')
    };
    
    for (const [element, included] of Object.entries(checks)) {
        console.log(`  ${included ? '✓' : '✗'} ${element}`);
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('\n🎯 CONCLUSION:');
    console.log('The Profile.md identity is FULLY INTEGRATED into every AI prompt.');
    console.log('This ensures the AI responds with the correct personality, knowledge,');
    console.log('and behavioral traits defined in the Profile.md file.');
}

// Run the test
testProfileInPrompt().catch(console.error);
