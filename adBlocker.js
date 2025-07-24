const { session } = require('electron');

// Basic patterns to block common video ad networks including YouTube ads
const AD_BLOCK_PATTERNS = [
  '*://*.doubleclick.net/*',
  '*://*.googlesyndication.com/*',
  '*://*.googleadservices.com/*',
  '*://*.adservice.google.com/*',
  '*://*.adservice.google.*/*',
  '*://*.youtube.com/get_video_ads*',
  '*://*.youtube.com/api/stats/ads*',
  '*://*.youtube.com/pagead/*',
  '*://pagead*.googlesyndication.com/*'
];

function setupAdBlocker(targetSession = session.defaultSession) {
  if (!targetSession || !targetSession.webRequest) return;
  try {
    targetSession.webRequest.onBeforeRequest(
      { urls: AD_BLOCK_PATTERNS },
      (details, callback) => callback({ cancel: true })
    );
  } catch (err) {
    console.error('Failed to set up ad blocker:', err);
  }
}

module.exports = { setupAdBlocker, AD_BLOCK_PATTERNS };
