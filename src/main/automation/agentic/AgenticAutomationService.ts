/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AgenticAutomationService - ReAct-based agentic automation with Claude
 * 
 * Implements the Think → Act → Observe → Reflect loop with persistent session storage:
 * 1. THINK: Claude analyzes current state and decides next action
 * 2. ACT: Execute the chosen tool/action
 * 3. OBSERVE: Capture results and update browser context
 * 4. REFLECT: Analyze success/failure and adapt strategy
 * 
 * Features:
 * - Persistent conversation context with prompt caching
 * - Full session storage (messages, tools, costs) in SQLite
 * - Real-time browser state awareness with screenshots
 * - Intelligent error recovery
 * - Adaptive planning
 * - Progress tracking and reporting
 */

import Anthropic from '@anthropic-ai/sdk';
import { WebContentsView } from 'electron';
import { randomUUID } from 'crypto';
import { BrowserAutomation } from '../BrowserAutomation';
import { BrowserContextProvider } from '@/main/automation/context';
import { ConversationManager } from './ConversationManager';
import { ToolRegistry } from './ToolRegistry';
import { RecordingSession } from '@/shared/types';
import { ChatSessionService } from '@/main/services/ChatSessionService';

export interface AgenticExecutionOptions {
  userPrompt: string;
  recordingSession: RecordingSession;
  apiKey: string;
  maxIterations?: number;
  onProgress?: (update: ProgressUpdate) => void;
  sessionId?: string;  // Optional: resume existing session
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
  sessionId: string;  // ID of the stored session
}

export class AgenticAutomationService {
  private anthropic: Anthropic;
  private browserAutomation: BrowserAutomation;
  private contextProvider: BrowserContextProvider;
  private conversationManager: ConversationManager;
  private chatSessionService: ChatSessionService;
  private view: WebContentsView;
  
  private isExecuting = false;
  private shouldStop = false;
  private currentIteration = 0;
  private currentSessionId: string | null = null;
  
  // Limits
  private readonly MAX_ITERATIONS = 50;
  private readonly MAX_CONSECUTIVE_ERRORS = 3;
  private readonly MAX_SAME_ACTION_REPEATS = 3;
  
  // Tracking
  private consecutiveErrors = 0;
  private lastActions: string[] = [];

  constructor(view: WebContentsView, chatSessionService: ChatSessionService) {
    this.view = view;
    this.browserAutomation = new BrowserAutomation(view);
    this.contextProvider = new BrowserContextProvider(view);
    this.conversationManager = new ConversationManager();
    this.chatSessionService = chatSessionService;
    this.anthropic = new Anthropic({ apiKey: '' }); // Will be set during execution
  }

  /**
   * Execute automation task using ReAct loop with full session persistence
   */
  public async execute(options: AgenticExecutionOptions): Promise<AgenticExecutionResult> {
    const startTime = Date.now();
    const { userPrompt, recordingSession, apiKey, maxIterations = this.MAX_ITERATIONS, onProgress } = options;

    // Create or resume session
    const sessionId = options.sessionId || randomUUID();
    this.currentSessionId = sessionId;

    // Initialize
    this.anthropic = new Anthropic({ apiKey });
    this.isExecuting = true;
    this.shouldStop = false;
    this.currentIteration = 0;
    this.consecutiveErrors = 0;
    this.lastActions = [];
    this.conversationManager.reset();

    console.log('🤖 Starting agentic automation...');
    console.log(`   Session ID: ${sessionId}`);
    console.log(`   User Goal: ${userPrompt}`);
    console.log(`   Recording: ${recordingSession.name}`);

    try {
      // Create session in database
      if (!options.sessionId) {
        this.chatSessionService.createSession({
          id: sessionId,
          title: userPrompt.substring(0, 100),
          recordingSessionId: recordingSession.id,
          userPrompt
        });
        console.log(`📝 Created new session: ${sessionId}`);
      } else {
        console.log(`📝 Resuming session: ${sessionId}`);
      }

      // Start monitoring browser context
      await this.browserAutomation.start();
      await this.contextProvider.startMonitoring();

      // Initialize conversation with system prompt and context
      await this.initializeConversation(userPrompt, recordingSession);

      // Add initial user message
      const initialMessageId = randomUUID();
      const initialMessage = `Please help me automate the following task:\n\n${userPrompt}\n\nAnalyze the current browser state and decide what action to take first.`;
      
      this.conversationManager.addUserMessage(initialMessage);
      this.chatSessionService.addMessage({
        id: initialMessageId,
        sessionId,
        role: 'user',
        content: initialMessage
      });

      // ReAct Loop
      while (this.currentIteration < maxIterations && !this.shouldStop) {
        this.currentIteration++;
        console.log(`\n🔄 Iteration ${this.currentIteration}/${maxIterations}`);

        // Update session iteration count
        this.chatSessionService.updateSession(sessionId, {
          iterations: this.currentIteration
        });

        try {
          // THINK: Get Claude's decision
          onProgress?.({
            type: 'thinking',
            message: 'Analyzing current state and deciding next action...',
            iteration: this.currentIteration
          });

          const response = await this.getClaudeResponse();

          // Log assistant message
          const assistantMessageId = randomUUID();
          this.chatSessionService.addMessage({
            id: assistantMessageId,
            sessionId,
            role: 'assistant',
            content: response.content,
            inputTokens: response.usage?.input_tokens,
            outputTokens: response.usage?.output_tokens,
            cacheCreationTokens: response.usage?.cache_creation_input_tokens,
            cacheReadTokens: response.usage?.cache_read_input_tokens
          });

          // Check for completion or failure
          if (this.isTaskComplete(response)) {
            const summary = this.extractCompletionSummary(response);
            console.log('✅ Task completed successfully!');
            
            onProgress?.({
              type: 'completed',
              message: summary,
              iteration: this.currentIteration
            });

            // Update session as completed
            const tokenUsage = this.conversationManager.getTokenUsage();
            this.chatSessionService.updateSession(sessionId, {
              status: 'completed',
              completedAt: Date.now(),
              duration: Date.now() - startTime,
              totalTokens: tokenUsage.totalTokens,
              totalCost: tokenUsage.estimatedCost,
              summary
            });

            return {
              success: true,
              summary,
              iterations: this.currentIteration,
              conversationHistory: this.conversationManager.export().messages,
              duration: Date.now() - startTime,
              sessionId
            };
          }

          if (this.isTaskFailed(response)) {
            const reason = this.extractFailureReason(response);
            console.log(`❌ Task failed: ${reason}`);
            
            onProgress?.({
              type: 'failed',
              message: reason,
              iteration: this.currentIteration,
              error: reason
            });

            // Update session as failed
            const tokenUsage = this.conversationManager.getTokenUsage();
            this.chatSessionService.updateSession(sessionId, {
              status: 'failed',
              completedAt: Date.now(),
              duration: Date.now() - startTime,
              totalTokens: tokenUsage.totalTokens,
              totalCost: tokenUsage.estimatedCost,
              error: reason
            });

            return {
              success: false,
              summary: reason,
              iterations: this.currentIteration,
              conversationHistory: this.conversationManager.export().messages,
              error: reason,
              duration: Date.now() - startTime,
              sessionId
            };
          }

          // ACT: Execute tool calls
          const toolResults = await this.executeToolCalls(response, onProgress, sessionId);

          // OBSERVE: Update browser context
          onProgress?.({
            type: 'observing',
            message: 'Capturing updated browser state...',
            iteration: this.currentIteration
          });

          const updatedContext = await this.contextProvider.getContext({
            includePrunedDOM: true,
            includeConsoleLogs: true,
            includeScreenshot: true,  // Enable visual context
            maxElements: 100,
            maxConsoleEntries: 10
          });

          // REFLECT: Add tool results to conversation in proper format
          const toolResultContent = this.buildToolResultContent(response, toolResults, updatedContext);
          this.conversationManager.addUserMessage(toolResultContent);
          
          // Log user message with tool results
          const toolResultMessageId = randomUUID();
          this.chatSessionService.addMessage({
            id: toolResultMessageId,
            sessionId,
            role: 'user',
            content: toolResultContent
          });

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
            const warningMessage = 'You seem to be repeating the same actions. Please try a different approach or use task_failed if you cannot proceed.';
            this.conversationManager.addUserMessage(warningMessage);
            
            this.chatSessionService.addMessage({
              id: randomUUID(),
              sessionId,
              role: 'system',
              content: warningMessage
            });
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
            
            // Update session as failed
            const tokenUsage = this.conversationManager.getTokenUsage();
            this.chatSessionService.updateSession(sessionId, {
              status: 'failed',
              completedAt: Date.now(),
              duration: Date.now() - startTime,
              totalTokens: tokenUsage.totalTokens,
              totalCost: tokenUsage.estimatedCost,
              error: errorMsg
            });

            return {
              success: false,
              summary: errorMsg,
              iterations: this.currentIteration,
              conversationHistory: this.conversationManager.export().messages,
              error: errorMsg,
              duration: Date.now() - startTime,
              sessionId
            };
          }

          // Add error to conversation for Claude to handle
          const errorMessage = `An error occurred: ${(error as Error).message}\n\nPlease analyze the error and decide how to proceed.`;
          this.conversationManager.addUserMessage(errorMessage);
          
          this.chatSessionService.addMessage({
            id: randomUUID(),
            sessionId,
            role: 'system',
            content: errorMessage
          });
        }
      }

      // Max iterations reached
      const timeoutMsg = `Reached maximum iterations (${maxIterations}) without completing the task`;
      console.warn(timeoutMsg);
      
      // Update session as failed
      const tokenUsage = this.conversationManager.getTokenUsage();
      this.chatSessionService.updateSession(sessionId, {
        status: 'failed',
        completedAt: Date.now(),
        duration: Date.now() - startTime,
        totalTokens: tokenUsage.totalTokens,
        totalCost: tokenUsage.estimatedCost,
        error: timeoutMsg
      });

      return {
        success: false,
        summary: timeoutMsg,
        iterations: this.currentIteration,
        conversationHistory: this.conversationManager.export().messages,
        error: timeoutMsg,
        duration: Date.now() - startTime,
        sessionId
      };

    } finally {
      this.isExecuting = false;
      this.contextProvider.stopMonitoring();
      await this.browserAutomation.stop();
      
      // Log comprehensive execution summary
      const duration = (Date.now() - startTime) / 1000;
      const tokenUsage = this.conversationManager.getTokenUsage();
      
      console.log('\n' + '='.repeat(80));
      console.log('📊 EXECUTION SUMMARY');
      console.log('='.repeat(80));
      console.log(`📝 Session ID:        ${sessionId}`);
      console.log(`⏱️  Duration:          ${duration.toFixed(2)}s`);
      console.log(`🔄 Iterations:        ${this.currentIteration}`);
      console.log('');
      console.log('💰 TOKEN USAGE & COST:');
      console.log(`   Input tokens:         ${tokenUsage.inputTokens.toLocaleString()}`);
      console.log(`   Output tokens:        ${tokenUsage.outputTokens.toLocaleString()}`);
      console.log(`   Cache write tokens:   ${tokenUsage.cacheCreationTokens.toLocaleString()}`);
      console.log(`   Cache read tokens:    ${tokenUsage.cacheReadTokens.toLocaleString()}`);
      console.log(`   ─────────────────────────────────`);
      console.log(`   Total tokens:         ${tokenUsage.totalTokens.toLocaleString()}`);
      console.log(`   Estimated cost:       $${tokenUsage.estimatedCost.toFixed(4)}`);
      console.log('='.repeat(80) + '\n');
    }
  }

  /**
   * Cancel ongoing execution
   */
  public cancel(): void {
    console.log('🛑 Cancelling automation...');
    this.shouldStop = true;
    
    // Update session as cancelled
    if (this.currentSessionId) {
      const tokenUsage = this.conversationManager.getTokenUsage();
      this.chatSessionService.updateSession(this.currentSessionId, {
        status: 'cancelled',
        completedAt: Date.now(),
        totalTokens: tokenUsage.totalTokens,
        totalCost: tokenUsage.estimatedCost
      });
    }
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

    // Capture initial browser context
    const browserContext = await this.contextProvider.getContext({
      includePrunedDOM: true,
      includeAccessibilityTree: false,
      includeConsoleLogs: true,
      includeNetworkActivity: true,
      includeScreenshot: true,
      maxElements: 100,
      maxConsoleEntries: 20,
      maxNetworkEntries: 20
    });

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt();

    // Build recording context
    const recordingContext = this.buildRecordingContext(recordingSession);

    // Build browser context text
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
    console.log(`   ${tools.length} tools available: ${tools.map(t => t.name).join(', ')}`);
    console.log(`   ${this.conversationManager.getSummary()}`);
  }

  /**
   * Build system prompt for Claude
   */
  private buildSystemPrompt(): string {
    return `You are an expert browser automation agent powered by Claude Sonnet 4.5. Your role is to help users automate web tasks using a ReAct (Reasoning and Acting) approach.

## Your Capabilities

You have access to browser automation tools that let you:
- Navigate to URLs
- Click elements (buttons, links, etc.)
- Type into input fields
- Select dropdown options
- Wait for elements to appear
- Scroll pages
- Inspect page content and structure
- Get text from elements

## How You Work (ReAct Loop)

1. **THINK**: Analyze the current browser state (DOM, screenshots, console logs)
2. **ACT**: Choose and execute ONE tool at a time
3. **OBSERVE**: See the results and updated browser state
4. **REFLECT**: Decide if you're making progress or need to adjust strategy
5. **REPEAT**: Continue until task is complete or impossible

## Important Guidelines

- **One tool at a time**: Execute tools sequentially, never assume multiple actions succeed
- **Verify before proceeding**: Always check if your action succeeded before moving on
- **Use screenshots**: Visual context helps you understand the page layout
- **Be adaptive**: If something fails, try alternative approaches
- **Use selectors wisely**: Prefer data-testid, aria-labels, or IDs over complex CSS paths
- **Handle errors gracefully**: If you encounter errors, analyze them and try different approaches
- **Know when to give up**: Use task_failed if the task is truly impossible

## When to Complete

Use \`task_complete\` when:
- The user's goal has been fully achieved
- You can verify the success visually or through page content

Use \`task_failed\` when:
- The task is impossible (e.g., page doesn't exist, feature not available)
- You've tried multiple approaches and all failed
- You're stuck in a loop and can't make progress

## Best Practices

- Start by understanding the current page state
- Break complex tasks into simple steps
- Verify each step before proceeding
- Use :contains() for text-based element selection when needed
- Wait for elements to load before interacting with them
- Check for error messages or unexpected page states

Remember: You're iterative and adaptive. Each action gives you new information to refine your approach.`;
  }

  /**
   * Build recording context from session
   */
  private buildRecordingContext(session: RecordingSession): string {
    const lines: string[] = [];
    
    lines.push('# RECORDING CONTEXT');
    lines.push('');
    lines.push(`The user has provided a recording session "${session.name}" that demonstrates the task.`);
    lines.push('This recording shows the sequence of actions they took:');
    lines.push('');
    
    // Add first 20 actions from recording
    session.actions.slice(0, 20).forEach((action, idx) => {
      const target = (action as any).target;
      const selector = target?.selector || '';
      const value = (action as any).value || '';
      lines.push(`${idx + 1}. [${action.type}] ${selector || value}`);
    });
    
    if (session.actions.length > 20) {
      lines.push(`... and ${session.actions.length - 20} more actions`);
    }
    
    lines.push('');
    lines.push('Use this as a reference for the general flow, but adapt based on the current page state.');
    
    return lines.join('\n');
  }

  /**
   * Get Claude's response with tool use
   */
  private async getClaudeResponse(): Promise<Anthropic.Message> {
    console.log('🤔 Asking Claude for next action...');

    const { system, messages, tools } = this.conversationManager.buildMessagesForAPI();

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: system as any, // System can be string or array of content blocks
      messages,
      tools,
      tool_choice: { type: 'auto' }
    });

    // Add assistant response to conversation with token usage
    this.conversationManager.addAssistantMessage(response.content, response.usage);

    return response;
  }

  /**
   * Execute tool calls from Claude's response
   */
  private async executeToolCalls(
    response: Anthropic.Message,
    onProgress?: (update: ProgressUpdate) => void,
    sessionId?: string
  ): Promise<Array<{ toolName: string; input: any; success: boolean; output?: any; error?: string }>> {
    const results: Array<{ toolName: string; input: any; success: boolean; output?: any; error?: string }> = [];

    for (const block of response.content) {
      if (block.type === 'tool_use') {
        const toolName = block.name;
        const input = block.input;
        const toolStartTime = Date.now();

        console.log(`🔧 Executing tool: ${toolName}`);
        console.log(`   Input: ${JSON.stringify(input, null, 2)}`);

        onProgress?.({
          type: 'acting',
          message: `Executing: ${toolName}`,
          iteration: this.currentIteration,
          toolName,
          toolInput: input
        });

        try {
          const output = await this.executeTool(toolName, input);
          const duration = Date.now() - toolStartTime;
          
          console.log('✅ Tool executed successfully');
          if (output && typeof output === 'object' && Object.keys(output).length > 0) {
            console.log(`   Output: ${JSON.stringify(output).substring(0, 200)}`);
          }

          results.push({
            toolName,
            input,
            success: true,
            output
          });

          // Log tool execution to database
          if (sessionId) {
            this.chatSessionService.addToolExecution({
              id: randomUUID(),
              sessionId,
              iteration: this.currentIteration,
              toolName,
              input,
              output,
              success: true,
              duration
            });
          }

          // Track action for loop detection
          this.lastActions.push(`${toolName}:${JSON.stringify(input)}`);
          if (this.lastActions.length > 10) {
            this.lastActions.shift();
          }

        } catch (error) {
          const duration = Date.now() - toolStartTime;
          const errorMsg = (error as Error).message;
          
          console.log('❌ Tool execution failed');
          console.log(`   Error: ${errorMsg}`);

          results.push({
            toolName,
            input,
            success: false,
            error: errorMsg
          });

          // Log failed tool execution to database
          if (sessionId) {
            this.chatSessionService.addToolExecution({
              id: randomUUID(),
              sessionId,
              iteration: this.currentIteration,
              toolName,
              input,
              error: errorMsg,
              success: false,
              duration
            });
          }

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
        const selectors = Array.isArray(input.selector) ? input.selector : [input.selector];
        await this.browserAutomation.click(selectors);
        return { success: true, selector: input.selector };

      case 'type':
        await this.browserAutomation.type(input.selector, input.text);
        return { success: true };

      case 'select':
        await this.browserAutomation.select(input.selector, input.value);
        return { success: true };

      case 'wait_for_element':
        await this.browserAutomation.waitForElementVisible(input.selector, input.timeout || 5000);
        return { success: true };

      case 'wait':
        // Use a simple promise-based wait
        await new Promise(resolve => setTimeout(resolve, input.duration));
        return { success: true, duration: input.duration };

      case 'get_browser_context':
        const level = input.detail_level || 'standard';
        let context;
        if (level === 'minimal') {
          context = await this.contextProvider.getLightweightContext();
        } else if (level === 'rich') {
          context = await this.contextProvider.getRichContext();
        } else {
          context = await this.contextProvider.getContext();
        }
        console.log('Browser context:', context);
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
    
    // Add screenshot if available (image should come before text per Claude best practices)
    if (browserContext.visual?.screenshotBase64) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: browserContext.visual.screenshotMediaType || 'image/png',
          data: browserContext.visual.screenshotBase64
        }
      });
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
    return (toolUse as any)?.input?.summary || 'Task completed successfully';
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
