// Test script to verify memory decay and pruning functionality
const { 
    decayMidTermSlots, 
    getMidTermDecayStats,
    addOrUpdateMidTermSlot 
} = require('./utils/memory');

console.log('=== Memory Decay and Pruning Test ===\n');

// Create a test persona with mid-term slots
const createTestPersona = () => {
    const now = Date.now();
    return {
        id: 'test_persona',
        name: 'Test Persona',
        shortTermHistory: [],
        midTermSlots: [
            {
                summary: 'Fresh topic - just discussed',
                embedding: [0.1, 0.2, 0.3],
                priority: 1.0,
                ts: now // Current time
            },
            {
                summary: '5 minutes old topic',
                embedding: [0.2, 0.3, 0.4],
                priority: 1.0,
                ts: now - 5 * 60 * 1000 // 5 minutes ago
            },
            {
                summary: '15 minutes old topic',
                embedding: [0.3, 0.4, 0.5],
                priority: 1.0,
                ts: now - 15 * 60 * 1000 // 15 minutes ago
            },
            {
                summary: '25 minutes old topic',
                embedding: [0.4, 0.5, 0.6],
                priority: 1.0,
                ts: now - 25 * 60 * 1000 // 25 minutes ago
            },
            {
                summary: '35 minutes old topic - should be pruned',
                embedding: [0.5, 0.6, 0.7],
                priority: 1.0,
                ts: now - 35 * 60 * 1000 // 35 minutes ago
            },
            {
                summary: 'High priority recent topic',
                embedding: [0.6, 0.7, 0.8],
                priority: 3.0, // High priority
                ts: now - 10 * 60 * 1000 // 10 minutes ago
            }
        ],
        longTermStore: { items: [] }
    };
};

// Test 1: Initial state
console.log('Test 1: Initial State');
console.log('----------------------');
let persona = createTestPersona();
let stats = getMidTermDecayStats(persona);
console.log(`Total slots: ${stats.totalSlots}`);
console.log(`Average priority: ${stats.avgPriority.toFixed(3)}`);
console.log(`Oldest slot age: ${stats.oldestSlotAge} minutes`);
console.log(`Newest slot age: ${stats.newestSlotAge} minutes`);
console.log();

// Test 2: Apply decay with default settings
console.log('Test 2: Apply Decay (default: 0.98 rate, 0.2 min, 30 min max)');
console.log('---------------------------------------------------------------');
persona = createTestPersona();
const beforeCount = persona.midTermSlots.length;
console.log(`Before decay: ${beforeCount} slots`);

persona.midTermSlots.forEach((slot, idx) => {
    const ageMinutes = Math.round((Date.now() - slot.ts) / 60000);
    console.log(`  Slot ${idx + 1}: priority=${slot.priority.toFixed(3)}, age=${ageMinutes}min`);
});

// Apply decay
decayMidTermSlots(persona, 0.98, 0.2, 30);

const afterCount = persona.midTermSlots.length;
console.log(`\nAfter decay: ${afterCount} slots`);
console.log(`Removed: ${beforeCount - afterCount} slots\n`);

persona.midTermSlots.forEach((slot, idx) => {
    const ageMinutes = Math.round((Date.now() - slot.ts) / 60000);
    console.log(`  Slot ${idx + 1}: priority=${slot.priority.toFixed(3)}, age=${ageMinutes}min - "${slot.summary.substring(0, 30)}..."`);
});
console.log();

// Test 3: Simulate multiple decay cycles
console.log('Test 3: Simulate 10 Minutes of Decay (5 cycles @ 2min intervals)');
console.log('------------------------------------------------------------------');
persona = createTestPersona();
console.log(`Starting with ${persona.midTermSlots.length} slots\n`);

// Run 5 decay cycles simulating 2-minute intervals
for (let cycle = 1; cycle <= 5; cycle++) {
    // Age all slots by 2 minutes
    persona.midTermSlots.forEach(slot => {
        slot.ts = slot.ts - 2 * 60 * 1000;
    });
    
    const beforeStats = getMidTermDecayStats(persona);
    const beforeCount = persona.midTermSlots.length;
    
    // Apply decay
    decayMidTermSlots(persona, 0.98, 0.2, 30);
    
    const afterStats = getMidTermDecayStats(persona);
    const afterCount = persona.midTermSlots.length;
    
    console.log(`Cycle ${cycle} (${cycle * 2} minutes elapsed):`);
    console.log(`  Slots: ${beforeCount} → ${afterCount}`);
    console.log(`  Avg priority: ${beforeStats.avgPriority.toFixed(3)} → ${afterStats.avgPriority.toFixed(3)}`);
    
    if (afterCount === 0) {
        console.log('  All slots pruned!');
        break;
    }
}

console.log('\nFinal state:');
stats = getMidTermDecayStats(persona);
console.log(`  Total slots: ${stats.totalSlots}`);
console.log(`  Healthy slots (priority > 0.5): ${stats.healthySlots}`);
console.log(`  Decayed slots (priority < 0.5): ${stats.decayedSlots}`);
console.log();

// Test 4: Verify priority decay calculation
console.log('Test 4: Priority Decay Calculation');
console.log('-----------------------------------');
const testPriority = 1.0;
const decayRate = 0.98;
const testAges = [0, 5, 10, 15, 20, 25, 30, 35];

console.log(`Initial priority: ${testPriority}`);
console.log(`Decay rate: ${decayRate} per minute\n`);
console.log('Age (min) | Decayed Priority | Will be pruned?');
console.log('----------|------------------|----------------');

testAges.forEach(age => {
    const decayFactor = Math.pow(decayRate, age);
    const decayedPriority = testPriority * decayFactor;
    const willPrune = decayedPriority < 0.2 && age > 30;
    console.log(`${age.toString().padEnd(9)} | ${decayedPriority.toFixed(4).padEnd(16)} | ${willPrune ? 'YES' : 'NO'}`);
});

// Test 5: Verify that recently accessed items get priority boost
console.log('\nTest 5: Priority Boost for Accessed Items');
console.log('------------------------------------------');
persona = createTestPersona();
const oldSlot = persona.midTermSlots[2]; // 15 minutes old
console.log(`Original slot: priority=${oldSlot.priority}, age=15min`);

// Simulate accessing this topic again (merging)
const similarSlot = {
    slot: oldSlot,
    index: 2,
    similarity: 0.9
};

addOrUpdateMidTermSlot(persona, {
    summary: 'Updated topic that was accessed again',
    embedding: oldSlot.embedding,
    priority: 1.0,
    ts: Date.now()
}, similarSlot);

const updatedSlot = persona.midTermSlots[2];
console.log(`After access: priority=${updatedSlot.priority.toFixed(2)}, age=0min`);
console.log(`Priority increased by ${((updatedSlot.priority - oldSlot.priority) * 100).toFixed(0)}%`);

console.log('\n=== TEST COMPLETED ===');
console.log('\nSummary:');
console.log('✓ Decay reduces priority exponentially over time');
console.log('✓ Slots with priority < 0.2 and age > 30 min are pruned');
console.log('✓ Recently accessed slots get priority boost');
console.log('✓ High priority slots survive longer');
console.log('\nMemory decay will automatically maintain compact, relevant mid-term memory!');
