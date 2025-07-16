const fs = require('fs').promises;

const handlers = {};

jest.mock('electron', () => ({
  ipcMain: {
    on: (channel, cb) => { handlers[channel] = cb; },
    handle: jest.fn()
  },
  shell: {}
}));

jest.mock('../personaService.js', () => ({}));
jest.mock('../sharedDataService.js', () => ({ init: jest.fn() }));

const initialize = require('../ipcHandlers');

const mockWindow = {
  webContents: {
    send: jest.fn(),
    isDestroyed: () => false
  }
};

describe('open-program handler', () => {
  beforeEach(() => {
    mockWindow.webContents.send.mockClear();
    initialize(mockWindow, { serverUrl: 'http://localhost:3000', userDataPath: '/tmp' });
  });

  test('sends load-display when program file exists', async () => {
    fs.access = jest.fn().mockResolvedValue();
    const handler = handlers['open-program'];
    await handler({}, { program: 'test', displayId: 'display1' });
    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      'load-display',
      expect.objectContaining({ displayId: 'display1', url: expect.stringContaining('/programs/test/index.html') })
    );
  });

  test('sends error when program file does not exist', async () => {
    fs.access = jest.fn().mockRejectedValue(new Error('not found'));
    const handler = handlers['open-program'];
    await handler({}, { program: 'missing', displayId: 'display1' });
    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      'main-process-error',
      'No program "missing" found.'
    );
  });
});
