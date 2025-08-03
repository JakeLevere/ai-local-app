jest.mock('electron', () => ({
  session: { defaultSession: { webRequest: { onBeforeRequest: jest.fn() } } },
  net: { request: jest.fn() }
}));

const { setupAdBlocker, adBlockPatterns } = require('../adBlocker');

describe('adBlocker', () => {
  test('setupAdBlocker registers webRequest handler', () => {
    const mockSession = {
      webRequest: { onBeforeRequest: jest.fn() }
    };
    setupAdBlocker(mockSession);
    expect(mockSession.webRequest.onBeforeRequest).toHaveBeenCalledWith(
      { urls: adBlockPatterns },
      expect.any(Function)
    );
  });
});
