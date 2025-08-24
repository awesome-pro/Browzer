import { ToolMatch } from './McpRouter';

/**
 * Composes dynamic capability headers for LLM prompts.
 * Injects only the relevant tools for each request to keep prompts clean and focused.
 */
export class McpPromptComposer {
  
  /**
   * Creates a minimal capabilities header for the selected tools
   */
  static buildCapabilitiesHeader(tools: ToolMatch[]): string {
    if (tools.length === 0) {
      return '';
    }

    const toolDescriptions = tools.map(tool => {
      const params = this.extractRequiredParams(tool.schema);
      const paramStr = params.length > 0 ? `(${params.join(', ')})` : '()';
      return `- ${tool.toolName}${paramStr}: ${tool.description}`;
    }).join('\n');

    return `
Available tools for this request:
${toolDescriptions}

Tool usage rules:
- Only call tools if they clearly help answer the user's request
- Ask for missing required parameters before calling a tool
- Prefer one complete tool call over multiple partial calls
- If no tools are relevant, answer without using tools

`;
  }

  /**
   * Augments an existing system prompt with dynamic capabilities
   */
  static augmentSystemPrompt(basePrompt: string, tools: ToolMatch[]): string {
    const header = this.buildCapabilitiesHeader(tools);
    if (!header) {
      return basePrompt;
    }
    
    return `${basePrompt}\n\n${header}`;
  }

  /**
   * Converts tool matches to OpenAI function calling format
   */
  static toFunctionDefinitions(tools: ToolMatch[]) {
    return tools.map(tool => ({
      name: tool.toolName,
      description: tool.description,
      parameters: tool.schema || {
        type: 'object',
        properties: {},
        required: []
      }
    }));
  }

  private static extractRequiredParams(schema: any): string[] {
    if (!schema || !schema.properties) {
      return [];
    }

    const required = schema.required || [];
    const properties = schema.properties;
    
    return Object.keys(properties).map(key => {
      const isRequired = required.includes(key);
      return isRequired ? `${key}*` : key;
    });
  }
}
