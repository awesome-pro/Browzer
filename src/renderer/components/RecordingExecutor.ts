/**
 * RecordingExecutor.ts
 * 
 * This class handles converting recording sessions to a format that can be used by DoAgent
 * to understand and execute similar tasks with variations.
 */

import { SmartRecordingSession, SemanticAction, ActionType } from '../../shared/types/recording';
import { DoAgentService, DoStep, DoTask } from '../services/DoAgent';

// Interface for the context provided to DoAgent
export interface RecordingContext {
  taskDescription: string;
  recordedSteps: RecordedStep[];
  metadata: {
    recordingDuration: number;
    totalEvents: number;
    url: string;
    browser: string;
    recordedAt: string;
  };
}

// Interface for a recorded step in a simplified format for the agent
export interface RecordedStep {
  stepNumber: number;
  action: string;
  target?: string;
  selector?: string;
  value?: string;
  url?: string;
  timestamp: number;
}

export class RecordingExecutor {
  /**
   * Convert a recording session to a context format that can be used by DoAgent
   */
  public static convertSessionToContext(session: SmartRecordingSession, taskDescription?: string): RecordingContext {
    // Filter out relevant events (clicks, inputs, navigation)
    const relevantEvents = session.actions.filter(event => {
      return [
        ActionType.CLICK, 
        ActionType.TEXT_INPUT, 
        ActionType.NAVIGATION, 
        ActionType.FORM_SUBMIT, 
        ActionType.SCROLL
      ].includes(event.type);
    });

    // Convert events to simplified steps
    const steps: RecordedStep[] = relevantEvents.map((event, index) => {
      return this.convertEventToStep(event, index + 1);
    });

    return {
      taskDescription: taskDescription || session.taskGoal,
      recordedSteps: steps,
      metadata: {
        recordingDuration: session.metadata.duration,
        totalEvents: session.metadata.totalActions,
        url: session.initialContext.url,
        browser: session.initialContext.userAgent || 'Unknown',
        recordedAt: new Date(session.startTime).toISOString()
      }
    };
  }

  /**
   * Convert a recording event to a simplified step
   */
  private static convertEventToStep(event: SemanticAction, stepNumber: number): RecordedStep {
    const step: RecordedStep = {
      stepNumber,
      action: this.mapEventTypeToAction(event.type),
      timestamp: event.timestamp
    };

    // Add URL from context if available
    if (event.context?.url) {
      step.url = event.context.url;
    }

    // Add specific properties based on event type
    switch (event.type) {
      case ActionType.CLICK:
        if (event.target) {
          step.selector = event.target.selector;
          step.target = event.target.description || 'element';
        }
        break;

      case ActionType.TEXT_INPUT:
        if (event.target) {
          step.selector = event.target.selector;
          step.target = event.target.description || 'input';
        }
        if (event.value) {
          step.value = typeof event.value === 'string' 
            ? event.value 
            : JSON.stringify(event.value);
        }
        break;

      case ActionType.NAVIGATION:
      case ActionType.SCROLL:
        if (event.context?.url) {
          step.target = event.context.url;
        }
        break;

      case ActionType.FORM_SUBMIT:
        if (event.target) {
          step.selector = event.target.selector;
          step.target = 'form';
        }
        break;
    }

    return step;
  }

  /**
   * Map EventType to a more readable action name for the agent
   */
  private static mapEventTypeToAction(eventType: ActionType): string {
    switch (eventType) {
      case ActionType.CLICK: return 'click';
      case ActionType.TEXT_INPUT: return 'type';
      case ActionType.NAVIGATION: return 'navigate';
      case ActionType.SCROLL: return 'load_page';
      case ActionType.FORM_SUBMIT: return 'submit_form';
      default: return eventType.toLowerCase();
    }
  }

  /**
   * Generate a prompt for the DoAgent based on the recording context
   */
  public static generateAgentPrompt(context: RecordingContext, userInstruction: string): string {
    // Create a prompt that explains the recorded steps and the new task
    let prompt = `I want you to perform a task similar to one I've recorded previously. Here's what I recorded:\n\n`;
    
    // Add task description
    prompt += `RECORDED TASK: "${context.taskDescription}"\n\n`;
    
    // Add recorded steps in a clear format
    prompt += `RECORDED STEPS:\n`;
    context.recordedSteps.forEach(step => {
      prompt += `${step.stepNumber}. `;
      
      switch (step.action) {
        case 'click':
          prompt += `Clicked on ${step.target || 'element'}`;
          if (step.selector) prompt += ` with selector "${step.selector}"`;
          break;
          
        case 'type':
          prompt += `Typed "${step.value || ''}" into ${step.target || 'input'}`;
          if (step.selector) prompt += ` with selector "${step.selector}"`;
          break;
          
        case 'navigate':
        case 'load_page':
          prompt += `Navigated to ${step.target || step.url || 'page'}`;
          break;
          
        case 'submit_form':
          prompt += `Submitted a form`;
          if (step.selector) prompt += ` with selector "${step.selector}"`;
          break;
          
        default:
          prompt += `${step.action} ${step.target || ''}`;
      }
      
      prompt += `\n`;
    });
    
    // Add the new task instruction
    prompt += `\nNOW, I want you to: ${userInstruction}\n\n`;
    prompt += `Please follow a similar approach to the recorded task, but adapt it to this new instruction.`;
    
    return prompt;
  }

  /**
   * Execute a task based on a recording session and user instruction
   */
  public static async executeTask(
    session: SmartRecordingSession, 
    userInstruction: string, 
    webview: any,
    onProgress?: (message: string) => void
  ): Promise<any> {
    try {
      if (onProgress) {
        onProgress('Converting recording session to agent context...');
      }
      
      // Convert session to context
      const context = this.convertSessionToContext(session, session.taskGoal);
      
      // Generate prompt
      const prompt = this.generateAgentPrompt(context, userInstruction);
      
      if (onProgress) {
        onProgress('Starting task execution based on recording...');
      }
      
      // Create DoAgent instance with progress callback
      const doAgent = new DoAgentService(webview, (task: DoTask, step: DoStep) => {
        if (onProgress) {
          let message = `Step ${step.id}: ${step.description}`;
          if (step.status === 'completed') message += ' ✅';
          else if (step.status === 'failed') message += ' ❌';
          onProgress(message);
        }
      });
      
      // Execute task with the prompt
      const result = await doAgent.executeTask(prompt);
      
      return result;
    } catch (error) {
      console.error('RecordingExecutor: Failed to execute task:', error);
      throw error;
    }
  }
}