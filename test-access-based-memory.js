// Test for access-based memory system
const { 
    calculateMemoryPriority,
    evaluateMemoriesForPromotion,
    findRelevantMemories,
    MIN_ACCESS_COUNT_FOR_PROMOTION,
    SEMANTIC_CLUSTER_THRESHOLD,
    MEMORY_IMPORTANCE_WEIGHTS
} = require('./utils/memory');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function createTestMemory(overrides = {}) {
    const base = {
        summary: 'Test memory about coding project',
        embedding: new Array(1536).fill(0).map(() => Math.random()),
        priority: 1.0,
        baseRelevance: 1.0,
        accessCount: 0,
        lastAccessed: Date.now(),
        createdAt: Date.now() - (24 * 60 * 60 * 1000), // 1 day old
        ts: Date.now(),
        category: 'general',
        userMarkedImportant: false,
        semanticClusterSize: 1
    };
    return { ...base, ...overrides };
}

async function testAccessBasedPriority() {
    log('\n=== Test 1: Access-Based Priority Calculation ===', 'magenta');
    
    // Test 1: Frequently accessed memory
    const frequentMemory = createTestMemory({
        accessCount: 10,
        createdAt: Date.now() - (7 * 24 * 60 * 60 * 1000), // 7 days old
        lastAccessed: Date.now() - (2 * 60 * 60 * 1000), // accessed 2 hours ago
        category: 'technical'
    });
    
    const freq_priority = calculateMemoryPriority(frequentMemory);
    log(`Frequently accessed (10 times in 7 days): Priority = ${freq_priority.toFixed(3)}`, 'cyan');
    
    // Test 2: Never accessed old memory
    const oldMemory = createTestMemory({
        accessCount: 0,
        createdAt: Date.now() - (30 * 24 * 60 * 60 * 1000), // 30 days old
        lastAccessed: Date.now() - (30 * 24 * 60 * 60 * 1000),
        category: 'casual'
    });
    
    const old_priority = calculateMemoryPriority(oldMemory);
    log(`Never accessed (30 days old): Priority = ${old_priority.toFixed(3)}`, 'cyan');
    
    // Test 3: User marked important
    const importantMemory = createTestMemory({
        accessCount: 2,
        userMarkedImportant: true,
        category: 'personal'
    });
    
    const imp_priority = calculateMemoryPriority(importantMemory);
    log(`User marked important: Priority = ${imp_priority.toFixed(3)}`, 'cyan');
    
    // Test 4: Part of semantic cluster
    const clusterMemory = createTestMemory({
        accessCount: 5,
        semanticClusterSize: 5,
        category: 'project'
    });
    
    const cluster_priority = calculateMemoryPriority(clusterMemory);
    log(`Part of semantic cluster (5 related): Priority = ${cluster_priority.toFixed(3)}`, 'cyan');
    
    // Verify priorities make sense
    if (freq_priority > old_priority && imp_priority > old_priority) {
        log('✓ Access-based priority correctly favors accessed and important memories', 'green');
    } else {
        log('✗ Priority calculation issue', 'red');
    }
}

async function testPromotionRules() {
    log('\n=== Test 2: Promotion Rules ===', 'magenta');
    
    const persona = {
        midTermSlots: [],
        longTermStore: { items: [] }
    };
    
    // Add memories with different characteristics
    persona.midTermSlots.push(
        createTestMemory({ 
            summary: 'Frequently accessed memory',
            accessCount: 6, // Above threshold
            category: 'technical'
        }),
        createTestMemory({ 
            summary: 'Important personal memory',
            accessCount: 1,
            userMarkedImportant: true,
            category: 'personal'
        }),
        createTestMemory({ 
            summary: 'Part of large cluster',
            accessCount: 2,
            semanticClusterSize: 4, // Above threshold
            category: 'project'
        }),
        createTestMemory({ 
            summary: 'Low priority memory',
            accessCount: 0,
            priority: 0.1
        }),
        createTestMemory({ 
            summary: 'Recent but unimportant',
            accessCount: 1,
            createdAt: Date.now() - (60 * 60 * 1000) // 1 hour old
        })
    );
    
    const beforeMidCount = persona.midTermSlots.length;
    const beforeLongCount = persona.longTermStore.items.length;
    
    // Run evaluation
    const evaluated = evaluateMemoriesForPromotion(persona);
    
    const afterMidCount = evaluated.midTermSlots.length;
    const afterLongCount = evaluated.longTermStore.items.length;
    
    log(`Before: ${beforeMidCount} mid-term, ${beforeLongCount} long-term`, 'cyan');
    log(`After: ${afterMidCount} mid-term, ${afterLongCount} long-term`, 'cyan');
    
    // Check promoted items
    const promoted = evaluated.longTermStore.items;
    log('\nPromoted to long-term:', 'yellow');
    promoted.forEach(item => {
        log(`  - ${item.summary} (access: ${item.accessCount}, important: ${item.userMarkedImportant})`, 'cyan');
    });
    
    // Verify promotion rules
    const hasFrequentlyAccessed = promoted.some(i => i.summary.includes('Frequently accessed'));
    const hasImportant = promoted.some(i => i.summary.includes('Important personal'));
    const hasCluster = promoted.some(i => i.summary.includes('large cluster'));
    
    if (hasFrequentlyAccessed && hasImportant && hasCluster) {
        log('✓ All promotion rules working correctly', 'green');
    } else {
        log('✗ Some promotion rules not working', 'red');
        if (!hasFrequentlyAccessed) log('  - Access count rule failed', 'red');
        if (!hasImportant) log('  - User marked important rule failed', 'red');
        if (!hasCluster) log('  - Semantic cluster rule failed', 'red');
    }
}

async function testRetrievalWithAccessTracking() {
    log('\n=== Test 3: Retrieval with Access Tracking ===', 'magenta');
    
    const persona = {
        midTermSlots: [
            createTestMemory({ 
                summary: 'JavaScript async programming patterns',
                accessCount: 0
            }),
            createTestMemory({ 
                summary: 'Python data science libraries',
                accessCount: 0
            }),
            createTestMemory({ 
                summary: 'React component lifecycle',
                accessCount: 0
            })
        ],
        longTermStore: { 
            items: [
                createTestMemory({ 
                    summary: 'Database optimization techniques',
                    accessCount: 0
                })
            ]
        }
    };
    
    // Create a query embedding (simulate)
    const queryEmbedding = new Array(1536).fill(0).map(() => Math.random());
    
    // Simulate multiple retrievals
    log('Simulating 3 retrievals...', 'cyan');
    
    for (let i = 0; i < 3; i++) {
        const results = findRelevantMemories(
            queryEmbedding,
            persona.midTermSlots,
            persona.longTermStore,
            2,
            persona // Pass persona to track access
        );
        
        log(`\nRetrieval ${i + 1}:`, 'yellow');
        if (results.midTerm.length > 0) {
            results.midTerm.forEach(item => {
                const slot = persona.midTermSlots[item.index];
                log(`  Mid-term: ${slot.summary.substring(0, 40)}... (access: ${slot.accessCount})`, 'cyan');
            });
        }
    }
    
    // Check that access counts increased
    const accessedSlots = persona.midTermSlots.filter(s => s.accessCount > 0);
    log(`\n${accessedSlots.length} memories had their access count increased`, 'cyan');
    
    // Check base relevance updates
    const relevanceUpdated = persona.midTermSlots.filter(s => s.baseRelevance > 1.0);
    log(`${relevanceUpdated.length} memories had their base relevance increased`, 'cyan');
    
    if (accessedSlots.length > 0 && relevanceUpdated.length > 0) {
        log('✓ Access tracking during retrieval working correctly', 'green');
    } else {
        log('✗ Access tracking not working properly', 'red');
    }
}

async function testCategoryWeights() {
    log('\n=== Test 4: Category Importance Weights ===', 'magenta');
    
    const categories = Object.keys(MEMORY_IMPORTANCE_WEIGHTS);
    log('Testing category weights:', 'yellow');
    
    categories.forEach(category => {
        const memory = createTestMemory({
            category: category,
            accessCount: 3,
            createdAt: Date.now() - (3 * 24 * 60 * 60 * 1000) // 3 days
        });
        
        const priority = calculateMemoryPriority(memory);
        log(`  ${category}: weight=${MEMORY_IMPORTANCE_WEIGHTS[category]}, priority=${priority.toFixed(3)}`, 'cyan');
    });
    
    // Verify personal > technical > project > general
    const personalPriority = calculateMemoryPriority(createTestMemory({ category: 'personal' }));
    const technicalPriority = calculateMemoryPriority(createTestMemory({ category: 'technical' }));
    const generalPriority = calculateMemoryPriority(createTestMemory({ category: 'general' }));
    
    if (personalPriority > technicalPriority && technicalPriority > generalPriority) {
        log('✓ Category weights correctly prioritize different memory types', 'green');
    } else {
        log('✗ Category weight ordering incorrect', 'red');
    }
}

async function testCapacityBasedPruning() {
    log('\n=== Test 5: Capacity-Based Pruning ===', 'magenta');
    
    const persona = {
        midTermSlots: [],
        longTermStore: { items: [] }
    };
    
    // Fill mid-term slots near capacity (18 slots)
    for (let i = 0; i < 18; i++) {
        persona.midTermSlots.push(createTestMemory({
            summary: `Memory slot ${i}`,
            accessCount: Math.floor(Math.random() * 3),
            priority: Math.random() * 0.3 // Low priorities
        }));
    }
    
    // Add one important memory
    persona.midTermSlots.push(createTestMemory({
        summary: 'Important memory that should not be pruned',
        userMarkedImportant: true,
        priority: 0.15 // Low priority but marked important
    }));
    
    const beforeCount = persona.midTermSlots.length;
    log(`Starting with ${beforeCount} mid-term slots (near capacity)`, 'cyan');
    
    // Run evaluation
    const evaluated = evaluateMemoriesForPromotion(persona);
    const afterCount = evaluated.midTermSlots.length;
    
    log(`After evaluation: ${afterCount} mid-term slots`, 'cyan');
    
    // Check that important memory was kept (either in mid-term or promoted to long-term)
    const importantInMidTerm = evaluated.midTermSlots.some(s => 
        s.summary.includes('Important memory')
    );
    const importantInLongTerm = evaluated.longTermStore.items.some(s => 
        s.summary.includes('Important memory')
    );
    
    if (importantInMidTerm || importantInLongTerm) {
        if (importantInLongTerm) {
            log('✓ Important memory promoted to long-term due to userMarkedImportant flag', 'green');
        } else {
            log('✓ Important memory preserved in mid-term', 'green');
        }
    } else {
        log('✗ Important memory was incorrectly removed entirely', 'red');
    }
    
    if (afterCount < beforeCount) {
        log(`✓ Pruned ${beforeCount - afterCount} low-priority memories near capacity`, 'green');
    } else {
        log('✗ No pruning occurred despite being near capacity', 'red');
    }
}

async function runAllTests() {
    log('\n🧪 Running Access-Based Memory System Tests', 'yellow');
    log('==========================================', 'yellow');
    
    try {
        await testAccessBasedPriority();
        await testPromotionRules();
        await testRetrievalWithAccessTracking();
        await testCategoryWeights();
        await testCapacityBasedPruning();
        
        log('\n✅ All tests completed!', 'green');
        log('\nKey improvements over time-based decay:', 'yellow');
        log('  • Memories stay relevant based on usage, not age', 'cyan');
        log('  • Important topics persist across conversation gaps', 'cyan');
        log('  • User control through marking memories as important', 'cyan');
        log('  • Semantic clustering keeps related memories together', 'cyan');
        log('  • Category-based weighting for different memory types', 'cyan');
        log('  • Capacity-based pruning only when needed', 'cyan');
        
    } catch (error) {
        log(`\n❌ Test suite failed: ${error.message}`, 'red');
        console.error(error);
    }
}

// Run tests
runAllTests().catch(console.error);
