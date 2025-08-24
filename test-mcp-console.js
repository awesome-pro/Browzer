/**
 * MCP Console Test - Run this in Browzer's Developer Console
 * 
 * Instructions:
 * 1. Open Browzer
 * 2. Open Developer Tools (F12 or Cmd+Option+I)
 * 3. Go to Console tab
 * 4. Copy and paste this entire script
 * 5. Press Enter to run
 */

console.log('🧪 MCP Console Test Starting...\n');

// Test 1: Environment Check
function testEnvironment() {
    console.log('1️⃣ Testing Browser Environment:');
    
    const apis = [
        { name: 'fetch', available: typeof fetch !== 'undefined' },
        { name: 'WebSocket', available: typeof WebSocket !== 'undefined' },
        { name: 'localStorage', available: typeof localStorage !== 'undefined' },
        { name: 'EventSource', available: typeof EventSource !== 'undefined' },
        { name: 'URL', available: typeof URL !== 'undefined' }
    ];
    
    apis.forEach(api => {
        console.log(`   ${api.available ? '✅' : '❌'} ${api.name}: ${api.available ? 'Available' : 'Missing'}`);
    });
    
    const allAvailable = apis.every(api => api.available);
    console.log(`\n   Result: ${allAvailable ? '✅ All APIs available!' : '❌ Some APIs missing'}\n`);
    
    return allAvailable;
}

// Test 2: Storage Test
function testStorage() {
    console.log('2️⃣ Testing localStorage:');
    
    try {
        // Test MCP config storage
        const testConfig = {
            name: 'zapier-test',
            url: 'https://mcp.zapier.com/api/mcp/s/ZjgwOGM1ZjctYjBkZC00ZWM4LWFiOGEtMGE2ZTA0NmJhNzgzOjdjNDEwOTc0LTIzNTctNGYyYy1hZTBiLWU4Mjg2OTA2MzZlZQ==/mcp',
            enabled: true,
            transport: 'sse'
        };
        
        localStorage.setItem('mcp_test', JSON.stringify([testConfig]));
        const retrieved = JSON.parse(localStorage.getItem('mcp_test'));
        localStorage.removeItem('mcp_test');
        
        if (retrieved && retrieved.length === 1 && retrieved[0].name === 'zapier-test') {
            console.log('   ✅ localStorage read/write/delete works');
            console.log('   ✅ MCP config storage compatible\n');
            return true;
        } else {
            throw new Error('Data mismatch');
        }
    } catch (error) {
        console.log(`   ❌ localStorage failed: ${error.message}\n`);
        return false;
    }
}

// Test 3: MCP Connection Test
async function testMcpConnection() {
    console.log('3️⃣ Testing MCP Connection:');
    
    const zapierUrl = 'https://mcp.zapier.com/api/mcp/s/ZjgwOGM1ZjctYjBkZC00ZWM4LWFiOGEtMGE2ZTA0NmJhNzgzOjdjNDEwOTc0LTIzNTctNGYyYy1hZTBiLWU4Mjg2OTA2MzZlZQ==/mcp';
    
    const payload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            clientInfo: {
                name: 'browzer-console-test',
                version: '1.0.0'
            }
        }
    };
    
    try {
        console.log('   📤 Sending initialize request...');
        
        const response = await fetch(zapierUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream'
            },
            body: JSON.stringify(payload)
        });
        
        console.log(`   📥 Response: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Handle SSE response
        if (response.headers.get('content-type')?.includes('text/event-stream')) {
            console.log('   📡 Processing SSE stream...');
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

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
                                    const server = eventData.result.serverInfo;
                                    console.log(`   ✅ Connected to: ${server.name} v${server.version}`);
                                    console.log(`   ✅ Protocol: ${eventData.result.protocolVersion}`);
                                    console.log(`   ✅ Capabilities: ${JSON.stringify(eventData.result.capabilities)}\n`);
                                    return true;
                                }
                            } catch (parseError) {
                                console.log(`   ⚠️ Parse error: ${parseError.message}`);
                            }
                        }
                        currentEvent = {};
                    }
                }
            }
        }
        
        console.log('   ❌ No valid response received\n');
        return false;
        
    } catch (error) {
        console.log(`   ❌ Connection failed: ${error.message}`);
        
        if (error.message.includes('CORS')) {
            console.log('   💡 CORS error detected - server may not allow browser requests');
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
            console.log('   💡 Network error - check internet connection');
        }
        
        console.log('');
        return false;
    }
}

// Test 4: Tools List Test
async function testToolsList() {
    console.log('4️⃣ Testing Tools List:');
    
    const zapierUrl = 'https://mcp.zapier.com/api/mcp/s/ZjgwOGM1ZjctYjBkZC00ZWM4LWFiOGEtMGE2ZTA0NmJhNzgzOjdjNDEwOTc0LTIzNTctNGYyYy1hZTBiLWU4Mjg2OTA2MzZlZQ==/mcp';
    
    const payload = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
    };
    
    try {
        console.log('   📤 Requesting tools list...');
        
        const response = await fetch(zapierUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream'
            },
            body: JSON.stringify(payload)
        });
        
        if (response.headers.get('content-type')?.includes('text/event-stream')) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

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
                                if (eventData.result && eventData.result.tools) {
                                    const tools = eventData.result.tools;
                                    console.log(`   ✅ Found ${tools.length} tools!`);
                                    
                                    // Show first 5 tools
                                    console.log('   📋 Sample tools:');
                                    tools.slice(0, 5).forEach((tool, i) => {
                                        console.log(`      ${i + 1}. ${tool.name} - ${tool.description || 'No description'}`);
                                    });
                                    
                                    if (tools.length > 5) {
                                        console.log(`      ... and ${tools.length - 5} more tools`);
                                    }
                                    
                                    console.log('');
                                    return tools;
                                }
                            } catch (parseError) {
                                // Continue processing
                            }
                        }
                        currentEvent = {};
                    }
                }
            }
        }
        
        console.log('   ❌ No tools received\n');
        return [];
        
    } catch (error) {
        console.log(`   ❌ Tools list failed: ${error.message}\n`);
        return [];
    }
}

// Run all tests
async function runAllTests() {
    console.log('🚀 Running Complete MCP Browser Test Suite...\n');
    
    const envOk = testEnvironment();
    const storageOk = testStorage();
    const connectionOk = await testMcpConnection();
    const tools = await testToolsList();
    
    console.log('📊 Test Results Summary:');
    console.log(`   Environment: ${envOk ? '✅ Pass' : '❌ Fail'}`);
    console.log(`   Storage: ${storageOk ? '✅ Pass' : '❌ Fail'}`);
    console.log(`   Connection: ${connectionOk ? '✅ Pass' : '❌ Fail'}`);
    console.log(`   Tools: ${tools.length > 0 ? `✅ Pass (${tools.length} tools)` : '❌ Fail'}`);
    
    const allPassed = envOk && storageOk && connectionOk && tools.length > 0;
    
    console.log(`\n🎯 Overall Result: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ Some tests failed'}`);
    
    if (allPassed) {
        console.log('\n🎉 MCP is fully working in your browser!');
        console.log('💡 You can now use McpClientManager in Browzer');
        console.log('💡 Add the Zapier server in Settings → MCP Servers');
    } else {
        console.log('\n🔧 Some issues detected. Check the individual test results above.');
    }
    
    return allPassed;
}

// Auto-run all tests
runAllTests();
