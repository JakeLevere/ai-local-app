// Jest test for persona profile functionality
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { loadPersonaData, savePersonaData } = require('../personaService');

describe('Persona Profile', () => {
    let tempDir;
    let vaultPath;

    beforeEach(async () => {
        // Create a temporary directory for testing
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'persona-test-'));
        vaultPath = tempDir;
    });

    afterEach(async () => {
        // Clean up temporary directory
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('should load default profile when file does not exist', async () => {
        const data = await loadPersonaData('test-persona', vaultPath);
        
        expect(data.profile).toBeDefined();
        expect(data.profile.name).toBe('test-persona');
        expect(data.profile.description).toBe('');
        expect(data.profile.style).toBe('conversational');
        expect(data.profile.pronouns).toBe('they/them');
        expect(data.profile.topics).toEqual([]);
    });

    it('should save and load profile data correctly', async () => {
        const testProfile = {
            name: 'Alice',
            description: 'A helpful AI assistant specializing in coding',
            style: 'professional',
            pronouns: 'she/her',
            topics: ['programming', 'algorithms', 'web development']
        };

        const testData = {
            profile: testProfile,
            shortTermHistory: [],
            midTermSlots: [],
            longTermStore: { items: [] },
            voice: {
                provider: 'elevenlabs',
                voiceId: 'test-voice-id',
                speed: 1.0,
                stability: 0.5,
                similarityBoost: 0.75,
                style: 0.5
            }
        };

        // Save the data
        await savePersonaData('alice', testData, vaultPath);

        // Load it back
        const loadedData = await loadPersonaData('alice', vaultPath);

        expect(loadedData.profile).toEqual(testProfile);
        expect(loadedData.voice.voiceId).toBe('test-voice-id');
    });

    it('should preserve existing data when updating profile', async () => {
        // Initial data with some memory
        const initialData = {
            profile: {
                name: 'Bob',
                description: 'Initial description',
                style: 'casual',
                pronouns: 'he/him',
                topics: ['sports']
            },
            shortTermHistory: [
                { role: 'user', content: 'Hello', ts: Date.now() }
            ],
            midTermSlots: [
                { summary: 'Discussed sports', embedding: [0.1, 0.2], priority: 1.0 }
            ],
            longTermStore: { items: [
                { summary: 'Long-term memory item', embedding: [0.3, 0.4] }
            ]},
            voice: {
                provider: 'elevenlabs',
                voiceId: 'bob-voice',
                speed: 1.2,
                stability: 0.6,
                similarityBoost: 0.8,
                style: 0.4
            }
        };

        await savePersonaData('bob', initialData, vaultPath);

        // Update only the profile
        const updatedData = await loadPersonaData('bob', vaultPath);
        updatedData.profile.description = 'Updated description';
        updatedData.profile.topics.push('technology');

        await savePersonaData('bob', updatedData, vaultPath);

        // Verify all data is preserved
        const finalData = await loadPersonaData('bob', vaultPath);

        expect(finalData.profile.description).toBe('Updated description');
        expect(finalData.profile.topics).toContain('technology');
        expect(finalData.shortTermHistory).toHaveLength(1);
        expect(finalData.midTermSlots).toHaveLength(1);
        expect(finalData.longTermStore.items).toHaveLength(1);
        expect(finalData.voice.voiceId).toBe('bob-voice');
    });

    it('should handle missing profile fields with defaults', async () => {
        // Create a persona.json with missing profile fields
        const personaFolder = path.join(vaultPath, 'test_persona');
        await fs.mkdir(personaFolder, { recursive: true });
        
        const partialData = {
            profile: {
                name: 'PartialProfile'
                // Missing other fields
            },
            shortTermHistory: [],
            midTermSlots: [],
            longTermStore: { items: [] }
        };

        await fs.writeFile(
            path.join(personaFolder, 'persona.json'),
            JSON.stringify(partialData, null, 2)
        );

        const loadedData = await loadPersonaData('test_persona', vaultPath);

        // Should have default values for missing fields
        expect(loadedData.profile.name).toBe('PartialProfile');
        expect(loadedData.profile.description).toBe('');
        expect(loadedData.profile.style).toBe('conversational');
        expect(loadedData.profile.pronouns).toBe('they/them');
        expect(loadedData.profile.topics).toEqual([]);
    });

    it('should handle empty topics array', async () => {
        const data = {
            profile: {
                name: 'EmptyTopics',
                description: 'Test',
                style: 'formal',
                pronouns: 'it/its',
                topics: []
            },
            shortTermHistory: [],
            midTermSlots: [],
            longTermStore: { items: [] }
        };

        await savePersonaData('empty-topics', data, vaultPath);
        const loaded = await loadPersonaData('empty-topics', vaultPath);

        expect(loaded.profile.topics).toEqual([]);
        expect(Array.isArray(loaded.profile.topics)).toBe(true);
    });
});
