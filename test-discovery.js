// Test script to manually trigger persona discovery after app starts
// Run this in the developer console of your Electron app

console.log("=== MANUAL PERSONA DISCOVERY TEST ===");

// Check if the backend-ready was missed
console.log("Sending discover-personas request manually...");
window.electronAPI.send('discover-personas');

// Also try to manually trigger backend-ready handler
setTimeout(() => {
    console.log("Checking if personas were loaded...");
    // This should trigger the personas-loaded event if the backend is working
}, 2000);
