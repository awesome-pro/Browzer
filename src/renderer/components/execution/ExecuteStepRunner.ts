import { ExecuteStep } from '../../types';
import { RecoveryStrategies } from './strategies/RecoveryStrategies';
import { StrategyFactory } from './StrategyFactory';
import { ExecutionConfigManager } from './ExecutionConfig';
import { ActionValidator } from './validators/ActionValidator';

export class ExecuteStepRunner {
  private webview: any;
  private readonly config: any;
  private recoveryStrategies: RecoveryStrategies;

  constructor(webview: any) {
    this.webview = webview;
    this.recoveryStrategies = new RecoveryStrategies(webview);
    this.config = ExecutionConfigManager.getInstance().getConfig();
  }

  public async executeStep(step: ExecuteStep): Promise<any> {
    console.log(`[ExecuteStepRunner] Executing step: ${step.action} - ${step.description}`);
    
    if (!this.webview) {
      throw new Error('No webview available for step execution');
    }

    const validation = ActionValidator.validateStep(step);
    if (!validation.valid) {
      throw new Error(`Invalid step: ${validation.errors.join(', ')}`);
    }

    step.startTime = Date.now();
    step.status = 'running';

    try {
      const result = await this.executeActionWithRetry(step);
      
      step.status = 'completed';
      step.endTime = Date.now();
      step.result = result;
      
      console.log(`[ExecuteStepRunner] Step completed: ${step.description}`);
      return result;
    } catch (error) {
      step.status = 'failed';
      step.endTime = Date.now();
      step.error = (error as Error).message;
      
      console.error(`[ExecuteStepRunner] Step failed: ${step.description}`, error);
      throw error;
    }
  }

  private async executeActionWithRetry(step: ExecuteStep): Promise<any> {
    const maxRetries = step.maxRetries || 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[ExecuteStepRunner] Attempt ${attempt}/${maxRetries} for step: ${step.description}`);
        
        const result = await this.executeAction(step);
        
        if (attempt > 1) {
          console.log(`[ExecuteStepRunner] Step succeeded on attempt ${attempt}`);
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        step.retryCount = attempt;
        
        console.warn(`[ExecuteStepRunner] Attempt ${attempt} failed:`, error);
        
        // Try recovery before next retry
        if (await this.recoveryStrategies.attemptRecovery(step, lastError)) {
          console.log(`[ExecuteStepRunner] Recovery successful for ${step.action} on ${step.target}`);
          return { 
            success: true, 
            message: 'Completed via recovery mechanism',
            recoveryUsed: true
          };
        }
        
        if (attempt < maxRetries) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          console.log(`[ExecuteStepRunner] Waiting ${waitTime}ms before retry`);
          await this.wait(waitTime);
        }
      }
    }

    throw new Error(`Step failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
  }

  private async executeAction(step: ExecuteStep): Promise<any> {
    await this.wait(this.config.actionDelay);

    try {
      const strategy = StrategyFactory.createStrategy(step.action);
      return await strategy.execute(step, this.webview);
    } catch (error: any) {
      if (error.message.includes('No strategy found')) {
        throw new Error(`Unsupported action: ${step.action}`);
      }
      throw error;
    }
  }

  private async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}