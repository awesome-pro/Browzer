import { ExecuteResult, ExecuteStep, ExecuteTask, ActionValidator, ActionType, } from '../types';
import { TabService } from './TabService';
import { SessionSelector } from '../components/SessionSelector';
import { SmartRecordingEngine } from '../components/RecordingEngine';
import { PromptGenerator } from '../components/PromptGenerator';
import { ExecuteStepRunner } from '../components/ExecuteStepRunner';
import { RecordingUtil, Utils } from '../utils';

export class ExecuteAgentService {
  private tabService: TabService;
  private recordingEngine: SmartRecordingEngine;
  private isExecuting = false;
  private currentTask: ExecuteTask | null = null;
  private selectedRecordingSessionId: string | null = null;
  private sessionSelector: SessionSelector | null = null;
  
  private readonly MAX_EXECUTION_TIME = 120000; // Reduced to 2 minutes
  private readonly STEP_TIMEOUT = 30000; // Reduced to 30 seconds
  private readonly MAX_RETRIES_PER_STEP = 2; // Reduced retries

  constructor(tabService: TabService) {
    this.tabService = tabService;
    this.recordingEngine = SmartRecordingEngine.getInstance();
    this.sessionSelector = new SessionSelector();
  }

  public async executeTask(instruction: string): Promise<ExecuteResult> {
    if (this.isExecuting) {
      return {
        success: false,
        error: 'Already executing a task. Please wait for current task to complete.',
        executionTime: 0
      };
    }

    this.isExecuting = true;
    const startTime = Date.now();

    try {
      this.addMessageToChat('assistant', '<div class="loading">Preparing to execute task...</div>');
      
      const selectedSessionId = await this.showSessionSelectorAndWaitForSelection();
      
      if (!selectedSessionId) {
        this.clearLoadingMessages();
        this.addMessageToChat('assistant', 'No recording session selected. Task execution cancelled.');
        return {
          success: false,
          error: 'No recording session selected',
          executionTime: Date.now() - startTime
        };
      }

      const session = this.recordingEngine.getSession(selectedSessionId);
      if (!session) {
        this.clearLoadingMessages();
        this.addMessageToChat('assistant', 'Selected recording session not found. Please try again.');
        return {
          success: false,
          error: 'Recording session not found',
          executionTime: Date.now() - startTime
        };
      }

      this.clearLoadingMessages();
      this.addMessageToChat('user', instruction);

      this.currentTask = {
        id: `execute-task-${Date.now()}`,
        instruction,
        recordingSessionId: selectedSessionId,
        steps: [],
        status: 'running'
      };

      const result = await this.executeWithPrompting(instruction, session);
      
      return {
        success: result.success,
        data: result.data,
        error: result.error,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      console.error('[ExecuteAgentService] Task execution failed:', error);
      this.addMessageToChat('assistant', `Execution failed: ${(error as Error).message}`);
      return {
        success: false,
        error: (error as Error).message,
        executionTime: Date.now() - startTime
      };
    } finally {
      this.isExecuting = false;
      this.currentTask = null;
    }
  }

  public setSelectedSessionId(sessionId: string): void {
    this.selectedRecordingSessionId = sessionId;
    console.log('[ExecuteAgentService] Selected recording session ID:', sessionId);
  }

  private async executeWithPrompting(instruction: string, session: any): Promise<ExecuteResult> {
    try {
      this.addMessageToChat('assistant', this.generateContextAnalysis(instruction, session));

      const systemPrompt = PromptGenerator.generateSystemPrompt(session);
      const userPrompt = PromptGenerator.generateUserPrompt(instruction);

      this.addMessageToChat('assistant', '<div class="loading">🧠 Analyzing recorded workflow and planning execution steps...</div>');

      const apiKey = localStorage.getItem('anthropic_api_key');
      if (!apiKey) {
        this.clearLoadingMessages();
        this.addMessageToChat('assistant', 'Please configure your Anthropic API key in the Extensions panel before proceeding.');
        throw new Error('Anthropic API key not configured');
      }

      const llmResponse = await this.callLLM(systemPrompt, userPrompt, apiKey);
      this.clearLoadingMessages();

      const executionSteps = this.parseAndValidateSteps(llmResponse);
      
      if (!executionSteps || executionSteps.length === 0) {
        this.addMessageToChat('assistant', 'Failed to generate valid execution steps. Please try again with a clearer instruction.');
        throw new Error('No valid execution steps generated');
      }

      this.displayExecutionPlan(executionSteps, session);

      const result = await this.executeStepsWithMonitoring(executionSteps);
      
      return result;
    } catch (error) {
      console.error('[ExecuteAgentService]  execution failed:', error);
      throw error;
    }
  }

  private async callLLM(systemPrompt: string, userPrompt: string, apiKey: string): Promise<string> {
    try {
      console.log('[ExecuteAgentService] Calling Anthropic Claude with  prompt...');
      console.log('[ExecuteAgentService] System prompt length:', systemPrompt.length);
      console.log('[ExecuteAgentService] User prompt length:', userPrompt.length);

      const response = await window.electronAPI.ipcInvoke('call-llm', {
        provider: 'anthropic',
        apiKey: apiKey,
        systemPrompt: systemPrompt,
        prompt: userPrompt,
        maxTokens: 3000, // Increased for more complex responses
        temperature: 0.1, // Lower temperature for more consistent JSON output
      });

      if (!response.success) {
        console.error('[ExecuteAgentService] LLM API error:', response.error);
        throw new Error(response.error || 'LLM API call failed');
      }

      console.log('[ExecuteAgentService] LLM response received, length:', response.response.length);
      console.log('[ExecuteAgentService] Raw LLM response:', response.response);

      return response.response;
    } catch (error) {
      console.error('[ExecuteAgentService] LLM API call failed:', error);
      throw new Error(`AI model call failed: ${(error as Error).message}`);
    }
  }

  private parseAndValidateSteps(llmResponse: string): ExecuteStep[] {
    try {
      console.log('[ExecuteAgentService] Parsing LLM response:', llmResponse);
      const parsedSteps = PromptGenerator.parseAndValidateResponse(llmResponse);
      
      if (!parsedSteps) {
        throw new Error('Failed to parse execution steps from AI response');
      }
      
      if (!Array.isArray(parsedSteps)) {
        throw new Error('AI response is not a valid array of steps');
      }

      const validatedSteps: ExecuteStep[] = [];
      
      for (let i = 0; i < parsedSteps.length; i++) {
        const rawStep = parsedSteps[i];
        const step: ExecuteStep = {
          id: `step-${i + 1}`,
          action: RecordingUtil.normalizeActionType(rawStep.action),
          target: rawStep.target || '',
          value: rawStep.value,
          reasoning: rawStep.reasoning || '',
          status: 'pending',
          maxRetries: this.MAX_RETRIES_PER_STEP,
          retryCount: 0
        };
        const validation = ActionValidator.validateStep(step);
        if (!validation.valid) {
          console.warn(`[ExecuteAgentService] Step ${i + 1} validation failed:`, validation.errors);
          const fixedStep = this.attemptStepFix(step, validation.errors);
          if (ActionValidator.validateStep(fixedStep).valid) {
            validatedSteps.push(fixedStep);
          } else {
            console.error(`[ExecuteAgentService] Could not fix step ${i + 1}, skipping`);
          }
        } else {
          validatedSteps.push(step);
        }
      }

      if (validatedSteps.length === 0) {
        throw new Error('No valid execution steps could be generated');
      }

      console.log(`[ExecuteAgentService] Successfully parsed and validated ${validatedSteps.length} steps`);
      return validatedSteps;
    } catch (error) {
      console.error('[ExecuteAgentService] Step parsing failed:', error);
      throw new Error(`Failed to parse execution steps: ${(error as Error).message}`);
    }
  }

  private attemptStepFix(step: ExecuteStep, errors: string[]): ExecuteStep {
    const fixedStep = { ...step };
    for (const error of errors) {
      if (error.includes('URL is required') && step.action === ActionType.NAVIGATION) {
        if (!fixedStep.target && !fixedStep.value) {
          const urlMatch = step.reasoning?.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          if (urlMatch) {
            fixedStep.target = urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`;
          }
        }
      }

      if (error.includes('Target selector required') && !fixedStep.target) {
        const selectorMatch = step.reasoning?.match(/['"`]([^'"`]+)['"`]/);
        if (selectorMatch) {
          fixedStep.target = selectorMatch[1];
        }
      }

      if (error.includes('value required') && !fixedStep.value) {
        const valueMatch = step.reasoning?.match(/(?:type|enter|select)\s+['"`]([^'"`]+)['"`]/i);
        if (valueMatch) {
          fixedStep.value = valueMatch[1];
        }
      }
    }

    return fixedStep;
  }

  private generateContextAnalysis(instruction: string, session: any): string {
    const analysis = `## Task Analysis

**New Task:** ${instruction}
**Referenced Workflow:** ${session.taskGoal}
**Original Steps:** ${session.actions.length}
**Pages Visited:** ${session.metadata.pagesVisited.length}

### Workflow Pattern
The recorded session shows a **${this.identifyWorkflowPattern(session)}** pattern. I'll adapt this proven workflow to execute your new task while maintaining the same reliable sequence of actions.

### Adaptation Strategy
I'll modify the specific targets, values, and selectors from the recording to match your new requirements while preserving the timing and flow that made the original workflow successful.`;

    return analysis;
  }

  private identifyWorkflowPattern(session: any): string {
    const actions = session.actions.map((a: any) => a.type);
    const hasSearch = session.taskGoal.toLowerCase().includes('search');
    const hasForm = actions.includes('input') && actions.includes('submit');
    const hasNavigation = actions.includes('navigation');
    
    if (hasSearch) return 'search and discovery';
    if (hasForm) return 'form submission';
    if (hasNavigation) return 'multi-page navigation';
    return 'interactive workflow';
  }

  private displayExecutionPlan(steps: ExecuteStep[], session: any): void {
    // Check if the ExecutionSteps component is available
    if (typeof window !== 'undefined' && window.ExecutionSteps) {
      // Create a container for the chat message
      let chatContainer = document.getElementById('chatContainer');
      if (!chatContainer) return;
      
      const messageDiv = document.createElement('div');
      messageDiv.className = 'chat-message assistant-message';
      messageDiv.dataset.role = 'assistant';
      messageDiv.dataset.timestamp = new Date().toISOString();
      
      // Create the execution plan visualization
      const executionPlan = window.ExecutionSteps.createExecutionPlan(steps, session);
      messageDiv.appendChild(executionPlan);
      
      chatContainer.appendChild(messageDiv);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    } else {
      // Fallback to original text-based plan if component not available
      let planMessage = `## Execution Plan

I've analyzed the recorded workflow and generated **${steps.length} execution steps** based on the proven pattern. Here's what I'll do:

### Steps Overview:`;

      steps.forEach((step, index) => {
        planMessage += `\n${index + 1}. ${step.action} - ${step.reasoning}`;
        if (step.reasoning) {
          planMessage += `\n   *${step.reasoning}*`;
        }
      });

      planMessage += `\n\n### Execution Settings
- **Max retries per step:** ${this.MAX_RETRIES_PER_STEP}
- **Step timeout:** ${this.STEP_TIMEOUT / 1000}s
- **Total timeout:** ${this.MAX_EXECUTION_TIME / 1000}s

I'll now begin executing these steps. You'll see real-time progress updates as each step completes.`;

      this.addMessageToChat('assistant', planMessage);
    }
    
    if (this.currentTask) {
      this.currentTask.steps = steps as ExecuteStep[];
    }
  }

  private async executeStepsWithMonitoring(steps: ExecuteStep[]): Promise<ExecuteResult> {
    const startTime = Date.now();
    let successCount = 0;
    let failureCount = 0;
    let finalResult = null;
    const webview = this.tabService.getActiveWebview();
    if (!webview) {
      throw new Error('No active webview found. Please ensure a tab is open.');
    }

    const stepRunner = new ExecuteStepRunner(webview);
    const executionTimeout = setTimeout(() => {
      throw new Error(`Execution timeout after ${this.MAX_EXECUTION_TIME / 1000} seconds`);
    }, this.MAX_EXECUTION_TIME);

    try {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        this.updateStepProgress(i, step, 'running');
        
        try {
          const stepTimeout = setTimeout(() => {
            throw new Error(`Step timeout after ${this.STEP_TIMEOUT / 1000} seconds`);
          }, this.STEP_TIMEOUT);
          const stepResult = await stepRunner.executeStep(step);
          clearTimeout(stepTimeout);
          successCount++;
          this.updateStepProgress(i, step, 'completed', stepResult)
          await this.wait(800);

        } catch (error) {
          failureCount++;
          step.status = 'failed';
          step.error = (error as Error).message;
          
          this.updateStepProgress(i, step, 'failed', null, (error as Error).message);

          if (this.shouldContinueAfterFailure(step, error as Error)) {
            await this.wait(1000);
          } else {
            break;
          }
        }
      }

      clearTimeout(executionTimeout);
      const executionTime = Date.now() - startTime;
      const overallSuccess = failureCount === 0 || (successCount > failureCount);
      
      this.displayExecutionSummary(steps, successCount, failureCount, executionTime, overallSuccess);

      return {
        success: overallSuccess,
        data: finalResult,
        executionTime,
        error: overallSuccess ? undefined : `${failureCount} steps failed out of ${steps.length}`
      };

    } catch (error) {
      clearTimeout(executionTimeout);
      
      this.addMessageToChat('assistant', `❌ **Execution Failed**\n\nError: ${(error as Error).message}`);
      
      return {
        success: false,
        error: (error as Error).message,
        executionTime: Date.now() - startTime
      };
    }
  }

  private shouldContinueAfterFailure(step: ExecuteStep, error: Error): boolean {
    const criticalActions = [
      ActionType.NAVIGATION,
      ActionType.SUBMIT
    ];
    if (criticalActions.includes(step.action)) {
      return false;
    }
    if (error.message.includes('timeout')) {
      return false;
    }
    if (step.action.toString().includes('VERIFY') && error.message.includes('not found')) {
      return true;
    }
    if (error.message.includes('selector') || 
        error.message.includes('Element not found') ||
        error.message.includes('Failed to execute')) {
      console.log('[ExecuteAgentService] Continuing after selector error:', error.message);
      return true;
    }

    return true;
  }

  private updateStepProgress(index: number, step: ExecuteStep, status: string, result?: any, error?: string): void {
    // Check if the ExecutionSteps component is available
    if (typeof window !== 'undefined' && window.ExecutionSteps) {
      // Find the execution plan container
      const chatContainer = document.getElementById('chatContainer');
      if (!chatContainer) return;
      
      const executionPlanContainer = chatContainer.querySelector('.execution-plan');
      if (executionPlanContainer) {
        // Update the step status in the visual component
        window.ExecutionSteps.updateStepStatus(
          executionPlanContainer as HTMLElement,
          step.id,
          status as 'pending' | 'running' | 'completed' | 'failed',
          result,
          error
        );
        return;
      }
    }
    
    // Fallback to original text-based progress if component not available
    const statusIcon = status === 'completed' ? '✅' : 
                      status === 'failed' ? '❌' : 
                      status === 'running' ? '🔄' : '⭕';
    
    let progressMessage = `**Step ${index + 1}:** ${step.reasoning} ${statusIcon}`;
    
    if (status === 'running') {
      progressMessage += '\n  *Executing...*';
    } else if (status === 'completed' && result?.message) {
      progressMessage += `\n  ✓ ${result.message}`;
    } else if (status === 'failed' && error) {
      progressMessage += `\n  ⚠️ ${error}`;
    }

    if (step.startTime && step.endTime) {
      const duration = step.endTime - step.startTime;
      progressMessage += `\n  ⏱️ ${duration}ms`;
    }

    this.addMessageToChat('assistant', progressMessage);
  }

  private displayExecutionSummary(
    steps: ExecuteStep[], 
    successCount: number, 
    failureCount: number, 
    executionTime: number,
    overallSuccess: boolean
  ): void {
    // Check if the ExecutionSteps component is available
    if (typeof window !== 'undefined' && window.ExecutionSteps) {
      // Create a container for the chat message
      let chatContainer = document.getElementById('chatContainer');
      if (!chatContainer) return;
      
      const messageDiv = document.createElement('div');
      messageDiv.className = 'chat-message assistant-message';
      messageDiv.dataset.role = 'assistant';
      messageDiv.dataset.timestamp = new Date().toISOString();
      
      // Create the execution summary visualization
      const executionSummary = window.ExecutionSteps.createExecutionSummary(
        steps, 
        successCount, 
        failureCount, 
        executionTime,
        overallSuccess
      );
      messageDiv.appendChild(executionSummary);
      
      chatContainer.appendChild(messageDiv);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    } else {
      // Fallback to original text-based summary if component not available
      const summary = `## Execution Summary

${overallSuccess ? '🎉 **Task Completed Successfully!**' : '⚠️ **Task Completed with Issues**'}

### Results:
- **Total Steps:** ${steps.length}
- **Successful:** ${successCount} ✅
- **Failed:** ${failureCount} ❌
- **Success Rate:** ${Math.round((successCount / steps.length) * 100)}%
- **Execution Time:** ${(executionTime / 1000).toFixed(2)}s

### Performance Analysis:
${this.generatePerformanceAnalysis(steps, executionTime)}

${failureCount > 0 ? `### Failed Steps:
${steps.filter(s => s.status === 'failed').map((s) => 
  `- **Step ${steps.indexOf(s) + 1}:** ${s.reasoning}\n  Error: ${s.error}`
).join('\n')}` : ''}

The task execution is now complete. ${overallSuccess ? 'All critical steps were successful.' : 'Some steps failed, but the main workflow completed.'}`;

      this.addMessageToChat('assistant', summary);
    }
  }

  private generatePerformanceAnalysis(steps: ExecuteStep[], totalTime: number): string {
    const avgStepTime = totalTime / steps.length;
    const slowSteps = steps.filter(s => 
      s.startTime && s.endTime && (s.endTime - s.startTime) > avgStepTime * 2
    );

    let analysis = `- **Average step time:** ${avgStepTime.toFixed(0)}ms`;
    
    if (slowSteps.length > 0) {
      analysis += `\n- **Slower steps:** ${slowSteps.length} (primarily wait operations)`;
    }

    if (totalTime > 30000) {
      analysis += `\n- **Note:** Extended execution time due to page loading and dynamic content`;
    }

    return analysis;
  }

  private async showSessionSelectorAndWaitForSelection(): Promise<string | null> {
    return await this.sessionSelector!.show();
  }

  private addMessageToChat(role: string, content: string, timing?: number): void {
    try {
      // Use the new ChatMessage component if available
      if (typeof window !== 'undefined' && window.ChatMessage) {
        window.ChatMessage.addMessageToChat(role, content, timing);
        return;
      }
      
      // Fallback to original implementation if ChatMessage is not available
      let chatContainer = document.getElementById('chatContainer');
      
      if (!chatContainer) {
        const agentResults = document.getElementById('agentResults');
        if (!agentResults) return;
        
        const existingWelcome = agentResults.querySelector('.welcome-container');
        if (existingWelcome) existingWelcome.remove();
        
        chatContainer = document.createElement('div');
        chatContainer.id = 'chatContainer';
        chatContainer.className = 'chat-container';
        agentResults.appendChild(chatContainer);
      }
      
      if (!content || content.trim() === '') return;
      
      const messageDiv = document.createElement('div');
      messageDiv.className = `chat-message ${role}-message`;
      messageDiv.dataset.role = role;
      messageDiv.dataset.timestamp = new Date().toISOString();
      
      const isLoading = content.includes('class="loading"');
      const processedContent = isLoading ? content : Utils.markdownToHtml(content);
      
      if (timing && !isLoading) {
        messageDiv.innerHTML = `
          <div class="timing-info">Response generated in ${timing.toFixed(2)}s</div>
          <div class="message-content">${processedContent}</div>
        `;
      } else {
        messageDiv.innerHTML = `<div class="message-content">${processedContent}</div>`;
      }
      
      chatContainer.appendChild(messageDiv);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    } catch (error) {
      console.error('[ExecuteAgentService] Error adding message to chat:', error);
    }
  }

  private clearLoadingMessages(): void {
    // Use the new ChatMessage component if available
    if (typeof window !== 'undefined' && window.ChatMessage) {
      window.ChatMessage.clearLoadingMessages();
      return;
    }
    
    // Fallback to original implementation
    const loadingMessages = document.querySelectorAll('.loading');
    Array.from(loadingMessages).forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) parentMessage.remove();
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public destroy(): void {
    try {
      this.isExecuting = false;
      this.currentTask = null;
      this.sessionSelector = null;
    } catch (error) {
      console.error('[ExecuteAgentService] Error during destruction:', error);
    }
  }
}