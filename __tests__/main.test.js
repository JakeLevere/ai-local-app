const handlers = {};

jest.mock('electron', () => {
  const ipcMain = {
    on: jest.fn((channel, fn) => { handlers[channel] = fn; }),
    removeListener: jest.fn(),
  };
  const mockWebContents = {
    on: jest.fn(),
    once: jest.fn(),
    loadURL: jest.fn().mockResolvedValue(),
    send: jest.fn(),
    isDestroyed: jest.fn(() => false),
  };
  const BrowserWindow = jest.fn(() => ({
    webContents: mockWebContents,
    on: jest.fn(),
    once: jest.fn(),
    loadURL: jest.fn().mockResolvedValue(),
    maximize: jest.fn(),
    show: jest.fn(),
    getContentSize: jest.fn(() => [800, 600]),
    setBrowserView: jest.fn(),
  }));
  const BrowserView = jest.fn(() => ({
    webContents: {
      loadURL: jest.fn(),
      on: jest.fn(),
      getURL: jest.fn(() => 'about:blank'),
    },
    setBounds: jest.fn(),
    setAutoResize: jest.fn(),
  }));
  return {
    app: {
      whenReady: jest.fn(() => ({ then: jest.fn() })),
      getPath: jest.fn(() => '/tmp'),
      on: jest.fn(),
      quit: jest.fn(),
    },
    BrowserWindow,
    BrowserView,
    ipcMain,
  };
});

jest.mock('../ipcHandlers', () => jest.fn());

const main = require('../main.js');

describe('launch-browser ipc handling', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    for (const key in handlers) delete handlers[key];
    await main.createWindow('http://localhost:3000');
    jest.spyOn(main, 'launchBrowser').mockImplementation(() => {});
  });

  test('registers single listener and calls launchBrowser', () => {
    expect(handlers['launch-browser']).toBeDefined();
    expect(require('electron').ipcMain.on).toHaveBeenCalledTimes(1);
    handlers['launch-browser']();
    expect(main.launchBrowser).toHaveBeenCalledTimes(1);
  });
});
