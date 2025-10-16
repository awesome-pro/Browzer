/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AgenticAutomationService - ReAct-based agentic automation with Claude
 * 
 * Implements the Think → Act → Observe → Reflect loop:
 * 1. THINK: Claude analyzes current state and decides next action
 * 2. ACT: Execute the chosen tool/action
 * 3. OBSERVE: Capture results and update browser context
 * 4. REFLECT: Analyze success/failure and adapt strategy
 * 
 * Features:
 * - Persistent conversation context with prompt caching
 * - Real-time browser state awareness
 * - Intelligent error recovery
 * - Adaptive planning
 * - Progress tracking and reporting
 */

import Anthropic from '@anthropic-ai/sdk';
import { WebContentsView } from 'electron';
import { BrowserAutomation } from '../BrowserAutomation';
import { BrowserContextProvider } from '@/main/automation/context';
import { ConversationManager } from './ConversationManager';
import { ToolRegistry } from './ToolRegistry';
import { RecordingSession } from '@/shared/types';

export interface AgenticExecutionOptions {
  userPrompt: string;
  recordingSession: RecordingSession;
  apiKey: string;
  maxIterations?: number;
  onProgress?: (update: ProgressUpdate) => void;
}

export interface ProgressUpdate {
  type: 'thinking' | 'acting' | 'observing' | 'reflecting' | 'completed' | 'failed';
  message: string;
  iteration: number;
  toolName?: string;
  toolInput?: any;
  toolOutput?: any;
  error?: string;
}

export interface AgenticExecutionResult {
  success: boolean;
  summary: string;
  iterations: number;
  conversationHistory: any[];
  error?: string;
  duration: number;
}

export class AgenticAutomationService {
  private anthropic: Anthropic;
  private browserAutomation: BrowserAutomation;
  private contextProvider: BrowserContextProvider;
  private conversationManager: ConversationManager;
  private view: WebContentsView;
  
  private isExecuting = false;
  private shouldStop = false;
  private currentIteration = 0;
  
  // Limits
  private readonly MAX_ITERATIONS = 50;
  private readonly MAX_CONSECUTIVE_ERRORS = 3;
  private readonly MAX_SAME_ACTION_REPEATS = 3;
  
  // Tracking
  private consecutiveErrors = 0;
  private lastActions: string[] = [];

  constructor(view: WebContentsView) {
    this.view = view;
    this.browserAutomation = new BrowserAutomation(view);
    this.contextProvider = new BrowserContextProvider(view);
    this.conversationManager = new ConversationManager();
    this.anthropic = new Anthropic({ apiKey: '' }); // Will be set during execution
  }

  /**
   * Execute automation task using ReAct loop
   */
  public async execute(options: AgenticExecutionOptions): Promise<AgenticExecutionResult> {
    const startTime = Date.now();
    const { userPrompt, recordingSession, apiKey, maxIterations = this.MAX_ITERATIONS, onProgress } = options;

    // Initialize
    this.anthropic = new Anthropic({ apiKey });
    this.isExecuting = true;
    this.shouldStop = false;
    this.currentIteration = 0;
    this.consecutiveErrors = 0;
    this.lastActions = [];
    this.conversationManager.reset();

    console.log('🤖 Starting agentic automation...');
    console.log(`   User Goal: ${userPrompt}`);
    console.log(`   Recording: ${recordingSession.name}`);

    try {
      // Start monitoring browser context
      await this.browserAutomation.start();
      await this.contextProvider.startMonitoring();

      // Initialize conversation with system prompt and context
      await this.initializeConversation(userPrompt, recordingSession);

      // Add initial user message
      this.conversationManager.addUserMessage(
        `Please help me automate the following task:\n\n${userPrompt}\n\nAnalyze the current browser state and decide what action to take first.`
      );

      // ReAct Loop
      while (this.currentIteration < maxIterations && !this.shouldStop) {
        this.currentIteration++;
        console.log(`\n🔄 Iteration ${this.currentIteration}/${maxIterations}`);

        try {
          // THINK: Get Claude's decision
          onProgress?.({
            type: 'thinking',
            message: 'Analyzing current state and deciding next action...',
            iteration: this.currentIteration
          });

          const response = await this.getClaudeResponse();

          // Check for completion or failure
          if (this.isTaskComplete(response)) {
            const summary = this.extractCompletionSummary(response);
            console.log('✅ Task completed successfully!');
            
            onProgress?.({
              type: 'completed',
              message: summary,
              iteration: this.currentIteration
            });

            return {
              success: true,
              summary,
              iterations: this.currentIteration,
              conversationHistory: this.conversationManager.export().messages,
              duration: Date.now() - startTime
            };
          }

          if (this.isTaskFailed(response)) {
            const reason = this.extractFailureReason(response);
            console.log('❌ Task failed:', reason);
            
            onProgress?.({
              type: 'failed',
              message: reason,
              iteration: this.currentIteration,
              error: reason
            });

            return {
              success: false,
              summary: reason,
              iterations: this.currentIteration,
              conversationHistory: this.conversationManager.export().messages,
              error: reason,
              duration: Date.now() - startTime
            };
          }

          // ACT: Execute tool calls
          const toolResults = await this.executeToolCalls(response, onProgress);

          // OBSERVE: Update browser context
          onProgress?.({
            type: 'observing',
            message: 'Capturing updated browser state...',
            iteration: this.currentIteration
          });

          const updatedContext = await this.contextProvider.getContext({
            includePrunedDOM: true,
            includeConsoleLogs: true,
            maxElements: 100,
            maxConsoleEntries: 10
          });

          // REFLECT: Add tool results to conversation in proper format
          const toolResultContent = this.buildToolResultContent(response, toolResults, updatedContext);
          this.conversationManager.addUserMessage(toolResultContent);

          onProgress?.({
            type: 'reflecting',
            message: 'Analyzing results and planning next step...',
            iteration: this.currentIteration
          });

          // Update cached browser context for next iteration
          this.updateCachedContext(updatedContext);

          // Check for repetitive behavior
          if (this.isStuckInLoop()) {
            console.warn('⚠️ Detected repetitive behavior, asking Claude to try different approach');
            this.conversationManager.addUserMessage(
              'You seem to be repeating the same actions. Please try a different approach or use task_failed if you cannot proceed.'
            );
          }

          // Reset consecutive errors on success
          if (toolResults.every(r => r.success)) {
            this.consecutiveErrors = 0;
          }

        } catch (error) {
          console.error(`❌ Error in iteration ${this.currentIteration}:`, error);
          this.consecutiveErrors++;

          if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
            const errorMsg = `Failed after ${this.MAX_CONSECUTIVE_ERRORS} consecutive errors`;
            console.error(errorMsg);
            
            return {
              success: false,
              summary: errorMsg,
              iterations: this.currentIteration,
              conversationHistory: this.conversationManager.export().messages,
              error: errorMsg,
              duration: Date.now() - startTime
            };
          }

          // Add error to conversation for Claude to handle
          this.conversationManager.addUserMessage(
            `An error occurred: ${(error as Error).message}\n\nPlease analyze the error and decide how to proceed.`
          );
        }
      }

      // Max iterations reached
      const timeoutMsg = `Reached maximum iterations (${maxIterations}) without completing the task`;
      console.warn(timeoutMsg);
      
      return {
        success: false,
        summary: timeoutMsg,
        iterations: this.currentIteration,
        conversationHistory: this.conversationManager.export().messages,
        error: timeoutMsg,
        duration: Date.now() - startTime
      };

    } finally {
      this.isExecuting = false;
      this.contextProvider.stopMonitoring();
      await this.browserAutomation.stop();
      console.log(`\n⏱️ Total execution time: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
    }
  }

  /**
   * Cancel ongoing execution
   */
  public cancel(): void {
    console.log('🛑 Cancelling automation...');
    this.shouldStop = true;
  }

  /**
   * Check if currently executing
   */
  public isActive(): boolean {
    return this.isExecuting;
  }

  /**
   * Initialize conversation with system prompt and cached context
   */
  private async initializeConversation(userPrompt: string, recordingSession: RecordingSession): Promise<void> {
    console.log('📝 Initializing conversation context...');

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt();

    // Build recording context
    const recordingContext = this.buildRecordingContext(recordingSession);

    // Get initial browser context
    const browserContext = await this.contextProvider.getRichContext();
    const browserContextText = this.contextProvider.contextToText(browserContext);

    // Get tools
    const tools = ToolRegistry.getTools();

    // Update cached context with prompt caching
    this.conversationManager.updateCachedContext(
      systemPrompt,
      browserContextText,
      recordingContext,
      tools
    );

    console.log('✅ Conversation initialized with prompt caching');
    console.log(`   ${ToolRegistry.getSummary()}`);
    console.log(`   ${this.conversationManager.getSummary()}`);
  }

  /**
   * Build system prompt for Claude
   */
  private buildSystemPrompt(): string {
    return `You are an expert browser automation agent. Your role is to help users automate web tasks by controlling a browser through a set of tools.

# YOUR CAPABILITIES

You have access to tools that allow you to:
- Navigate to URLs
- Click on elements (buttons, links, etc.)
- Type text into input fields
- Select options from dropdowns
- Wait for elements to appear
- Inspect the current page state
- Scroll the page

# YOUR APPROACH (ReAct Pattern)

Follow this iterative process:

1. **THINK**: Analyze the current browser state and user's goal
2. **ACT**: Choose and execute ONE tool at a time
3. **OBSERVE**: Examine the results of your action
4. **REFLECT**: Decide if you're making progress or need to adjust

# IMPORTANT GUIDELINES

- **One action at a time**: Execute only ONE tool per turn, then wait for results
- **Verify before acting**: Use get_browser_context to understand the page before interacting
- **Be specific**: Use precise selectors (IDs are best, then classes, then text matching)
- **Handle errors gracefully**: If an action fails, analyze why and try a different approach
- **Avoid repetition**: If the same action fails multiple times, try something different
- **Know when to stop**: Use task_complete when done or task_failed if stuck

# SELECTOR STRATEGIES

1. **ID selectors**: \`#submit-button\` (most reliable)
2. **Class selectors**: \`.btn-primary\`
3. **Attribute selectors**: \`button[type="submit"]\`
4. **Text matching**: \`button:contains('Submit')\` (use for buttons with text)
5. **Combination**: \`form#login button.submit\`

# ERROR RECOVERY

If an action fails:
1. Check console logs for errors
2. Verify the element exists with get_browser_context
3. Try alternative selectors
4. Wait for dynamic content to load
5. If truly stuck after 3 attempts, use task_failed

# COMPLETION

- Use **task_complete** when you've successfully accomplished the user's goal
- Use **task_failed** if you encounter an unrecoverable error or cannot proceed

Remember: You're in an iterative loop. Take it step by step, verify your actions, and adapt based on results.`;
  }

  /**
   * Build recording context from session
   */
  private buildRecordingContext(session: RecordingSession): string {
    const lines: string[] = [];
    
    lines.push(`# Recording: ${session.name}`);
    lines.push(`Actions recorded: ${session.actionCount}`);
    lines.push(`URL: ${session.url}`);
    lines.push('');
    lines.push('## Recorded Actions:');
    
    session.actions.slice(0, 20).forEach((action, idx) => {
      const target = (action as any).target;
      const selector = target?.selector || '';
      const value = (action as any).value || '';
      lines.push(`${idx + 1}. [${action.type}] ${selector || value}`);
    });
    
    if (session.actions.length > 20) {
      lines.push(`... and ${session.actions.length - 20} more actions`);
    }
    
    return lines.join('\n');
  }

  /**
   * Get response from Claude with tool use
   */
  private async getClaudeResponse(): Promise<Anthropic.Message> {
    const { system, messages, tools } = this.conversationManager.buildMessagesForAPI();

    console.log('🤔 Asking Claude for next action...');

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: system as any, // System can be string or array of content blocks
      messages,
      tools,
      tool_choice: { type: 'auto' }
    });

    // Add assistant response to conversation
    this.conversationManager.addAssistantMessage(response.content);

    return response;
  }

  /**
   * Execute tool calls from Claude's response
   */
  private async executeToolCalls(
    response: Anthropic.Message,
    onProgress?: (update: ProgressUpdate) => void
  ): Promise<Array<{ toolName: string; input: any; success: boolean; output?: any; error?: string }>> {
    const results: Array<{ toolName: string; input: any; success: boolean; output?: any; error?: string }> = [];

    for (const block of response.content) {
      if (block.type === 'tool_use') {
        const { name: toolName, input } = block;
        
        console.log(`🔧 Executing tool: ${toolName}`);
        console.log(`   Input:`, JSON.stringify(input, null, 2));

        onProgress?.({
          type: 'acting',
          message: `Executing: ${toolName}`,
          iteration: this.currentIteration,
          toolName,
          toolInput: input
        });

        // Track action for loop detection
        this.lastActions.push(toolName);
        if (this.lastActions.length > this.MAX_SAME_ACTION_REPEATS) {
          this.lastActions.shift();
        }

        try {
          const output = await this.executeTool(toolName, input);
          
          results.push({
            toolName,
            input,
            success: true,
            output
          });

          console.log(`✅ Tool executed successfully`);
          if (output) console.log(`   Output:`, output);

        } catch (error) {
          const errorMsg = (error as Error).message;
          console.error(`❌ Tool execution failed:`, errorMsg);
          
          results.push({
            toolName,
            input,
            success: false,
            error: errorMsg
          });

          this.consecutiveErrors++;
        }
      }
    }

    return results;
  }

  /**
   * Execute a single tool
   */
  private async executeTool(toolName: string, input: any): Promise<any> {
    switch (toolName) {
      case 'navigate':
        await this.browserAutomation.navigate(input.url);
        return { success: true, url: input.url };

      case 'click':
        await this.browserAutomation.click(input.selector);
        return { success: true, selector: input.selector };

      case 'type':
        await this.browserAutomation.type(input.selector, input.text, {
          clear: input.clear !== false
        });
        return { success: true, selector: input.selector, text: input.text };

      case 'select':
        await this.browserAutomation.select(input.selector, input.value);
        return { success: true, selector: input.selector, value: input.value };

      case 'wait_for_element':
        await this.browserAutomation.waitForElementVisible(input.selector, input.timeout || 10000);
        return { success: true, selector: input.selector };

      case 'wait':
        // Use a simple promise-based wait
        await new Promise(resolve => setTimeout(resolve, input.duration));
        return { success: true, duration: input.duration };

      case 'get_browser_context':
        const level = input.detail_level || 'standard';
        let context;
        if (level === 'lightweight') {
          context = await this.contextProvider.getLightweightContext();
        } else if (level === 'rich') {
          context = await this.contextProvider.getRichContext();
        } else {
          context = await this.contextProvider.getContext();
        }
        return this.contextProvider.contextToText(context);

      case 'get_element_text':
        const text = await this.browserAutomation.getText(input.selector);
        return { text };

      case 'scroll':
        await this.browserAutomation.scroll(input);
        return { success: true };

      case 'task_complete':
      case 'task_failed':
        // These are handled separately
        return { success: true };

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Build tool result content in proper Anthropic format
   */
  private buildToolResultContent(
    response: Anthropic.Message,
    toolResults: Array<{ toolName: string; input: any; success: boolean; output?: any; error?: string }>,
    browserContext: any
  ): Anthropic.MessageParam['content'] {
    const content: Anthropic.MessageParam['content'] = [];
    
    // Add tool_result blocks for each tool_use in the response
    let resultIndex = 0;
    for (const block of response.content) {
      if (block.type === 'tool_use' && resultIndex < toolResults.length) {
        const result = toolResults[resultIndex];
        
        // Format the output
        let outputText: string;
        if (!result.success) {
          outputText = `Error: ${result.error}`;
        } else if (typeof result.output === 'string') {
          outputText = result.output;
        } else if (result.output) {
          outputText = JSON.stringify(result.output, null, 2);
        } else {
          outputText = 'Success';
        }
        
        // Add tool_result block
        content.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: outputText,
          is_error: !result.success
        });
        
        resultIndex++;
      }
    }
    
    // Add browser context as additional text
    const browserContextText = this.contextProvider.contextToText(browserContext);
    content.push({
      type: 'text',
      text: `\n## Updated Browser State:\n${browserContextText}`
    });
    
    return content;
  }

  /**
   * Update cached browser context
   */
  private updateCachedContext(browserContext: any): void {
    const browserContextText = this.contextProvider.contextToText(browserContext);
    const cached = this.conversationManager['cachedContext'];
    
    if (cached) {
      this.conversationManager.updateCachedContext(
        cached.systemPrompt,
        browserContextText,
        cached.recordingContext,
        cached.tools
      );
    }
  }

  /**
   * Check if task is complete
   */
  private isTaskComplete(response: Anthropic.Message): boolean {
    return response.content.some(
      block => block.type === 'tool_use' && block.name === 'task_complete'
    );
  }

  /**
   * Check if task failed
   */
  private isTaskFailed(response: Anthropic.Message): boolean {
    return response.content.some(
      block => block.type === 'tool_use' && block.name === 'task_failed'
    );
  }

  /**
   * Extract completion summary
   */
  private extractCompletionSummary(response: Anthropic.Message): string {
    const toolUse = response.content.find(
      block => block.type === 'tool_use' && block.name === 'task_complete'
    );
    return (toolUse as any)?.input?.summary || 'Task completed';
  }

  /**
   * Extract failure reason
   */
  private extractFailureReason(response: Anthropic.Message): string {
    const toolUse = response.content.find(
      block => block.type === 'tool_use' && block.name === 'task_failed'
    );
    return (toolUse as any)?.input?.reason || 'Task failed';
  }

  /**
   * Check if stuck in repetitive loop
   */
  private isStuckInLoop(): boolean {
    if (this.lastActions.length < this.MAX_SAME_ACTION_REPEATS) {
      return false;
    }
    
    // Check if last N actions are all the same
    const lastN = this.lastActions.slice(-this.MAX_SAME_ACTION_REPEATS);
    return lastN.every(action => action === lastN[0]);
  }
}
