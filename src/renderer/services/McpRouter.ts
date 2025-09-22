import { McpClientManager, McpTool } from './McpClientService';

export interface ToolMatch {
  toolName: string;
  score: number;
  description: string;
  schema?: any;
}

/**
 * Simple keyword-based router that selects relevant MCP tools for a user query.
 * Keeps it lightweight and effective for MVP.
 */
export class McpRouter {
  constructor(private mcpManager: McpClientManager) {}

  async routeQuery(userQuery: string, maxTools: number = 3): Promise<ToolMatch[]> {
    const allToolNames = await this.mcpManager.listAllTools();
    const query = userQuery.toLowerCase();
    
    const matches: ToolMatch[] = [];
    
    for (const toolName of allToolNames) {
      const toolInfo = this.mcpManager.getToolInfo(toolName);
      if (!toolInfo) continue;
      
      const score = this.scoreToolForQuery(toolName, query);
      if (score > 0) {
        matches.push({
          toolName,
          score,
          description: toolInfo.description || this.getToolDescription(toolName),
          schema: toolInfo.inputSchema || this.getToolSchema(toolName)
        });
      }
    }
    
    // Sort by score descending and take top K
    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, maxTools);
  }

  private scoreToolForQuery(toolName: string, query: string): number {
    const [serverName, ...toolParts] = toolName.split('.');
    const tool = toolParts.join('.');
    
    let score = 0;
    
    // Filesystem scoring
    if (serverName === 'filesystem') {
      if (query.includes('read') || query.includes('open') || query.includes('file')) {
        if (tool.includes('read')) score += 3;
        if (tool.includes('list')) score += 1;
      }
      if (query.includes('write') || query.includes('save') || query.includes('create')) {
        if (tool.includes('write')) score += 3;
        if (tool.includes('create')) score += 2;
      }
      if (query.includes('list') || query.includes('directory') || query.includes('folder')) {
        if (tool.includes('list')) score += 3;
      }
    }
    
    // Slack scoring
    if (serverName === 'slack') {
      if (query.includes('slack') || query.includes('message') || query.includes('send')) {
        if (tool.includes('send') || tool.includes('message')) score += 3;
        if (tool.includes('channel')) score += 2;
      }
    }
    
    // Web/browser scoring
    if (serverName === 'web' || serverName === 'browser') {
      if (query.includes('search') || query.includes('web') || query.includes('browse')) {
        if (tool.includes('search')) score += 3;
        if (tool.includes('navigate')) score += 2;
      }
    }
    
    // Generic scoring for any tool
    if (query.includes(tool.toLowerCase())) score += 2;
    if (query.includes(serverName.toLowerCase())) score += 1;
    
    return score;
  }

  private getToolDescription(toolName: string): string {
    const [serverName, ...toolParts] = toolName.split('.');
    const tool = toolParts.join('.');
    
    // Simple descriptions based on common patterns
    if (serverName === 'filesystem') {
      if (tool.includes('read')) return 'Read contents of a file';
      if (tool.includes('write')) return 'Write content to a file';
      if (tool.includes('list')) return 'List files and directories';
      if (tool.includes('delete')) return 'Delete a file or directory';
    }
    
    if (serverName === 'slack') {
      if (tool.includes('send')) return 'Send a message to Slack';
      if (tool.includes('channel')) return 'List or manage Slack channels';
    }
    
    return `Execute ${tool} on ${serverName}`;
  }

  private getToolSchema(toolName: string): any {
    // This would normally come from the MCP client's tool registry
    // For now, return a basic schema
    return {
      type: 'object',
      properties: {
        // Common parameters that most tools might need
        ...(toolName.includes('read') && { path: { type: 'string', description: 'File path to read' } }),
        ...(toolName.includes('write') && { 
          path: { type: 'string', description: 'File path to write' },
          content: { type: 'string', description: 'Content to write' }
        }),
        ...(toolName.includes('list') && { path: { type: 'string', description: 'Directory path to list' } }),
        ...(toolName.includes('send') && { 
          message: { type: 'string', description: 'Message to send' },
          channel: { type: 'string', description: 'Channel or recipient' }
        })
      }
    };
  }
}
