import { ActionType, ExecuteStep } from "../../../types";

export class ActionValidator {
    static validateStep(step: ExecuteStep): { valid: boolean; errors: string[] } {
      const errors: string[] = [];
      
      if (!step.action || !Object.values(ActionType).includes(step.action)) {
        errors.push('Invalid or missing action type');
      }
      
      if (!step.description?.trim()) {
        errors.push('Description is required');
      }
      
      // Action-specific validations
      switch (step.action) {
        case ActionType.NAVIGATION:
          if (!step.target && !step.value) {
            errors.push('URL is required for navigate action');
          }
          break;
          
      
        case ActionType.CLICK:
        case ActionType.FOCUS:
        case ActionType.HOVER:
          if (!step.target) errors.push(`Target selector required for ${step.action} action`);
          break;
          
        case ActionType.SELECT:
          if (!step.target) errors.push('Target selector required for select action');
          if (!step.value) errors.push('Option value required for select action');
          break;
          
        case ActionType.WAIT:
          if (!step.value || typeof step.value !== 'number') {
            errors.push('Numeric value (milliseconds) required for wait action');
          }
          break;
          
        case ActionType.WAIT_FOR_ELEMENT:
          if (!step.target) errors.push('Target selector required for wait_for_element action');
          break;
          
        case ActionType.KEYPRESS:
          if (!step.value) errors.push('Key value required for keypress action');
          break;
      }
      
      return {
        valid: errors.length === 0,
        errors
      };
    }
    
    static sanitizeStep(step: Partial<ExecuteStep>): ExecuteStep {
      return {
        id: step.id || `step_${Date.now()}`,
        action: step.action || ActionType.CLICK,
        description: step.description?.trim() || 'Automated action',
        target: step.target?.trim() || '',
        value: step.value,
        reasoning: step.reasoning?.trim() || 'Automated step',
        status: 'pending',
        maxRetries: step.maxRetries || 3,
        retryCount: 0
      };
    }
  }
