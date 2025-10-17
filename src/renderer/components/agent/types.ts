/**
 * Shared types for Agent components
 */

export interface ChatSession {
  id: string;
  title: string;
  recordingSessionId: string;
  userPrompt: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  duration?: number;
  iterations: number;
  totalTokens: number;
  totalCost: number;
  summary?: string;
  error?: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: any;
  timestamp: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

export interface ToolExecution {
  id: string;
  sessionId: string;
  iteration: number;
  toolName: string;
  input: any;
  output?: any;
  error?: string;
  success: boolean;
  timestamp: number;
  duration?: number;
}

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

export interface SessionStats {
  totalSessions: number;
  completedSessions: number;
  failedSessions: number;
  totalTokens: number;
  totalCost: number;
}
