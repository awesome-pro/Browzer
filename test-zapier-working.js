#!/usr/bin/env node

/**
 * Working test for Zapier MCP server using manual SSE handling.
 * This demonstrates the correct way to connect to Zapier MCP.
 */

const https = require('https');

function testZapierMcpWorking() {
  console.log('🎯 Testing Zapier MCP Server (Working Method)...\n');

  const serverUrl = 'https://mcp.zapier.com/api/mcp/s/ZjgwOGM1ZjctYjBkZC00ZWM4LWFiOGEtMGE2ZTA0NmJhNzgzOjdjNDEwOTc0LTIzNTctNGYyYy1hZTBiLWU4Mjg2OTA2MzZlZQ==/mcp';
  
  return new Promise((resolve, reject) => {
    console.log('1️⃣ Sending initialize request...');
    
    const initPayload = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        clientInfo: { name: 'browzer-assistant', version: '1.0.0' }
      }
    });

    const url = new URL(serverUrl);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Content-Length': Buffer.byteLength(initPayload),
        'User-Agent': 'Browzer-Assistant/1.0.0'
      }
    };

    const req = https.request(options, (res) => {
      console.log(`Status: ${res.statusCode}`);
      console.log(`Headers:`, res.headers);
      
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        return;
      }

      let buffer = '';
      let messageId = 1;

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        
        // Process complete SSE messages
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        let currentEvent = {};
        
        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent.event = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            currentEvent.data = line.substring(5).trim();
          } else if (line === '') {
            // End of message
            if (currentEvent.data) {
              console.log(`📥 Received: ${currentEvent.data}`);
              
              try {
                const response = JSON.parse(currentEvent.data);
                
                if (response.id === 1 && response.result) {
                  console.log('✅ Initialize successful!');
                  console.log('   Server info:', response.result.serverInfo);
                  
                  // Now request tools
                  console.log('\n2️⃣ Requesting tools list...');
                  sendToolsRequest();
                }
                
                if (response.id === 2 && response.result) {
                  console.log('✅ Tools list received!');
                  const tools = response.result.tools || [];
                  
                  if (tools.length === 0) {
                    console.log('⚠️ No tools found. You may need to:');
                    console.log('   - Configure Zaps in your Zapier account');
                    console.log('   - Enable MCP tools in Zapier settings');
                  } else {
                    console.log(`🎉 Found ${tools.length} Zapier tools:`);
                    tools.forEach((tool, i) => {
                      console.log(`   ${i + 1}. ${tool.name}`);
                      console.log(`      ${tool.description || 'No description'}`);
                    });
                  }
                  
                  resolve(tools);
                }
                
              } catch (parseError) {
                console.log('⚠️ Could not parse response:', currentEvent.data);
              }
            }
            currentEvent = {};
          }
        }
      });

      res.on('end', () => {
        console.log('\n🔌 Connection ended');
      });

      function sendToolsRequest() {
        const toolsPayload = JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {}
        });

        // Create new request for tools/list according to MCP Streamable HTTP spec
        const toolsOptions = {
          ...options,
          headers: {
            ...options.headers,
            'Content-Length': Buffer.byteLength(toolsPayload)
          }
        };

        const toolsReq = https.request(toolsOptions, (toolsRes) => {
          console.log('📤 Tools request sent, status:', toolsRes.statusCode);
          
          let toolsBuffer = '';
          
          toolsRes.on('data', (chunk) => {
            toolsBuffer += chunk.toString();
            
            // Process SSE format for tools response
            const lines = toolsBuffer.split('\n');
            toolsBuffer = lines.pop() || '';

            let currentEvent = {};
            
            for (const line of lines) {
              if (line.startsWith('event:')) {
                currentEvent.event = line.substring(6).trim();
              } else if (line.startsWith('data:')) {
                currentEvent.data = line.substring(5).trim();
              } else if (line === '') {
                if (currentEvent.data) {
                  console.log(`📥 Tools response: ${currentEvent.data}`);
                  
                  try {
                    const response = JSON.parse(currentEvent.data);
                    if (response.id === 2 && response.result) {
                      console.log('✅ Tools list received!');
                      const tools = response.result.tools || [];
                      
                      if (tools.length === 0) {
                        console.log('⚠️ No tools found. You may need to:');
                        console.log('   - Configure Zaps in your Zapier account');
                        console.log('   - Enable MCP tools in Zapier settings');
                      } else {
                        console.log(`🎉 Found ${tools.length} Zapier tools:`);
                        tools.forEach((tool, i) => {
                          console.log(`   ${i + 1}. ${tool.name}`);
                          console.log(`      ${tool.description || 'No description'}`);
                        });
                      }
                      
                      resolve(tools);
                    }
                  } catch (parseError) {
                    console.log('⚠️ Could not parse tools response:', currentEvent.data);
                  }
                }
                currentEvent = {};
              }
            }
          });
          
          toolsRes.on('end', () => {
            console.log('🔌 Tools request completed');
          });
        });
        
        toolsReq.on('error', (error) => {
          console.error('❌ Tools request error:', error.message);
        });
        
        toolsReq.write(toolsPayload);
        toolsReq.end();
      }
    });

    req.on('error', (error) => {
      console.error('❌ Request error:', error.message);
      reject(error);
    });

    req.write(initPayload);
    req.end();
  });
}

// Test the connection
testZapierMcpWorking()
  .then((tools) => {
    console.log('\n🎉 SUCCESS! Your Zapier MCP server is working!');
    console.log('💡 Next steps:');
    console.log('   1. Add this URL to Browzer Settings → MCP Servers');
    console.log('   2. The transport will be auto-detected as SSE');
    console.log('   3. You can then use the tools in Ask queries');
    
    if (tools && tools.length > 0) {
      console.log('\n🔧 Available tools for Ask queries:');
      tools.forEach(tool => {
        console.log(`   - "Use ${tool.name} to..." `);
      });
    }
  })
  .catch((error) => {
    console.error('\n❌ Connection failed:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('   1. Check if the server URL is still valid');
    console.log('   2. Verify you have Zaps configured in Zapier');
    console.log('   3. Try regenerating the server URL in Zapier MCP settings');
  });
