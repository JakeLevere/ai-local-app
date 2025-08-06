const {
    addToShortTerm,
    getShortTermHistory,
    clearShortTermHistory,
    getShortTermSize
} = require('../utils/memory');

describe('Memory utility - Fixed-size queue for short-term history', () => {
    let testPersona;

    beforeEach(() => {
        testPersona = {
            id: 'test',
            name: 'Test Persona',
            shortTermHistory: [],
            midTermSlots: [],
            longTermStore: { items: [] }
        };
    });

    test('addToShortTerm adds messages to empty history', () => {
        const message = { role: 'user', content: 'Hello', ts: Date.now() };
        addToShortTerm(testPersona, message);
        
        expect(testPersona.shortTermHistory.length).toBe(1);
        expect(testPersona.shortTermHistory[0].content).toBe('Hello');
    });

    test('addToShortTerm maintains max size of 10 by default', () => {
        // Add 15 messages
        for (let i = 1; i <= 15; i++) {
            addToShortTerm(testPersona, {
                role: i % 2 === 0 ? 'assistant' : 'user',
                content: `Message ${i}`
            });
        }

        expect(testPersona.shortTermHistory.length).toBe(10);
        // Should contain messages 6-15 (the most recent 10)
        expect(testPersona.shortTermHistory[0].content).toBe('Message 6');
        expect(testPersona.shortTermHistory[9].content).toBe('Message 15');
    });

    test('addToShortTerm respects custom max size', () => {
        const maxN = 5;
        
        for (let i = 1; i <= 10; i++) {
            addToShortTerm(testPersona, {
                role: 'user',
                content: `Message ${i}`
            }, maxN);
        }

        expect(testPersona.shortTermHistory.length).toBe(maxN);
        // Should contain messages 6-10 (the most recent 5)
        expect(testPersona.shortTermHistory[0].content).toBe('Message 6');
        expect(testPersona.shortTermHistory[4].content).toBe('Message 10');
    });

    test('addToShortTerm adds timestamp if not provided', () => {
        const message = { role: 'user', content: 'Test' };
        addToShortTerm(testPersona, message);
        
        expect(testPersona.shortTermHistory[0].ts).toBeDefined();
        expect(typeof testPersona.shortTermHistory[0].ts).toBe('number');
    });

    test('addToShortTerm preserves provided timestamp', () => {
        const customTs = 1234567890;
        const message = { role: 'user', content: 'Test', ts: customTs };
        addToShortTerm(testPersona, message);
        
        expect(testPersona.shortTermHistory[0].ts).toBe(customTs);
    });

    test('addToShortTerm throws error if message lacks required fields', () => {
        expect(() => {
            addToShortTerm(testPersona, { content: 'No role' });
        }).toThrow('Message must have role and content fields');

        expect(() => {
            addToShortTerm(testPersona, { role: 'user' });
        }).toThrow('Message must have role and content fields');
    });

    test('getShortTermHistory returns current history', () => {
        addToShortTerm(testPersona, { role: 'user', content: 'Message 1' });
        addToShortTerm(testPersona, { role: 'assistant', content: 'Message 2' });
        
        const history = getShortTermHistory(testPersona);
        expect(history.length).toBe(2);
        expect(history[0].content).toBe('Message 1');
        expect(history[1].content).toBe('Message 2');
    });

    test('getShortTermHistory returns empty array if no history', () => {
        const emptyPersona = { id: 'empty' };
        const history = getShortTermHistory(emptyPersona);
        
        expect(Array.isArray(history)).toBe(true);
        expect(history.length).toBe(0);
    });

    test('clearShortTermHistory removes all messages', () => {
        // Add some messages
        for (let i = 1; i <= 5; i++) {
            addToShortTerm(testPersona, { role: 'user', content: `Message ${i}` });
        }
        expect(testPersona.shortTermHistory.length).toBe(5);
        
        // Clear history
        clearShortTermHistory(testPersona);
        expect(testPersona.shortTermHistory.length).toBe(0);
    });

    test('getShortTermSize returns correct history size', () => {
        expect(getShortTermSize(testPersona)).toBe(0);
        
        addToShortTerm(testPersona, { role: 'user', content: 'Message 1' });
        expect(getShortTermSize(testPersona)).toBe(1);
        
        addToShortTerm(testPersona, { role: 'assistant', content: 'Message 2' });
        expect(getShortTermSize(testPersona)).toBe(2);
    });

    test('getShortTermSize returns 0 for persona without history', () => {
        const noHistoryPersona = { id: 'no-history' };
        expect(getShortTermSize(noHistoryPersona)).toBe(0);
    });

    test('Fixed-size queue removes oldest messages first (FIFO)', () => {
        const maxN = 3;
        
        // Add messages sequentially
        for (let i = 1; i <= 5; i++) {
            addToShortTerm(testPersona, {
                role: 'user',
                content: `Message ${i}`,
                ts: i
            }, maxN);
        }
        
        // Should have messages 3, 4, 5 (oldest 1, 2 removed)
        const history = getShortTermHistory(testPersona);
        expect(history.length).toBe(3);
        expect(history[0].content).toBe('Message 3');
        expect(history[1].content).toBe('Message 4');
        expect(history[2].content).toBe('Message 5');
    });
});
