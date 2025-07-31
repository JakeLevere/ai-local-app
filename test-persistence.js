// test-persistence.js
// Simple script to test the persistence functionality

const fs = require('fs').promises;
const path = require('path');

const dataFilePath = path.join(__dirname, '..', 'ai-local-data', 'sharedData.json');

async function testPersistence() {
    console.log('Testing Persistence System\n');
    
    try {
        // Read current state
        console.log('1. Reading current state...');
        const content = await fs.readFile(dataFilePath, 'utf-8');
        const data = JSON.parse(content);
        console.log('Current state:', JSON.stringify(data, null, 2));
        
        // Simulate adding some program states
        console.log('\n2. Simulating program state changes...');
        data.openDisplays = {
            'display1': { program: 'browser', url: 'https://www.google.com' },
            'display2': { program: 'calendar' },
            'display3': { program: 'health' }
        };
        
        // Write the updated state
        await fs.writeFile(dataFilePath, JSON.stringify(data, null, 2), 'utf-8');
        console.log('Updated state written to file');
        
        // Read back to verify
        console.log('\n3. Verifying written state...');
        const verifyContent = await fs.readFile(dataFilePath, 'utf-8');
        const verifyData = JSON.parse(verifyContent);
        console.log('Verified state:', JSON.stringify(verifyData, null, 2));
        
        console.log('\n✅ Persistence test completed successfully!');
        console.log('\nTo test full persistence:');
        console.log('1. Run the app with `npm start`');
        console.log('2. Open some programs in different displays');
        console.log('3. Close the app (Ctrl+C or close window)');
        console.log('4. Reopen the app with `npm start`');
        console.log('5. The programs should be restored in their displays');
        
    } catch (error) {
        console.error('❌ Persistence test failed:', error);
    }
}

testPersistence();
