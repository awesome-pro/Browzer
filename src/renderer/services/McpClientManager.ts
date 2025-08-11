import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
// Note: SSEClientTransport has Node.js dependencies, so we'll use fetch-based SSE for browser

/**
 * Browser-compatible SSE transport using native fetch API
 * Implements the MCP Transport interface for Streamable HTTP transport
 */
class BrowserSSETransport {
  private url: URL;
  private eventSource?: EventSource;
  
  public onmessage?: (message: any, extra?: any) => void;
  public onerror?: (error: Error) => void;
  public onclose?: () => void;
  public sessionId?: string;

  constructor(url: URL) {
    this.url = url;
  }

  async start(): Promise<void> {
    // For MCP Streamable HTTP, we use fetch for sending and responses for receiving
    // No persistent connection needed for initialization
    return Promise.resolve();
  }

  async send(message: any, options?: any): Promise<void> {
    try {
      const response = await fetch(this.url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify(message)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Handle SSE response
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');
        
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent: any = {};
          
          for (const line of lines) {
            if (line.startsWith('data:')) {
              currentEvent.data = line.substring(5).trim();
            } else if (line === '') {
              if (currentEvent.data && this.onmessage) {
                try {
                  const parsed = JSON.parse(currentEvent.data);
                  this.onmessage(parsed);
                } catch (parseError) {
                  console.warn('[MCP] Failed to parse SSE data:', currentEvent.data);
                }
              }
              currentEvent = {};
            }
          }
        }
      } else {
        // JSON response
        const data = await response.json();
        if (this.onmessage) {
          this.onmessage(data);
        }
      }
    } catch (error) {
      if (this.onerror) {
        this.onerror(error instanceof Error ? error : new Error(String(error)));
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }
    if (this.onclose) {
      this.onclose();
    }
  }

  setProtocolVersion?(version: string): void {
    // Store protocol version if needed
  }
}

export interface McpServerConfig {
  name: string;
  url: string;
  enabled: boolean;
  transport?: 'websocket' | 'sse'; // Auto-detect if not specified
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: any;
  serverName: string;
}

/**
 * MCP Client Manager using the official Model Context Protocol SDK.
 * Manages connections to multiple MCP servers and provides a unified tool registry.
 */
export class McpClientManager {
  private static STORAGE_KEY = 'mcp_servers';

  private clients = new Map<string, Client>();
  private toolIndex = new Map<string, McpTool>();

  constructor() {
    // Auto-connect enabled servers on construction
    this.initializeConnections();
  }

  private async initializeConnections() {
    const configs = this.loadConfigs().filter(c => c.enabled);
    for (const config of configs) {
      await this.connect(config);
    }
  }

  /* ---------- Persistence helpers ---------- */
  loadConfigs(): McpServerConfig[] {
    try {
      const raw = localStorage.getItem(McpClientManager.STORAGE_KEY);
      if (!raw) return [];
      const list: McpServerConfig[] = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  saveConfigs(configs: McpServerConfig[]) {
    localStorage.setItem(McpClientManager.STORAGE_KEY, JSON.stringify(configs));
  }

  async addConfig(config: McpServerConfig) {
    const list = this.loadConfigs();
    list.push(config);
    this.saveConfigs(list);
    if (config.enabled) {
      await this.connect(config);
    }
  }

  async toggleServer(name: string, enabled: boolean) {
    const list = this.loadConfigs();
    const config = list.find(s => s.name === name);
    if (!config) return;
    
    config.enabled = enabled;
    this.saveConfigs(list);
    
    if (enabled) {
      await this.connect(config);
    } else {
      await this.disconnect(name);
    }
  }

  /* ---------- Connection logic ---------- */
  private async connect(config: McpServerConfig) {
    if (this.clients.has(config.name)) {
      console.log(`[MCP] Already connected to ${config.name}`);
      return;
    }

    try {
      console.log(`[MCP] Connecting to ${config.name} at ${config.url}`);
      
      // Auto-detect transport type if not specified
      const transportType = config.transport || this.detectTransportType(config.url);
      console.log(`[MCP] Using ${transportType} transport`);
      
      let transport;
      if (transportType === 'sse') {
        // Use our browser-compatible SSE transport
        transport = new BrowserSSETransport(new URL(config.url));
      } else {
        transport = new WebSocketClientTransport(new URL(config.url));
      }
      
      const client = new Client(
        {
          name: 'browzer-assistant',
          version: '1.0.0'
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      await client.connect(transport);
      this.clients.set(config.name, client);
      
      console.log(`[MCP] Connected to ${config.name} using ${transportType}`);
      
      // Discover and register tools
      await this.discoverTools(config.name, client);
      
    } catch (error) {
      console.error(`[MCP] Failed to connect to ${config.name}:`, error);
    }
  }

  private async disconnect(name: string) {
    const client = this.clients.get(name);
    if (client) {
      try {
        await client.close();
      } catch (error) {
        console.warn(`[MCP] Error closing connection to ${name}:`, error);
      }
      this.clients.delete(name);
    }
    
    // Remove tools from this server
    for (const [toolName, tool] of this.toolIndex.entries()) {
      if (tool.serverName === name) {
        this.toolIndex.delete(toolName);
      }
    }
    
    console.log(`[MCP] Disconnected from ${name}`);
  }

  private detectTransportType(url: string): 'websocket' | 'sse' {
    const urlLower = url.toLowerCase();
    
    // WebSocket URLs
    if (urlLower.startsWith('ws://') || urlLower.startsWith('wss://')) {
      return 'websocket';
    }
    
    // HTTPS URLs are typically SSE for MCP
    if (urlLower.startsWith('http://') || urlLower.startsWith('https://')) {
      // Special case: Zapier MCP uses SSE
      if (urlLower.includes('mcp.zapier.com')) {
        return 'sse';
      }
      // Default to SSE for HTTP(S) URLs
      return 'sse';
    }
    
    // Default fallback
    return 'websocket';
  }

  private async discoverTools(serverName: string, client: Client) {
    try {
      const response = await client.listTools();
      const tools = response.tools || [];
      
      for (const tool of tools) {
        const fullName = `${serverName}.${tool.name}`;
        this.toolIndex.set(fullName, {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          serverName
        });
      }
      
      console.log(`[MCP] Registered ${tools.length} tools from ${serverName}:`, tools.map(t => t.name));
    } catch (error) {
      console.warn(`[MCP] Failed to discover tools from ${serverName}:`, error);
    }
  }

  /* ---------- Public API ---------- */
  async listAllTools(): Promise<string[]> {
    return Array.from(this.toolIndex.keys());
  }

  getToolInfo(fullName: string): McpTool | undefined {
    return this.toolIndex.get(fullName);
  }

  async callTool(fullName: string, args: any): Promise<any> {
    const tool = this.toolIndex.get(fullName);
    if (!tool) {
      throw new Error(`Tool ${fullName} not found`);
    }
    
    const client = this.clients.get(tool.serverName);
    if (!client) {
      throw new Error(`Server ${tool.serverName} not connected`);
    }

    try {
      console.log(`[MCP] Calling tool ${fullName} with args:`, args);
      const response = await client.callTool({
        name: tool.name,
        arguments: args
      });
      
      console.log(`[MCP] Tool ${fullName} response:`, response);
      return response;
    } catch (error) {
      console.error(`[MCP] Tool call failed for ${fullName}:`, error);
      throw error;
    }
  }

  /* ---------- Status and debugging ---------- */
  getStatus() {
    const configs = this.loadConfigs();
    return {
      totalServers: configs.length,
      connectedServers: this.clients.size,
      enabledServers: configs.filter(c => c.enabled).length,
      totalTools: this.toolIndex.size,
      servers: configs.map(c => ({
        name: c.name,
        url: c.url,
        enabled: c.enabled,
        connected: this.clients.has(c.name),
        tools: Array.from(this.toolIndex.values()).filter(t => t.serverName === c.name).length
      }))
    };
  }

  async cleanup() {
    const disconnectPromises = Array.from(this.clients.keys()).map(name => this.disconnect(name));
    await Promise.all(disconnectPromises);
  }
}
