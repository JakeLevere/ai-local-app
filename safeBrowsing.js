const BLOCKED_DOMAINS = [
    'malware.com',
    'phishing.test',
    'bad.example'
];

function isUrlSafe(url) {
    try {
        const { hostname } = new URL(url);
        const host = hostname.toLowerCase();
        return !BLOCKED_DOMAINS.some(blocked => host.includes(blocked));
    } catch (err) {
        return false;
    }
}

module.exports = { isUrlSafe };
