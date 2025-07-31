const { session, net } = require('electron');

const youtubePatterns = [
    '*://*.youtube.com/api/stats/ads*',
    '*://*.youtube.com/get_video_ads*',
    '*://*.youtube.com/pagead/*',
    '*://*.youtube.com/ptracking?*',
    '*://*.googleadservices.com/*',
    '*://*.googlesyndication.com/*',
    '*://googleads.g.doubleclick.net/*',
    '*://static.doubleclick.net/*',
    '*://pagead2.googlesyndication.com/*',
    '*://*.googlevideo.com/videoplayback?*adformat*',
];

let adBlockPatterns = [
    ...new Set([
        ...youtubePatterns,
        '*://*.doubleclick.net/*',
        '*://*.googlesyndication.com/*',
        '*://*.googleadservices.com/*',
        '*://*.adservice.google.com/*',
        '*://*.adnxs.com/*',
        '*://*.adform.net/*',
        '*://*.adroll.com/*',
        '*://*.amazon-adsystem.com/*',
        '*://*.criteo.com/*',
        '*://*.pubmatic.com/*',
        '*://*.rubiconproject.com/*',
        '*://*.openx.net/*',
        '*://*.zedo.com/*',
        '*://*.taboola.com/*',
        '*://*.outbrain.com/*',
        '*://*.sharethrough.com/*',
        '*://*.adsrvr.org/*',
        '*://*.moatads.com/*',
        '*://*.integralads.com/*',
        '*://*.scorecardresearch.com/*',
        '*://*.quantserve.com/*',
        '*://*.comscore.com/*',
        '*://*.liadm.com/*',
        '*://*.turn.com/*',
        '*://*.contextweb.com/*',
        '*://*.simpli.fi/*',
        '*://*.criteo.net/*',
        '*://*.crwdcntrl.net/*',
        '*://*.rlcdn.com/*',
        '*://*.mathtag.com/*',
        '*://*.tapad.com/*',
        '*://*.bidswitch.net/*',
        '*://*.agkn.com/*',
        '*://*.casalemedia.com/*',
        '*://*.dotomi.com/*',
        '*://*.eyeota.net/*',
        '*://*.servenobid.com/*',
        '*://*.adblade.com/*',
        '*://*.adcolony.com/*',
        '*://*.adtech.com/*',
        '*://*.adtechus.com/*',
        '*://*.advertising.com/*',
        '*://*.yieldmo.com/*',
        '*://*.conversantmedia.com/*',
        '*://*.media.net/*',
        '*://*.tribalfusion.com/*',
        '*://*.undertone.com/*',
        '*://*.exponential.com/*',
        '*://*.vibrantmedia.com/*',
        '*://*.gumgum.com/*',
        '*://*.infolinks.com/*',
        '*://*.sovrn.com/*',
        '*://*.spotxchange.com/*',
        '*://*.teads.tv/*',
        '*://*.tremorhub.com/*',
        '*://*.brightroll.com/*',
        '*://*.adap.tv/*',
        '*://*.liverail.com/*',
        '*://*.smartadserver.com/*',
        '*://*.freewheel.tv/*',
        '*://*.stickyadstv.com/*',
        '*://*.tubemogul.com/*',
        '*://*.videologygroup.com/*',
        '*://*.acuityplatform.com/*',
        '*://*.adingo.jp/*',
        '*://*.adverline.com/*',
        '*://*.imrworldwide.com/*',
        '*://*.revsci.net/*',
        '*://*.fastclick.net/*',
        '*://*.valueclick.net/*',
        '*://*.Burstnet.com/*',
    ])
];

function setupAdBlocker(targetSession = session.defaultSession) {
    if (!targetSession || !targetSession.webRequest) return;
    const filter = {
        urls: adBlockPatterns
    };
    targetSession.webRequest.onBeforeRequest(filter, (details, callback) => {
        callback({ cancel: true });
    });
}

function addAdBlockPatterns(patterns, targetSession = session.defaultSession) {
    if (!Array.isArray(patterns) || patterns.length === 0) return;
    const patternSet = new Set(adBlockPatterns);
    const newPatterns = patterns.filter(p => !patternSet.has(p));
    
    if (newPatterns.length > 0) {
        adBlockPatterns.push(...newPatterns);
        console.log(`Added ${newPatterns.length} new ad block patterns.`);
        setupAdBlocker(targetSession);
    }
}

async function updateAdBlockPatternsFromURL(url, targetSession = session.defaultSession) {
    console.log(`Fetching ad block patterns from ${url}`);
    return new Promise((resolve, reject) => {
        const request = net.request(url);
        let body = '';
        request.on('response', (response) => {
            if (response.statusCode < 200 || response.statusCode >= 300) {
                return reject(new Error(`Failed to load page, status code: ${response.statusCode}`));
            }
            response.on('data', (chunk) => {
                body += chunk.toString();
            });
            response.on('end', () => {
                try {
                    const lines = body.split('\n');
                    const newPatterns = lines.map(line => {
                        const match = line.match(/^\s*(?:127\.0\.0\.1|0\.0\.0\.0)\s+([^\s#]+)/);
                        if (match && match[1]) {
                            return `*://${match[1].trim()}/*`;
                        }
                        return null;
                    }).filter(Boolean);
                    
                    addAdBlockPatterns(newPatterns, targetSession);
                    console.log(`Successfully updated ad block patterns with ${newPatterns.length} patterns from ${url}`);
                    resolve();
                } catch (err) {
                    console.error('Failed to parse ad block list:', err);
                    reject(err);
                }
            });
        });
        request.on('error', (error) => {
            console.error(`Failed to fetch ad block list from ${url}:`, error);
            reject(error);
        });
        request.end();
    });
}

module.exports = { setupAdBlocker, addAdBlockPatterns, updateAdBlockPatternsFromURL, adBlockPatterns };
