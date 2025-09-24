import { ExecuteStep } from '../../types';

/**
 * Interface for StepParser service
 * Handles parsing and validating execution steps from LLM responses
 */
export interface IStepParserService {
  /**
   * Parse and validate execution steps from LLM response
   * @param llmResponse - The raw response from the LLM
   * @returns Array of validated ExecuteStep objects
   */
  parseAndValidateSteps(llmResponse: string): ExecuteStep[];
  
  /**
   * Extract JSON from LLM response text
   * @param response - The raw response text
   * @returns Cleaned JSON string
   */
  extractJSONFromResponse(response: string): string;
  
  /**
   * Normalize action type string to ActionType enum
   * @param action - The action string to normalize
   * @returns Normalized ActionType
   */
  normalizeActionType(action: string): any; // Using 'any' here as ActionType is imported from elsewhere
  
  /**
   * Attempt to fix invalid steps
   * @param step - The step to fix
   * @param errors - Array of validation error messages
   * @returns Fixed ExecuteStep
   */
  attemptStepFix(step: ExecuteStep, errors: string[]): ExecuteStep;
}
