/**
 * ExecutionSteps Component
 * Provides a modern UI for displaying execution steps and their status
 */
import './ExecutionSteps.css';
import { ExecuteStep } from '../types';

export class ExecutionSteps {
  /**
   * Creates an execution plan visualization
   */
  public static createExecutionPlan(steps: ExecuteStep[], session: any): HTMLElement {
    const container = document.createElement('div');
    container.className = 'execution-plan';
    
    // Create header
    const header = document.createElement('div');
    header.className = 'execution-plan-header';
    header.innerHTML = `
      <div class="execution-plan-title">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
          <path d="M9 14h.01"></path>
          <path d="M13 18.5v.5"></path>
          <path d="M16 12h.01"></path>
          <path d="M13 12h.01"></path>
          <path d="M9 18h.01"></path>
        </svg>
        Execution Plan
      </div>
      <p class="execution-plan-subtitle">
        ${steps.length} steps based on the recorded workflow pattern
      </p>
    `;
    container.appendChild(header);
    
    // Create content
    const content = document.createElement('div');
    content.className = 'execution-plan-content';
    
    // Create progress bar
    const progress = document.createElement('div');
    progress.className = 'execution-progress';
    progress.innerHTML = `
      <div class="progress-bar-container">
        <div class="progress-bar" style="width: 0%"></div>
      </div>
      <div class="progress-text">0/${steps.length} steps</div>
    `;
    content.appendChild(progress);
    
    // Create steps container
    const stepsContainer = document.createElement('div');
    stepsContainer.className = 'execution-steps';
    
    // Add each step
    steps.forEach((step, index) => {
      const stepElement = this.createStepElement(step, index);
      stepsContainer.appendChild(stepElement);
    });
    
    content.appendChild(stepsContainer);
    container.appendChild(content);
    
    return container;
  }
  
  /**
   * Creates a single step element
   */
  private static createStepElement(step: ExecuteStep, index: number): HTMLElement {
    const stepElement = document.createElement('div');
    stepElement.className = 'execution-step pending';
    stepElement.dataset.stepId = step.id;
    
    stepElement.innerHTML = `
      <div class="step-indicator">
        <div class="step-number">${index + 1}</div>
        <div class="step-status">
          <div class="status-icon pending">⏳</div>
        </div>
      </div>
      <div class="step-content">
        <div class="step-title">${this.capitalizeFirstLetter(step.action.toString())}</div>
        <div class="step-description">${step.reasoning || 'No description provided'}</div>
        <div class="step-details" style="display: none;"></div>
      </div>
    `;
    
    return stepElement;
  }
  
  /**
   * Updates the status of a step
   */
  public static updateStepStatus(
    container: HTMLElement, 
    stepId: string, 
    status: 'pending' | 'running' | 'completed' | 'failed',
    result?: any,
    error?: string
  ): void {
    const stepElement = container.querySelector(`[data-step-id="${stepId}"]`);
    if (!stepElement) return;
    
    // Update step class
    stepElement.className = `execution-step ${status}`;
    
    // Update status icon
    const statusIcon = stepElement.querySelector('.status-icon');
    if (statusIcon) {
      statusIcon.className = `status-icon ${status}`;
      
      if (status === 'running') {
        statusIcon.innerHTML = `<div class="spinner"></div>`;
      } else if (status === 'completed') {
        statusIcon.innerHTML = `✅`;
      } else if (status === 'failed') {
        statusIcon.innerHTML = `❌`;
      } else {
        statusIcon.innerHTML = `⏳`;
      }
    }
    
    // Update step details if provided
    const stepDetails = stepElement.querySelector('.step-details');
    if (stepDetails) {
      if ((result && result.message) || error) {
        let detailsContent = '';
        
        if (result && result.message) {
          detailsContent += `<div class="step-result">${result.message}</div>`;
        }
        
        if (error) {
          detailsContent += `<div class="step-error">${error}</div>`;
        }
        
        stepDetails.innerHTML = detailsContent;
        (stepDetails as HTMLElement).style.display = 'block';
      }
    }
    
    // Update progress bar
    this.updateProgressBar(container);
  }
  
  /**
   * Updates the progress bar based on completed steps
   */
  private static updateProgressBar(container: HTMLElement): void {
    const steps = container.querySelectorAll('.execution-step');
    const completedSteps = container.querySelectorAll('.execution-step.completed').length;
    const failedSteps = container.querySelectorAll('.execution-step.failed').length;
    const totalSteps = steps.length;
    const finishedSteps = completedSteps + failedSteps;
    
    const progressBar = container.querySelector('.progress-bar') as HTMLElement;
    const progressText = container.querySelector('.progress-text');
    
    if (progressBar) {
      const progressPercentage = (finishedSteps / totalSteps) * 100;
      (progressBar as HTMLElement).style.width = `${progressPercentage}%`;
    }
    
    if (progressText) {
      progressText.textContent = `${finishedSteps}/${totalSteps} steps`;
    }
  }
  
  /**
   * Creates an execution summary
   */
  public static createExecutionSummary(
    steps: ExecuteStep[], 
    successCount: number, 
    failureCount: number, 
    executionTime: number,
    overallSuccess: boolean
  ): HTMLElement {
    const container = document.createElement('div');
    container.className = 'execution-summary';
    
    // Determine status
    let status = 'success';
    let statusText = 'Task Completed Successfully!';
    let statusIcon = '✅';
    
    if (failureCount > 0 && overallSuccess) {
      status = 'partial';
      statusText = 'Task Completed with Some Issues';
      statusIcon = '⚠️';
    } else if (!overallSuccess) {
      status = 'failed';
      statusText = 'Task Failed';
      statusIcon = '❌';
    }
    
    // Create header
    const header = document.createElement('div');
    header.className = 'execution-summary-header';
    header.innerHTML = `
      <div class="summary-icon ${status}">${statusIcon}</div>
      <div class="summary-title">
        <h3 class="${status}">${statusText}</h3>
        <p>Execution completed in ${(executionTime / 1000).toFixed(2)}s</p>
      </div>
    `;
    container.appendChild(header);
    
    // Create content
    const content = document.createElement('div');
    content.className = 'execution-summary-content';
    
    // Add stats
    content.innerHTML += `
      <div class="summary-stats">
        <div class="stat-item">
          <div class="stat-value">${steps.length}</div>
          <div class="stat-label">Total Steps</div>
        </div>
        <div class="stat-item">
          <div class="stat-value success">${successCount}</div>
          <div class="stat-label">Successful</div>
        </div>
        <div class="stat-item">
          <div class="stat-value failed">${failureCount}</div>
          <div class="stat-label">Failed</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${Math.round((successCount / steps.length) * 100)}%</div>
          <div class="stat-label">Success Rate</div>
        </div>
      </div>
    `;
    
    // Add failed steps if any
    const failedSteps = steps.filter(s => s.status === 'failed');
    if (failedSteps.length > 0) {
      let failedStepsHtml = `
        <div class="summary-section">
          <div class="summary-section-title">Failed Steps</div>
          <div class="failed-steps">
      `;
      
      failedSteps.forEach((step, index) => {
        failedStepsHtml += `
          <div class="failed-step">
            <div class="failed-step-title">Step ${steps.indexOf(step) + 1}: ${this.capitalizeFirstLetter(step.action.toString())}</div>
            <div class="failed-step-error">${step.error || 'Unknown error'}</div>
          </div>
        `;
      });
      
      failedStepsHtml += `
          </div>
        </div>
      `;
      
      content.innerHTML += failedStepsHtml;
    }
    
    container.appendChild(content);
    return container;
  }
  
  /**
   * Helper to capitalize first letter
   */
  private static capitalizeFirstLetter(string: string): string {
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
  }
}

// Add to global window object for access from other modules
declare global {
  interface Window {
    ExecutionSteps: typeof ExecutionSteps;
  }
}

if (typeof window !== 'undefined') {
  window.ExecutionSteps = ExecutionSteps;
}

export default ExecutionSteps;
