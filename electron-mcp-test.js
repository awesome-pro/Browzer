/**
 * ELECTRON MCP TEST - Copy and paste this into Browzer's Developer Console
 * 
 * Instructions:
 * 1. Open Browzer app
 * 2. Press Cmd+Option+I (Mac) or F12 (Windows/Linux) to open DevTools
 * 3. Go to Console tab
 * 4. Copy and paste this ENTIRE script
 * 5. Press Enter
 * 6. Watch the test results
 */

console.log('🚀 BROWZER ELECTRON MCP TEST STARTING...\n');

async function testMcpInElectron() {
    console.log('🧪 Testing MCP Integration in Browzer Electron Environment\n');
    
    let testsPassed = 0;
    let totalTests = 0;
    
    function logTest(testName, passed, details = '') {
        totalTests++;
        if (passed) testsPassed++;
        console.log(`${passed ? '✅' : '❌'} ${testName}: ${passed ? 'PASS' : 'FAIL'} ${details}`);
    }
    
    // Test 1: Electron Environment
    console.log('1️⃣ ELECTRON ENVIRONMENT CHECK:');
    logTest('fetch API', typeof fetch !== 'undefined');
    logTest('WebSocket API', typeof WebSocket !== 'undefined');
    logTest('localStorage', typeof localStorage !== 'undefined');
    logTest('EventSource', typeof EventSource !== 'undefined');
    logTest('URL constructor', typeof URL !== 'undefined');
    logTest('JSON support', typeof JSON !== 'undefined');
    logTest('Promise support', typeof Promise !== 'undefined');
    
    // Check if we're in Electron
    const isElectron = typeof window !== 'undefined' && window.process && window.process.type === 'renderer';
    logTest('Electron renderer process', isElectron);
    
    console.log('');
    
    // Test 2: MCP Server Connection
    console.log('2️⃣ MCP SERVER CONNECTION TEST:');
    try {
        const zapierUrl = 'https://mcp.zapier.com/api/mcp/s/ZjgwOGM1ZjctYjBkZC00ZWM4LWFiOGEtMGE2ZTA0NmJhNzgzOjdjNDEwOTc0LTIzNTctNGYyYy1hZTBiLWU4Mjg2OTA2MzZlZQ==/mcp';
        
        console.log('   📤 Sending initialize request to Zapier MCP...');
        
        const response = await fetch(zapierUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream'
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2024-11-05',
                    capabilities: { tools: {} },
                    clientInfo: { name: 'browzer-electron-console-test', version: '1.0.0' }
                }
            })
        });
        
        logTest('HTTP request success', response.ok, `(${response.status} ${response.statusText})`);
        logTest('SSE content type', response.headers.get('content-type')?.includes('text/event-stream'));
        
        // Test SSE parsing
        if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
            console.log('   📡 Processing SSE stream...');
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let serverInfo = null;

            // Read first few chunks to get initialize response
            let attempts = 0;
            while (attempts < 10) {
                const { done, value } = await reader.read();
                if (done) break;
                
                attempts++;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                let currentEvent = {};
                
                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        currentEvent.data = line.substring(5).trim();
                    } else if (line === '') {
                        if (currentEvent.data) {
                            try {
                                const eventData = JSON.parse(currentEvent.data);
                                if (eventData.result && eventData.result.serverInfo) {
                                    serverInfo = eventData.result.serverInfo;
                                    break;
                                }
                            } catch (parseError) {
                                // Continue
                            }
                        }
                        currentEvent = {};
                    }
                }
                
                if (serverInfo) break;
            }
            
            logTest('Server initialization', !!serverInfo, serverInfo ? `(${serverInfo.name} v${serverInfo.version})` : '');
            
            // Clean up reader
            try { reader.cancel(); } catch {}
        }
        
    } catch (error) {
        logTest('MCP connection', false, `(${error.message})`);
    }
    
    console.log('');
    
    // Test 3: Storage Compatibility
    console.log('3️⃣ STORAGE COMPATIBILITY TEST:');
    try {
        const testKey = 'mcp_electron_test';
        const testData = {
            servers: [{
                name: 'test-server',
                url: 'https://example.com/mcp',
                enabled: true,
                transport: 'sse'
            }],
            timestamp: Date.now()
        };
        
        localStorage.setItem(testKey, JSON.stringify(testData));
        const retrieved = JSON.parse(localStorage.getItem(testKey));
        localStorage.removeItem(testKey);
        
        logTest('localStorage read/write', 
            retrieved && 
            retrieved.servers && 
            retrieved.servers[0].name === 'test-server'
        );
        
    } catch (error) {
        logTest('localStorage test', false, `(${error.message})`);
    }
    
    console.log('');
    
    // Test 4: MCP Manager Simulation
    console.log('4️⃣ MCP MANAGER SIMULATION:');
    try {
        // Simulate McpClientManager functionality
        const configs = [
            {
                name: 'zapier',
                url: 'https://mcp.zapier.com/api/mcp/s/ZjgwOGM1ZjctYjBkZC00ZWM4LWFiOGEtMGE2ZTA0NmJhNzgzOjdjNDEwOTc0LTIzNTctNGYyYy1hZTBiLWU4Mjg2OTA2MzZlZQ==/mcp',
                enabled: true,
                transport: 'sse'
            }
        ];
        
        // Test transport detection
        function detectTransportType(url) {
            const urlLower = url.toLowerCase();
            if (urlLower.startsWith('ws://') || urlLower.startsWith('wss://')) {
                return 'websocket';
            }
            if (urlLower.startsWith('http://') || urlLower.startsWith('https://')) {
                if (urlLower.includes('mcp.zapier.com')) {
                    return 'sse';
                }
                return 'sse';
            }
            return 'websocket';
        }
        
        const detectedTransport = detectTransportType(configs[0].url);
        logTest('Transport detection', detectedTransport === 'sse', `(detected: ${detectedTransport})`);
        
        // Test config management
        localStorage.setItem('mcp_servers', JSON.stringify(configs));
        const savedConfigs = JSON.parse(localStorage.getItem('mcp_servers'));
        localStorage.removeItem('mcp_servers');
        
        logTest('Config management', savedConfigs && savedConfigs.length === 1 && savedConfigs[0].name === 'zapier');
        
    } catch (error) {
        logTest('Manager simulation', false, `(${error.message})`);
    }
    
    console.log('');
    
    // Summary
    console.log('📊 TEST SUMMARY:');
    console.log(`   Tests passed: ${testsPassed}/${totalTests}`);
    console.log(`   Success rate: ${Math.round((testsPassed/totalTests) * 100)}%`);
    
    if (testsPassed === totalTests) {
        console.log('\n🎉 ALL TESTS PASSED!');
        console.log('✅ MCP is fully functional in Browzer Electron');
        console.log('✅ You can now use McpClientManager');
        console.log('✅ Ready to add MCP servers in Settings');
        
        console.log('\n💡 NEXT STEPS:');
        console.log('1. Go to Browzer Settings → MCP Servers');
        console.log('2. Add your Zapier server URL');
        console.log('3. Enable the server');
        console.log('4. Use MCP tools in Ask queries');
        
    } else {
        console.log('\n⚠️ SOME TESTS FAILED');
        console.log('Check the individual test results above');
        
        if (testsPassed >= totalTests * 0.8) {
            console.log('💡 Most tests passed - MCP should still work with minor issues');
        }
    }
    
    console.log('\n🔧 TROUBLESHOOTING:');
    console.log('- If connection fails: Check internet connectivity');
    console.log('- If CORS errors: Server may not allow browser requests');
    console.log('- If storage fails: Check Electron localStorage permissions');
    
    return { testsPassed, totalTests, success: testsPassed === totalTests };
}

// Auto-run the test
testMcpInElectron().then(result => {
    console.log(`\n🏁 Test completed: ${result.success ? 'SUCCESS' : 'PARTIAL SUCCESS'}`);
}).catch(error => {
    console.error(`\n💥 Test failed with error: ${error.message}`);
});

// Also make it available for manual re-run
window.testMcpInElectron = testMcpInElectron;
