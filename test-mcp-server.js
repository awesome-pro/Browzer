#!/usr/bin/env node

const WebSocket = require('ws');
const http = require('http');

// Simple MCP server for testing
const server = http.createServer();
const wss = new WebSocket.Server({ server });

console.log('🚀 Starting test MCP server...');

wss.on('connection', (ws) => {
    console.log('📡 Client connected');
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log('📥 Received:', message.method);
            
            let response;
            
            switch (message.method) {
                case 'initialize':
                    response = {
                        jsonrpc: '2.0',
                        id: message.id,
                        result: {
                            protocolVersion: '2024-11-05',
                            capabilities: {
                                tools: {}
                            },
                            serverInfo: {
                                name: 'test-mcp-server',
                                version: '1.0.0'
                            }
                        }
                    };
                    break;
                    
                case 'tools/list':
                    response = {
                        jsonrpc: '2.0',
                        id: message.id,
                        result: {
                            tools: [
                                {
                                    name: 'echo',
                                    description: 'Echo back the input text',
                                    inputSchema: {
                                        type: 'object',
                                        properties: {
                                            text: { type: 'string', description: 'Text to echo' }
                                        },
                                        required: ['text']
                                    }
                                },
                                {
                                    name: 'get_time',
                                    description: 'Get current time',
                                    inputSchema: {
                                        type: 'object',
                                        properties: {}
                                    }
                                }
                            ]
                        }
                    };
                    break;
                    
                case 'tools/call':
                    const { name, arguments: args } = message.params;
                    let result;
                    
                    if (name === 'echo') {
                        result = { text: `Echo: ${args.text}` };
                    } else if (name === 'get_time') {
                        result = { time: new Date().toISOString() };
                    } else {
                        result = { error: `Unknown tool: ${name}` };
                    }
                    
                    response = {
                        jsonrpc: '2.0',
                        id: message.id,
                        result: {
                            content: [
                                {
                                    type: 'text',
                                    text: JSON.stringify(result, null, 2)
                                }
                            ]
                        }
                    };
                    break;
                    
                default:
                    response = {
                        jsonrpc: '2.0',
                        id: message.id,
                        error: {
                            code: -32601,
                            message: `Method not found: ${message.method}`
                        }
                    };
            }
            
            ws.send(JSON.stringify(response));
            
        } catch (error) {
            console.error('❌ Error processing message:', error);
            ws.send(JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                error: {
                    code: -32603,
                    message: 'Internal error'
                }
            }));
        }
    });
    
    ws.on('close', () => {
        console.log('📡 Client disconnected');
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`✅ Test MCP server running on ws://localhost:${PORT}`);
    console.log('📝 Available tools: echo, get_time');
    console.log('🔗 Add this to Browzer MCP settings:');
    console.log(`   Name: test-server`);
    console.log(`   URL: ws://localhost:${PORT}`);
    console.log(`   Transport: websocket`);
});
