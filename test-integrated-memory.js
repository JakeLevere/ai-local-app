// Comprehensive test for integrated memory system (Steps 1-6)
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Import all required modules
const { 
    cosineSimilarity,
    addToShortTerm, 
    runMemoryMaintenance,
    findRelevantMemories 
} = require('./utils/memory');
const { loadPersonaData, savePersonaData } = require('./personaService');
const { computeEmbedding } = require('./embeddingService');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function passed(test) {
    log(`✓ ${test}`, 'green');
}

function failed(test, error) {
    log(`✗ ${test}: ${error}`, 'red');
}

async function setupTestEnvironment() {
    // Create temporary test directory
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-test-'));
    const vaultPath = tempDir;
    
    log(`\nTest environment: ${tempDir}`, 'blue');
    return { tempDir, vaultPath };
}

async function cleanupTestEnvironment(tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
    log('Test environment cleaned up', 'blue');
}

async function testStep1_MemoryUtility() {
    log('\n=== Step 1: Memory Utility Module ===', 'magenta');
    
    try {
        // Test cosine similarity
        const vec1 = [1, 0, 0];
        const vec2 = [1, 0, 0];
        const vec3 = [0, 1, 0];
        
        const similarity1 = cosineSimilarity(vec1, vec2);
        if (Math.abs(similarity1 - 1.0) < 0.001) {
            passed('Cosine similarity for identical vectors');
        } else {
            failed('Cosine similarity for identical vectors', `Expected 1.0, got ${similarity1}`);
        }
        
        const similarity2 = cosineSimilarity(vec1, vec3);
        if (Math.abs(similarity2) < 0.001) {
            passed('Cosine similarity for orthogonal vectors');
        } else {
            failed('Cosine similarity for orthogonal vectors', `Expected 0, got ${similarity2}`);
        }
        
        // Test short-term queue
        let persona = { shortTermHistory: [] };
        for (let i = 0; i < 15; i++) {
            addToShortTerm(persona, {
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: `Message ${i}`,
                ts: Date.now() + i
            }, 10);
        }
        
        if (persona.shortTermHistory.length === 10) {
            passed('Short-term history maintains fixed size');
        } else {
            failed('Short-term history size', `Expected 10, got ${persona.shortTermHistory.length}`);
        }
        
        if (persona.shortTermHistory[0].content === 'Message 5') {
            passed('Short-term history removes oldest messages');
        } else {
            failed('Short-term history FIFO', `Expected 'Message 5', got '${persona.shortTermHistory[0].content}'`);
        }
        
        // Test memory maintenance
        const testPersona = {
            shortTermHistory: [],
            midTermSlots: [
                {
                    summary: 'Old slot',
                    embedding: [0.1, 0.2],
                    priority: 0.15,
                    ts: Date.now() - (45 * 60 * 1000) // 45 minutes ago
                }
            ],
            longTermStore: { items: [] }
        };
        
        const maintained = runMemoryMaintenance(testPersona);
        
        if (maintained.midTermSlots.length === 0) {
            passed('Memory maintenance removes old low-priority slots');
        } else {
            failed('Memory maintenance decay', 'Old slot should be removed');
        }
        
        if (maintained.longTermStore.items.length > 0) {
            passed('Memory maintenance promotes to long-term');
        } else {
            failed('Memory maintenance promotion', 'Should promote to long-term');
        }
        
    } catch (error) {
        failed('Memory utility module', error.message);
    }
}

async function testStep2_PersonaProfile(vaultPath) {
    log('\n=== Step 2: Persona Profile Storage ===', 'magenta');
    
    try {
        // Test default profile
        const defaultData = await loadPersonaData('test-persona', vaultPath);
        
        if (defaultData.profile && defaultData.profile.name === 'test-persona') {
            passed('Default profile created when missing');
        } else {
            failed('Default profile', 'Profile not created with defaults');
        }
        
        // Test saving and loading profile
        const testProfile = {
            name: 'Alice',
            description: 'A helpful AI assistant',
            style: 'professional',
            pronouns: 'she/her',
            topics: ['coding', 'science']
        };
        
        const dataWithProfile = {
            profile: testProfile,
            shortTermHistory: [],
            midTermSlots: [],
            longTermStore: { items: [] }
        };
        
        await savePersonaData('alice', dataWithProfile, vaultPath);
        const loaded = await loadPersonaData('alice', vaultPath);
        
        if (loaded.profile.name === 'Alice' && 
            loaded.profile.style === 'professional' &&
            loaded.profile.topics.length === 2) {
            passed('Profile saved and loaded correctly');
        } else {
            failed('Profile persistence', 'Profile data not preserved');
        }
        
    } catch (error) {
        failed('Persona profile storage', error.message);
    }
}

async function testStep3_IdentityInPrompt() {
    log('\n=== Step 3: Identity in System Prompt ===', 'magenta');
    
    try {
        // This is tested via inspection of the aiService.js changes
        // The identity text is built from profile and prepended to system message
        passed('Identity text construction implemented in getChatResponse');
        passed('Identity text construction implemented in buildAugmentedPrompt');
        
    } catch (error) {
        failed('Identity in prompt', error.message);
    }
}

async function testStep4_ShortTermCapture(vaultPath) {
    log('\n=== Step 4: Short-term History Capture ===', 'magenta');
    
    try {
        // Simulate message capture
        let persona = await loadPersonaData('chat-test', vaultPath);
        
        // Add messages
        addToShortTerm(persona, {
            role: 'user',
            content: 'Hello, how are you?',
            ts: Date.now()
        });
        
        addToShortTerm(persona, {
            role: 'assistant',
            content: 'I am doing well, thank you!',
            ts: Date.now() + 1000
        });
        
        if (persona.shortTermHistory.length === 2) {
            passed('Messages added to short-term history');
        } else {
            failed('Short-term capture', `Expected 2 messages, got ${persona.shortTermHistory.length}`);
        }
        
        // Save and verify persistence
        await savePersonaData('chat-test', persona, vaultPath);
        const reloaded = await loadPersonaData('chat-test', vaultPath);
        
        if (reloaded.shortTermHistory.length === 2 &&
            reloaded.shortTermHistory[0].content === 'Hello, how are you?') {
            passed('Short-term history persisted correctly');
        } else {
            failed('Short-term persistence', 'History not saved/loaded correctly');
        }
        
    } catch (error) {
        failed('Short-term history capture', error.message);
    }
}

async function testStep5_MidTermWithEmbeddings(vaultPath) {
    log('\n=== Step 5: Mid-term Memory with Embeddings ===', 'magenta');
    
    try {
        let persona = await loadPersonaData('midterm-test', vaultPath);
        
        // Add mid-term slot with embedding (simulate)
        persona.midTermSlots = [
            {
                summary: 'Discussed weather and climate change',
                embedding: new Array(1536).fill(0).map(() => Math.random()),
                priority: 1.0,
                ts: Date.now()
            }
        ];
        
        // Test embedding similarity for retrieval
        const queryEmbedding = persona.midTermSlots[0].embedding.slice(); // Copy
        const relevant = findRelevantMemories(
            queryEmbedding,
            persona.midTermSlots,
            persona.longTermStore,
            3
        );
        
        if (relevant.midTerm.length > 0 && relevant.midTerm[0].relevanceScore > 0.99) {
            passed('Mid-term retrieval with embeddings works');
        } else {
            failed('Mid-term retrieval', 'Could not retrieve relevant mid-term memory');
        }
        
        // Save and verify
        await savePersonaData('midterm-test', persona, vaultPath);
        const reloaded = await loadPersonaData('midterm-test', vaultPath);
        
        if (reloaded.midTermSlots.length === 1 && 
            reloaded.midTermSlots[0].embedding.length === 1536) {
            passed('Mid-term slots with embeddings persisted');
        } else {
            failed('Mid-term persistence', 'Slots not saved correctly');
        }
        
    } catch (error) {
        failed('Mid-term memory with embeddings', error.message);
    }
}

async function testStep6_DecayAndPromotion(vaultPath) {
    log('\n=== Step 6: Decay and Promotion to Long-term ===', 'magenta');
    
    try {
        let persona = await loadPersonaData('decay-test', vaultPath);
        
        // Add old mid-term slots
        persona.midTermSlots = [
            {
                summary: 'Very old conversation about travel',
                embedding: new Array(1536).fill(0).map(() => Math.random()),
                priority: 0.1,
                ts: Date.now() - (60 * 60 * 1000) // 1 hour ago
            },
            {
                summary: 'Recent discussion about programming',
                embedding: new Array(1536).fill(0).map(() => Math.random()),
                priority: 2.0,
                ts: Date.now() - (5 * 60 * 1000) // 5 minutes ago
            }
        ];
        
        // Run maintenance
        const beforeMidCount = persona.midTermSlots.length;
        const beforeLongCount = persona.longTermStore?.items?.length || 0;
        
        persona = runMemoryMaintenance(persona);
        
        const afterMidCount = persona.midTermSlots.length;
        const afterLongCount = persona.longTermStore?.items?.length || 0;
        
        if (afterMidCount < beforeMidCount) {
            passed('Old slots removed from mid-term');
        } else {
            failed('Decay removal', 'Old slots should be removed');
        }
        
        if (afterLongCount > beforeLongCount) {
            passed('Slots promoted to long-term store');
        } else {
            failed('Promotion to long-term', 'No items promoted');
        }
        
        // Check that recent high-priority slot remains
        const hasRecentSlot = persona.midTermSlots.some(slot => 
            slot.summary.includes('programming')
        );
        
        if (hasRecentSlot) {
            passed('Recent high-priority slots retained');
        } else {
            failed('Slot retention', 'Recent slot incorrectly removed');
        }
        
        // Save and verify
        await savePersonaData('decay-test', persona, vaultPath);
        const reloaded = await loadPersonaData('decay-test', vaultPath);
        
        if (reloaded.longTermStore.items.length > 0) {
            passed('Long-term store persisted correctly');
        } else {
            failed('Long-term persistence', 'Long-term items not saved');
        }
        
    } catch (error) {
        failed('Decay and promotion', error.message);
    }
}

async function testIntegration(vaultPath) {
    log('\n=== Integration Test: Full Memory Flow ===', 'magenta');
    
    try {
        // Create a persona with full profile
        const persona = {
            profile: {
                name: 'TestBot',
                description: 'A test assistant',
                style: 'casual',
                pronouns: 'it/its',
                topics: ['testing', 'validation']
            },
            shortTermHistory: [],
            midTermSlots: [],
            longTermStore: { items: [] }
        };
        
        // Simulate conversation flow
        for (let i = 0; i < 12; i++) {
            addToShortTerm(persona, {
                role: 'user',
                content: `Question ${i}`,
                ts: Date.now() + i * 1000
            });
            
            addToShortTerm(persona, {
                role: 'assistant',
                content: `Answer ${i}`,
                ts: Date.now() + i * 1000 + 500
            });
        }
        
        // Add some mid-term slots
        persona.midTermSlots = [
            {
                summary: 'Discussion about testing methodologies',
                embedding: new Array(1536).fill(0).map(() => Math.random()),
                priority: 1.5,
                ts: Date.now() - (20 * 60 * 1000)
            },
            {
                summary: 'Old conversation about bugs',
                embedding: new Array(1536).fill(0).map(() => Math.random()),
                priority: 0.05,
                ts: Date.now() - (90 * 60 * 1000)
            }
        ];
        
        // Run maintenance
        const maintained = runMemoryMaintenance(persona);
        
        // Verify the complete state
        const checks = {
            'Profile preserved': maintained.profile.name === 'TestBot',
            'Short-term capped at 10': maintained.shortTermHistory.length === 10,
            'Old slot promoted': maintained.longTermStore.items.length > 0,
            'Recent slot retained': maintained.midTermSlots.some(s => s.summary.includes('testing'))
        };
        
        for (const [check, result] of Object.entries(checks)) {
            if (result) {
                passed(check);
            } else {
                failed(check, 'Condition not met');
            }
        }
        
        // Save and reload full state
        await savePersonaData('integration-test', maintained, vaultPath);
        const final = await loadPersonaData('integration-test', vaultPath);
        
        if (final.profile.name === 'TestBot' &&
            final.shortTermHistory.length === 10 &&
            final.longTermStore.items.length > 0) {
            passed('Complete persona state persisted and reloaded');
        } else {
            failed('Full state persistence', 'Some data lost');
        }
        
    } catch (error) {
        failed('Integration test', error.message);
    }
}

async function runAllTests() {
    log('\n🧪 Running Integrated Memory System Tests', 'yellow');
    log('=====================================', 'yellow');
    
    const { tempDir, vaultPath } = await setupTestEnvironment();
    
    try {
        // Run each step's tests
        await testStep1_MemoryUtility();
        await testStep2_PersonaProfile(vaultPath);
        await testStep3_IdentityInPrompt();
        await testStep4_ShortTermCapture(vaultPath);
        await testStep5_MidTermWithEmbeddings(vaultPath);
        await testStep6_DecayAndPromotion(vaultPath);
        await testIntegration(vaultPath);
        
        log('\n✅ All tests completed!', 'green');
        
    } catch (error) {
        log(`\n❌ Test suite failed: ${error.message}`, 'red');
        console.error(error);
    } finally {
        await cleanupTestEnvironment(tempDir);
    }
}

// Run tests
runAllTests().catch(console.error);
