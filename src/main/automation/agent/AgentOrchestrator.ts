/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AgentOrchestrator - ReAct-based LLM orchestration for browser automation
 * 
 * Implements a sophisticated ReAct (Reasoning + Acting) loop that:
 * - Analyzes recorded sessions to understand task patterns
 * - Plans multi-step automation sequences
 * - Executes tools with real-time browser context
 * - Self-debugs and recovers from failures
 * - Maintains memory across conversation turns
 * 
 * Architecture:
 * 1. Planning Phase: Analyze intent + recorded session → Generate action plan
 * 2. Execution Phase: Execute tools sequentially with context updates
 * 3. Reflection Phase: Verify results, detect failures, replan if needed
 * 4. Recovery Phase: Self-debug errors and retry with updated strategy
 */

import Anthropic from '@anthropic-ai/sdk';
import { ToolRegistry } from '../tools/ToolRegistry';
import { BrowserContextProvider } from '@/main/automation/context/BrowserContextProvider';
import { SessionAnalyzer } from './SessionAnalyzer';
import { RecordingSession } from '@/shared/types';
import { WebContentsView } from 'electron';
import { ExecutionEngine } from './ExecutionEngine';
import { MemoryManager } from './MemoryManager';

export interface AgentConfig {
  apiKey: string;
  model?: string;
  maxIterations?: number;
  maxRetries?: number;
  temperature?: number;
  thinkingBudget?: number; // Extended thinking tokens
}

export interface AutomationRequest {
  userIntent: string;
  recordedSession?: RecordingSession;
  startUrl?: string;
  constraints?: string[];
  expectedOutcome?: string;
}

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

export interface ExecutionPlan {
  goal: string;
  steps: ExecutionStep[];
  estimatedDuration?: number;
  confidence?: number;
}

export interface AgentState {
  currentStep: number;
  plan: ExecutionPlan | null;
  executionHistory: ExecutionStep[];
  errors: string[];
  iterationCount: number;
  isReplanning: boolean;
  lastBrowserContext?: any;
}

export class AgentOrchestrator {
  private client: Anthropic;
  private config: Required<AgentConfig>;
  private toolRegistry: ToolRegistry;
  private contextProvider: BrowserContextProvider;
  private sessionAnalyzer: SessionAnalyzer;
  private executionEngine: ExecutionEngine;
  private memoryManager: MemoryManager;
  private state: AgentState;

  constructor(
    view: WebContentsView,
    config: AgentConfig
  ) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model || 'claude-sonnet-4-20250514',
      maxIterations: config.maxIterations || 15,
      maxRetries: config.maxRetries || 3,
      temperature: config.temperature || 0.7,
      thinkingBudget: config.thinkingBudget || 10000
    };

    this.client = new Anthropic({ apiKey: this.config.apiKey });
    this.toolRegistry = new ToolRegistry(view);
    this.contextProvider = new BrowserContextProvider(view);
    this.sessionAnalyzer = new SessionAnalyzer();
    this.executionEngine = new ExecutionEngine(this.toolRegistry, this.contextProvider);
    this.memoryManager = new MemoryManager();

    this.state = this.initializeState();

    console.log('🤖 Agent Orchestrator initialized with model:', this.config.model);
  }

  /**
   * Main entry point: Execute automation based on user intent
   */
  public async executeAutomation(request: AutomationRequest): Promise<{
    success: boolean;
    result?: any;
    plan?: ExecutionPlan;
    executionHistory: ExecutionStep[];
    error?: string;
  }> {
    console.log('🎯 Starting automation:', request.userIntent);

    try {
      // Reset state for new automation
      this.state = this.initializeState();
      
      // Store request in memory
      this.memoryManager.addUserMessage(request.userIntent);

      // Phase 1: Analyze recorded session (if provided)
      let sessionContext = '';
      if (request.recordedSession) {
        console.log('📊 Analyzing recorded session...');
        sessionContext = await this.sessionAnalyzer.analyzeSession(request.recordedSession);
        this.memoryManager.addContext('recorded_session', sessionContext);
      }

      // Phase 2: Get initial browser context
      const initialContext = await this.contextProvider.getContext({
        includePrunedDOM: true,
        includeAccessibilityTree: true,
        includeScreenshot: false
      });

      // Phase 3: Generate initial plan
      console.log('🧠 Generating execution plan...');
      const plan = await this.generatePlan(request, sessionContext, initialContext);
      this.state.plan = plan;

      console.log(`📋 Plan generated with ${plan.steps.length} steps`);
      plan.steps.forEach((step, i) => {
        console.log(`  ${i + 1}. ${step.toolName}: ${step.reasoning}`);
      });

      // Phase 4: Execute plan with ReAct loop
      const result = await this.executeReActLoop(request);

      return {
        success: result.success,
        result: result.data,
        plan: this.state.plan || undefined,
        executionHistory: this.state.executionHistory,
        error: result.error
      };

    } catch (error) {
      console.error('❌ Automation failed:', error);
      return {
        success: false,
        executionHistory: this.state.executionHistory,
        error: (error as Error).message
      };
    }
  }

  /**
   * ReAct Loop: Reason → Act → Observe → Reflect → (Replan if needed)
   */
  private async executeReActLoop(_request: AutomationRequest): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    while (this.state.iterationCount < this.config.maxIterations) {
      this.state.iterationCount++;
      console.log(`\n🔄 ReAct Iteration ${this.state.iterationCount}/${this.config.maxIterations}`);

      try {
        // Check if plan is complete
        if (this.isPlanComplete()) {
          console.log('✅ All steps completed successfully!');
          return {
            success: true,
            data: this.collectResults()
          };
        }

        // Get current step
        const currentStep = this.getCurrentStep();
        if (!currentStep) {
          console.log('⚠️ No more steps to execute');
          break;
        }

        console.log(`\n📍 Step ${currentStep.stepNumber}: ${currentStep.toolName}`);
        console.log(`   Reasoning: ${currentStep.reasoning}`);

        // Get fresh browser context before execution
        const browserContext = await this.contextProvider.getContext({
          includePrunedDOM: true,
          includeAccessibilityTree: true,
          includeScreenshot: false
        });
        this.state.lastBrowserContext = browserContext;

        // Execute current step
        currentStep.status = 'executing';
        const stepResult = await this.executionEngine.executeStep(
          currentStep,
          browserContext
        );

        // Update step with result
        currentStep.status = stepResult.success ? 'success' : 'failed';
        currentStep.result = stepResult.data;
        currentStep.error = stepResult.error;
        this.state.executionHistory.push({ ...currentStep });

        if (stepResult.success) {
          console.log(`✅ Step ${currentStep.stepNumber} succeeded`);
          this.state.currentStep++;
          
          // Note: We don't add tool results to memory here
          // The plan execution is self-contained and doesn't use the message history
        } else {
          console.log(`❌ Step ${currentStep.stepNumber} failed: ${stepResult.error}`);
          this.state.errors.push(stepResult.error || 'Unknown error');

          // Attempt recovery
          const recovered = await this.attemptRecovery(currentStep, stepResult.error || '');
          
          if (!recovered) {
            return {
              success: false,
              error: `Failed at step ${currentStep.stepNumber}: ${stepResult.error}`
            };
          }
        }

        // Small delay between steps
        await this.sleep(500);

      } catch (error) {
        console.error('❌ Error in ReAct loop:', error);
        this.state.errors.push((error as Error).message);
        
        // Try to recover
        const recovered = await this.attemptRecovery(
          this.getCurrentStep(),
          (error as Error).message
        );
        
        if (!recovered) {
          return {
            success: false,
            error: (error as Error).message
          };
        }
      }
    }

    // Max iterations reached
    return {
      success: false,
      error: `Maximum iterations (${this.config.maxIterations}) reached without completion`
    };
  }

  /**
   * Generate execution plan using Claude with extended thinking
   */
  private async generatePlan(
    request: AutomationRequest,
    sessionContext: string,
    browserContext: any
  ): Promise<ExecutionPlan> {
    const systemPrompt = this.buildPlanningSystemPrompt();
    const userPrompt = this.buildPlanningUserPrompt(request, sessionContext, browserContext);

    console.log('🧠 Calling Claude for plan generation...');

    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: 16000,
      // temperature: this.config.temperature,
      // thinking: {
      //   type: 'enabled',
      //   budget_tokens: this.config.thinkingBudget
      // },
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ],
      tools: this.toolRegistry.getToolsAsMCP() as unknown as Anthropic.Tool[]
    });

    // Extract plan from response
    const plan = this.extractPlanFromResponse(response);
    return plan;
  }

  /**
   * Attempt to recover from step failure
   */
  private async attemptRecovery(
    failedStep: ExecutionStep,
    error: string
  ): Promise<boolean> {
    console.log('🔧 Attempting recovery...');

    failedStep.retryCount = (failedStep.retryCount || 0) + 1;

    if (failedStep.retryCount > this.config.maxRetries) {
      console.log('❌ Max retries exceeded, initiating replan');
      return await this.replan(failedStep, error);
    }

    // Simple retry with same parameters
    console.log(`🔄 Retry ${failedStep.retryCount}/${this.config.maxRetries}`);
    return true;
  }

  /**
   * Replan: Ask Claude to generate new plan based on failure
   */
  private async replan(
    failedStep: ExecutionStep,
    error: string
  ): Promise<boolean> {
    console.log('🔄 Replanning execution strategy...');
    this.state.isReplanning = true;

    try {
      // Get current browser state
      const currentContext = await this.contextProvider.getContext({
        includePrunedDOM: true,
        includeAccessibilityTree: true,
        includeScreenshot: false
      });

      // Build replan prompt
      const replanPrompt = this.buildReplanPrompt(failedStep, error, currentContext);

      // For replanning, we start fresh with just the replan prompt
      // We don't use the conversation history as it may have tool_use blocks without proper tool_result pairing
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: 16000,
        temperature: this.config.temperature,
        thinking: {
          type: 'enabled',
          budget_tokens: this.config.thinkingBudget
        },
        system: this.buildPlanningSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: replanPrompt
          }
        ],
        tools: this.toolRegistry.getToolsAsMCP() as unknown as Anthropic.Tool[]
      });

      // Extract new plan
      const newPlan = this.extractPlanFromResponse(response);
      
      // Update state with new plan (starting from failed step)
      if (this.state.plan) {
        this.state.plan.steps = [
          ...this.state.plan.steps.slice(0, this.state.currentStep),
          ...newPlan.steps
        ];
      }

      this.state.isReplanning = false;
      console.log('✅ Replan successful, continuing execution');
      return true;

    } catch (error) {
      console.error('❌ Replan failed:', error);
      this.state.isReplanning = false;
      return false;
    }
  }

  /**
   * Build system prompt for planning
   * Based on Claude 4.5 best practices for precise instruction following
   */
  private buildPlanningSystemPrompt(): string {
    return `You are an expert browser automation agent powered by Claude Sonnet 4.5. Your role is to help users automate web tasks by generating and executing precise, well-reasoned action plans.

<capabilities>
You have access to a comprehensive set of browser automation tools:

NAVIGATION TOOLS:
- navigate_to_url: Navigate to a URL
- go_back: Go back in browser history
- go_forward: Go forward in browser history  
- reload_page: Reload the current page

INTERACTION TOOLS:
- click_element: Click an element using CSS selector, XPath, or text content
- type_text: Type text into an input field
- press_key: Press keyboard keys
- select_option: Select an option from dropdown
- check_checkbox: Check/uncheck a checkbox
- submit_form: Submit a form

OBSERVATION TOOLS:
- get_page_info: Get current page URL, title, and metadata
- find_element: Find and return information about an element
- verify_element_exists: Check if an element exists on the page
- verify_text_present: Check if text is present on the page
- get_element_text: Get text content of an element
- get_element_attribute: Get attribute value of an element
- wait_for_element: Wait for an element to appear
- take_screenshot: Capture a screenshot

Each tool uses Chrome DevTools Protocol (CDP) for reliable, production-grade automation.
</capabilities>

<planning_guidelines>
When creating automation plans, follow these critical guidelines:

1. **Use observation tools first**: Always start by using observation tools (get_page_info, find_element) to understand the current page state before taking actions. Never guess about page structure.

2. **Be specific with selectors**: When finding elements:
   - First try to find by visible text content (most reliable for buttons/links)
   - Use aria-labels or data-testid attributes when available
   - Use specific CSS selectors with class names or IDs
   - Avoid generic selectors like "button" or "a"
   - Example: Instead of searching for "button", search for text like "Create repository" or "New"

3. **Break down complex tasks**: Decompose tasks into atomic steps:
   - Navigate to the page
   - Observe and verify page loaded
   - Find target element
   - Interact with element
   - Verify action succeeded

4. **Include wait steps**: Always wait for elements before interacting:
   - Use wait_for_element before click_element or type_text
   - Wait for page transitions to complete
   - Handle dynamic content loading

5. **Add verification steps**: After critical actions, verify they succeeded:
   - After navigation, verify URL changed
   - After form submission, verify success message
   - After clicking, verify new content appeared

6. **Handle failures gracefully**: If a selector doesn't work:
   - Try alternative selectors (text, aria-label, id, class)
   - Use more general selectors if specific ones fail
   - Check if element is in an iframe or shadow DOM

7. **Keep steps focused**: Each step should do ONE thing clearly.

8. **Provide clear reasoning**: Explain why each step is necessary and what it accomplishes.
</planning_guidelines>

<critical_element_finding_strategy>
When finding elements (especially buttons, links, inputs):

1. **Text-based search is most reliable**: Use the visible text that users see
   - For "Create repository" button → search for text "Create repository"
   - For "Sign in" link → search for text "Sign in"
   - Case-insensitive partial matches work well

2. **Multiple selector fallbacks**: Plan with fallback strategies
   - Primary: Text content match
   - Secondary: Aria-label attribute
   - Tertiary: Specific CSS class or ID
   - Final: Generic selector with context

3. **Context matters**: Elements may need context
   - "Submit" button → find in context of specific form
   - "Save" button → may appear in multiple places

Example good element finding approach:
- Step 1: Use find_element with description "button with text 'Create repository'" 
- If fails, Step 2: Use find_element with description "button with aria-label containing 'create' and 'repository'"
- If fails, Step 3: Use find_element with broader description "primary action button in main navigation"
</critical_element_finding_strategy>

<output_format>
You MUST provide your plan as a valid JSON object in this exact format:

{
  "goal": "Clear, specific description of what we're automating",
  "steps": [
    {
      "stepNumber": 1,
      "reasoning": "Detailed explanation of why this step is needed and what it will accomplish",
      "toolName": "exact_tool_name",
      "parameters": {
        "parameter_name": "parameter_value"
      },
      "status": "pending"
    }
  ],
  "confidence": 0.85,
  "estimatedDuration": 30000
}

CRITICAL: Your response must contain this JSON object. The JSON must be valid and parseable.
</output_format>

<best_practices>
- Be explicit and detailed in your reasoning
- Always observe before acting
- Use reliable, text-based element finding
- Include verification steps
- Plan for failures with fallback approaches
- Keep each step atomic and focused
- Never guess about page structure - use observation tools
</best_practices>

Remember: You're automating a real browser. Precision and verification are critical. Users see text on buttons and links - use that text to find elements reliably.`;
  }

  /**
   * Build user prompt for planning
   */
  private buildPlanningUserPrompt(
    _request: AutomationRequest,
    sessionContext: string,
    browserContext: any
  ): string {
    const request = _request;
    let prompt = `I need help automating the following task:\n\n`;
    prompt += `<user_intent>\n${request.userIntent}\n</user_intent>\n\n`;

    if (sessionContext) {
      prompt += `<recorded_session_analysis>\n${sessionContext}\n</recorded_session_analysis>\n\n`;
    }

    if (request.startUrl) {
      prompt += `<start_url>\n${request.startUrl}\n</start_url>\n\n`;
    }

    if (request.expectedOutcome) {
      prompt += `<expected_outcome>\n${request.expectedOutcome}\n</expected_outcome>\n\n`;
    }

    if (request.constraints && request.constraints.length > 0) {
      prompt += `<constraints>\n${request.constraints.join('\n')}\n</constraints>\n\n`;
    }

    prompt += `<current_browser_state>\n`;
    prompt += `URL: ${browserContext.url}\n`;
    prompt += `Title: ${browserContext.title}\n`;
    prompt += `Ready State: ${browserContext.readyState}\n\n`;
    
    // Include pruned DOM for better element visibility
    if (browserContext.prunedDOM && browserContext.prunedDOM.length > 0) {
      prompt += `Visible Interactive Elements on Page:\n`;
      browserContext.prunedDOM.slice(0, 30).forEach((elem: any, idx: number) => {
        prompt += `${idx + 1}. ${elem.role || elem.tag} - "${elem.text || elem.value || '(no text)'}"\n`;
        if (elem.attributes) {
          const attrs = [];
          if (elem.attributes.id) attrs.push(`id="${elem.attributes.id}"`);
          if (elem.attributes.class) attrs.push(`class="${elem.attributes.class}"`);
          if (elem.attributes['aria-label']) attrs.push(`aria-label="${elem.attributes['aria-label']}"`);
          if (elem.attributes.href) attrs.push(`href="${elem.attributes.href}"`);
          if (attrs.length > 0) {
            prompt += `   Attributes: ${attrs.join(', ')}\n`;
          }
        }
        if (elem.selector) {
          prompt += `   CSS Selector: ${elem.selector}\n`;
        }
      });
      prompt += `\n`;
    }
    
    // Include accessible elements if available
    if (browserContext.accessibilityTree && browserContext.accessibilityTree.interactiveElements) {
      const interactiveElements = browserContext.accessibilityTree.interactiveElements.slice(0, 15);
      if (interactiveElements.length > 0) {
        prompt += `\nAccessible Interactive Elements:\n`;
        interactiveElements.forEach((elem: any, idx: number) => {
          prompt += `${idx + 1}. ${elem.role} - "${elem.name || '(unnamed)'}"\n`;
        });
      }
    }
    prompt += `</current_browser_state>\n\n`;

    prompt += `Please generate a detailed execution plan to accomplish this task. Think through the steps carefully, considering the current browser state and any patterns from the recorded session.`;

    return prompt;
  }

  /**
   * Build replan prompt after failure
   */
  private buildReplanPrompt(
    failedStep: ExecutionStep,
    error: string,
    currentContext: any
  ): string {
    let prompt = `The execution failed at step ${failedStep.stepNumber}. I need to replan the remaining steps.\n\n`;
    
    prompt += `<failed_step>\n`;
    prompt += `Step: ${failedStep.stepNumber}\n`;
    prompt += `Tool: ${failedStep.toolName}\n`;
    prompt += `Parameters: ${JSON.stringify(failedStep.parameters, null, 2)}\n`;
    prompt += `Reasoning: ${failedStep.reasoning}\n`;
    prompt += `Error: ${error}\n`;
    prompt += `Retry Count: ${failedStep.retryCount || 0}\n`;
    prompt += `</failed_step>\n\n`;

    prompt += `<execution_history>\n`;
    this.state.executionHistory.forEach(step => {
      prompt += `Step ${step.stepNumber} (${step.status}): ${step.toolName}\n`;
      if (step.error) prompt += `  Error: ${step.error}\n`;
    });
    prompt += `</execution_history>\n\n`;

    prompt += `<current_browser_state>\n`;
    prompt += `URL: ${currentContext.url}\n`;
    prompt += `Title: ${currentContext.title}\n\n`;
    
    // Include visible elements for better understanding
    if (currentContext.prunedDOM && currentContext.prunedDOM.length > 0) {
      prompt += `Visible Elements Currently on Page:\n`;
      currentContext.prunedDOM.slice(0, 25).forEach((elem: any, idx: number) => {
        prompt += `${idx + 1}. ${elem.role || elem.tag} - "${elem.text || elem.value || '(no text)'}"\n`;
        if (elem.selector) {
          prompt += `   Selector: ${elem.selector}\n`;
        }
      });
      prompt += `\n`;
    }
    
    if (currentContext.accessibilityTree && currentContext.accessibilityTree.interactiveElements) {
      const interactiveElements = currentContext.accessibilityTree.interactiveElements.slice(0, 12);
      if (interactiveElements.length > 0) {
        prompt += `Interactive Elements:\n`;
        interactiveElements.forEach((elem: any, idx: number) => {
          prompt += `${idx + 1}. ${elem.role} - "${elem.name || '(unnamed)'}"\n`;
        });
      }
    }
    prompt += `</current_browser_state>\n\n`;

    prompt += `Please analyze why this step failed and generate a new plan for the remaining steps. Consider:
1. Is the selector wrong or has the page structure changed?
2. Do we need to wait longer for elements to appear?
3. Is there an alternative approach to achieve the same goal?
4. Should we verify something before proceeding?

Generate a new execution plan starting from the current state.`;

    return prompt;
  }

  /**
   * Extract execution plan from Claude response
   */
  private extractPlanFromResponse(response: Anthropic.Message): ExecutionPlan {
    // Look for JSON plan in response
    let planJson: any = null;

    for (const block of response.content) {
      if (block.type === 'text') {
        // Try to extract JSON from text
        const jsonMatch = block.text.match(/\{[\s\S]*"steps"[\s\S]*\}/);
        if (jsonMatch) {
          try {
            planJson = JSON.parse(jsonMatch[0]);
            break;
          } catch (e) {
            console.warn('Failed to parse plan JSON:', e);
          }
        }
      }
    }

    if (!planJson || !planJson.steps) {
      // Fallback: extract from tool_use blocks
      const steps: ExecutionStep[] = [];
      let stepNumber = 1;

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          steps.push({
            stepNumber: stepNumber++,
            reasoning: `Execute ${block.name}`,
            toolName: block.name,
            parameters: block.input as Record<string, any>,
            status: 'pending'
          });
        }
      }

      return {
        goal: 'Automation task',
        steps,
        confidence: 0.7
      };
    }

    return {
      goal: planJson.goal || 'Automation task',
      steps: planJson.steps.map((step: any) => ({
        ...step,
        status: step.status || 'pending'
      })),
      confidence: planJson.confidence || 0.8,
      estimatedDuration: planJson.estimatedDuration
    };
  }

  /**
   * Initialize agent state
   */
  private initializeState(): AgentState {
    return {
      currentStep: 0,
      plan: null,
      executionHistory: [],
      errors: [],
      iterationCount: 0,
      isReplanning: false
    };
  }

  /**
   * Check if plan is complete
   */
  private isPlanComplete(): boolean {
    if (!this.state.plan) return false;
    return this.state.currentStep >= this.state.plan.steps.length;
  }

  /**
   * Get current step to execute
   */
  private getCurrentStep(): ExecutionStep | undefined {
    if (!this.state.plan) return undefined;
    if (this.state.currentStep >= this.state.plan.steps.length) return undefined;
    return this.state.plan.steps[this.state.currentStep];
  }

  /**
   * Collect results from successful steps
   */
  private collectResults(): any {
    return {
      completedSteps: this.state.executionHistory.filter(s => s.status === 'success').length,
      totalSteps: this.state.plan?.steps.length || 0,
      results: this.state.executionHistory.map(step => ({
        step: step.stepNumber,
        tool: step.toolName,
        status: step.status,
        result: step.result
      }))
    };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current agent state (for debugging/monitoring)
   */
  public getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Reset agent state
   */
  public reset(): void {
    this.state = this.initializeState();
    this.memoryManager.clear();
  }
}

