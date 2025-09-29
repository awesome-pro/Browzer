import { IpcRenderer } from '../types';
import WorkflowProgressIndicator from '../components/WorkflowProgress';
import { getExtensionDisplayName } from '../utils';

/**
 * WorkflowService handles all workflow-related functionality including
 * progress tracking, execution, and completion handling
 */
export class WorkflowService {
  private ipcRenderer: IpcRenderer;
  private isWorkflowExecuting = false;
  private workflowProgressSetup = false;
  private displayAgentResultsCallCount = 0;
  private displayAgentResultsCalls: Array<{callNumber: number, timestamp: number, stackTrace: string, data: any}> = [];
  private executionFlow: Array<{timestamp: number, function: string, details: any}> = [];

  constructor(ipcRenderer: IpcRenderer) {
    this.ipcRenderer = ipcRenderer;
  }

  public initialize(): void {
    if (!this.workflowProgressSetup) {
      this.setupWorkflowEventListeners();
    }
  }

  public isExecuting(): boolean {
    return this.isWorkflowExecuting;
  }

  public setExecuting(executing: boolean): void {
    this.isWorkflowExecuting = executing;
    console.log(`[WorkflowService] Execution flag set to: ${executing}`);
  }

  public setupWorkflowEventListeners(): void {
    console.log('[WorkflowService] Setting up workflow event listeners...');
    
    if (!window.electronAPI) {
      console.error('[WorkflowService] electronAPI not available, cannot setup workflow listeners');
      return;
    }
    
    console.log('🚨 [CONTEXT ISOLATION] Using secure electronAPI for workflow listeners');
    window.electronAPI.onWorkflowProgress((data: any) => {
      console.log('[WorkflowProgress] workflow-progress event received:', data);
      if (data.type === 'workflow_start') {
        console.log('[WorkflowProgress] workflow-start event received:', data);
        const workflowData = {
          workflowId: data.workflow_id || `workflow-${Date.now()}`,
          type: data.type || 'workflow',
          steps: (data.steps || []).map((step: any) => ({
            extensionId: step.extension_id,
            extensionName: step.extension_name
          }))
        };
        
        console.log('[WorkflowProgress] Creating new workflow progress in chat:', workflowData);
        this.addWorkflowProgressToChat(workflowData);
        
      } else if (data.type === 'step_start') {
        console.log('📡 [IPC DEBUG] step_start event received:', data);
        const workflowMessage = this.findWorkflowProgressInChat(data.workflow_id);
        if (workflowMessage && (workflowMessage as any).progressIndicator) {
          console.log('[WorkflowProgress] Updating progress for step start:', {
            workflowId: data.workflow_id,
            currentStep: data.current_step,
            stepStatus: 'running'
          });
          (workflowMessage as any).progressIndicator.updateProgress({
            workflowId: data.workflow_id,
            currentStep: data.current_step,
            stepStatus: 'running'
          });
        } else {
          console.warn('[WorkflowProgress] Workflow progress message not found for step-start:', data.workflow_id);
        }
        
      } else if (data.type === 'step_complete') {
        console.log('📡 [IPC DEBUG] step_complete event received:', data);
        const workflowMessage = this.findWorkflowProgressInChat(data.workflow_id);
        if (workflowMessage && (workflowMessage as any).progressIndicator) {
          console.log('[WorkflowProgress] Calling updateProgress with:', {
            workflowId: data.workflow_id,
            currentStep: data.current_step,
            stepStatus: data.step_status,
            stepResult: data.step_result,
            stepError: data.step_error
          });
          (workflowMessage as any).progressIndicator.updateProgress({
            workflowId: data.workflow_id,
            currentStep: data.current_step,
            stepStatus: data.step_status,
            stepResult: data.step_result,
            stepError: data.step_error
          });
        } else {
          console.warn('[WorkflowProgress] Workflow progress message not found for step-complete:', data.workflow_id);
        }
      } 
    });

    window.electronAPI.onWorkflowComplete((data: any) => {
      console.log('📡 [IPC DEBUG] workflow-complete event received:', data);
      console.log('📡 [IPC DEBUG] workflow-complete data keys:', Object.keys(data));
      console.log('📡 [IPC DEBUG] workflow-complete data.result keys:', data.result ? Object.keys(data.result) : 'no result');
      console.log('📡 [IPC DEBUG] workflow-complete has consolidated_summary:', !!(data.result && data.result.consolidated_summary));
      const workflowId = data.workflow_id;
      const currentTime = Date.now();
      const workflowCompleteKey = `workflowComplete_${workflowId}`;
      const lastCompleteTime = parseInt(localStorage.getItem(workflowCompleteKey) || '0');
      
      if (currentTime - lastCompleteTime < 2000) {
        console.log('🚨 [DUPLICATE FIX] Same workflow completed recently, skipping duplicate processing:', workflowId);
        return;
      }
      localStorage.setItem(workflowCompleteKey, currentTime.toString());
      
      this.logExecutionFlow('workflow-complete-event', { workflowId: data.workflow_id, hasResult: !!data.result });
      this.isWorkflowExecuting = false;
      console.log('[WorkflowProgress] Clearing execution flag on workflow completion');
      const workflowMessage = this.findWorkflowProgressInChat(data.workflow_id);
      if (workflowMessage && (workflowMessage as any).progressIndicator) {
        (workflowMessage as any).progressIndicator.completeWorkflow({
          workflowId: data.workflow_id,
          result: data.result
        });
      } else {
        console.warn('[WorkflowProgress] Workflow progress message not found for completion:', data.workflow_id);
      }
      if (data.result) {
        console.log('🎯 [WORKFLOW-COMPLETE] About to call displayAgentResults from workflow-complete event');
        let resultData = data.result;
        if (data.result.type === 'workflow' && data.result.data) {
          console.log('🎯 [WORKFLOW-COMPLETE] Extracting inner data from workflow result');
          resultData = data.result.data;
        }
        const displayResultsEvent = new CustomEvent('workflow:displayResults', {
          detail: { data: resultData, workflowId: data.workflow_id }
        });
        window.dispatchEvent(displayResultsEvent);
        
        console.log('🎯 [WORKFLOW-COMPLETE] displayAgentResults event dispatched successfully');
      } else {
        console.warn('[WorkflowProgress] No result data found in workflow-complete event');
      }
    });

    window.electronAPI.onWorkflowError((data: any) => {
      console.log('📡 [IPC DEBUG] workflow-error event received:', data);
      this.isWorkflowExecuting = false;
      console.log('[WorkflowProgress] Clearing execution flag on workflow error');
      const workflowMessage = this.findWorkflowProgressInChat(data.workflow_id || 'unknown');
      if (workflowMessage && (workflowMessage as any).progressIndicator) {
        (workflowMessage as any).progressIndicator.handleWorkflowError({
          workflowId: data.workflow_id || 'unknown',
          error: data.error
        });
      } else {
        console.warn('[WorkflowProgress] Workflow progress message not found for error:', data.workflow_id);
        const errorEvent = new CustomEvent('workflow:error', {
          detail: { error: data.error, workflowId: data.workflow_id }
        });
        window.dispatchEvent(errorEvent);
      }
    });

    console.log('[WorkflowService] Workflow progress system initialized');
    this.workflowProgressSetup = true; // Mark as set up to prevent duplicates
  }

  private logExecutionFlow(functionName: string, details: any = {}): void {
    const entry = {
      timestamp: Date.now(),
      function: functionName,
      details
    };
    this.executionFlow.push(entry);
    console.log(`🔄 [FLOW] ${functionName}:`, details);

    if (this.executionFlow.length > 50) {
      this.executionFlow.splice(0, this.executionFlow.length - 50);
    }
  }

  private findWorkflowProgressInChat(workflowId: string): HTMLElement | null {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return null;

    const workflowMessages = chatContainer.querySelectorAll(`[data-workflow-id="${workflowId}"]`);
    return workflowMessages.length > 0 ? workflowMessages[0] as HTMLElement : null;
  }

  public addWorkflowProgressToChat(workflowData: any): HTMLElement {
    let chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) {
      console.log('[WorkflowService] Chat container not found, creating one');
      
      const agentResults = document.getElementById('agentResults');
      if (!agentResults) {
        console.error('[WorkflowService] agentResults container not found');
        return document.createElement('div');
      }
      const existingWelcome = agentResults.querySelector('.welcome-container');
      if (existingWelcome) {
        existingWelcome.remove();
      }
      chatContainer = document.createElement('div');
      chatContainer.id = 'chatContainer';
      chatContainer.className = 'chat-container';
      agentResults.appendChild(chatContainer);
      
      console.log('[WorkflowService] Chat container created successfully');
    }

    console.log('[WorkflowService] Creating workflow progress for:', workflowData);
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message workflow-progress-message';
    messageDiv.dataset.role = 'workflow-progress';
    messageDiv.dataset.workflowId = workflowData.workflowId;
    messageDiv.dataset.timestamp = new Date().toISOString();
    const progressContainer = document.createElement('div');
    progressContainer.className = 'workflow-progress-container';
    
    messageDiv.appendChild(progressContainer);
    chatContainer.appendChild(messageDiv);
    const progressIndicator = new WorkflowProgressIndicator(progressContainer);
    progressIndicator.startWorkflow(workflowData);
    (messageDiv as any).progressIndicator = progressIndicator;
    chatContainer.scrollTop = chatContainer.scrollHeight;

    console.log('[WorkflowService] Workflow progress message added to chat');
    return messageDiv;
  }

  public async executeWorkflow(query: string, data: any): Promise<void> {
    if (this.isWorkflowExecuting) {
      console.log('[WorkflowService] Workflow already executing, skipping');
      throw new Error('Workflow already in progress');
    }

    this.setExecuting(true);

    try {
      await this.ipcRenderer.invoke('execute-workflow', {
        query,
        data
      });
      
    } catch (workflowError) {
      console.error('[WorkflowService] Workflow execution failed:', workflowError);
      this.setExecuting(false);
      throw workflowError;
    }
  }

  public createSingleExtensionProgress(extensionId: string, extensionName: string): any {
    const singleExtensionWorkflowData = {
      workflowId: `single-${Date.now()}`,
      type: 'single_extension',
      steps: [{
        extensionId: extensionId,
        extensionName: extensionName || getExtensionDisplayName(extensionId)
      }]
    };
    
    console.log('[WorkflowService] Creating progress indicator for single extension:', singleExtensionWorkflowData);
    const progressElement = this.addWorkflowProgressToChat(singleExtensionWorkflowData);
    if (progressElement && (progressElement as any).progressIndicator) {
      (progressElement as any).progressIndicator.startWorkflow(singleExtensionWorkflowData);
      (progressElement as any).progressIndicator.updateProgress({
        workflowId: singleExtensionWorkflowData.workflowId,
        currentStep: 0,
        stepStatus: 'running'
      });
    }
    
    return {
      progressElement,
      workflowData: singleExtensionWorkflowData
    };
  }

  public getExecutionFlow(): Array<{timestamp: number, function: string, details: any}> {
    return [...this.executionFlow];
  }

  public getDisplayAgentResultsCalls(): Array<{callNumber: number, timestamp: number, stackTrace: string, data: any}> {
    return [...this.displayAgentResultsCalls];
  }

  public trackDisplayAgentResultsCall(data: any): void {
    this.displayAgentResultsCallCount++;
    const callInfo = {
      callNumber: this.displayAgentResultsCallCount,
      timestamp: Date.now(),
      stackTrace: new Error().stack || 'No stack trace available',
      data: data
    };
    this.displayAgentResultsCalls.push(callInfo);
    const recentCalls = this.displayAgentResultsCalls.filter(call => 
      callInfo.timestamp - call.timestamp < 5000 && call.callNumber !== callInfo.callNumber
    );
    
    if (recentCalls.length > 0) {
      console.warn(`🚨 [DUPLICATE DEBUG] POTENTIAL DUPLICATE DETECTED! Recent calls within 5 seconds:`);
      recentCalls.forEach(call => {
        console.warn(`🚨 [DUPLICATE DEBUG] Call #${call.callNumber} at ${new Date(call.timestamp).toISOString()}`);
        console.warn(`🚨 [DUPLICATE DEBUG] Previous data:`, {
          hasConsolidatedSummary: !!(call.data && call.data.consolidated_summary),
          hasSummaries: !!(call.data && call.data.summaries),
          dataKeys: call.data ? Object.keys(call.data) : 'null'
        });
      });
    }
  }

  public destroy(): void {
    try {
      this.isWorkflowExecuting = false;
      this.workflowProgressSetup = false;
      this.displayAgentResultsCalls = [];
      this.executionFlow = [];
      console.log('[WorkflowService] Destroyed successfully');
    } catch (error) {
      console.error('[WorkflowService] Error during destruction:', error);
    }
  }
}
