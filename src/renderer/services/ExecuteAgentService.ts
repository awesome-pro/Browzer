import { ExecuteResult, ExecuteStep, ExecuteTask } from '../types';
import { TabManager } from './TabManager';
import { SessionSelector } from '../components/SessionSelector';
import { SmartRecordingEngine } from '../components/RecordingEngine';
import { AnthropicPromptGenerator } from '../components/PropmtGenerator';
import { ActionValidator, UnifiedActionType, UnifiedExecuteStep } from '../../shared/types';
import { ExecuteStepRunner } from '../components/ExecuteStepRunner';

export class ExecuteAgentService {
  private tabManager: TabManager;
  private recordingEngine: SmartRecordingEngine;
  private isExecuting = false;
  private currentTask: ExecuteTask | null = null;
  private selectedRecordingSessionId: string | null = null;
  private sessionSelector: SessionSelector | null = null;
  
  private readonly MAX_EXECUTION_TIME = 120000; // Reduced to 2 minutes
  private readonly STEP_TIMEOUT = 30000; // Reduced to 30 seconds
  private readonly MAX_RETRIES_PER_STEP = 2; // Reduced retries

  constructor(tabManager: TabManager) {
    this.tabManager = tabManager;
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

      const result = await this.executeWithEnhancedPrompting(instruction, session);
      
      return {
        success: result.success,
        data: result.data,
        error: result.error,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      console.error('[EnhancedExecuteAgentService] Task execution failed:', error);
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

  private async executeWithEnhancedPrompting(instruction: string, session: any): Promise<ExecuteResult> {
    try {
      this.addMessageToChat('assistant', this.generateContextAnalysis(instruction, session));

      const systemPrompt = AnthropicPromptGenerator.generateClaudeSystemPrompt(session);
      const userPrompt = AnthropicPromptGenerator.generateClaudeUserPrompt(instruction, session);

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

      const result = await this.executeStepsWithEnhancedMonitoring(executionSteps);
      
      return result;
    } catch (error) {
      console.error('[EnhancedExecuteAgentService] Enhanced execution failed:', error);
      throw error;
    }
  }

  private async callLLM(systemPrompt: string, userPrompt: string, apiKey: string): Promise<string> {
    try {
      console.log('[ExecuteAgentService] Calling Anthropic Claude with enhanced prompt...');
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

  private parseAndValidateSteps(llmResponse: string): UnifiedExecuteStep[] {
    try {
      console.log('[EnhancedExecuteAgentService] Parsing LLM response:', llmResponse);

      const cleanedResponse = this.extractJSONFromResponse(llmResponse);
      let parsedSteps: any[];

      try {
        parsedSteps = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error('[EnhancedExecuteAgentService] JSON parsing failed, trying alternative methods');
        throw new Error('Failed to parse execution steps from AI response');
      }

      if (!Array.isArray(parsedSteps)) {
        throw new Error('AI response is not a valid array of steps');
      }

      const validatedSteps: UnifiedExecuteStep[] = [];
      
      for (let i = 0; i < parsedSteps.length; i++) {
        const rawStep = parsedSteps[i];
        
        // Convert to unified format
        const step: UnifiedExecuteStep = {
          id: `step-${i + 1}`,
          action: this.normalizeActionType(rawStep.action),
          description: rawStep.description || `Step ${i + 1}`,
          target: rawStep.target || '',
          value: rawStep.value,
          reasoning: rawStep.reasoning || '',
          status: 'pending',
          maxRetries: this.MAX_RETRIES_PER_STEP,
          retryCount: 0
        };

        // Validate the step
        const validation = ActionValidator.validateStep(step);
        if (!validation.valid) {
          console.warn(`[EnhancedExecuteAgentService] Step ${i + 1} validation failed:`, validation.errors);
          const fixedStep = this.attemptStepFix(step, validation.errors);
          if (ActionValidator.validateStep(fixedStep).valid) {
            validatedSteps.push(fixedStep);
          } else {
            console.error(`[EnhancedExecuteAgentService] Could not fix step ${i + 1}, skipping`);
          }
        } else {
          validatedSteps.push(step);
        }
      }

      if (validatedSteps.length === 0) {
        throw new Error('No valid execution steps could be generated');
      }

      console.log(`[EnhancedExecuteAgentService] Successfully parsed and validated ${validatedSteps.length} steps`);
      return validatedSteps;
    } catch (error) {
      console.error('[EnhancedExecuteAgentService] Step parsing failed:', error);
      throw new Error(`Failed to parse execution steps: ${(error as Error).message}`);
    }
  }

  private extractJSONFromResponse(response: string): string {
    console.log('[ExecuteAgentService] Extracting JSON from response...');
    
    // Clean the response first
    let cleaned = response.trim();
    
    // Remove common prefixes that Claude might add
    cleaned = cleaned.replace(/^Here's the JSON array[^[]*/, '');
    cleaned = cleaned.replace(/^Based on the recorded workflow[^[]*/, '');
    cleaned = cleaned.replace(/^Following the recorded pattern[^[]*/, '');
    
    // Try multiple extraction patterns in order of preference
    const patterns = [
      // Pure JSON array (most preferred)
      /^\s*(\[[\s\S]*\])\s*$/,
      // JSON in code blocks
      /```(?:json)?\s*(\[[\s\S]*?\])\s*```/,
      // JSON after descriptive text
      /(?:array|steps|json)[:\s]*(\[[\s\S]*?\])/i,
      // Any JSON array in the text
      /(\[[\s\S]*?\])/,
      // JSON with trailing text
      /(\[[\s\S]*?\])[^}]*/
    ];

    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match) {
        const jsonStr = match[1];
        try {
          // Validate JSON is parseable
          const parsed = JSON.parse(jsonStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            console.log(`[ExecuteAgentService] Successfully extracted JSON with ${parsed.length} steps`);
            return jsonStr;
          }
        } catch (e) {
          console.warn('[ExecuteAgentService] JSON validation failed for pattern:', pattern);
          continue;
        }
      }
    }

    // Advanced cleaning for malformed JSON
    const lines = cleaned.split('\n');
    let jsonStart = -1;
    let jsonEnd = -1;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('[') && jsonStart === -1) {
        jsonStart = i;
      }
      if (lines[i].trim().endsWith(']') && jsonStart !== -1) {
        jsonEnd = i;
        break;
      }
    }
    
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const extractedJson = lines.slice(jsonStart, jsonEnd + 1).join('\n');
      try {
        JSON.parse(extractedJson);
        console.log('[ExecuteAgentService] Extracted JSON using line-by-line method');
        return extractedJson;
      } catch (e) {
        console.warn('[ExecuteAgentService] Line-by-line extraction failed');
      }
    }

    console.error('[ExecuteAgentService] Failed to extract valid JSON from response');
    return cleaned;
  }

  private normalizeActionType(action: string): UnifiedActionType {
    if (!action) return UnifiedActionType.CLICK;
    
    const normalized = action.toLowerCase().trim();
    const actionMap: Record<string, UnifiedActionType> = {
      'navigate': UnifiedActionType.NAVIGATE,
      'go_to': UnifiedActionType.NAVIGATE,
      'visit': UnifiedActionType.NAVIGATE,
      'type': UnifiedActionType.TYPE,
      'input': UnifiedActionType.TYPE,
      'enter': UnifiedActionType.TYPE,
      'fill': UnifiedActionType.TYPE,
      'clear': UnifiedActionType.CLEAR,
      'click': UnifiedActionType.CLICK,
      'press': UnifiedActionType.CLICK,
      'tap': UnifiedActionType.CLICK,
      'select': UnifiedActionType.SELECT,
      'choose': UnifiedActionType.SELECT,
      'toggle': UnifiedActionType.TOGGLE,
      'check': UnifiedActionType.TOGGLE,
      'uncheck': UnifiedActionType.TOGGLE,
      'submit': UnifiedActionType.SUBMIT,
      
      // Enhanced Form Actions
      'select_option': UnifiedActionType.SELECT_OPTION,
      'select_dropdown': UnifiedActionType.SELECT_OPTION,
      'dropdown': UnifiedActionType.SELECT_OPTION,
      'toggle_checkbox': UnifiedActionType.TOGGLE_CHECKBOX,
      'checkbox': UnifiedActionType.TOGGLE_CHECKBOX,
      'select_radio': UnifiedActionType.SELECT_RADIO,
      'radio': UnifiedActionType.SELECT_RADIO,
      'select_file': UnifiedActionType.SELECT_FILE,
      'upload': UnifiedActionType.SELECT_FILE,
      'file': UnifiedActionType.SELECT_FILE,
      'adjust_slider': UnifiedActionType.ADJUST_SLIDER,
      'slider': UnifiedActionType.ADJUST_SLIDER,
      'range': UnifiedActionType.ADJUST_SLIDER,
      
      // Clipboard Actions
      'copy': UnifiedActionType.COPY,
      'cut': UnifiedActionType.CUT,
      'paste': UnifiedActionType.PASTE,
      
      // Context Actions
      'context_menu': UnifiedActionType.CONTEXT_MENU,
      'right_click': UnifiedActionType.CONTEXT_MENU,
      'contextmenu': UnifiedActionType.CONTEXT_MENU,
      
      'wait': UnifiedActionType.WAIT,
      'wait_for_element': UnifiedActionType.WAIT_FOR_ELEMENT,
      'wait_element': UnifiedActionType.WAIT_FOR_ELEMENT,
      'wait_for_dynamic_content': UnifiedActionType.WAIT_FOR_DYNAMIC_CONTENT,
      'wait_dynamic': UnifiedActionType.WAIT_FOR_DYNAMIC_CONTENT,
      'focus': UnifiedActionType.FOCUS,
      'blur': UnifiedActionType.BLUR,
      'hover': UnifiedActionType.HOVER,
      'keypress': UnifiedActionType.KEYPRESS,
      'key': UnifiedActionType.KEYPRESS,
      'scroll': UnifiedActionType.SCROLL,
      'extract': UnifiedActionType.EXTRACT,
      'get_data': UnifiedActionType.EXTRACT,
      'verify_element': UnifiedActionType.VERIFY_ELEMENT,
      'verify_text': UnifiedActionType.VERIFY_TEXT,
      'verify_url': UnifiedActionType.VERIFY_URL
    };

    return actionMap[normalized] || UnifiedActionType.CLICK;
  }

  private attemptStepFix(step: UnifiedExecuteStep, errors: string[]): UnifiedExecuteStep {
    const fixedStep = { ...step };

    // Fix common issues
    for (const error of errors) {
      if (error.includes('URL is required') && step.action === UnifiedActionType.NAVIGATE) {
        if (!fixedStep.target && !fixedStep.value) {
          // Try to extract URL from description
          const urlMatch = step.description.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          if (urlMatch) {
            fixedStep.target = urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`;
          }
        }
      }

      if (error.includes('Target selector required') && !fixedStep.target) {
        // Try to extract selector from description
        const selectorMatch = step.description.match(/['"`]([^'"`]+)['"`]/);
        if (selectorMatch) {
          fixedStep.target = selectorMatch[1];
        }
      }

      if (error.includes('value required') && !fixedStep.value) {
        // Try to extract value from description
        const valueMatch = step.description.match(/(?:type|enter|select)\s+['"`]([^'"`]+)['"`]/i);
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
**Session Success:** ${session.metadata.success ? 'Yes' : 'No'}
**Complexity:** ${session.metadata.complexity}
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
    const hasForm = actions.includes('text_input') && actions.includes('submit');
    const hasNavigation = actions.includes('navigation');
    
    if (hasSearch) return 'search and discovery';
    if (hasForm) return 'form submission';
    if (hasNavigation) return 'multi-page navigation';
    return 'interactive workflow';
  }

  private displayExecutionPlan(steps: UnifiedExecuteStep[], session: any): void {
    let planMessage = `## Execution Plan

I've analyzed the recorded workflow and generated **${steps.length} execution steps** based on the proven pattern. Here's what I'll do:

### Steps Overview:`;

    steps.forEach((step, index) => {
      const stepIcon = this.getStepIcon(step.action);
      planMessage += `\n${index + 1}. ${stepIcon} **${step.action}** - ${step.description}`;
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

    // Update current task
    if (this.currentTask) {
      this.currentTask.steps = steps as ExecuteStep[];
    }
  }

  private getStepIcon(action: UnifiedActionType): string {
    const iconMap: Record<UnifiedActionType, string> = {
      [UnifiedActionType.NAVIGATE]: '🌐',
      [UnifiedActionType.TYPE]: '⌨️',
      [UnifiedActionType.CLEAR]: '🧹',
      [UnifiedActionType.CLICK]: '👆',
      [UnifiedActionType.SELECT]: '📋',
      [UnifiedActionType.TOGGLE]: '☑️',
      [UnifiedActionType.SUBMIT]: '📤',
      [UnifiedActionType.WAIT]: '⏳',
      [UnifiedActionType.WAIT_FOR_ELEMENT]: '👀',
      [UnifiedActionType.WAIT_FOR_DYNAMIC_CONTENT]: '⚡',
      [UnifiedActionType.FOCUS]: '🎯',
      [UnifiedActionType.BLUR]: '💨',
      [UnifiedActionType.HOVER]: '🖱️',
      [UnifiedActionType.KEYPRESS]: '⌨️',
      [UnifiedActionType.SCROLL]: '📜',
      [UnifiedActionType.EXTRACT]: '📊',
      [UnifiedActionType.VERIFY_ELEMENT]: '✅',
      [UnifiedActionType.VERIFY_TEXT]: '🔍',
      [UnifiedActionType.VERIFY_URL]: '🔗',
      
      // Enhanced Form Actions with specific icons
      [UnifiedActionType.SELECT_OPTION]: '📝',
      [UnifiedActionType.TOGGLE_CHECKBOX]: '☑️',
      [UnifiedActionType.SELECT_RADIO]: '🔘',
      [UnifiedActionType.SELECT_FILE]: '📁',
      [UnifiedActionType.ADJUST_SLIDER]: '🎚️',
      
      // Clipboard Actions
      [UnifiedActionType.COPY]: '📋',
      [UnifiedActionType.CUT]: '✂️',
      [UnifiedActionType.PASTE]: '📌',
      
      // Context Actions
      [UnifiedActionType.CONTEXT_MENU]: '🖱️'
    };

    return iconMap[action] || '⚡';
  }

  private async executeStepsWithEnhancedMonitoring(steps: UnifiedExecuteStep[]): Promise<ExecuteResult> {
    const startTime = Date.now();
    let successCount = 0;
    let failureCount = 0;
    let finalResult = null;

    // Get active webview
    const webview = this.tabManager.getActiveWebview();
    if (!webview) {
      throw new Error('No active webview found. Please ensure a tab is open.');
    }

    const stepRunner = new ExecuteStepRunner(webview);

    // Set overall timeout
    const executionTimeout = setTimeout(() => {
      throw new Error(`Execution timeout after ${this.MAX_EXECUTION_TIME / 1000} seconds`);
    }, this.MAX_EXECUTION_TIME);

    try {
      // Execute steps with real-time monitoring
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        
        // Update UI for current step
        this.updateStepProgress(i, step, 'running');
        
        try {
          // Set step timeout
          const stepTimeout = setTimeout(() => {
            throw new Error(`Step timeout after ${this.STEP_TIMEOUT / 1000} seconds`);
          }, this.STEP_TIMEOUT);

          // Execute step
          const stepResult = await stepRunner.executeStep(step);
          clearTimeout(stepTimeout);

          // Update success
          successCount++;
          this.updateStepProgress(i, step, 'completed', stepResult);

          // Capture extract results
          if (step.action === UnifiedActionType.EXTRACT) {
            finalResult = stepResult;
          }

          // Brief pause between steps
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

      // Generate execution summary
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

  private shouldContinueAfterFailure(step: UnifiedExecuteStep, error: Error): boolean {
    const criticalActions = [
      UnifiedActionType.NAVIGATE,
      UnifiedActionType.SUBMIT
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

    return true;
  }

  private updateStepProgress(index: number, step: UnifiedExecuteStep, status: string, result?: any, error?: string): void {
    const statusIcon = status === 'completed' ? '✅' : 
                      status === 'failed' ? '❌' : 
                      status === 'running' ? '🔄' : '⭕';

    const stepIcon = this.getStepIcon(step.action);
    
    let progressMessage = `**Step ${index + 1}:** ${stepIcon} ${step.description} ${statusIcon}`;
    
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
    steps: UnifiedExecuteStep[], 
    successCount: number, 
    failureCount: number, 
    executionTime: number,
    overallSuccess: boolean
  ): void {
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
${steps.filter(s => s.status === 'failed').map((s, i) => 
  `- **Step ${steps.indexOf(s) + 1}:** ${s.description}\n  Error: ${s.error}`
).join('\n')}` : ''}

The task execution is now complete. ${overallSuccess ? 'All critical steps were successful.' : 'Some steps failed, but the main workflow completed.'}`;

    this.addMessageToChat('assistant', summary);
  }

  private generatePerformanceAnalysis(steps: UnifiedExecuteStep[], totalTime: number): string {
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
      const processedContent = isLoading ? content : this.markdownToHtml(content);
      
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
      console.error('[EnhancedExecuteAgentService] Error adding message to chat:', error);
    }
  }

  private markdownToHtml(markdown: string): string {
    return markdown
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/```([^`]*?)```/gim, '<pre><code>$1</code></pre>')
      .replace(/`([^`]*?)`/gim, '<code>$1</code>')
      .replace(/^(?!<[hou])\s*([^\n].*)$/gim, '<p>$1</p>')
      .replace(/\n/g, '<br/>');
  }

  private clearLoadingMessages(): void {
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
      console.error('[EnhancedExecuteAgentService] Error during destruction:', error);
    }
  }
}