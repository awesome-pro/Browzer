/**
 * ConversationManager - Manages conversation history with prompt caching
 * 
 * Implements Anthropic's best practices for Claude Sonnet 4.5:
 * - Prompt caching for system prompts and context
 * - Efficient token management
 * - Conversation history pruning
 * - Cache breakpoint optimization
 */

import Anthropic from '@anthropic-ai/sdk';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string | Anthropic.MessageParam['content'];
  timestamp: number;
  tokenCount?: number;
}

export interface CachedContext {
  systemPrompt: string;
  browserContext: string;
  recordingContext: string;
  tools: Anthropic.Tool[];
  cacheTimestamp: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  estimatedCost: number;  // In USD
}

export class ConversationManager {
  private messages: ConversationMessage[] = [];
  private cachedContext: CachedContext | null = null;
  private readonly MAX_MESSAGES = 50; // Keep last 50 messages
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  // Token usage tracking
  private tokenUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    estimatedCost: 0
  };
  
  // Pricing for Claude Sonnet 4.5 (per million tokens)
  private readonly PRICING = {
    input: 3.00,           // $3 per million input tokens
    output: 15.00,         // $15 per million output tokens
    cacheWrite: 3.75,      // $3.75 per million cache write tokens
    cacheRead: 0.30        // $0.30 per million cache read tokens
  };
  
  /**
   * Add a user message to conversation
   */
  public addUserMessage(content: string | Anthropic.MessageParam['content']): void {
    this.messages.push({
      role: 'user',
      content,
      timestamp: Date.now()
    });
    
    this.pruneOldMessages();
  }
  
  /**
   * Add an assistant message to conversation
   */
  public addAssistantMessage(content: string | Anthropic.MessageParam['content'], usage?: Anthropic.Usage): void {
    this.messages.push({
      role: 'assistant',
      content,
      timestamp: Date.now()
    });
    
    // Track token usage if provided
    if (usage) {
      this.updateTokenUsage(usage);
    }
    
    this.pruneOldMessages();
  }
  
  /**
   * Update cached context (system prompt, browser state, tools)
   */
  public updateCachedContext(
    systemPrompt: string,
    browserContext: string,
    recordingContext: string,
    tools: Anthropic.Tool[]
  ): void {
    this.cachedContext = {
      systemPrompt,
      browserContext,
      recordingContext,
      tools,
      cacheTimestamp: Date.now()
    };
  }
  
  /**
   * Build messages array for Claude API with prompt caching
   * 
   * Cache structure (from least to most frequently changing):
   * 1. System prompt (cached, 5m TTL)
   * 2. Recording context (cached, 5m TTL)
   * 3. Browser context (cached, 5m TTL)
   * 4. Conversation history (not cached, changes frequently)
   */
  public buildMessagesForAPI(): {
    system: Anthropic.MessageParam['content'];
    messages: Anthropic.MessageParam[];
    tools: Anthropic.Tool[];
  } {
    if (!this.cachedContext) {
      throw new Error('Cached context not initialized. Call updateCachedContext first.');
    }
    
    // Build system prompt with cache control
    const systemContent: Anthropic.MessageParam['content'] = [
      {
        type: 'text',
        text: this.cachedContext.systemPrompt,
        cache_control: { type: 'ephemeral', ttl: '5m' }
      },
      {
        type: 'text',
        text: `\n\n# RECORDING CONTEXT\n${this.cachedContext.recordingContext}`,
        cache_control: { type: 'ephemeral', ttl: '5m' }
      },
      {
        type: 'text',
        text: `\n\n# CURRENT BROWSER STATE\n${this.cachedContext.browserContext}`,
        cache_control: { type: 'ephemeral', ttl: '5m' }
      }
    ];
    
    // Convert conversation messages to API format
    const apiMessages: Anthropic.MessageParam[] = this.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    
    return {
      system: systemContent,
      messages: apiMessages,
      tools: this.cachedContext.tools
    };
  }
  
  /**
   * Check if cache is still valid
   */
  public isCacheValid(): boolean {
    if (!this.cachedContext) return false;
    
    const age = Date.now() - this.cachedContext.cacheTimestamp;
    return age < this.CACHE_TTL;
  }
  
  /**
   * Get conversation history
   */
  public getMessages(): ConversationMessage[] {
    return [...this.messages];
  }
  
  /**
   * Get message count
   */
  public getMessageCount(): number {
    return this.messages.length;
  }
  
  /**
   * Clear conversation history (keeps cached context)
   */
  public clearHistory(): void {
    this.messages = [];
  }
  
  /**
   * Reset everything
   */
  public reset(): void {
    this.messages = [];
    this.cachedContext = null;
    this.tokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
      estimatedCost: 0
    };
  }
  
  /**
   * Prune old messages to stay within limits
   */
  private pruneOldMessages(): void {
    if (this.messages.length > this.MAX_MESSAGES) {
      // Keep the most recent messages
      this.messages = this.messages.slice(-this.MAX_MESSAGES);
      console.log(`📝 Pruned conversation history to ${this.MAX_MESSAGES} messages`);
    }
  }
  
  /**
   * Update token usage from API response
   */
  private updateTokenUsage(usage: Anthropic.Usage): void {
    this.tokenUsage.inputTokens += usage.input_tokens || 0;
    this.tokenUsage.outputTokens += usage.output_tokens || 0;
    this.tokenUsage.cacheCreationTokens += usage.cache_creation_input_tokens || 0;
    this.tokenUsage.cacheReadTokens += usage.cache_read_input_tokens || 0;
    this.tokenUsage.totalTokens = 
      this.tokenUsage.inputTokens + 
      this.tokenUsage.outputTokens + 
      this.tokenUsage.cacheCreationTokens;
    
    // Calculate cost
    this.tokenUsage.estimatedCost = 
      (this.tokenUsage.inputTokens * this.PRICING.input / 1_000_000) +
      (this.tokenUsage.outputTokens * this.PRICING.output / 1_000_000) +
      (this.tokenUsage.cacheCreationTokens * this.PRICING.cacheWrite / 1_000_000) +
      (this.tokenUsage.cacheReadTokens * this.PRICING.cacheRead / 1_000_000);
  }
  
  /**
   * Get token usage statistics
   */
  public getTokenUsage(): TokenUsage {
    return { ...this.tokenUsage };
  }
  
  /**
   * Get conversation summary for logging
   */
  public getSummary(): string {
    const userMsgs = this.messages.filter(m => m.role === 'user').length;
    const assistantMsgs = this.messages.filter(m => m.role === 'assistant').length;
    const cacheStatus = this.isCacheValid() ? 'valid' : 'expired';
    
    return `Messages: ${this.messages.length} (${userMsgs} user, ${assistantMsgs} assistant), Cache: ${cacheStatus}`;
  }
  
  /**
   * Export conversation for debugging
   */
  public export(): {
    messages: ConversationMessage[];
    cachedContext: CachedContext | null;
    summary: string;
  } {
    return {
      messages: this.getMessages(),
      cachedContext: this.cachedContext,
      summary: this.getSummary()
    };
  }
}
