// test-enhanced-persistence.js
// Comprehensive test script for the enhanced browser persistence system

const fs = require('fs').promises;
const path = require('path');

const dataDir = path.join(__dirname, '..', 'ai-local-data');
const dataFilePath = path.join(dataDir, 'sharedData.json');
const testResults = {
    passed: 0,
    failed: 0,
    tests: []
};

function addTestResult(testName, passed, message) {
    testResults.tests.push({
        name: testName,
        passed,
        message
    });
    
    if (passed) {
        testResults.passed++;
        console.log(`✅ ${testName}: ${message}`);
    } else {
        testResults.failed++;
        console.log(`❌ ${testName}: ${message}`);
    }
}

async function testEnhancedPersistence() {
    console.log('🧪 Testing Enhanced Browser Persistence System\n');
    console.log('='.repeat(60));

    try {
        // Ensure data file exists
        await fs.mkdir(dataDir, { recursive: true });
        try {
            await fs.access(dataFilePath);
        } catch {
            await fs.writeFile(dataFilePath, JSON.stringify({ openDisplays: {} }, null, 2), 'utf-8');
        }

        // Test 1: Verify data file exists and is readable
        console.log('\n📁 Testing Data File Integrity...');
        const content = await fs.readFile(dataFilePath, 'utf-8');
        const data = JSON.parse(content);
        
        addTestResult(
            'Data File Readable', 
            content.length > 0, 
            `File size: ${content.length} characters`
        );
        
        // Test 2: Verify enhanced structure
        console.log('\n🏗️  Testing Enhanced Data Structure...');
        const hasOpenDisplays = data.openDisplays && typeof data.openDisplays === 'object';
        addTestResult(
            'Open Displays Structure', 
            hasOpenDisplays, 
            hasOpenDisplays ? 'openDisplays object found' : 'openDisplays missing'
        );
        
        // Test 3: Verify multi-tab URL storage
        console.log('\n🗂️  Testing Multi-Tab URL Storage...');
        let multiTabTestPassed = false;
        let multiTabMessage = 'No browser displays found';
        
        for (const [displayId, displayInfo] of Object.entries(data.openDisplays || {})) {
            if (displayInfo.program === 'browser' && Array.isArray(displayInfo.urls)) {
                multiTabTestPassed = true;
                multiTabMessage = `${displayId}: ${displayInfo.urls.length} tab URLs stored`;
                
                addTestResult(
                    `${displayId} URL Array`, 
                    displayInfo.urls.length > 0, 
                    `Contains ${displayInfo.urls.length} URLs`
                );
                
                // Test individual URLs
                displayInfo.urls.forEach((url, index) => {
                    if (url && url !== 'https://www.google.com/') {
                        addTestResult(
                            `${displayId} Tab ${index} Custom URL`, 
                            true, 
                            `Saved: ${url.substring(0, 50)}...`
                        );
                    }
                });
            }
        }
        
        addTestResult('Multi-Tab URL Storage', multiTabTestPassed, multiTabMessage);
        
        // Test 4: Verify active tab index tracking
        console.log('\n🎯 Testing Active Tab Index Tracking...');
        let activeTabTestPassed = false;
        let activeTabMessage = 'No active tab indices found';
        
        for (const [displayId, displayInfo] of Object.entries(data.openDisplays || {})) {
            if (displayInfo.program === 'browser' && typeof displayInfo.activeTabIndex === 'number') {
                activeTabTestPassed = true;
                activeTabMessage = `${displayId}: Active tab index ${displayInfo.activeTabIndex}`;
                
                addTestResult(
                    `${displayId} Active Tab Index`, 
                    displayInfo.activeTabIndex >= 0 && displayInfo.activeTabIndex < 5, 
                    `Index: ${displayInfo.activeTabIndex}`
                );
            }
        }
        
        addTestResult('Active Tab Index Tracking', activeTabTestPassed, activeTabMessage);
        
        // Test 5: Verify timestamp tracking
        console.log('\n⏰ Testing Timestamp Tracking...');
        let timestampTestPassed = false;
        let timestampMessage = 'No timestamps found';
        
        for (const [displayId, displayInfo] of Object.entries(data.openDisplays || {})) {
            if (displayInfo.program === 'browser' && typeof displayInfo.lastUpdated === 'number') {
                timestampTestPassed = true;
                const updateTime = new Date(displayInfo.lastUpdated);
                timestampMessage = `${displayId}: Last updated ${updateTime.toLocaleString()}`;
                
                addTestResult(
                    `${displayId} Timestamp`, 
                    displayInfo.lastUpdated > 0, 
                    `Updated: ${updateTime.toLocaleString()}`
                );
            }
        }
        
        addTestResult('Timestamp Tracking', timestampTestPassed, timestampMessage);
        
        // Test 6: Data consistency check
        console.log('\n🔍 Testing Data Consistency...');
        let consistencyPassed = true;
        let consistencyMessage = 'All data consistent';
        
        for (const [displayId, displayInfo] of Object.entries(data.openDisplays || {})) {
            if (displayInfo.program === 'browser') {
                // Check if activeTabIndex is within bounds
                if (displayInfo.activeTabIndex >= (displayInfo.urls?.length || 0)) {
                    consistencyPassed = false;
                    consistencyMessage = `${displayId}: Active tab index out of bounds`;
                }
                
                // Check if URLs array has reasonable length
                if (displayInfo.urls && displayInfo.urls.length > 10) {
                    consistencyPassed = false;
                    consistencyMessage = `${displayId}: Too many URLs (${displayInfo.urls.length})`;
                }
            }
        }
        
        addTestResult('Data Consistency', consistencyPassed, consistencyMessage);
        
        // Test 7: Backward compatibility
        console.log('\n🔄 Testing Backward Compatibility...');
        let backwardCompatPassed = false;
        let backwardCompatMessage = 'No backward compatibility data found';
        
        for (const [displayId, displayInfo] of Object.entries(data.openDisplays || {})) {
            if (displayInfo.program === 'browser' && displayInfo.url) {
                backwardCompatPassed = true;
                backwardCompatMessage = `${displayId}: Legacy 'url' field preserved`;
                
                addTestResult(
                    `${displayId} Legacy URL Field`, 
                    typeof displayInfo.url === 'string', 
                    `URL: ${displayInfo.url.substring(0, 50)}...`
                );
            }
        }
        
        addTestResult('Backward Compatibility', backwardCompatPassed, backwardCompatMessage);
        
    } catch (error) {
        addTestResult('Critical Error', false, error.message);
    }
    
    // Display final results
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📈 Success Rate: ${Math.round((testResults.passed / (testResults.passed + testResults.failed)) * 100)}%`);
    
    if (testResults.failed === 0) {
        console.log('\n🎉 ALL TESTS PASSED! Enhanced persistence system is working perfectly.');
    } else {
        console.log('\n⚠️  Some tests failed. Please review the issues above.');
    }
    
    console.log('\n📋 Detailed Test Results:');
    testResults.tests.forEach(test => {
        const status = test.passed ? '✅' : '❌';
        console.log(`  ${status} ${test.name}: ${test.message}`);
    });
    
    return testResults.failed === 0;
}

async function demonstrateFeatures() {
    console.log('\n🚀 ENHANCED FEATURES DEMONSTRATION');
    console.log('='.repeat(60));
    
    try {
        const content = await fs.readFile(dataFilePath, 'utf-8');
        const data = JSON.parse(content);
        
        console.log('\n🔹 Multi-Tab URL Persistence:');
        for (const [displayId, displayInfo] of Object.entries(data.openDisplays || {})) {
            if (displayInfo.program === 'browser') {
                console.log(`   ${displayId}:`);
                displayInfo.urls?.forEach((url, index) => {
                    const indicator = index === displayInfo.activeTabIndex ? '👆 ACTIVE' : '';
                    console.log(`     Tab ${index}: ${url} ${indicator}`);
                });
            }
        }
        
        console.log('\n🔹 Enhanced State Information:');
        for (const [displayId, displayInfo] of Object.entries(data.openDisplays || {})) {
            if (displayInfo.program === 'browser') {
                console.log(`   ${displayId}:`);
                console.log(`     Active Tab: ${displayInfo.activeTabIndex}`);
                console.log(`     Last Updated: ${new Date(displayInfo.lastUpdated).toLocaleString()}`);
                console.log(`     Total Tabs: ${displayInfo.urls?.length || 0}`);
                console.log(`     Unique URLs: ${new Set(displayInfo.urls).size}`);
            }
        }
        
    } catch (error) {
        console.log(`Error demonstrating features: ${error.message}`);
    }
}

// Run the tests
testEnhancedPersistence().then(async (success) => {
    if (success) {
        await demonstrateFeatures();
    }
    
    console.log('\n💡 NEXT STEPS FOR TESTING:');
    console.log('1. Open multiple browser tabs with different websites');
    console.log('2. Switch between tabs to change the active tab');
    console.log('3. Close and reopen the application');
    console.log('4. Verify all tabs and active tab are restored correctly');
    
}).catch(error => {
    console.error('Test execution failed:', error);
});
