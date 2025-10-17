/**
 * Chat Session Types - Unified type definitions
 * 
 * Single source of truth for chat session types used across:
 * - Main process (ChatSessionService)
 * - Renderer (AgentContext, components)
 * - IPC communication
 */

/**
 * Chat session - represents an AI conversation about automating a recording
 */
export interface ChatSession {
  id: string;
  title: string;
  recordingSessionId: string; // Links to RecordingSession
  userPrompt: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  duration?: number;
  
  // Execution metadata
  iterations: number;
  totalTokens: number;
  totalCost: number;
  
  // Summary
  summary?: string;
  error?: string;
}

/**
 * Chat message - single message in the conversation
 */
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;  // JSON stringified content (for Claude API format)
  timestamp: number;
  
  // Token tracking
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

/**
 * Tool execution - single tool call within a chat session
 */
export interface ToolExecution {
  id: string;
  sessionId: string;
  iteration: number;
  toolName: string;
  input: string;  // JSON stringified
  output?: string;  // JSON stringified
  error?: string;
  success: boolean;
  timestamp: number;
  duration?: number;
}

/**
 * Complete session data - includes all related data
 */
export interface CompleteChatSession {
  session: ChatSession;
  messages: ChatMessage[];
  toolExecutions: ToolExecution[];
}

/**
 * Session statistics
 */
export interface SessionStats {
  totalSessions: number;
  completedSessions: number;
  failedSessions: number;
  totalTokens: number;
  totalCost: number;
}

/**
 * Execution step - UI-friendly representation of tool execution
 * Used in renderer for displaying real-time progress
 */
export interface ExecutionStep {
  type: 'thinking' | 'acting' | 'observing' | 'reflecting' | 'completed' | 'failed';
  message: string;
  iteration: number;
  toolName?: string;
  toolInput?: any;
  toolOutput?: any;
  error?: string;
  timestamp: number;
}

/**
 * Automation progress update - sent from main to renderer via IPC
 */
export interface AutomationProgressUpdate {
  type: ExecutionStep['type'];
  message: string;
  iteration: number;
  toolName?: string;
  toolInput?: any;
  toolOutput?: any;
  error?: string;
}
