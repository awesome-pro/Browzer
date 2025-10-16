/**
 * Agent Module - ReAct-based LLM orchestration for browser automation
 * 
 * Exports:
 * - AgentOrchestrator: Main ReAct loop controller
 * - SessionAnalyzer: Recorded session analysis
 * - ExecutionEngine: Tool execution manager
 * - MemoryManager: Conversation and context memory
 */

export { AgentOrchestrator } from './AgentOrchestrator';
export { SessionAnalyzer } from './SessionAnalyzer';
export { ExecutionEngine } from './ExecutionEngine';
export { MemoryManager } from './MemoryManager';

export type {
  AgentConfig,
  AutomationRequest,
  ExecutionStep,
  ExecutionPlan,
  AgentState
} from './AgentOrchestrator';

export type { SessionInsights } from './SessionAnalyzer';
export type { ExecutionResult } from './ExecutionEngine';

