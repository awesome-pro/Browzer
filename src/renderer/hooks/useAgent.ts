import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { RecordingSession } from '@/shared/types';

export interface AgentAutomationRequest {
  userIntent: string;
  recordedSession?: RecordingSession;
  startUrl?: string;
  constraints?: string[];
  expectedOutcome?: string;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: any;
}

export interface AgentState {
  currentStep: number;
  plan: any;
  executionHistory: any[];
  errors: string[];
  iterationCount: number;
  isReplanning: boolean;
}

export function useAgent() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [currentRequest, setCurrentRequest] = useState<AgentAutomationRequest | null>(null);

  // Initialize agent with API key
  const initializeAgent = useCallback(async (apiKey: string, config?: any) => {
    try {
      const success = await window.browserAPI.initializeAgent(apiKey, config);
      
      if (success) {
        setIsInitialized(true);
        // toast.success('Agent initialized successfully');
        
        // Add system message
        setMessages([{
          id: `msg-${Date.now()}`,
          role: 'system',
          content: 'Agent initialized and ready. Select a recorded session and provide your automation intent.',
          timestamp: Date.now()
        }]);
      } else {
        toast.error('Failed to initialize agent');
      }
      
      return success;
    } catch (error) {
      console.error('Failed to initialize agent:', error);
      toast.error('Failed to initialize agent');
      return false;
    }
  }, []);

  // Execute automation
  const executeAutomation = useCallback(async (request: AgentAutomationRequest) => {
    if (!isInitialized) {
      toast.error('Agent not initialized. Please initialize first.');
      return null;
    }

    setIsExecuting(true);
    setCurrentRequest(request);

    // Add user message
    const userMessage: AgentMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: request.userIntent,
      timestamp: Date.now(),
      metadata: {
        hasRecordedSession: !!request.recordedSession,
        sessionName: request.recordedSession?.name,
        constraints: request.constraints
      }
    };
    setMessages(prev => [...prev, userMessage]);

    // Add assistant "thinking" message
    const thinkingMessage: AgentMessage = {
      id: `msg-thinking-${Date.now()}`,
      role: 'assistant',
      content: 'Analyzing your request and planning the automation...',
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, thinkingMessage]);

    try {
      const result = await window.browserAPI.executeAgentAutomation(request);

      // Remove thinking message and add result
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== thinkingMessage.id);
        
        const resultMessage: AgentMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: result.success 
            ? `✅ Automation completed successfully!\n\nSteps executed: ${result.executionHistory?.length || 0}\n\n${result.result ? JSON.stringify(result.result, null, 2) : ''}`
            : `❌ Automation failed: ${result.error}\n\nCompleted steps: ${result.executionHistory?.filter((s: any) => s.status === 'success').length || 0}`,
          timestamp: Date.now(),
          metadata: {
            success: result.success,
            plan: result.plan,
            executionHistory: result.executionHistory,
            error: result.error
          }
        };
        
        return [...filtered, resultMessage];
      });

      if (result.success) {
        toast.success('Automation completed successfully!');
      } else {
        toast.error(`Automation failed: ${result.error}`);
      }

      return result;
    } catch (error) {
      console.error('Automation execution error:', error);
      
      // Remove thinking message and add error
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== thinkingMessage.id);
        
        const errorMessage: AgentMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: `❌ Error executing automation: ${(error as Error).message}`,
          timestamp: Date.now(),
          metadata: { error: (error as Error).message }
        };
        
        return [...filtered, errorMessage];
      });

      toast.error('Automation execution failed');
      return null;
    } finally {
      setIsExecuting(false);
      setCurrentRequest(null);
    }
  }, [isInitialized]);

  // Get current agent state
  const refreshState = useCallback(async () => {
    try {
      const state = await window.browserAPI.getAgentState();
      setAgentState(state);
      return state;
    } catch (error) {
      console.error('Failed to get agent state:', error);
      return null;
    }
  }, []);

  // Reset agent
  const resetAgent = useCallback(async () => {
    try {
      const success = await window.browserAPI.resetAgent();
      
      if (success) {
        setMessages([]);
        setAgentState(null);
        setCurrentRequest(null);
        toast.success('Agent reset successfully');
      }
      
      return success;
    } catch (error) {
      console.error('Failed to reset agent:', error);
      toast.error('Failed to reset agent');
      return false;
    }
  }, []);

  // Clear messages (keep agent initialized)
  const clearMessages = useCallback(() => {
    setMessages([{
      id: `msg-${Date.now()}`,
      role: 'system',
      content: 'Messages cleared. Ready for new automation task.',
      timestamp: Date.now()
    }]);
  }, []);

  // Listen for automation complete events
  useEffect(() => {
    const unsubscribe = window.browserAPI.onAgentAutomationComplete((result) => {
      console.log('Agent automation completed:', result);
      refreshState();
    });

    return unsubscribe;
  }, [refreshState]);

  // Poll agent state while executing
  useEffect(() => {
    if (!isExecuting) return;

    const interval = setInterval(() => {
      refreshState();
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [isExecuting, refreshState]);

  return {
    isInitialized,
    isExecuting,
    messages,
    agentState,
    currentRequest,
    initializeAgent,
    executeAutomation,
    refreshState,
    resetAgent,
    clearMessages
  };
}

