import { ExecuteResult, ExecuteTask } from '../types';
import { TabService } from './TabService';
import { SmartRecordingEngine } from '../components/RecordingEngine';
import { AnthropicPromptGenerator } from '../components/PropmtGenerator';

import { 
  IStepParserService, 
  IUIService, 
  IExecutionMonitorService, 
  ISessionSelectorService 
} from './interfaces';

import { 
  LLMService, 
  StepParserService, 
  UIService, 
  ExecutionMonitorService, 
  SessionSelectorService 
} from './index';

export class ExecuteAgentService {
  private tabService: TabService;
  private recordingEngine: SmartRecordingEngine;
  private isExecuting = false;
  private currentTask: ExecuteTask | null = null;

  private llmService: LLMService;
  private stepParserService: IStepParserService;
  private uiService: IUIService;
  private executionMonitorService: IExecutionMonitorService;
  private sessionSelectorService: ISessionSelectorService;


  constructor(tabService: TabService) {
    this.tabService = tabService;
    this.recordingEngine = SmartRecordingEngine.getInstance();
    
    this.llmService = new LLMService();
    this.stepParserService = new StepParserService();
    this.uiService = new UIService();
    this.executionMonitorService = new ExecutionMonitorService(this.uiService);
    this.sessionSelectorService = new SessionSelectorService();
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
      this.uiService.addMessageToChat('assistant', '<div class="loading">Preparing to execute task...</div>');
      
      const selectedSessionId = await this.sessionSelectorService.show();
      
      if (!selectedSessionId) {
        this.uiService.clearLoadingMessages();
        this.uiService.addMessageToChat('assistant', 'No recording session selected. Task execution cancelled.');
        return {
          success: false,
          error: 'No recording session selected',
          executionTime: Date.now() - startTime
        };
      }

      const session = this.recordingEngine.getSession(selectedSessionId);
      if (!session) {
        this.uiService.clearLoadingMessages();
        this.uiService.addMessageToChat('assistant', 'Selected recording session not found. Please try again.');
        return {
          success: false,
          error: 'Recording session not found',
          executionTime: Date.now() - startTime
        };
      }

      this.uiService.clearLoadingMessages();
      this.uiService.addMessageToChat('user', instruction);

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
      console.error('[ExecuteAgentService] Task execution failed:', error);
      this.uiService.addMessageToChat('assistant', `Execution failed: ${(error as Error).message}`);
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
    this.sessionSelectorService.setSelectedSessionId(sessionId);
  }

  private async executeWithEnhancedPrompting(instruction: string, session: any): Promise<ExecuteResult> {
    try {
      const contextAnalysis = this.uiService.generateContextAnalysis(instruction, session);
      this.uiService.addMessageToChat('assistant', contextAnalysis);

      const systemPrompt = AnthropicPromptGenerator.generateClaudeSystemPrompt(session);
      const userPrompt = AnthropicPromptGenerator.generateClaudeUserPrompt(instruction, session);

      this.uiService.addMessageToChat('assistant', '<div class="loading">🧠 Analyzing recorded workflow and planning execution steps...</div>');

      const apiKey = localStorage.getItem('anthropic_api_key');
      if (!apiKey) {
        this.uiService.clearLoadingMessages();
        this.uiService.addMessageToChat('assistant', 'Please configure your Anthropic API key in the Extensions panel before proceeding.');
        throw new Error('Anthropic API key not configured');
      }

      const llmResponse = await this.llmService.callLLM(systemPrompt, userPrompt, apiKey);
      this.uiService.clearLoadingMessages();

      const executionSteps = this.stepParserService.parseAndValidateSteps(llmResponse);
      
      if (!executionSteps || executionSteps.length === 0) {
        this.uiService.addMessageToChat('assistant', 'Failed to generate valid execution steps. Please try again with a clearer instruction.');
        throw new Error('No valid execution steps generated');
      }

      this.uiService.displayExecutionPlan(executionSteps, session);

      if (this.currentTask) {
        this.currentTask.steps = executionSteps;
      }

      const webview = this.tabService.getActiveWebview();
      const result = await this.executionMonitorService.executeStepsWithEnhancedMonitoring(executionSteps, webview);
      
      return result;
    } catch (error) {
      console.error('[ExecuteAgentService] Enhanced execution failed:', error);
      throw error;
    }
  }

  
  public destroy(): void {
    try {
      this.isExecuting = false;
      this.currentTask = null;
    } catch (error) {
      console.error('[ExecuteAgentService] Error during destruction:', error);
    }
  }
}