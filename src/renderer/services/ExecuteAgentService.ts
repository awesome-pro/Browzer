import { SmartRecordingEngine } from '../components/RecordingEngine';
import { AIPromptGenerator } from '../components/PropmtGenerator';
import { ExecuteResult, ExecuteTask, ExecuteStep } from '../types';
import { SessionSelector } from '../components/SessionSelector';
import { ExecuteStepRunner } from '../components/ExecuteStepRunner';
import { TabManager } from './TabManager';

export class ExecuteAgentService {  
  private tabManager: TabManager;
  private recordingEngine: SmartRecordingEngine;
  private isExecuting = false;
  private currentTask: ExecuteTask | null = null;
  private selectedRecordingSessionId: string | null = null;
  private sessionSelector: SessionSelector | null = null;
  private stepCount = 0;

  constructor(tabManager: TabManager) {
    this.tabManager = tabManager;
    this.recordingEngine = SmartRecordingEngine.getInstance();
    this.sessionSelector = new SessionSelector();
  }


  public async executeTask(instruction: string): Promise<ExecuteResult> {
    if (this.isExecuting) {
      return {
        success: false,
        error: 'Already executing a task',
        executionTime: 0
      };
    }

    this.isExecuting = true;
    const startTime = Date.now();

    try {
      const selectedSessionId = await this.showSessionSelectorAndWaitForSelection();
      
      if (!selectedSessionId) {
        return {
          success: false,
          error: 'No recording session selected',
          executionTime: Date.now() - startTime
        };
      }

      this.selectedRecordingSessionId = selectedSessionId;
      
      this.currentTask = {
        id: `execute-task-${Date.now()}`,
        instruction,
        recordingSessionId: selectedSessionId,
        steps: [],
        status: 'running'
      };

      const result = await this.executeWithSession(instruction, selectedSessionId);
      
      return {
        success: result.success,
        data: result.data,
        error: result.error,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      console.error('[ExecuteAgentService] Task execution failed:', error);
      return {
        success: false,
        error: (error as Error).message,
        executionTime: Date.now() - startTime
      };
    } finally {
      this.isExecuting = false;
      this.currentTask = null;
      this.selectedRecordingSessionId = null;
      this.stepCount = 0;
    }
  }

  public setSelectedSessionId(sessionId: string): void {
    this.selectedRecordingSessionId = sessionId;
    console.log('[ExecuteAgentService] Selected recording session ID:', sessionId);
  }

  private async showSessionSelectorAndWaitForSelection(): Promise<string | null> {
    return await this.sessionSelector!.show();
  }

  private async executeWithSession(instruction: string, sessionId: string): Promise<ExecuteResult> {
    try {
      const session = this.recordingEngine.getSession(sessionId);
      if (!session) {
        throw new Error('Recording session not found');
      }

      this.addMessageToChat('assistant', '<div class="loading">Analyzing recording session and planning execution steps...</div>');

      // const generatedPrompt = AIPromptGenerator.generateTaskPrompt(session);
      
      const systemPrompt = `You are an expert browser automation assistant. You execute tasks by taking single atomic actions.
IMPORTANT: You have access to a recording of a user performing a task. DO NOT ask for clarification about what task to perform. 
Instead, use the recording context below combined with the user's instruction to generate the execution steps.

RECORDING CONTEXT:
The user has recorded a workflow for searching on Google. Here's what they did:
1. Navigated to https://www.google.com
2. Clicked on the textarea#APjFqb
3. Typed a search query "abhinandan pro"
4. Pressed Enter to submit the search
5. Waited for search results to load
6. Clicked on the first search result - a abhinandan.pro
7. Extracted information from the resulting page

When the user gives you an instruction like "Search for Python tutorials", you should use this recorded workflow
and adapt it to the specific search term "Python tutorials" without asking for clarification.

AVAILABLE ACTIONS:
- navigate: Go to a URL
- click: Click an element
- type: Type text into an input
- wait: Wait for milliseconds (value = milliseconds)
- extract: Get comprehensive page data
- select_dropdown: Select option from dropdown (value = option text)
- wait_for_element: Wait for element to appear (value = selector to wait for)
- wait_for_dynamic_content: Wait for dynamic content to load
- clear: Clear an input field
- focus: Focus an element
- hover: Hover over an element
- keypress: Press a key (key = key name)
- check/uncheck: Check or uncheck a checkbox

CRITICAL RULES:
1. ALWAYS verify elements are in viewport before interacting
2. For elements not in viewport, first use "scroll" to bring them into view
3. ALWAYS use "wait" after actions that trigger dynamic changes
4. Use "wait_for_element" when you expect an element to appear after an action
5. Use "wait_for_dynamic_content" for sites with heavy JavaScript before extracting
6. For complex forms, fill fields one by one, don't rush
7. Use "extract" periodically to understand current page state
8. NEVER ask the user for clarification about what task to perform - use the recording context

OUTPUT FORMAT:
You MUST respond with a JSON array of steps in this format:
[
  {
    "action": "navigate|click|type|wait|extract|...",
    "target": "URL or CSS selector",
    "value": "text to type or option to select or milliseconds to wait",
    "reasoning": "explanation of why this specific action is needed now"
  },
  {...}
]

DO NOT include any text before or after the JSON array. Your entire response should be valid JSON.`;
      
      // Cre
      
      // Get the API key for the LLM
      const provider = 'anthropic';
      const apiKey = localStorage.getItem(`${provider}_api_key`);
      
      if (!apiKey) {
        this.clearLoadingMessages();
        this.addMessageToChat('assistant', 'Please configure your API key in the Extensions panel.');
        throw new Error('API key not found');
      }

      // Call the LLM to generate execution steps
      const executionPlanResponse = await this.callLLM(systemPrompt, instruction, apiKey);
      
      // Clear loading message
      this.clearLoadingMessages();
      
      // Parse the execution plan
      const executionSteps = this.parseExecutionPlan(executionPlanResponse);
      
      if (!executionSteps || executionSteps.length === 0) {
        throw new Error('Failed to generate execution steps');
      }

      // Display the execution plan
      this.displayExecutionPlan(executionSteps);
      
      // Execute each step
      const result = await this.executeSteps(executionSteps);
      
      return result;
    } catch (error) {
      console.error('[ExecuteAgentService] Failed to execute with session:', error);
      this.addMessageToChat('assistant', `Error: ${(error as Error).message}`);
      return {
        success: false,
        error: (error as Error).message,
        executionTime: 0
      };
    }
  }

  private async callLLM(systemPrompt: string, userPrompt: string, apiKey: string): Promise<string> {
    try {
      // Call the LLM via IPC to main process
      const response = await window.electronAPI.ipcInvoke('call-llm', {
        provider: 'anthropic',
        apiKey: apiKey,
        systemPrompt: systemPrompt,
        prompt: userPrompt,
        maxTokens: 2000
      });

      if (!response.success) {
        throw new Error(response.error || 'LLM call failed');
      }

      return response.response;
    } catch (error) {
      console.error('[ExecuteAgentService] LLM call failed:', error);
      throw error;
    }
  }

  private parseExecutionPlan(llmResponse: string): ExecuteStep[] {
    try {
      console.log('[ExecuteAgentService] Parsing execution plan from LLM response:', llmResponse);
      
      // Clean up the response - remove any non-JSON text
      const cleanedResponse = llmResponse.trim()
        .replace(/^```json\s*/, '') // Remove leading ```json
        .replace(/```\s*$/, '')     // Remove trailing ```
        .replace(/^[^[]*(\[[\s\S]*\])[^]]*$/, '$1'); // Extract just the JSON array
      
      console.log('[ExecuteAgentService] Cleaned response:', cleanedResponse);
      
      // Try to parse the cleaned response directly
      try {
        const steps = JSON.parse(cleanedResponse);
        console.log('[ExecuteAgentService] Successfully parsed JSON steps:', steps);
        
        // Validate that we have an array of steps
        if (!Array.isArray(steps)) {
          throw new Error('Parsed result is not an array');
        }
        
        // Convert to ExecuteStep format
        return steps.map((step: any, index: number) => {
          // Ensure required fields exist
          if (!step.action) {
            console.warn(`[ExecuteAgentService] Step ${index + 1} missing action:`, step);
            step.action = this.inferActionFromStep(step);
          }
          
          return {
            id: `step-${index + 1}`,
            description: step.description || step.action || `Step ${index + 1}`,
            status: 'pending',
            reasoning: step.reasoning || step.rationale || '',
            action: step.action,
            target: step.target || step.selector || '',
            value: step.value || ''
          };
        });
      } catch (directParseError) {
        console.warn('[ExecuteAgentService] Direct JSON parsing failed:', directParseError);
      }
      
      // If direct parsing fails, try to extract a JSON array pattern
      try {
        const jsonMatch = llmResponse.match(/\[\s*\{[\s\S]*?\}\s*\]/g);
        if (jsonMatch && jsonMatch[0]) {
          const jsonStr = jsonMatch[0];
          console.log('[ExecuteAgentService] Found JSON array pattern:', jsonStr);
          const steps = JSON.parse(jsonStr);
          
          // Convert to ExecuteStep format
          return steps.map((step: any, index: number) => ({
            id: `step-${index + 1}`,
            description: step.description || step.action || `Step ${index + 1}`,
            status: 'pending',
            reasoning: step.reasoning || step.rationale || '',
            action: step.action || '',
            target: step.target || step.selector || '',
            value: step.value || ''
          }));
        }
      } catch (jsonError) {
        console.warn('[ExecuteAgentService] JSON pattern extraction failed:', jsonError);
      }
      
      // Try to extract a JSON array from code blocks
      const stepsMatch = llmResponse.match(/```(?:json)?\n([\s\S]*?)\n```/) || 
                         llmResponse.match(/```([\s\S]*?)```/);
      
      if (stepsMatch) {
        const stepsJson = stepsMatch[1];
        console.log('[ExecuteAgentService] Found JSON in code block:', stepsJson);
        try {
          const steps = JSON.parse(stepsJson);
          
          // Convert to ExecuteStep format
          return steps.map((step: any, index: number) => ({
            id: `step-${index + 1}`,
            description: step.description || step.action || `Step ${index + 1}`,
            status: 'pending',
            reasoning: step.reasoning || step.rationale || '',
            action: step.action || '',
            target: step.target || step.selector || '',
            value: step.value || ''
          }));
        } catch (jsonError) {
          console.warn('[ExecuteAgentService] JSON parsing from code block failed:', jsonError);
        }
      }
      
      // If no JSON found, try to parse numbered steps
      const numberedSteps = llmResponse.match(/\d+\.\s+(.*?)(?=\n\d+\.|\n\n|$)/g);
      if (numberedSteps && numberedSteps.length > 0) {
        console.log('[ExecuteAgentService] Falling back to numbered steps parsing');
        return numberedSteps.map((step, index) => {
          const cleanStep = step.replace(/^\d+\.\s+/, '').trim();
          
          // Try to extract action, target, and value from the step text
          const actionMatch = cleanStep.match(/^(navigate|click|type|wait|extract|select_dropdown|wait_for_element|wait_for_dynamic_content|clear|focus|hover|keypress|check|uncheck)\s+(.*?)(?:\s+with\s+value\s+"(.*?)"|$)/i);
          
          if (actionMatch) {
            const [_, action, target, value] = actionMatch;
            return {
              id: `step-${index + 1}`,
              description: cleanStep,
              status: 'pending',
              reasoning: '',
              action: action.toLowerCase(),
              target: target.trim(),
              value: value || ''
            };
          }
          
          return {
            id: `step-${index + 1}`,
            description: cleanStep,
            status: 'pending',
            reasoning: ''
          };
        });
      }
      
      // If all else fails, create a default Google search workflow with the instruction
      console.log('[ExecuteAgentService] Creating default Google search workflow for:', llmResponse);
      return this.createDefaultGoogleSearchWorkflow(llmResponse);
    } catch (error) {
      console.error('[ExecuteAgentService] Failed to parse execution plan:', error);
      throw new Error('Failed to parse execution plan from LLM response');
    }
  }
  
  private inferActionFromStep(step: any): string {
    if (!step) return 'unknown';
    
    const description = (step.description || '').toLowerCase();
    
    if (description.includes('navigate') || description.includes('go to')) {
      return 'navigate';
    } else if (description.includes('click') || description.includes('select')) {
      return 'click';
    } else if (description.includes('type') || description.includes('enter')) {
      return 'type';
    } else if (description.includes('wait')) {
      return 'wait';
    } else if (description.includes('extract')) {
      return 'extract';
    }
    
    return 'unknown';
  }
  
  private createDefaultGoogleSearchWorkflow(instruction: string): ExecuteStep[] {
    console.log('[ExecuteAgentService] Creating default Google search workflow');
    
    // Extract search term from the instruction
    let searchTerm = instruction;
    if (instruction.toLowerCase().includes('search for ')) {
      searchTerm = instruction.replace(/.*search for ['"]?(.*?)['"]?$/i, '$1');
    }
    
    // Create a default Google search workflow
    return [
      {
        id: 'step-1',
        description: 'Navigate to Google',
        status: 'pending',
        reasoning: 'Starting the search workflow',
        action: 'navigate',
        target: 'https://www.google.com',
        value: ''
      },
      {
        id: 'step-2',
        description: 'Wait for page to load',
        status: 'pending',
        reasoning: 'Ensure the page is fully loaded before interacting',
        action: 'wait',
        target: '',
        value: '2000'
      },
      {
        id: 'step-3',
        description: 'Wait for search box to appear',
        status: 'pending',
        reasoning: 'Ensure the search box is available',
        action: 'wait_for_element',
        target: 'textarea[name="q"]',
        value: ''
      },
      {
        id: 'step-4',
        description: 'Click on the search box',
        status: 'pending',
        reasoning: 'Focus the search box to prepare for typing',
        action: 'click',
        target: 'textarea[name="q"]',
        value: ''
      },
      {
        id: 'step-5',
        description: `Type "${searchTerm}" into the search box`,
        status: 'pending',
        reasoning: 'Enter the search query',
        action: 'type',
        target: 'textarea[name="q"]',
        value: searchTerm
      },
      {
        id: 'step-6',
        description: 'Press Enter to submit the search',
        status: 'pending',
        reasoning: 'Submit the search query',
        action: 'keypress',
        target: 'textarea[name="q"]',
        value: 'Enter'
      },
      {
        id: 'step-7',
        description: 'Wait for search results to load',
        status: 'pending',
        reasoning: 'Give time for the search results to appear',
        action: 'wait_for_dynamic_content',
        target: '',
        value: '3000'
      },
      {
        id: 'step-8',
        description: 'Wait for first search result to appear',
        status: 'pending',
        reasoning: 'Ensure search results are available',
        action: 'wait_for_element',
        target: 'div[data-hveid] a:not([data-jsarwt])',
        value: '10000'
      },
      {
        id: 'step-9',
        description: 'Click on the first search result',
        status: 'pending',
        reasoning: 'Navigate to the first search result',
        action: 'click',
        target: 'div[data-hveid] a:not([data-jsarwt])',
        value: ''
      },
      {
        id: 'step-10',
        description: 'Wait for the page to load',
        status: 'pending',
        reasoning: 'Ensure the result page is fully loaded',
        action: 'wait',
        target: '',
        value: '2000'
      },
      {
        id: 'step-11',
        description: 'Extract page content',
        status: 'pending',
        reasoning: 'Get information from the result page',
        action: 'extract',
        target: '',
        value: ''
      }
    ];
  }

  private displayExecutionPlan(steps: ExecuteStep[]): void {
    // Add the execution plan to the current task
    if (this.currentTask) {
      this.currentTask.steps = steps;
    }
    
    // Display the execution plan in the chat
    let planMessage = `# Execution Plan\n\nI'll execute your task using the recorded workflow as a guide. Here's my plan:\n\n`;
    
    steps.forEach((step, index) => {
      planMessage += `${index + 1}. ${step.description}\n`;
      if (step.reasoning) {
        planMessage += `   *${step.reasoning}*\n`;
      }
    });
    
    planMessage += `\nI'll now start executing these steps one by one.`;
    
    this.addMessageToChat('assistant', planMessage);
  }

  private async executeSteps(steps: ExecuteStep[]): Promise<ExecuteResult> {
    const startTime = Date.now();
    let success = true;
    let finalResult = null;
    
    // Get the active webview
    const webview = this.tabManager.getActiveWebview();
    if (!webview) {
      throw new Error('No active webview found');
    }
    
    // Execute each step
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      // Update step status
      step.status = 'running';
      this.updateStepStatus(i, step);
      
      try {
        // Execute the step
        const stepResult = await this.executeStep(step, webview);
        
        // Update step status
        step.status = 'completed';
        step.result = stepResult;
        this.updateStepStatus(i, step);
        
        // Wait a bit between steps
        await this.wait(1000);
      } catch (error) {
        console.error(`[ExecuteAgentService] Step ${i + 1} failed:`, error);
        
        // Update step status
        step.status = 'failed';
        step.error = (error as Error).message;
        this.updateStepStatus(i, step);
        
        // Mark task as failed
        success = false;
        
        // Wait a bit before continuing
        await this.wait(1000);
      }
    }
    
    // Display final result
    const executionTime = Date.now() - startTime;
    const successCount = steps.filter(step => step.status === 'completed').length;
    const failureCount = steps.filter(step => step.status === 'failed').length;
    
    let resultMessage = '';
    if (success) {
      resultMessage = `✅ **Task completed successfully!**\n\n`;
      resultMessage += `- Executed ${steps.length} steps in ${(executionTime / 1000).toFixed(2)} seconds\n`;
      resultMessage += `- All steps completed successfully\n`;
    } else {
      resultMessage = `⚠️ **Task completed with issues**\n\n`;
      resultMessage += `- Executed ${steps.length} steps in ${(executionTime / 1000).toFixed(2)} seconds\n`;
      resultMessage += `- ${successCount} steps completed successfully\n`;
      resultMessage += `- ${failureCount} steps failed\n`;
    }
    
    this.addMessageToChat('assistant', resultMessage);
    
    return {
      success,
      data: finalResult,
      executionTime
    };
  }

  private async executeStep(step: ExecuteStep, webview: any): Promise<any> {
    try {
      // Create a step runner to execute the step
      const stepRunner = new ExecuteStepRunner(webview);
      
      // Execute the step
      return await stepRunner.executeStep(step);
    } catch (error) {
      console.error(`[ExecuteAgentService] Step execution failed:`, error);
      throw error;
    }
  }

  private updateStepStatus(index: number, step: ExecuteStep): void {
    // Update the step in the current task
    if (this.currentTask && this.currentTask.steps[index]) {
      this.currentTask.steps[index] = step;
    }
    
    // Update the step in the chat
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return;
    
    const lastMessage = chatContainer.querySelector('.chat-message.assistant-message:last-child .message-content');
    if (!lastMessage) return;
    
    const stepElement = lastMessage.querySelector(`#step-${step.id}`);
    if (stepElement) {
      // Update existing step element
      const statusClass = step.status === 'completed' ? 'completed' : 
                         step.status === 'failed' ? 'failed' : 
                         step.status === 'running' ? 'running' : '';
      
      const statusIcon = step.status === 'completed' ? '✅' : 
                        step.status === 'failed' ? '❌' : 
                        step.status === 'running' ? '⏳' : '⭕';
      
      stepElement.className = `execution-step ${statusClass}`;
      stepElement.innerHTML = `
        <span class="step-status">${statusIcon}</span>
        <span class="step-description">${step.description}</span>
        ${step.error ? `<span class="step-error">${step.error}</span>` : ''}
      `;
    } else {
      // Create progress update message
      let progressMessage = `**Step ${index + 1}:** ${step.description}`;
      
      if (step.status === 'completed') {
        progressMessage += ' ✅';
      } else if (step.status === 'failed') {
        progressMessage += ' ❌';
        if (step.error) {
          progressMessage += `\n  Error: ${step.error}`;
        }
      } else if (step.status === 'running') {
        progressMessage += ' ⏳';
      }
      
      // Add to existing message
      lastMessage.innerHTML += `<br/>${progressMessage}`;
    }
  }

  private addMessageToChat(role: string, content: string, timing?: number): void {
    try {
      let chatContainer = document.getElementById('chatContainer');
      
      if (!chatContainer) {
        const agentResults = document.getElementById('agentResults');
        if (!agentResults) {
          return;
        }
        
        const existingWelcome = agentResults.querySelector('.welcome-container');
        if (existingWelcome) {
          existingWelcome.remove();
        } 
        chatContainer = document.createElement('div');
        chatContainer.id = 'chatContainer';
        chatContainer.className = 'chat-container';
        agentResults.appendChild(chatContainer);
      }
      
      if (!content || content.trim() === '') {
        return;
      }
      
      const messageDiv = document.createElement('div');
      
      if (role === 'context') {
        messageDiv.className = 'chat-message context-message';
        messageDiv.innerHTML = `<div class="message-content">${this.markdownToHtml(content)}</div>`;
        messageDiv.dataset.role = 'context';
      } else if (role === 'user') {
        messageDiv.className = 'chat-message user-message';
        messageDiv.innerHTML = `<div class="message-content">${this.markdownToHtml(content)}</div>`;
        messageDiv.dataset.role = 'user';
        messageDiv.dataset.timestamp = new Date().toISOString();
      } else if (role === 'assistant') {
        messageDiv.className = 'chat-message assistant-message';
        messageDiv.dataset.role = 'assistant';
        messageDiv.dataset.timestamp = new Date().toISOString();
        
        const isLoading = content.includes('class="loading"') && !content.replace(/<div class="loading">.*?<\/div>/g, '').trim();
        const processedContent = isLoading ? content : this.markdownToHtml(content);
        
        if (timing && !isLoading) {
          messageDiv.innerHTML = `
            <div class="timing-info">
              <span>Response generated in</span>
              <span class="time-value">${timing.toFixed(2)}s</span>
            </div>
            <div class="message-content">${processedContent}</div>
          `;
          messageDiv.dataset.genTime = timing.toFixed(2);
        } else {
          messageDiv.innerHTML = `<div class="message-content">${processedContent}</div>`;
        }
      }
      
      chatContainer.appendChild(messageDiv);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    } catch (error) {
      console.error('[ExecuteAgentService] Error adding message to chat:', error);
    }
  }

  private markdownToHtml(markdown: string): string {
    // Simple markdown to HTML conversion
    // Replace headers
    let html = markdown
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      // Replace bold
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      // Replace italic
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      // Replace code blocks
      .replace(/```([^`]*?)```/gim, '<pre><code>$1</code></pre>')
      // Replace inline code
      .replace(/`([^`]*?)`/gim, '<code>$1</code>')
      // Replace lists
      .replace(/^\s*\d+\.\s+(.*$)/gim, '<ol><li>$1</li></ol>')
      .replace(/^\s*[\-\*]\s+(.*$)/gim, '<ul><li>$1</li></ul>')
      // Replace paragraphs
      .replace(/^(?!<[hou])\s*([^\n].*)$/gim, '<p>$1</p>');
    
    // Fix nested lists
    html = html.replace(/<\/[ou]l>\s*<[ou]l>/g, '');
    
    return html;
  }

  private clearLoadingMessages(): void {
    const loadingMessages = document.querySelectorAll('.loading');
    Array.from(loadingMessages).forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) {
        parentMessage.remove();
      }
    });
  }
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public destroy(): void {
    try {
      if (this.sessionSelector) {
        // No explicit destroy method needed for SessionSelector
        this.sessionSelector = null;
      }
      this.isExecuting = false;
      this.currentTask = null;
      this.selectedRecordingSessionId = null;
    } catch (error) {
      console.error('[ExecuteAgentService] Error during destruction:', error);
    }
  }
}