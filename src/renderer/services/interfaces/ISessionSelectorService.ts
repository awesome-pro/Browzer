/**
 * Interface for SessionSelector service
 * Handles selection of recording sessions
 */
export interface ISessionSelectorService {
  /**
   * Show the session selector and wait for user selection
   * @returns Promise resolving to selected session ID or null
   */
  show(): Promise<string | null>;
  
  /**
   * Set the selected session ID
   * @param sessionId - The ID of the selected session
   */
  setSelectedSessionId(sessionId: string): void;
}
