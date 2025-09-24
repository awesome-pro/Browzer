/**
 * Interface for UI service
 * Handles UI interactions like displaying messages in chat
 */
export interface IUIService {
  /**
   * Add a message to the chat UI
   * @param role - The role of the message sender (e.g., 'user', 'assistant')
   * @param content - The content of the message
   * @param timing - Optional timing information in seconds
   */
  addMessageToChat(role: string, content: string, timing?: number): void;
  
  /**
   * Clear loading messages from the UI
   */
  clearLoadingMessages(): void;
  
  /**
   * Convert markdown text to HTML
   * @param markdown - The markdown text to convert
   * @returns HTML string
   */
  markdownToHtml(markdown: string): string;
  
  /**
   * Generate and display context analysis
   * @param instruction - The user instruction
   * @param session - The recording session data
   * @returns Formatted analysis string
   */
  generateContextAnalysis(instruction: string, session: any): string;
  
  /**
   * Display execution plan in the UI
   * @param steps - The execution steps
   * @param session - The recording session data
   */
  displayExecutionPlan(steps: any[], session: any): void;
  
  /**
   * Update step progress in the UI
   * @param index - The step index
   * @param step - The step object
   * @param status - The step status
   * @param result - Optional step result
   * @param error - Optional error message
   */
  updateStepProgress(index: number, step: any, status: string, result?: any, error?: string): void;
  
  /**
   * Display execution summary in the UI
   * @param steps - The execution steps
   * @param successCount - Number of successful steps
   * @param failureCount - Number of failed steps
   * @param executionTime - Total execution time
   * @param overallSuccess - Whether the execution was overall successful
   */
  displayExecutionSummary(
    steps: any[], 
    successCount: number, 
    failureCount: number, 
    executionTime: number,
    overallSuccess: boolean
  ): void;
}
