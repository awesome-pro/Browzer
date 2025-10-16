/**
 * ExecutionEngine - Manages tool execution with context awareness
 * 
 * Handles:
 * - Tool execution with fresh browser context
 * - Pre-execution validation
 * - Post-execution verification
 * - Error handling and reporting
 * - Execution metrics
 */

import { ToolRegistry } from '@/main/automation/tools/ToolRegistry';
import { BrowserContextProvider } from '@/main/automation/context/BrowserContextProvider';
import { ToolResult } from '@/main/automation/tools/types';

export interface ExecutionStep {
  stepNumber: number;
  reasoning: string;
  toolName: string;
  parameters: Record<string, any>;
  status: 'pending' | 'executing' | 'success' | 'failed' | 'skipped';
  result?: any;
  error?: string;
  retryCount?: number;
}

export interface ExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTime?: number;
  contextBefore?: any;
  contextAfter?: any;
}

export class ExecutionEngine {
  private toolRegistry: ToolRegistry;
  private contextProvider: BrowserContextProvider;

  constructor(
    toolRegistry: ToolRegistry,
    contextProvider: BrowserContextProvider
  ) {
    this.toolRegistry = toolRegistry;
    this.contextProvider = contextProvider;
  }

  /**
   * Execute a single step with context awareness
   */
  public async executeStep(
    step: ExecutionStep,
    currentContext: any
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    console.log(`⚡ Executing: ${step.toolName}`);
    console.log(`   Parameters:`, JSON.stringify(step.parameters, null, 2));

    try {
      // Pre-execution validation
      const validation = await this.validateExecution(step, currentContext);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          executionTime: Date.now() - startTime
        };
      }

      // Execute tool
      const result = await this.toolRegistry.executeTool(
        step.toolName,
        step.parameters
      );

      // Wait for page to stabilize after action
      await this.waitForStability();

      // Get context after execution
      const contextAfter = await this.contextProvider.getContext({
        includePrunedDOM: false,
        includeAccessibilityTree: false,
        includeScreenshot: false
      });

      const executionTime = Date.now() - startTime;

      if (result.success) {
        console.log(`✅ Step completed in ${executionTime}ms`);
        return {
          success: true,
          data: result.data,
          executionTime,
          contextBefore: currentContext,
          contextAfter
        };
      } else {
        console.log(`❌ Step failed: ${result.message}`);
        return {
          success: false,
          error: result.message,
          executionTime,
          contextBefore: currentContext,
          contextAfter
        };
      }

    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`❌ Execution error:`, error);
      
      return {
        success: false,
        error: (error as Error).message,
        executionTime
      };
    }
  }

  /**
   * Validate step can be executed in current context
   */
  private async validateExecution(
    step: ExecutionStep,
    context: any
  ): Promise<{ valid: boolean; error?: string }> {
    // Check if tool exists
    const tool = this.toolRegistry.getTool(step.toolName);
    if (!tool) {
      return {
        valid: false,
        error: `Unknown tool: ${step.toolName}`
      };
    }

    // Validate parameters
    const requiredParams = Object.entries(tool.parameters)
      .filter(([_, def]) => def.required)
      .map(([name, _]) => name);

    for (const param of requiredParams) {
      if (!(param in step.parameters)) {
        return {
          valid: false,
          error: `Missing required parameter: ${param}`
        };
      }
    }

    // Context-specific validations
    if (step.toolName === 'click_element' || step.toolName === 'type_text') {
      // Check if we have selector information
      if (!step.parameters.selector_value) {
        return {
          valid: false,
          error: 'Missing selector_value for interaction'
        };
      }
    }

    if (step.toolName === 'navigate_to_url') {
      // Check if URL is provided
      if (!step.parameters.url) {
        return {
          valid: false,
          error: 'Missing URL for navigation'
        };
      }
    }

    return { valid: true };
  }

  /**
   * Wait for page to stabilize after action
   */
  private async waitForStability(): Promise<void> {
    // Give page time to react to action
    await this.sleep(300);

    // TODO: Could add more sophisticated stability detection:
    // - Wait for network idle
    // - Wait for DOM mutations to settle
    // - Wait for animations to complete
  }

  /**
   * Batch execute multiple steps
   */
  public async executeSteps(
    steps: ExecutionStep[],
    onStepComplete?: (step: ExecutionStep, result: ExecutionResult) => void
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const step of steps) {
      // Get fresh context before each step
      const context = await this.contextProvider.getContext({
        includePrunedDOM: true,
        includeAccessibilityTree: true,
        includeScreenshot: false
      });

      // Execute step
      const result = await this.executeStep(step, context);
      results.push(result);

      // Callback
      if (onStepComplete) {
        onStepComplete(step, result);
      }

      // Stop on first failure
      if (!result.success) {
        break;
      }

      // Small delay between steps
      await this.sleep(500);
    }

    return results;
  }

  /**
   * Verify execution result matches expected outcome
   */
  public async verifyOutcome(
    expectedOutcome: string,
    context: any
  ): Promise<{ verified: boolean; reason?: string }> {
    // Simple verification based on context
    // In a more sophisticated implementation, this could use LLM to verify

    // Check if we're on expected URL
    if (expectedOutcome.includes('http')) {
      const currentUrl = context.url || '';
      if (currentUrl.includes(expectedOutcome)) {
        return { verified: true };
      } else {
        return {
          verified: false,
          reason: `Expected URL to contain "${expectedOutcome}", but got "${currentUrl}"`
        };
      }
    }

    // Check if expected text is present
    if (context.visibleText) {
      if (context.visibleText.includes(expectedOutcome)) {
        return { verified: true };
      } else {
        return {
          verified: false,
          reason: `Expected text "${expectedOutcome}" not found on page`
        };
      }
    }

    // Default: assume verified
    return { verified: true };
  }

  /**
   * Get execution statistics
   */
  public getStats(): any {
    return this.toolRegistry.getAllStats();
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

