const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const {
  sanitizeFolderName,
  savePersonaFileContent,
  loadPersonaData,
  savePersonaData,
  discoverPersonas
} = require('../personaService');

describe('personaService utilities', () => {
  test('sanitizeFolderName replaces invalid characters', () => {
    expect(sanitizeFolderName('Hello World!')).toBe('hello_world_');
  });

  test('savePersonaFileContent writes file', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'persona-'));
    const identifier = 'Test Persona';
    const fileName = 'test.txt';
    const content = 'hello';
    await savePersonaFileContent(identifier, fileName, content, tmpDir);
    const filePath = path.join(tmpDir, sanitizeFolderName(identifier), fileName);
    const saved = await fs.readFile(filePath, 'utf-8');
    expect(saved).toBe(content);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('loadPersonaData returns defaults when file missing', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'persona-'));
    const data = await loadPersonaData('Missing Persona', tmpDir);
    expect(data).toEqual({
      shortTermHistory: [],
      midTermSlots: [],
      longTermStore: { items: [] }
    });
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('savePersonaData persists data', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'persona-'));
    const identifier = 'Persist Persona';
    const sample = {
      shortTermHistory: [{ role: 'user', content: 'hi', ts: 1 }],
      midTermSlots: [{ summary: 'test', embedding: [0.1], priority: 1, ts: 1 }],
      longTermStore: { items: [{ id: '1', summary: 'long', embedding: [0.2], meta: {} }] }
    };
    await savePersonaData(identifier, sample, tmpDir);
    const loaded = await loadPersonaData(identifier, tmpDir);
    expect(loaded).toEqual(sample);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('discoverPersonas includes memory fields', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'persona-'));
    const baseDir = tmpDir;
    await fs.mkdir(path.join(baseDir, 'images'), { recursive: true });
    await fs.writeFile(path.join(baseDir, 'images', 'test_persona.png'), '');
    const identifier = 'Test Persona';
    const personaDir = path.join(tmpDir, sanitizeFolderName(identifier));
    await fs.mkdir(personaDir, { recursive: true });
    await savePersonaData(identifier, { shortTermHistory: [], midTermSlots: [], longTermStore: { items: [] } }, tmpDir);
    const personas = await discoverPersonas(tmpDir, baseDir);
    expect(personas[0]).toHaveProperty('shortTermHistory');
    expect(Array.isArray(personas[0].shortTermHistory)).toBe(true);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
