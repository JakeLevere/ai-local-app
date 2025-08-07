// Test Profile.md functionality
const { loadPersonaData, savePersonaData } = require('./personaService');
const fs = require('fs').promises;
const path = require('path');

async function testProfileMd() {
    console.log('Testing Profile.md functionality...\n');
    
    const vaultPath = 'C:\\Users\\jakek\\Documents\\ai-local-data\\Personas';
    
    // Test 1: Load Jinx persona with Profile.md
    console.log('1. Loading Jinx persona with Profile.md:');
    const jinxData = await loadPersonaData('Jinx', vaultPath);
    
    if (jinxData.profile) {
        console.log('   ✓ Profile loaded successfully');
        console.log(`   - Name: ${jinxData.profile.name}`);
        console.log(`   - Pronouns: ${jinxData.profile.pronouns}`);
        console.log(`   - Traits: ${jinxData.profile.traits.length} traits`);
        console.log(`   - Topics: ${jinxData.profile.topics.length} topics`);
        console.log(`   - Knowledge: ${jinxData.profile.knowledge.length} expertise areas`);
    } else {
        console.log('   ✗ Failed to load profile');
    }
    
    // Test 2: Create a new test persona with Profile.md
    console.log('\n2. Creating test persona with Profile.md:');
    const testPersona = {
        profile: {
            name: 'TestBot',
            description: 'A helpful AI assistant for testing',
            style: 'Professional and concise',
            pronouns: 'it/its',
            topics: ['testing', 'quality assurance', 'automation'],
            traits: ['methodical', 'precise', 'reliable'],
            background: 'Created for testing the Profile.md system',
            goals: ['Ensure system reliability', 'Find bugs'],
            knowledge: ['Software testing', 'Test automation', 'Bug tracking']
        },
        shortTermHistory: [],
        midTermSlots: [],
        longTermStore: { items: [] }
    };
    
    await savePersonaData('TestBot', testPersona, vaultPath);
    console.log('   ✓ TestBot persona created');
    
    // Test 3: Verify Profile.md was created
    const profilePath = path.join(vaultPath, 'testbot', 'Profile.md');
    try {
        const profileContent = await fs.readFile(profilePath, 'utf-8');
        console.log('\n3. Profile.md content preview:');
        console.log('   ' + profileContent.split('\n').slice(0, 5).join('\n   '));
        console.log('   ...');
        console.log('   ✓ Profile.md file created successfully');
    } catch (err) {
        console.log('   ✗ Failed to read Profile.md:', err.message);
    }
    
    // Test 4: Reload to verify Profile.md takes precedence
    console.log('\n4. Reloading TestBot to verify Profile.md precedence:');
    const reloadedData = await loadPersonaData('TestBot', vaultPath);
    
    if (reloadedData.profile && reloadedData.profile.name === 'TestBot') {
        console.log('   ✓ Profile loaded from Profile.md');
        console.log(`   - Description: ${reloadedData.profile.description}`);
        console.log(`   - Background: ${reloadedData.profile.background}`);
    } else {
        console.log('   ✗ Failed to reload from Profile.md');
    }
    
    // Test 5: Edit Profile.md directly and reload
    console.log('\n5. Testing direct Profile.md editing:');
    const modifiedContent = `# TestBot

## Description
A MODIFIED helpful AI assistant for testing - now with updates!

## Pronouns
it/its

## Communication Style
Professional and concise

## Personality Traits
- methodical
- precise
- reliable
- efficient

## Background
Created for testing the Profile.md system - UPDATED

## Topics of Interest
- testing
- quality assurance
- automation
- continuous integration

## Goals
- Ensure system reliability
- Find bugs
- Improve test coverage

## Knowledge & Expertise
- Software testing
- Test automation
- Bug tracking
- CI/CD pipelines`;
    
    await fs.writeFile(profilePath, modifiedContent, 'utf-8');
    console.log('   ✓ Profile.md manually edited');
    
    const editedData = await loadPersonaData('TestBot', vaultPath);
    if (editedData.profile.description.includes('MODIFIED')) {
        console.log('   ✓ Changes from direct edit loaded successfully');
        console.log(`   - New description: ${editedData.profile.description.substring(0, 50)}...`);
        console.log(`   - Traits count: ${editedData.profile.traits.length} (added "efficient")`);
        console.log(`   - Topics count: ${editedData.profile.topics.length} (added "continuous integration")`);
    } else {
        console.log('   ✗ Failed to load edited changes');
    }
    
    // Cleanup
    console.log('\n6. Cleanup:');
    try {
        const testBotPath = path.join(vaultPath, 'testbot');
        await fs.rm(testBotPath, { recursive: true, force: true });
        console.log('   ✓ Test persona cleaned up');
    } catch (err) {
        console.log('   - Cleanup skipped:', err.message);
    }
    
    console.log('\n✅ Profile.md tests completed!');
    console.log('\nYou can now edit any persona by opening their Profile.md file at:');
    console.log(`${vaultPath}\\[persona name]\\Profile.md`);
}

// Run the test
testProfileMd().catch(console.error);
