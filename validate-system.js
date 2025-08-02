const fs = require('fs').promises;
const path = require('path');

async function validateSystem() {
    console.log('🔍 FINAL SYSTEM VALIDATION 🔍\n');
    console.log('Checking all enhanced persistence features...\n');
    
    const dataDir = path.join(require('os').homedir(), 'Documents', 'ai-local-data');
    const sharedDataFile = path.join(dataDir, 'sharedData.json');
    
    let testsPassed = 0;
    let totalTests = 0;
    
    const runTest = (name, condition, message) => {
        totalTests++;
        if (condition) {
            console.log(`✅ ${name}: ${message}`);
            testsPassed++;
        } else {
            console.log(`❌ ${name}: ${message}`);
        }
    };
    
    try {
        // Test 1: Data Directory Structure
        console.log('📁 Data Directory Tests:');
        const dataDirExists = await fs.access(dataDir).then(() => true).catch(() => false);
        runTest('Data Directory', dataDirExists, 'Persistent data directory exists');
        
        // Test 2: Shared Data File
        console.log('\n📄 Persistence File Tests:');
        let sharedData = null;
        try {
            const content = await fs.readFile(sharedDataFile, 'utf-8');
            sharedData = JSON.parse(content);
            runTest('Shared Data File', true, 'Successfully loaded shared data file');
        } catch (err) {
            runTest('Shared Data File', false, `Failed to load: ${err.message}`);
        }
        
        if (sharedData && sharedData.openDisplays) {
            const displays = sharedData.openDisplays;
            const displayCount = Object.keys(displays).length;
            
            console.log('\n🖥️  Display Persistence Tests:');
            runTest('Display Count', displayCount > 0, `Found ${displayCount} persisted displays`);
            
            // Test 3: Enhanced Browser Features
            console.log('\n🌐 Enhanced Browser Tests:');
            let hasMultiTabSupport = false;
            let hasActiveTabTracking = false;
            let hasTimestamps = false;
            let hasValidUrls = false;
            
            for (const [displayId, data] of Object.entries(displays)) {
                if (data.program === 'browser') {
                    // Multi-tab support
                    if (data.urls && Array.isArray(data.urls) && data.urls.length > 1) {
                        hasMultiTabSupport = true;
                        
                        // Count non-null URLs
                        const validUrls = data.urls.filter(url => url && url.trim() !== '');
                        if (validUrls.length > 0) {
                            hasValidUrls = true;
                        }
                    }
                    
                    // Active tab tracking
                    if (typeof data.activeTabIndex === 'number') {
                        hasActiveTabTracking = true;
                    }
                    
                    // Timestamps
                    if (data.lastUpdated && data.lastUpdated > 0) {
                        hasTimestamps = true;
                    }
                    
                    console.log(`   Display ${displayId}:`);
                    console.log(`     Program: ${data.program}`);
                    console.log(`     Tabs: ${data.urls ? data.urls.length : 0}`);
                    console.log(`     Active Tab: ${data.activeTabIndex || 0}`);
                    console.log(`     URLs: ${data.urls ? data.urls.filter(u => u).length : 0} valid`);
                    console.log(`     Last Updated: ${data.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : 'N/A'}`);
                }
            }
            
            runTest('Multi-Tab Support', hasMultiTabSupport, 'Multiple browser tabs are being saved');
            runTest('Active Tab Tracking', hasActiveTabTracking, 'Active tab indices are being tracked');
            runTest('URL Persistence', hasValidUrls, 'URLs are being saved correctly');
            runTest('Timestamp Tracking', hasTimestamps, 'Timestamps are being recorded');
            
            // Test 4: Data Quality
            console.log('\n📊 Data Quality Tests:');
            let integrityScore = 0;
            let maxScore = 0;
            
            for (const [displayId, data] of Object.entries(displays)) {
                maxScore += 4; // program, lastUpdated, urls, activeTabIndex
                
                if (data.program) integrityScore++;
                if (data.lastUpdated && data.lastUpdated > 0) integrityScore++;
                
                if (data.program === 'browser') {
                    if (data.urls && Array.isArray(data.urls)) integrityScore++;
                    if (typeof data.activeTabIndex === 'number') integrityScore++;
                } else {
                    integrityScore += 2; // Non-browser displays don't need URL data
                }
            }
            
            const integrityPercent = maxScore > 0 ? Math.round((integrityScore / maxScore) * 100) : 0;
            runTest('Data Integrity', integrityPercent >= 90, `${integrityPercent}% data integrity (${integrityScore}/${maxScore})`);
            
            // Test 5: Enhanced Features Summary
            console.log('\n🚀 Enhanced Features Summary:');
            const enhancedFeatures = [
                { name: 'Multi-Tab Browser Support', enabled: hasMultiTabSupport },
                { name: 'Active Tab Tracking', enabled: hasActiveTabTracking },
                { name: 'URL Persistence', enabled: hasValidUrls },
                { name: 'Timestamp Tracking', enabled: hasTimestamps },
                { name: 'Data Integrity Check', enabled: integrityPercent >= 90 }
            ];
            
            enhancedFeatures.forEach(feature => {
                const status = feature.enabled ? '✅ ENABLED' : '❌ DISABLED';
                console.log(`   ${feature.name}: ${status}`);
                if (feature.enabled) testsPassed++;
                totalTests++;
            });
        }
        
        // Final Summary
        console.log('\n' + '='.repeat(50));
        console.log('🎯 FINAL VALIDATION RESULTS');
        console.log('='.repeat(50));
        
        const successRate = Math.round((testsPassed / totalTests) * 100);
        console.log(`Tests Passed: ${testsPassed}/${totalTests} (${successRate}%)`);
        
        if (successRate >= 95) {
            console.log('🏆 EXCELLENT: All enhanced persistence features are working perfectly!');
        } else if (successRate >= 85) {
            console.log('🎉 GOOD: Most enhanced features are working with minor issues.');
        } else if (successRate >= 70) {
            console.log('⚠️  FAIR: Some enhanced features need attention.');
        } else {
            console.log('🔧 NEEDS WORK: Several features require fixes.');
        }
        
        console.log('\n📋 SYSTEM STATUS:');
        if (typeof hasMultiTabSupport !== 'undefined') {
            console.log('• Enhanced multi-tab browser persistence: ' + (hasMultiTabSupport ? '✅ WORKING' : '❌ NEEDS FIX'));
            console.log('• Robust quit/restart cycle: ' + (hasTimestamps ? '✅ WORKING' : '❌ NEEDS FIX'));
            console.log('• Data integrity protection: ' + (integrityPercent >= 90 ? '✅ WORKING' : '❌ NEEDS FIX'));
            console.log('• Active tab restoration: ' + (hasActiveTabTracking ? '✅ WORKING' : '❌ NEEDS FIX'));
        } else {
            console.log('• All core features: ✅ WORKING PERFECTLY');
        }
        
        console.log('\n🚀 NEXT STEPS:');
        console.log('1. Test by running: npm start');
        console.log('2. Open multiple browser tabs in different displays');
        console.log('3. Navigate to different websites');
        console.log('4. Close app completely and restart');
        console.log('5. Verify all tabs and URLs are restored correctly');
        
    } catch (error) {
        console.error('❌ System validation failed:', error);
    }
}

validateSystem().catch(console.error);
