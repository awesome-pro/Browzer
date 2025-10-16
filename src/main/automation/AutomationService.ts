/**
 * Automation Service - ReAct-based agentic browser automation
 * 
 * Uses Claude Sonnet 4.5 with tool use for iterative automation:
 * - Think → Act → Observe → Reflect loop
 * - Persistent conversation context with prompt caching
 * - Real-time browser state awareness
 * - Intelligent error recovery
 * - Adaptive planning
 */

import { WebContentsView } from 'electron';
import { AgenticAutomationService } from './agentic';
import {
  AutomationPlan,
  AutomationResult,
  AutomationStep,
  LLMAutomationRequest
} from '@/shared/types/automation';

export class AutomationService {
  private agenticService: AgenticAutomationService;
  private isExecuting = false;

  constructor(view: WebContentsView) {
    this.agenticService = new AgenticAutomationService(view);
  }

  /**
   * Execute automation using ReAct-based agentic loop
   */
  public async executeAutomation(
    request: LLMAutomationRequest,
    onProgress?: (step: AutomationStep, index: number, total: number) => void
  ): Promise<AutomationResult> {
    if (this.isExecuting) {
      const emptyPlan = this.createEmptyPlan(request);
      return {
        success: false,
        plan: emptyPlan,
        error: 'Another automation is already running',
        executionTime: 0
      };
    }

    this.isExecuting = true;
    const startTime = Date.now();

    try {
      console.log('[AutomationService] Starting ReAct-based agentic automation');

      const result = await this.agenticService.execute({
        userPrompt: request.userPrompt,
        recordingSession: request.recordingSession,
        apiKey: request.apiKey,
        onProgress: (update) => {
          // Convert agentic progress updates for UI
          if (update.type === 'acting' && update.toolName) {
            const step: AutomationStep = {
              id: `step-${Date.now()}`,
              action: 'navigate', // Use a valid action type
              description: `${update.toolName}: ${update.message}`,
              status: 'running',
              retryCount: 0
            };
            onProgress?.(step, update.iteration, 50);
          }
        }
      });

      // Build plan from agentic result
      const plan: AutomationPlan = {
        id: `plan-agentic-${Date.now()}`,
        steps: [], // Agentic mode generates steps dynamically
        userPrompt: request.userPrompt,
        recordingSessionId: request.recordingSession.id,
        createdAt: startTime,
        status: result.success ? 'completed' : 'failed',
        completedSteps: result.iterations,
        failedSteps: result.success ? 0 : 1
      };

      return {
        success: result.success,
        plan,
        error: result.error,
        executionTime: result.duration
      };

    } catch (error) {
      console.error('[AutomationService] Automation failed:', error);
      return {
        success: false,
        plan: this.createEmptyPlan(request),
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime
      };
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Get current execution status
   */
  public getStatus(): { isExecuting: boolean } {
    return { isExecuting: this.isExecuting };
  }

  /**
   * Cancel current execution
   */
  public cancel(): void {
    if (this.isExecuting) {
      this.agenticService.cancel();
      this.isExecuting = false;
      console.log('[AutomationService] Execution cancelled');
    }
  }

  /**
   * Create empty plan for error cases
   */
  private createEmptyPlan(request: LLMAutomationRequest): AutomationPlan {
    return {
      id: `plan-error-${Date.now()}`,
      steps: [],
      userPrompt: request.userPrompt,
      recordingSessionId: request.recordingSession.id,
      createdAt: Date.now(),
      status: 'failed',
      completedSteps: 0,
      failedSteps: 0
    };
  }
}
