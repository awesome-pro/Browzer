/**
 * AgentContext - Simplified global state management
 * 
 * Single source of truth using shared types.
 * State persists across tab switches and sidebar toggles.
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { toast } from 'sonner';
import {
  ChatSession,
  ChatMessage,
  ToolExecution,
  ExecutionStep,
  AutomationProgressUpdate
} from '@/shared/types';

interface AgentContextValue {
  // Sessions
  sessions: ChatSession[];
  selectedSession: ChatSession | null;
  loadSessions: () => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  exportSession: (sessionId: string) => Promise<void>;
  
  // Current session data
  messages: ChatMessage[];
  toolExecutions: ToolExecution[];
  executionSteps: ExecutionStep[];
  
  // Execution state
  isExecuting: boolean;
  startAutomation: (userPrompt: string, recordingSessionId: string) => Promise<void>;
  cancelAutomation: () => Promise<void>;
  
  // Pending recording ID (for new chats)
  pendingRecordingId: string | null;
  setPendingRecordingId: (id: string | null) => void;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  // Session state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  
  // Current session data
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([]);
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
  
  // Execution state
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  // Pending recording ID (for new chats before session is created)
  const [pendingRecordingId, setPendingRecordingId] = useState<string | null>(null);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  // Listen for real-time automation progress
  useEffect(() => {
    const unsubscribe = window.browserAPI.onAutomationProgress((data: { step: any; index: number; total: number }) => {
      console.log('🔄 Progress update:', data);
      
      const { step, index } = data;
      const metadata = step.metadata || {};
      
      // Convert AutomationStep to ExecutionStep
      const executionStep: ExecutionStep = {
        type: (metadata.type as ExecutionStep['type']) || 'acting',
        message: step.description,
        iteration: index,
        toolName: metadata.toolName as string | undefined,
        toolInput: metadata.toolInput,
        toolOutput: metadata.toolOutput,
        error: metadata.error as string | undefined || step.error,
        timestamp: Date.now()
      };
      
      setExecutionSteps(prev => [...prev, executionStep]);
      
      // Handle completion/failure
      if (step.status === 'completed' || step.status === 'failed') {
        setIsExecuting(false);
        
        // Reload sessions to get updated status
        setTimeout(() => {
          loadSessions();
          if (currentSessionId) {
            loadSessionData(currentSessionId);
          }
        }, 500);
        
        if (step.status === 'completed') {
          toast.success('✅ Automation completed successfully!');
        } else {
          toast.error('❌ Automation failed: ' + (step.error || 'Unknown error'));
        }
      }
    });

    return unsubscribe;
  }, [currentSessionId]);

  const loadSessions = useCallback(async () => {
    try {
      const allSessions = await window.browserAPI.getAllChatSessions(50);
      setSessions(allSessions);
      console.log(`📋 Loaded ${allSessions.length} sessions`);
    } catch (error) {
      console.error('Failed to load sessions:', error);
      toast.error('Failed to load chat sessions');
    }
  }, []);

  const loadSessionData = async (sessionId: string) => {
    try {
      console.log(`📖 Loading session data: ${sessionId}`);
      const data = await window.browserAPI.getCompleteChatSession(sessionId);
      
      setSelectedSession(data.session);
      setMessages(data.messages || []);
      setToolExecutions(data.toolExecutions || []);
      
      // Convert tool executions to execution steps for display
      const steps: ExecutionStep[] = (data.toolExecutions || []).map((tool: ToolExecution) => ({
        type: tool.success ? 'acting' as const : 'failed' as const,
        message: tool.success 
          ? `✓ Executed: ${tool.toolName}` 
          : `✗ Failed: ${tool.toolName}`,
        iteration: tool.iteration,
        toolName: tool.toolName,
        toolInput: typeof tool.input === 'string' ? JSON.parse(tool.input) : tool.input,
        toolOutput: tool.output ? (typeof tool.output === 'string' ? JSON.parse(tool.output) : tool.output) : undefined,
        error: tool.error,
        timestamp: tool.timestamp
      }));
      
      setExecutionSteps(steps);
      console.log(`✅ Loaded session with ${steps.length} execution steps`);
    } catch (error) {
      console.error('Failed to load session data:', error);
      toast.error('Failed to load session details');
    }
  };

  const selectSession = useCallback(async (sessionId: string) => {
    await loadSessionData(sessionId);
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!confirm('Delete this chat session? This cannot be undone.')) return;

    try {
      await window.browserAPI.deleteChatSession(sessionId);
      toast.success('Session deleted');
      await loadSessions();
      
      if (selectedSession?.id === sessionId) {
        setSelectedSession(null);
        setMessages([]);
        setToolExecutions([]);
        setExecutionSteps([]);
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
      toast.error('Failed to delete session');
    }
  }, [selectedSession, loadSessions]);

  const exportSession = useCallback(async (sessionId: string) => {
    try {
      const data = await window.browserAPI.exportChatSession(sessionId);
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-session-${sessionId}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Session exported successfully');
    } catch (error) {
      console.error('Failed to export:', error);
      toast.error('Failed to export session');
    }
  }, []);

  const startAutomation = useCallback(async (userPrompt: string, recordingSessionId: string) => {
    if (!userPrompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    if (!recordingSessionId) {
      toast.error('Please select a recording session first');
      return;
    }

    try {
      // Check API key from settings based on selected LLM provider
      const settings = await window.browserAPI.getSettingsCategory('automation');
      
     
      
      // Get API key based on selected provider
      let apiKey = '';
      switch (settings.llmProvider) {
        case 'gemini':
          apiKey = settings.geminiApiKey;
          break;
        case 'claude':
          apiKey = settings.claudeApiKey;
          break;
        case 'openai':
          apiKey = settings.openaiApiKey;
          break;
      }
      
      if (!apiKey) {
        toast.error(`Please configure your ${settings.llmProvider} API key in Settings first`);
        return;
      }

      setIsExecuting(true);
      setExecutionSteps([]);

      console.log('🚀 Starting automation...');

      // Get the selected recording session
      const recordings = await window.browserAPI.getAllRecordings();
      const recordingSession = recordings.find(r => r.id === recordingSessionId);
      
      if (!recordingSession) {
        toast.error('Selected recording session not found');
        setIsExecuting(false);
        return;
      }

      const result = await window.browserAPI.executeAutomation({
        userPrompt,
        recordingSession,
        apiKey
      });

      console.log('✅ Automation started, session ID:', result.sessionId);
      setCurrentSessionId(result.sessionId);

      // Immediately load and select the new session
      if (result.sessionId) {
        await loadSessions();
        await loadSessionData(result.sessionId);
        // Clear pending recording ID since we now have an active session
        setPendingRecordingId(null);
      }
    } catch (error) {
      console.error('Automation failed:', error);
      toast.error('Failed to start automation: ' + (error as Error).message);
      setIsExecuting(false);
    }
  }, [loadSessions]);

  const cancelAutomation = useCallback(async () => {
    try {
      await window.browserAPI.cancelAutomation();
      setIsExecuting(false);
      toast.info('Automation cancelled');
      
      // Reload to get updated status
      setTimeout(() => {
        loadSessions();
        if (currentSessionId) {
          loadSessionData(currentSessionId);
        }
      }, 500);
    } catch (error) {
      console.error('Failed to cancel:', error);
      toast.error('Failed to cancel automation');
    }
  }, [currentSessionId, loadSessions]);

  const value: AgentContextValue = {
    sessions,
    selectedSession,
    loadSessions,
    selectSession,
    deleteSession,
    exportSession,
    messages,
    toolExecutions,
    executionSteps,
    isExecuting,
    startAutomation,
    cancelAutomation,
    pendingRecordingId,
    setPendingRecordingId
  };

  return (
    <AgentContext.Provider value={value}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent() {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgent must be used within AgentProvider');
  }
  return context;
}
