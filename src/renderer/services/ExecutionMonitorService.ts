import { ActionType, ExecuteResult, ExecuteStep } from '../types';
import { ExecuteStepRunner } from '../components/execution/ExecuteStepRunner';
import { IExecutionMonitorService, IUIService } from './interfaces';

export class ExecutionMonitorService implements IExecutionMonitorService {
  private readonly MAX_EXECUTION_TIME = 120000;
  private readonly STEP_TIMEOUT = 30000;
  private uiService: IUIService;

  constructor(uiService: IUIService) {
    this.uiService = uiService;
  }

  public async executeStepsWithEnhancedMonitoring(steps: ExecuteStep[], webview: any): Promise<ExecuteResult> {
    const startTime = Date.now();
    let successCount = 0;
    let failureCount = 0;
    let finalResult = null;

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
        
        this.uiService.updateStepProgress(i, step, 'running');
        
        try {
          const stepTimeout = setTimeout(() => {
            throw new Error(`Step timeout after ${this.STEP_TIMEOUT / 1000} seconds`);
          }, this.STEP_TIMEOUT);

          const stepResult = await stepRunner.executeStep(step);
          clearTimeout(stepTimeout);

          successCount++;
          this.uiService.updateStepProgress(i, step, 'completed', stepResult);
          await this.wait(800);

        } catch (error) {
          failureCount++;
          step.status = 'failed';
          step.error = (error as Error).message;
          
          this.uiService.updateStepProgress(i, step, 'failed', null, (error as Error).message);

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
      
      this.uiService.displayExecutionSummary(steps, successCount, failureCount, executionTime, overallSuccess);

      return {
        success: overallSuccess,
        data: finalResult,
        executionTime,
        error: overallSuccess ? undefined : `${failureCount} steps failed out of ${steps.length}`
      };

    } catch (error) {
      clearTimeout(executionTimeout);
      
      this.uiService.addMessageToChat('assistant', `❌ **Execution Failed**\n\nError: ${(error as Error).message}`);
      
      return {
        success: false,
        error: (error as Error).message,
        executionTime: Date.now() - startTime
      };
    }
  }

  public shouldContinueAfterFailure(step: ExecuteStep, error: Error): boolean {
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

    return true;
  }

  public generatePerformanceAnalysis(steps: ExecuteStep[], totalTime: number): string {
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

  public wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
