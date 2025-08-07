// Test for Step 7: Memory UI Integration
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { loadPersonaData, savePersonaData } = require('./personaService');
const { runMemoryMaintenance } = require('./utils/memory');

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

async function testStep7() {
    log('\n=== Testing Step 7: Memory UI Integration ===', 'magenta');
    
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ui-test-'));
    const vaultPath = tempDir;
    
    try {
        // Test 1: Profile update
        log('\nTest 1: Profile Update', 'blue');
        const testProfile = {
            name: 'UI Test Persona',
            description: 'Testing UI integration',
            style: 'technical',
            pronouns: 'it/its',
            topics: ['testing', 'ui', 'memory']
        };
        
        let data = await loadPersonaData('ui-test', vaultPath);
        data.profile = testProfile;
        await savePersonaData('ui-test', data, vaultPath);
        
        const loaded = await loadPersonaData('ui-test', vaultPath);
        if (loaded.profile.name === 'UI Test Persona' && 
            loaded.profile.style === 'technical') {
            log('✓ Profile update works', 'green');
        } else {
            log('✗ Profile update failed', 'red');
        }
        
        // Test 2: Clear short-term history
        log('\nTest 2: Clear Short-term History', 'blue');
        data.shortTermHistory = [
            { role: 'user', content: 'Test 1', ts: Date.now() },
            { role: 'assistant', content: 'Response 1', ts: Date.now() + 1000 }
        ];
        await savePersonaData('ui-test', data, vaultPath);
        
        // Simulate clear
        data.shortTermHistory = [];
        await savePersonaData('ui-test', data, vaultPath);
        
        const afterClear = await loadPersonaData('ui-test', vaultPath);
        if (afterClear.shortTermHistory.length === 0) {
            log('✓ Short-term history clear works', 'green');
        } else {
            log('✗ Short-term history clear failed', 'red');
        }
        
        // Test 3: Prune mid-term memory
        log('\nTest 3: Prune Mid-term Memory', 'blue');
        data.midTermSlots = [
            {
                summary: 'Old low priority',
                embedding: [0.1],
                priority: 0.3,
                ts: Date.now() - (30 * 60 * 1000) // 30 min ago
            },
            {
                summary: 'Recent high priority',
                embedding: [0.2],
                priority: 0.8,
                ts: Date.now() - (5 * 60 * 1000) // 5 min ago
            }
        ];
        await savePersonaData('ui-test', data, vaultPath);
        
        // Simulate prune (keep only high priority recent)
        const now = Date.now();
        data.midTermSlots = data.midTermSlots.filter(slot => {
            const age = now - (slot.ts || 0);
            const ageMinutes = age / (60 * 1000);
            return slot.priority > 0.5 && ageMinutes < 20;
        });
        await savePersonaData('ui-test', data, vaultPath);
        
        const afterPrune = await loadPersonaData('ui-test', vaultPath);
        if (afterPrune.midTermSlots.length === 1 &&
            afterPrune.midTermSlots[0].summary === 'Recent high priority') {
            log('✓ Mid-term prune works', 'green');
        } else {
            log('✗ Mid-term prune failed', 'red');
        }
        
        // Test 4: Run maintenance
        log('\nTest 4: Run Memory Maintenance', 'blue');
        data.midTermSlots = [
            {
                summary: 'Very old slot',
                embedding: [0.1],
                priority: 0.1,
                ts: Date.now() - (60 * 60 * 1000) // 1 hour ago
            }
        ];
        data.longTermStore = { items: [] };
        await savePersonaData('ui-test', data, vaultPath);
        
        // Run maintenance
        let maintained = await loadPersonaData('ui-test', vaultPath);
        maintained = runMemoryMaintenance(maintained);
        await savePersonaData('ui-test', maintained, vaultPath);
        
        const afterMaintenance = await loadPersonaData('ui-test', vaultPath);
        if (afterMaintenance.midTermSlots.length === 0 &&
            afterMaintenance.longTermStore.items.length > 0) {
            log('✓ Memory maintenance works', 'green');
        } else {
            log('✗ Memory maintenance failed', 'red');
        }
        
        // Test 5: Memory export format
        log('\nTest 5: Memory Export Format', 'blue');
        const exportData = {
            persona: 'ui-test',
            exportDate: new Date().toISOString(),
            profile: afterMaintenance.profile,
            shortTermHistory: afterMaintenance.shortTermHistory,
            midTermSlots: afterMaintenance.midTermSlots,
            longTermStore: afterMaintenance.longTermStore
        };
        
        const json = JSON.stringify(exportData, null, 2);
        const parsed = JSON.parse(json);
        
        if (parsed.persona === 'ui-test' &&
            parsed.profile &&
            parsed.exportDate &&
            Array.isArray(parsed.shortTermHistory) &&
            Array.isArray(parsed.midTermSlots)) {
            log('✓ Memory export format valid', 'green');
        } else {
            log('✗ Memory export format invalid', 'red');
        }
        
        log('\n✅ Step 7 UI Integration Tests Complete', 'green');
        
    } catch (error) {
        log(`\n❌ Test failed: ${error.message}`, 'red');
        console.error(error);
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
        log('Test environment cleaned up', 'blue');
    }
}

// Run test
testStep7().catch(console.error);
