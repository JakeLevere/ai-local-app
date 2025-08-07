// Jest test for memory utility module
const {
    cosineSimilarity,
    addToShortTerm,
    getShortTermHistory,
    addOrUpdateMidTermSlot,
    decayMidTermSlots,
    addToLongTermStore,
    runMemoryMaintenance,
    findRelevantMemories,
    SIMILARITY_THRESHOLD
} = require('../utils/memory');

describe('Memory Utility Module', () => {
    describe('cosineSimilarity', () => {
        it('should return 1 for identical vectors', () => {
            const vec = [0.5, 0.3, 0.2];
            expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0);
        });

        it('should return 0 for orthogonal vectors', () => {
            const vec1 = [1, 0, 0];
            const vec2 = [0, 1, 0];
            expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(0);
        });

        it('should handle null/undefined vectors', () => {
            expect(cosineSimilarity(null, [1, 2])).toBe(0);
            expect(cosineSimilarity([1, 2], null)).toBe(0);
        });

        it('should handle vectors of different lengths', () => {
            expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
        });
    });

    describe('Short-term memory', () => {
        it('should maintain fixed size queue', () => {
            let persona = { shortTermHistory: [] };
            
            // Add more than max messages
            for (let i = 0; i < 15; i++) {
                persona = addToShortTerm(persona, {
                    role: 'user',
                    content: `Message ${i}`,
                    ts: Date.now() + i
                }, 10);
            }
            
            const history = getShortTermHistory(persona);
            expect(history.length).toBe(10);
            expect(history[0].content).toBe('Message 5');
            expect(history[9].content).toBe('Message 14');
        });

        it('should throw error for invalid messages', () => {
            const persona = { shortTermHistory: [] };
            expect(() => addToShortTerm(persona, {})).toThrow();
            expect(() => addToShortTerm(persona, { role: 'user' })).toThrow();
            expect(() => addToShortTerm(persona, { content: 'test' })).toThrow();
        });

        it('should add timestamp if not provided', () => {
            let persona = { shortTermHistory: [] };
            const beforeTime = Date.now();
            
            persona = addToShortTerm(persona, {
                role: 'user',
                content: 'Test message'
            });
            
            const history = getShortTermHistory(persona);
            expect(history[0].ts).toBeGreaterThanOrEqual(beforeTime);
            expect(history[0].ts).toBeLessThanOrEqual(Date.now());
        });
    });

    describe('Mid-term memory slots', () => {
        it('should create new slot when no similar exists', () => {
            let persona = { midTermSlots: [] };
            
            persona = addOrUpdateMidTermSlot(persona, {
                summary: 'Test summary',
                embedding: [0.1, 0.2, 0.3],
                priority: 1.0
            });
            
            expect(persona.midTermSlots.length).toBe(1);
            expect(persona.midTermSlots[0].summary).toBe('Test summary');
        });

        it('should update existing similar slot', () => {
            let persona = { midTermSlots: [] };
            const embedding = [0.5, 0.5, 0.5];
            
            // Add initial slot
            persona = addOrUpdateMidTermSlot(persona, {
                summary: 'First summary',
                embedding: embedding,
                priority: 1.0
            });
            
            // Add similar slot (same embedding for test)
            const similarSlot = {
                index: 0,
                similarity: 1.0
            };
            
            persona = addOrUpdateMidTermSlot(persona, {
                summary: 'Updated summary',
                embedding: embedding,
                priority: 1.0
            }, similarSlot);
            
            expect(persona.midTermSlots.length).toBe(1);
            expect(persona.midTermSlots[0].summary).toBe('Updated summary');
            expect(persona.midTermSlots[0].priority).toBeGreaterThan(1.0);
        });

        it('should maintain max slot limit', () => {
            let persona = { midTermSlots: [] };
            
            // Add more than max slots
            for (let i = 0; i < 25; i++) {
                persona = addOrUpdateMidTermSlot(persona, {
                    summary: `Summary ${i}`,
                    embedding: [Math.random(), Math.random()],
                    priority: Math.random() * 5
                });
            }
            
            expect(persona.midTermSlots.length).toBe(20); // Max slots is 20
        });
    });

    describe('Memory decay and promotion', () => {
        beforeEach(() => {
            // Mock console.log to suppress output in tests
            jest.spyOn(console, 'log').mockImplementation(() => {});
        });

        afterEach(() => {
            console.log.mockRestore();
        });

        it('should decay old slots and promote to long-term', () => {
            const oldTimestamp = Date.now() - (40 * 60 * 1000); // 40 minutes ago
            let persona = {
                midTermSlots: [
                    {
                        summary: 'Old slot',
                        embedding: [0.1, 0.2],
                        priority: 0.15,
                        ts: oldTimestamp
                    },
                    {
                        summary: 'Recent slot',
                        embedding: [0.3, 0.4],
                        priority: 2.0,
                        ts: Date.now()
                    }
                ],
                longTermStore: { items: [] }
            };
            
            persona = decayMidTermSlots(persona, 0.98, 0.2, 30);
            
            // Old slot should be promoted
            expect(persona.longTermStore.items.length).toBe(1);
            expect(persona.longTermStore.items[0].summary).toBe('Old slot');
            
            // Only recent slot should remain in mid-term
            expect(persona.midTermSlots.length).toBe(1);
            expect(persona.midTermSlots[0].summary).toBe('Recent slot');
        });

        it('should apply priority decay based on age', () => {
            const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
            let persona = {
                midTermSlots: [
                    {
                        summary: 'Test slot',
                        embedding: [0.1, 0.2],
                        priority: 5.0,
                        ts: fiveMinutesAgo
                    }
                ]
            };
            
            persona = decayMidTermSlots(persona, 0.95); // Aggressive decay for test
            
            expect(persona.midTermSlots[0].priority).toBeLessThan(5.0);
            expect(persona.midTermSlots[0].priority).toBeGreaterThan(3.5); // Should decay but not too much
        });

        it('should remove slots below promotion threshold', () => {
            let persona = {
                midTermSlots: [
                    {
                        summary: 'Low priority',
                        embedding: [0.1, 0.2],
                        priority: 0.1, // Below PROMOTION_THRESHOLD
                        ts: Date.now()
                    },
                    {
                        summary: 'High priority',
                        embedding: [0.3, 0.4],
                        priority: 1.0,
                        ts: Date.now()
                    }
                ]
            };
            
            persona = decayMidTermSlots(persona);
            
            // Low priority slot should be removed (not promoted due to recent timestamp)
            expect(persona.midTermSlots.length).toBe(1);
            expect(persona.midTermSlots[0].summary).toBe('High priority');
        });
    });

    describe('Long-term memory store', () => {
        it('should add items to long-term store', () => {
            let store = { items: [] };
            const newItems = [
                { summary: 'Item 1', embedding: [0.1] },
                { summary: 'Item 2', embedding: [0.2] }
            ];
            
            store = addToLongTermStore(store, newItems);
            
            expect(store.items.length).toBe(2);
            expect(store.items[0].summary).toBe('Item 1');
            expect(store.items[1].summary).toBe('Item 2');
        });

        it('should maintain max items limit', () => {
            let store = { items: [] };
            
            // Add more than max items
            const items = [];
            for (let i = 0; i < 150; i++) {
                items.push({
                    summary: `Item ${i}`,
                    embedding: [Math.random()],
                    promotedAt: Date.now() + i // Newer items have higher timestamp
                });
            }
            
            store = addToLongTermStore(store, items);
            
            expect(store.items.length).toBe(100); // LONG_TERM_MAX_ITEMS
            // Should keep most recent items
            expect(store.items[0].summary).toBe('Item 149');
        });
    });

    describe('Memory maintenance', () => {
        it('should run complete maintenance cycle', () => {
            let persona = {
                shortTermHistory: [{ role: 'user', content: 'test' }],
                midTermSlots: [
                    {
                        summary: 'Old slot',
                        embedding: [0.1],
                        priority: 0.1,
                        ts: Date.now() - (40 * 60 * 1000)
                    }
                ]
            };
            
            persona = runMemoryMaintenance(persona);
            
            // Should have all memory structures
            expect(persona.shortTermHistory).toBeDefined();
            expect(persona.midTermSlots).toBeDefined();
            expect(persona.longTermStore).toBeDefined();
            expect(persona.longTermStore.items).toBeDefined();
            
            // Old slot should be processed
            expect(persona.midTermSlots.length).toBe(0);
            expect(persona.longTermStore.items.length).toBeGreaterThan(0);
        });

        it('should initialize missing memory structures', () => {
            let persona = {};
            
            persona = runMemoryMaintenance(persona);
            
            expect(persona.shortTermHistory).toEqual([]);
            expect(persona.midTermSlots).toEqual([]);
            expect(persona.longTermStore).toEqual({ items: [] });
        });
    });

    describe('Memory retrieval', () => {
        it('should find relevant memories by similarity', () => {
            const queryEmbedding = [1, 0, 0];
            const midTermSlots = [
                { summary: 'Relevant', embedding: [0.9, 0.1, 0.0] },
                { summary: 'Irrelevant', embedding: [0, 1, 0] },
                { summary: 'Somewhat relevant', embedding: [0.7, 0.3, 0] }
            ];
            const longTermStore = {
                items: [
                    { summary: 'Long-term relevant', embedding: [0.95, 0.05, 0] },
                    { summary: 'Long-term irrelevant', embedding: [0, 0, 1] }
                ]
            };
            
            const results = findRelevantMemories(queryEmbedding, midTermSlots, longTermStore, 2);
            
            expect(results.midTerm.length).toBeLessThanOrEqual(2);
            expect(results.longTerm.length).toBeLessThanOrEqual(2);
            
            // Should return most relevant first
            if (results.midTerm.length > 0) {
                expect(results.midTerm[0].summary).toBe('Relevant');
            }
            if (results.longTerm.length > 0) {
                expect(results.longTerm[0].summary).toBe('Long-term relevant');
            }
        });

        it('should filter by minimum relevance threshold', () => {
            const queryEmbedding = [1, 0, 0];
            const midTermSlots = [
                { summary: 'Low relevance', embedding: [0.3, 0.7, 0] }
            ];
            
            const results = findRelevantMemories(queryEmbedding, midTermSlots);
            
            // Should filter out low relevance items (similarity < 0.5)
            expect(results.midTerm.length).toBe(0);
        });
    });
});
