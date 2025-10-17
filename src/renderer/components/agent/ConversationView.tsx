/**
 * ConversationView - Rich display of chat messages (like Cursor/Windsurf)
 * Shows user prompts, assistant thoughts, tool executions, and results
 */

import { MessageSquare, Bot, Zap, CheckCircle2, XCircle, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/renderer/ui/accordion';
import { cn } from '@/renderer/lib/utils';
import { ChatMessage, ToolExecution } from '@/shared/types';

interface ConversationViewProps {
  messages: ChatMessage[];
  toolExecutions: ToolExecution[];
}

export function ConversationView({ messages, toolExecutions }: ConversationViewProps) {
  // Group tool executions by iteration
  const toolsByIteration = toolExecutions.reduce((acc, tool) => {
    if (!acc[tool.iteration]) acc[tool.iteration] = [];
    acc[tool.iteration].push(tool);
    return acc;
  }, {} as Record<number, ToolExecution[]>);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const parseMessageContent = (content: string) => {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      {messages.map((message, index) => {
        const content = parseMessageContent(message.content);
        const isUser = message.role === 'user';
        const isAssistant = message.role === 'assistant';

        return (
          <div key={message.id} className="space-y-2">
            {/* User Message */}
            {isUser && (
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">You</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(message.timestamp)}
                    </span>
                  </div>
                  <div className="text-sm bg-muted/50 rounded-lg p-3">
                    {typeof content === 'string' ? content : content.text || JSON.stringify(content)}
                  </div>
                </div>
              </div>
            )}

            {/* Assistant Message */}
            {isAssistant && (
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-purple-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">Claude</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(message.timestamp)}
                    </span>
                    {message.inputTokens && (
                      <span className="text-xs text-muted-foreground">
                        {message.inputTokens + (message.outputTokens || 0)} tokens
                      </span>
                    )}
                  </div>

                  {/* Thinking/Content */}
                  {content.content && Array.isArray(content.content) && (
                    <div className="space-y-2">
                      {content.content.map((block: any, blockIndex: number) => {
                        if (block.type === 'text') {
                          return (
                            <div key={blockIndex} className="text-sm prose prose-sm max-w-none">
                              {block.text}
                            </div>
                          );
                        }
                        if (block.type === 'tool_use') {
                          // Find corresponding tool execution
                          const toolExec = toolExecutions.find(t => 
                            t.toolName === block.name && 
                            Math.abs(t.timestamp - message.timestamp) < 5000
                          );

                          return (
                            <ToolExecutionCard
                              key={blockIndex}
                              toolName={block.name}
                              input={block.input}
                              execution={toolExec}
                            />
                          );
                        }
                        return null;
                      })}
                    </div>
                  )}

                  {/* Stop reason */}
                  {content.stop_reason && (
                    <div className="text-xs text-muted-foreground mt-2">
                      {content.stop_reason === 'end_turn' && '✓ Completed'}
                      {content.stop_reason === 'max_tokens' && '⚠ Max tokens reached'}
                      {content.stop_reason === 'stop_sequence' && '⏹ Stopped'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Orphaned tool executions (not matched to messages) */}
      {Object.entries(toolsByIteration).map(([iteration, tools]) => {
        const hasMatchingMessage = messages.some(m => 
          tools.some(t => Math.abs(t.timestamp - m.timestamp) < 5000)
        );
        
        if (hasMatchingMessage) return null;

        return (
          <div key={`iteration-${iteration}`} className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">
              Iteration {iteration}
            </div>
            {tools.map(tool => (
              <ToolExecutionCard
                key={tool.id}
                toolName={tool.toolName}
                input={typeof tool.input === 'string' ? JSON.parse(tool.input) : tool.input}
                execution={tool}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

interface ToolExecutionCardProps {
  toolName: string;
  input: any;
  execution?: ToolExecution;
}

function ToolExecutionCard({ toolName, input, execution }: ToolExecutionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getToolIcon = () => {
    if (!execution) return <Zap className="w-4 h-4 text-blue-500 animate-pulse" />;
    if (execution.success) return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    return <XCircle className="w-4 h-4 text-red-500" />;
  };

  const getToolLabel = () => {
    if (!execution) return 'Executing...';
    if (execution.success) return 'Executed';
    return 'Failed';
  };

  return (
    <div className={cn(
      "border rounded-lg",
      !execution && "border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20",
      execution?.success && "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20",
      execution && !execution.success && "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
    )}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-accent/50 transition-colors"
      >
        <div className="flex-shrink-0 mt-0.5">
          {getToolIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {getToolLabel()}
            </span>
            <span className="text-xs font-mono">{toolName}</span>
            {execution?.duration && (
              <span className="text-xs text-muted-foreground">
                {execution.duration}ms
              </span>
            )}
          </div>
          {!isExpanded && (
            <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
              {JSON.stringify(input)}
            </div>
          )}
        </div>
        <ChevronDown className={cn(
          "w-4 h-4 text-muted-foreground transition-transform flex-shrink-0",
          isExpanded && "transform rotate-180"
        )} />
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 border-t">
          {/* Input */}
          <div className="mt-2">
            <div className="text-xs font-medium text-muted-foreground mb-1">Input:</div>
            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
              {JSON.stringify(input, null, 2)}
            </pre>
          </div>

          {/* Output */}
          {execution?.output && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Output:</div>
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-60 overflow-y-auto">
                {typeof execution.output === 'string' 
                  ? execution.output 
                  : JSON.stringify(JSON.parse(execution.output), null, 2)}
              </pre>
            </div>
          )}

          {/* Error */}
          {execution?.error && (
            <div>
              <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Error:</div>
              <pre className="text-xs bg-red-100 dark:bg-red-950/50 text-red-900 dark:text-red-200 p-2 rounded overflow-x-auto">
                {execution.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
