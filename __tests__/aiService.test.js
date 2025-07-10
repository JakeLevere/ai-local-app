const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const {
  sanitizeFolderName,
  appendToConversation
} = require('../aiService');

describe('aiService utilities', () => {
  test('sanitizeFolderName converts string', () => {
    expect(sanitizeFolderName('My Persona!')).toBe('my_persona_');
  });

  test('appendToConversation creates conversation file', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-'));
    const id = 'Chat User';
    await appendToConversation(id, 'Hello', 'Hi', tmpDir);
    const filePath = path.join(
      tmpDir,
      sanitizeFolderName(id),
      'Stored_Conversations_Aggregated.md'
    );
    const data = await fs.readFile(filePath, 'utf-8');
    expect(data).toContain('You: Hello');
    expect(data).toContain('Chat User: Hi');
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
