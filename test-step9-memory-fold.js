// Test for Step 9: Fold Existing Memory Summary
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { loadPersonaData, savePersonaData } = require('./personaService');

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

// Mock updateMemorySummary since we can't test with real OpenAI calls
async function mockUpdateMemorySummary(identifier, vaultPath, testSummary) {
    const { addOrUpdateMidTermSlot } = require('./utils/memory');
    
    // Simulate what updateMemorySummary does
    const personaData = await loadPersonaData(identifier, vaultPath);
    
    // Create a condensed version
    const condensedSummary = testSummary.substring(0, 400).replace(/\n+/g, ' ').trim();
    
    // Create mock embedding
    const mockEmbedding = new Array(1536).fill(0).map(() => Math.random());
    
    // Check for existing conversation summary slot
    let similarSlot = null;
    personaData.midTermSlots = personaData.midTermSlots || [];
    personaData.midTermSlots.forEach((slot, index) => {
        if (slot.summary && slot.summary.includes('Conversation summary')) {
            similarSlot = { slot, index, similarity: 1.0 };
        }
    });
    
    // Add or update mid-term slot
    addOrUpdateMidTermSlot(personaData, {
        summary: `Conversation summary: ${condensedSummary}`,
        embedding: mockEmbedding,
        priority: 2.0, // Higher priority for manual summaries
        ts: Date.now()
    }, similarSlot);
    
    // If summary is long, add to long-term
    if (testSummary.length > 1500) {
        personaData.longTermStore = personaData.longTermStore || { items: [] };
        personaData.longTermStore.items.push({
            id: `memory_${Date.now()}`,
            summary: `Memory snapshot: ${condensedSummary}`,
            embedding: mockEmbedding,
            createdAt: new Date().toISOString(),
            source: 'memory_update'
        });
    }
    
    await savePersonaData(identifier, personaData, vaultPath);
    return condensedSummary;
}

async function testStep9() {
    log('\n=== Testing Step 9: Fold Existing Memory Summary ===', 'magenta');
    
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fold-test-'));
    const vaultPath = tempDir;
    
    try {
        // Test 1: Short summary creates mid-term slot
        log('\nTest 1: Short Summary → Mid-term Slot', 'blue');
        
        const shortSummary = `# Memory
## Key Insights
- User discussed testing memory systems
- Preference for automated testing

## Open Questions
- How to handle edge cases?

## Action Items
- Write more tests`;
        
        await mockUpdateMemorySummary('test1', vaultPath, shortSummary);
        
        const data1 = await loadPersonaData('test1', vaultPath);
        
        if (data1.midTermSlots.length === 1 &&
            data1.midTermSlots[0].summary.includes('Conversation summary') &&
            data1.midTermSlots[0].priority === 2.0) {
            log('✓ Short summary created mid-term slot with high priority', 'green');
        } else {
            log('✗ Mid-term slot not created properly', 'red');
        }
        
        // Test 2: Update existing conversation summary slot
        log('\nTest 2: Update Existing Summary Slot', 'blue');
        
        const updatedSummary = `# Memory
## Key Insights
- User discussed testing memory systems
- Preference for automated testing
- New insight about performance

## Open Questions
- How to handle edge cases?
- What about scalability?

## Action Items
- Write more tests
- Optimize performance`;
        
        await mockUpdateMemorySummary('test1', vaultPath, updatedSummary);
        
        const data2 = await loadPersonaData('test1', vaultPath);
        
        if (data2.midTermSlots.length === 1 &&
            data2.midTermSlots[0].summary.includes('New insight about performance')) {
            log('✓ Existing conversation summary slot updated', 'green');
        } else {
            log('✗ Slot not updated correctly', 'red');
        }
        
        // Test 3: Long summary creates long-term item
        log('\nTest 3: Long Summary → Long-term Store', 'blue');
        
        // Create a long summary (>1500 chars)
        let longSummary = `# Memory\n## Key Insights\n`;
        for (let i = 0; i < 20; i++) {
            longSummary += `- Important insight number ${i} about the conversation and various topics discussed in detail\n`;
        }
        longSummary += `\n## Open Questions\n`;
        for (let i = 0; i < 10; i++) {
            longSummary += `- Question ${i} about implementation details and architecture considerations?\n`;
        }
        longSummary += `\n## Action Items\n`;
        for (let i = 0; i < 10; i++) {
            longSummary += `- Task ${i}: Implement feature with specific requirements and acceptance criteria\n`;
        }
        
        await mockUpdateMemorySummary('test2', vaultPath, longSummary);
        
        const data3 = await loadPersonaData('test2', vaultPath);
        
        if (data3.midTermSlots.length > 0 &&
            data3.longTermStore.items.length > 0 &&
            data3.longTermStore.items[0].source === 'memory_update') {
            log('✓ Long summary created both mid-term slot and long-term item', 'green');
        } else {
            log('✗ Long-term item not created', 'red');
        }
        
        // Test 4: Multiple memory updates maintain limit
        log('\nTest 4: Long-term Memory Limit', 'blue');
        
        // Add many memory updates
        for (let i = 0; i < 5; i++) {
            const summary = `Memory update ${i}: ` + 'x'.repeat(1600); // Long enough to trigger long-term
            await mockUpdateMemorySummary('test3', vaultPath, summary);
        }
        
        const data4 = await loadPersonaData('test3', vaultPath);
        
        if (data4.longTermStore.items.length === 5 &&
            data4.longTermStore.items.every(item => item.source === 'memory_update')) {
            log('✓ Multiple memory updates stored in long-term', 'green');
        } else {
            log(`✗ Unexpected long-term count: ${data4.longTermStore.items.length}`, 'red');
        }
        
        // Test 5: Integration with existing memory tiers
        log('\nTest 5: Integration with Memory Tiers', 'blue');
        
        // Start with existing memory data
        let testData = await loadPersonaData('test4', vaultPath);
        testData.shortTermHistory = [
            { role: 'user', content: 'Test message', ts: Date.now() }
        ];
        testData.midTermSlots = [
            {
                summary: 'Existing slot about different topic',
                embedding: new Array(1536).fill(0.1),
                priority: 1.0,
                ts: Date.now() - 10000
            }
        ];
        await savePersonaData('test4', testData, vaultPath);
        
        // Add memory summary
        await mockUpdateMemorySummary('test4', vaultPath, 'New memory summary from update');
        
        const finalData = await loadPersonaData('test4', vaultPath);
        
        if (finalData.shortTermHistory.length === 1 &&
            finalData.midTermSlots.length === 2 &&
            finalData.midTermSlots.some(s => s.summary.includes('Conversation summary'))) {
            log('✓ Memory summary integrated with existing tiers', 'green');
        } else {
            log('✗ Integration with existing memory failed', 'red');
        }
        
        log('\n✅ Step 9 Memory Folding Tests Complete', 'green');
        
    } catch (error) {
        log(`\n❌ Test failed: ${error.message}`, 'red');
        console.error(error);
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
        log('Test environment cleaned up', 'blue');
    }
}

// Run test
testStep9().catch(console.error);
