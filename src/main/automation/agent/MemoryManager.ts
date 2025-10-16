/**
 * MemoryManager - Manages conversation history and context for LLM
 * 
 * Implements sophisticated memory management following Anthropic best practices:
 * - Maintains conversation history with proper role alternation
 * - Manages context window efficiently
 * - Stores execution results and browser states
 * - Provides context summarization for long conversations
 * - Handles tool results in Claude's expected format
 */

import Anthropic from '@anthropic-ai/sdk';

export interface ContextEntry {
  type: 'user_message' | 'assistant_message' | 'tool_result' | 'browser_context' | 'system_context';
  content: any;
  timestamp: number;
}

export class MemoryManager {
  private conversationHistory: Anthropic.MessageParam[] = [];
  private contextStore: Map<string, any> = new Map();
  private maxHistoryLength = 50; // Maximum messages to keep
  private provider: 'anthropic' | 'google';

  constructor(provider: 'anthropic' | 'google' = 'anthropic') {
    this.provider = provider;
    console.log('💾 Memory Manager initialized');
  }

  /**
   * Add user message to conversation
   */
  public addUserMessage(content: string): void {
    this.conversationHistory.push({
      role: 'user',
      content
    });

    this.pruneHistory();
  }

  /**
   * Add assistant message to conversation
   */
  public addAssistantMessage(content: string | Anthropic.ContentBlock[]): void {
    this.conversationHistory.push({
      role: 'assistant',
      content
    });

    this.pruneHistory();
  }

  /**
   * Add tool result to conversation
   * Following Claude's format for tool results
   */
  public addToolResult(
    toolName: string,
    toolInput: Record<string, any>,
    result: any,
    isError = false
  ): void {
    // Tool results must be in a user message in Claude's API
    const toolResultContent: Anthropic.ToolResultBlockParam = {
      type: 'tool_result',
      tool_use_id: this.generateToolUseId(toolName),
      content: JSON.stringify(result, null, 2),
      is_error: isError
    };

    // If last message was assistant with tool_use, add tool_result to new user message
    this.conversationHistory.push({
      role: 'user',
      content: [toolResultContent]
    });

    this.pruneHistory();
  }

  /**
   * Add context information (not part of conversation, but available for retrieval)
   */
  public addContext(key: string, value: any): void {
    this.contextStore.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  /**
   * Get context by key
   */
  public getContext(key: string): any {
    const entry = this.contextStore.get(key);
    return entry?.value;
  }

  /**
   * Get all messages for Claude API
   */
  public getMessages(): Anthropic.MessageParam[] {
    return [...this.conversationHistory];
  }

  /**
   * Get recent messages (last N)
   */
  public getRecentMessages(count: number): Anthropic.MessageParam[] {
    return this.conversationHistory.slice(-count);
  }

  /**
   * Get conversation summary
   */
  public getSummary(): string {
    let summary = `Conversation History (${this.conversationHistory.length} messages):\n\n`;

    for (const msg of this.conversationHistory) {
      const role = msg.role.toUpperCase();
      
      if (typeof msg.content === 'string') {
        const preview = msg.content.substring(0, 100);
        summary += `[${role}] ${preview}${msg.content.length > 100 ? '...' : ''}\n`;
      } else if (Array.isArray(msg.content)) {
        summary += `[${role}] ${msg.content.length} content blocks\n`;
      }
    }

    return summary;
  }

  /**
   * Prune history to stay within limits
   */
  private pruneHistory(): void {
    if (this.conversationHistory.length > this.maxHistoryLength) {
      // Keep first message (usually important context) and recent messages
      const firstMessage = this.conversationHistory[0];
      const recentMessages = this.conversationHistory.slice(-this.maxHistoryLength + 1);
      
      this.conversationHistory = [firstMessage, ...recentMessages];
      
      console.log('💾 Pruned conversation history to', this.conversationHistory.length, 'messages');
    }
  }

  /**
   * Generate unique tool use ID
   */
  private generateToolUseId(toolName: string): string {
    return `toolu_${toolName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear all memory
   */
  public clear(): void {
    this.conversationHistory = [];
    this.contextStore.clear();
    console.log('💾 Memory cleared');
  }

  /**
   * Export memory state (for debugging/persistence)
   */
  public export(): {
    history: Anthropic.MessageParam[];
    context: Record<string, any>;
  } {
    const context: Record<string, any> = {};
    for (const [key, value] of this.contextStore) {
      context[key] = value;
    }

    return {
      history: this.conversationHistory,
      context
    };
  }

  /**
   * Import memory state
   */
  public import(data: {
    history: Anthropic.MessageParam[];
    context: Record<string, any>;
  }): void {
    this.conversationHistory = data.history;
    this.contextStore.clear();
    
    for (const [key, value] of Object.entries(data.context)) {
      this.contextStore.set(key, value);
    }

    console.log('💾 Memory imported:', this.conversationHistory.length, 'messages');
  }

  /**
   * Get memory statistics
   */
  public getStats(): {
    messageCount: number;
    contextEntries: number;
    estimatedTokens: number;
  } {
    // Rough token estimation (4 chars ≈ 1 token)
    let totalChars = 0;
    
    for (const msg of this.conversationHistory) {
      if (typeof msg.content === 'string') {
        totalChars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        totalChars += JSON.stringify(msg.content).length;
      }
    }

    return {
      messageCount: this.conversationHistory.length,
      contextEntries: this.contextStore.size,
      estimatedTokens: Math.ceil(totalChars / 4)
    };
  }

  /**
   * Format execution history for context
   */
  public formatExecutionHistory(steps: any[]): string {
    let formatted = 'Execution History:\n\n';

    for (const step of steps) {
      formatted += `Step ${step.stepNumber} [${step.status}]: ${step.toolName}\n`;
      formatted += `  Reasoning: ${step.reasoning}\n`;
      
      if (step.result) {
        formatted += `  Result: ${JSON.stringify(step.result).substring(0, 200)}\n`;
      }
      
      if (step.error) {
        formatted += `  Error: ${step.error}\n`;
      }
      
      formatted += '\n';
    }

    return formatted;
  }

  /**
   * Create context-aware prompt with memory
   */
  public createContextualPrompt(
    basePrompt: string,
    includeExecutionHistory = true,
    includeBrowserContext = true
  ): string {
    let prompt = basePrompt + '\n\n';

    // Add execution history if available
    if (includeExecutionHistory) {
      const executionHistory = this.getContext('execution_history');
      if (executionHistory) {
        prompt += '<execution_history>\n';
        prompt += this.formatExecutionHistory(executionHistory);
        prompt += '</execution_history>\n\n';
      }
    }

    // Add browser context if available
    if (includeBrowserContext) {
      const browserContext = this.getContext('browser_context');
      if (browserContext) {
        prompt += '<current_browser_state>\n';
        prompt += `URL: ${browserContext.url}\n`;
        prompt += `Title: ${browserContext.title}\n`;
        prompt += '</current_browser_state>\n\n';
      }
    }

    return prompt;
  }
}

