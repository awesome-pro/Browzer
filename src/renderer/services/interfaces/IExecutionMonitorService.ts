import { ExecuteResult, ExecuteStep } from '../../types';

/**
 * Interface for ExecutionMonitor service
 * Handles monitoring and executing steps
 */
export interface IExecutionMonitorService {
  /**
   * Execute steps with enhanced monitoring
   * @param steps - The steps to execute
   * @param webview - The webview to execute steps in
   * @returns Promise resolving to execution result
   */
  executeStepsWithEnhancedMonitoring(steps: ExecuteStep[], webview: any): Promise<ExecuteResult>;
  
  /**
   * Determine if execution should continue after a step failure
   * @param step - The failed step
   * @param error - The error that occurred
   * @returns Boolean indicating whether to continue
   */
  shouldContinueAfterFailure(step: ExecuteStep, error: Error): boolean;
  
  /**
   * Generate performance analysis for execution
   * @param steps - The executed steps
   * @param totalTime - The total execution time
   * @returns Formatted performance analysis string
   */
  generatePerformanceAnalysis(steps: ExecuteStep[], totalTime: number): string;
  
  /**
   * Wait for a specified time
   * @param ms - Time to wait in milliseconds
   * @returns Promise that resolves after the wait
   */
  wait(ms: number): Promise<void>;
}
