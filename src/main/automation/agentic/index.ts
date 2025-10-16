/**
 * Agentic Automation Module
 * 
 * ReAct-based browser automation with Claude Sonnet 4.5
 */

export { AgenticAutomationService } from './AgenticAutomationService';
export { ConversationManager } from './ConversationManager';
export { ToolRegistry } from './ToolRegistry';

export type {
  AgenticExecutionOptions,
  AgenticExecutionResult,
  ProgressUpdate
} from './AgenticAutomationService';

export type {
  ConversationMessage,
  CachedContext,
  TokenUsage
} from './ConversationManager';
