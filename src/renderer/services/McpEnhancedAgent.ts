import { McpClientManager } from './McpClientManager';
import { McpRouter } from './McpRouter';
import { McpPromptComposer } from './McpPromptComposer';

/**
 * Enhanced agent service that integrates MCP tools into the Ask pipeline.
 * Wraps the existing agent flow with MCP capabilities.
 */
export class McpEnhancedAgent {
  private mcpManager: McpClientManager;
  private router: McpRouter;

  constructor() {
    this.mcpManager = new McpClientManager();
    this.router = new McpRouter(this.mcpManager);
  }

  /**
   * Enhanced version of processFollowupQuestion that includes MCP tool routing
   */
  async processAskWithMcp(
    question: string, 
    baseSystemPrompt: string,
    executeToolCall: (toolName: string, args: any) => Promise<any>
  ): Promise<{
    enhancedPrompt: string;
    availableTools: any[];
    toolCallHandler: (toolName: string, args: any) => Promise<any>;
  }> {
    console.log('[McpEnhancedAgent] Processing Ask with MCP integration:', question);

    // Route query to find relevant tools
    const relevantTools = await this.router.routeQuery(question, 3);
    console.log('[McpEnhancedAgent] Found relevant tools:', relevantTools.map(t => t.toolName));

    // Augment system prompt with capabilities
    const enhancedPrompt = McpPromptComposer.augmentSystemPrompt(baseSystemPrompt, relevantTools);
    
    // Convert to function definitions for LLM
    const functionDefs = McpPromptComposer.toFunctionDefinitions(relevantTools);

    // Create tool call handler that uses MCP client
    const toolCallHandler = async (toolName: string, args: any) => {
      console.log('[McpEnhancedAgent] Executing MCP tool:', toolName, args);
      
      try {
        const result = await this.mcpManager.callTool(toolName, args);
        console.log('[McpEnhancedAgent] Tool result:', result);
        return result;
      } catch (error) {
        console.error('[McpEnhancedAgent] Tool execution failed:', error);
        throw error;
      }
    };

    return {
      enhancedPrompt,
      availableTools: functionDefs,
      toolCallHandler
    };
  }

  /**
   * Check if MCP integration is available (has enabled servers)
   */
  async isAvailable(): Promise<boolean> {
    const configs = this.mcpManager.loadConfigs();
    return configs.some(cfg => cfg.enabled);
  }

  /**
   * Get status of MCP servers for debugging
   */
  getStatus() {
    const configs = this.mcpManager.loadConfigs();
    return {
      totalServers: configs.length,
      enabledServers: configs.filter(c => c.enabled).length,
      servers: configs.map(c => ({
        name: c.name,
        url: c.url,
        enabled: c.enabled
      }))
    };
  }
}
