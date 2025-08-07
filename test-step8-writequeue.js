// Test for Step 8: Write Queue
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

async function testStep8() {
    log('\n=== Testing Step 8: Write Queue ===', 'magenta');
    
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'queue-test-'));
    const vaultPath = tempDir;
    
    try {
        // Test 1: Sequential writes are queued
        log('\nTest 1: Sequential Write Queueing', 'blue');
        
        const promises = [];
        const startTime = Date.now();
        
        // Fire off 5 rapid writes
        for (let i = 0; i < 5; i++) {
            const data = {
                profile: { name: `Test${i}` },
                shortTermHistory: [],
                midTermSlots: [],
                longTermStore: { items: [] }
            };
            promises.push(savePersonaData(`test${i}`, data, vaultPath));
        }
        
        // Wait for all to complete
        await Promise.all(promises);
        const elapsed = Date.now() - startTime;
        
        // Verify all files were written
        let allWritten = true;
        for (let i = 0; i < 5; i++) {
            const filePath = path.join(vaultPath, `test${i}`, 'persona.json');
            try {
                await fs.access(filePath);
            } catch {
                allWritten = false;
                break;
            }
        }
        
        if (allWritten) {
            log(`✓ All 5 writes completed successfully in ${elapsed}ms`, 'green');
        } else {
            log('✗ Some writes failed', 'red');
        }
        
        // Test 2: Concurrent writes don't corrupt data
        log('\nTest 2: Data Integrity Under Concurrent Writes', 'blue');
        
        const testData = {
            profile: {
                name: 'ConcurrentTest',
                description: 'Testing concurrent writes',
                style: 'technical',
                pronouns: 'it/its',
                topics: ['concurrency', 'testing']
            },
            shortTermHistory: [
                { role: 'user', content: 'Test message', ts: Date.now() }
            ],
            midTermSlots: [
                { summary: 'Test slot', embedding: [0.1, 0.2], priority: 1.0, ts: Date.now() }
            ],
            longTermStore: { items: [
                { summary: 'Test item', embedding: [0.3, 0.4] }
            ]}
        };
        
        // Fire off 10 concurrent writes to the same persona
        const concurrentPromises = [];
        for (let i = 0; i < 10; i++) {
            // Slightly modify data for each write
            const modifiedData = JSON.parse(JSON.stringify(testData));
            modifiedData.profile.description = `Write ${i}`;
            concurrentPromises.push(savePersonaData('concurrent', modifiedData, vaultPath));
        }
        
        await Promise.all(concurrentPromises);
        
        // Read back and verify integrity
        const finalData = await loadPersonaData('concurrent', vaultPath);
        
        if (finalData.profile.name === 'ConcurrentTest' &&
            finalData.shortTermHistory.length === 1 &&
            finalData.midTermSlots.length === 1 &&
            finalData.longTermStore.items.length === 1) {
            log('✓ Data integrity maintained under concurrent writes', 'green');
        } else {
            log('✗ Data corruption detected', 'red');
        }
        
        // Test 3: Write queue handles errors gracefully
        log('\nTest 3: Error Handling in Write Queue', 'blue');
        
        // Try to write to an invalid path
        const invalidData = {
            profile: { name: 'ErrorTest' },
            shortTermHistory: [],
            midTermSlots: [],
            longTermStore: { items: [] }
        };
        
        let errorCaught = false;
        try {
            // Use invalid characters in path
            await savePersonaData('/\\invalid*path?', invalidData, vaultPath);
        } catch (error) {
            errorCaught = true;
        }
        
        if (errorCaught) {
            log('✓ Write queue handles errors gracefully', 'green');
        } else {
            log('✗ Error not properly propagated', 'red');
        }
        
        // Test 4: Queue processes in order
        log('\nTest 4: Write Order Preservation', 'blue');
        
        const orderData = [];
        const orderPromises = [];
        
        for (let i = 0; i < 5; i++) {
            const data = {
                profile: { name: `Order${i}`, description: `Write number ${i}` },
                shortTermHistory: [],
                midTermSlots: [],
                longTermStore: { items: [] }
            };
            orderData.push(data);
            orderPromises.push(savePersonaData('order-test', data, vaultPath));
        }
        
        await Promise.all(orderPromises);
        
        // The last write should win
        const orderResult = await loadPersonaData('order-test', vaultPath);
        
        if (orderResult.profile.description === 'Write number 4') {
            log('✓ Write order preserved (last write wins)', 'green');
        } else {
            log(`✗ Unexpected final value: ${orderResult.profile.description}`, 'red');
        }
        
        log('\n✅ Step 8 Write Queue Tests Complete', 'green');
        
    } catch (error) {
        log(`\n❌ Test failed: ${error.message}`, 'red');
        console.error(error);
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
        log('Test environment cleaned up', 'blue');
    }
}

// Run test
testStep8().catch(console.error);
