const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const {
  sanitizeFolderName,
  savePersonaFileContent
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
});
