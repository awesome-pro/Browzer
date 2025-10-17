/**
 * ConversationView - Rich conversation display (Cursor/Windsurf style)
 * 
 * Properly displays:
 * - User prompts
 * - Claude's thinking/reasoning (text blocks)
 * - Tool calls with inputs
 * - Tool results with outputs
 * - Errors and success states
 */

import { MessageSquare, Bot, Zap, CheckCircle2, XCircle, ChevronDown, Clock, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/renderer/lib/utils';
import { ChatMessage, ToolExecution } from '@/shared/types';

interface ConversationViewProps {
  messages: ChatMessage[];
  toolExecutions: ToolExecution[];
}

export function ConversationView({ messages, toolExecutions }: ConversationViewProps) {

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const parseMessageContent = (content: string | any): any => {
    if (typeof content === 'string') {
      try {
        return JSON.parse(content);
      } catch {
        return { text: content };
      }
    }
    return content;
  };

  // Find tool execution for a tool_use block
  const findToolExecution = (toolUseId: string) => {
    return toolExecutions.find(t => {
      const input = typeof t.input === 'string' ? JSON.parse(t.input) : t.input;
      return input?.id === toolUseId || t.id === toolUseId;
    });
  };

  return (
    <div className="w-full  p-4 space-y-6 ">
      {messages.map((message) => {
        const content = parseMessageContent(message.content);
        const isUser = message.role === 'user';
        const isAssistant = message.role === 'assistant';

        return (
          <div key={message.id} className="space-y-3">
            {/* User Message */}
            {isUser && (
              <div className="flex gap-3 w-full">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm font-semibold">You</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(message.timestamp)}
                    </span>
                  </div>
                  <div className="text-sm bg-blue-50 dark:bg-blue-950/20 rounded-xl p-3 border border-blue-100 dark:border-blue-900 break-words">
                    {typeof content === 'string' ? content : content.text || JSON.stringify(content)}
                  </div>
                </div>
              </div>
            )}

            {/* Assistant Message */}
            {isAssistant && (
              <div className="flex gap-3 w-full">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-purple-500" />
                </div>
                <div className="flex-1 min-w-0 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Claude</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(message.timestamp)}
                    </span>
                    {message.inputTokens && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {message.inputTokens + (message.outputTokens || 0)} tokens
                      </span>
                    )}
                  </div>

                  {/* Content blocks */}
                  {Array.isArray(content) ? (
                    <div className="space-y-3">
                      {content.map((block: any, blockIndex: number) => {
                        if (block.type === 'text') {
                          return (
                            <div key={blockIndex} className="text-sm leading-relaxed bg-muted/30 rounded-lg p-3 border break-words">
                              <div className="whitespace-pre-wrap break-words">{block.text}</div>
                            </div>
                          );
                        }
                        if (block.type === 'tool_use') {
                          const toolExec = findToolExecution(block.id);
                          return (
                            <ToolExecutionCard
                              key={blockIndex}
                              toolUseId={block.id}
                              toolName={block.name}
                              input={block.input}
                              execution={toolExec}
                            />
                          );
                        }
                        if (block.type === 'tool_result') {
                          return (
                            <ToolResultCard
                              key={blockIndex}
                              toolUseId={block.tool_use_id}
                              content={block.content}
                              isError={block.is_error}
                            />
                          );
                        }
                        return null;
                      })}
                    </div>
                  ) : typeof content === 'string' ? (
                    <div className="text-sm leading-relaxed bg-muted/30 rounded-lg p-3 border break-words">
                      {content}
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Show orphaned tool executions if any */}
      {toolExecutions.length > 0 && messages.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-8">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          Processing...
        </div>
      )}
    </div>
  );
}

interface ToolExecutionCardProps {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  execution?: ToolExecution;
}

function ToolExecutionCard({ toolUseId, toolName, input, execution }: ToolExecutionCardProps) {
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
      "border rounded-lg overflow-hidden w-full",
      !execution && "border-blue-200 bg-blue-50/30 dark:border-blue-900/50 dark:bg-blue-950/10",
      execution?.success && "border-green-200 bg-green-50/30 dark:border-green-900/50 dark:bg-green-950/10",
      execution && !execution.success && "border-red-200 bg-red-50/30 dark:border-red-900/50 dark:bg-red-950/10"
    )}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-accent/30 transition-colors"
      >
        <div className="flex-shrink-0 mt-0.5">
          {getToolIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Zap className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold">{toolName}</span>
            <span className="text-xs text-muted-foreground">
              {getToolLabel()}
            </span>
            {execution?.duration && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {execution.duration}ms
              </span>
            )}
          </div>
          {!isExpanded && Object.keys(input).length > 0 && (
            <div className="text-xs text-muted-foreground mt-1.5 font-mono line-clamp-1 truncate">
              {Object.entries(input).map(([key, val]) => 
                `${key}: ${typeof val === 'string' ? val : JSON.stringify(val)}`
              ).join(', ')}
            </div>
          )}
        </div>
        <ChevronDown className={cn(
          "w-4 h-4 text-muted-foreground transition-transform flex-shrink-0",
          isExpanded && "transform rotate-180"
        )} />
      </button>

      {isExpanded && (
        <div className="border-t bg-muted/20">
          <div className="p-3 space-y-3">
            {/* Input */}
            {Object.keys(input).length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1.5">Input</div>
                <pre className="text-xs bg-background/50 p-2.5 rounded border overflow-x-auto font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(input, null, 2)}
                </pre>
              </div>
            )}

            {/* Output */}
            {execution?.output && (
              <div>
                <div className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1.5">Output</div>
                <pre className="text-xs bg-green-50 dark:bg-green-950/20 p-2.5 rounded border border-green-200 dark:border-green-900 overflow-x-auto max-h-60 overflow-y-auto font-mono whitespace-pre-wrap break-all">
                  {typeof execution.output === 'string' 
                    ? execution.output 
                    : JSON.stringify(execution.output, null, 2)}
                </pre>
              </div>
            )}

            {/* Error */}
            {execution?.error && (
              <div>
                <div className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1.5">Error</div>
                <pre className="text-xs bg-red-50 dark:bg-red-950/20 text-red-900 dark:text-red-200 p-2.5 rounded border border-red-200 dark:border-red-900 overflow-x-auto font-mono whitespace-pre-wrap break-all">
                  {execution.error}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface ToolResultCardProps {
  toolUseId: string;
  content: string;
  isError: boolean;
}

function ToolResultCard({ content, isError }: ToolResultCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Try to parse and format JSON content
  const formatContent = (rawContent: string) => {
    try {
      const parsed = JSON.parse(rawContent);
      return { isJson: true, formatted: JSON.stringify(parsed, null, 2), parsed };
    } catch {
      return { isJson: false, formatted: rawContent, parsed: null };
    }
  };

  const { isJson, formatted, parsed } = formatContent(content);

  // Extract key information from parsed content
  const getContentSummary = () => {
    if (!parsed) return formatted.substring(0, 100);
    
    if (typeof parsed === 'object') {
      const keys = Object.keys(parsed);
      if (keys.includes('success')) {
        return `${parsed.success ? '✓' : '✗'} ${keys.length} fields`;
      }
      return `${keys.length} fields: ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}`;
    }
    return formatted.substring(0, 100);
  };

  return (
    <div className={cn(
      "border rounded-lg overflow-hidden w-full",
      isError ? "border-red-200 bg-red-50/30 dark:border-red-900/50 dark:bg-red-950/10" : "border-gray-200 bg-gray-50/30 dark:border-gray-800 dark:bg-gray-900/10"
    )}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-accent/30 transition-colors"
      >
        <div className="flex-shrink-0 mt-0.5">
          {isError ? (
            <XCircle className="w-4 h-4 text-red-500" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-gray-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-muted-foreground">
            {isError ? 'Tool Error' : 'Tool Result'}
          </div>
          {!isExpanded && (
            <div className="text-xs text-muted-foreground mt-1 line-clamp-1 break-words">
              {getContentSummary()}
            </div>
          )}
        </div>
        <ChevronDown className={cn(
          "w-4 h-4 text-muted-foreground transition-transform flex-shrink-0",
          isExpanded && "transform rotate-180"
        )} />
      </button>

      {isExpanded && (
        <div className="border-t bg-muted/20 p-3">
          {isJson && parsed ? (
            <JsonViewer data={parsed} />
          ) : (
            <pre className="text-xs bg-background/50 p-2.5 rounded border overflow-x-auto max-h-60 overflow-y-auto font-mono whitespace-pre-wrap break-all">
              {formatted}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// JsonViewer component for better JSON display with syntax highlighting
interface JsonViewerProps {
  data: any;
}

function JsonViewer({ data }: JsonViewerProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCollapse = (key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const renderValue = (value: any, key: string, depth: number): React.ReactNode => {
    if (value === null) {
      return <span className="text-gray-500">null</span>;
    }

    if (typeof value === 'boolean') {
      return <span className="text-blue-600 dark:text-blue-400">{value.toString()}</span>;
    }

    if (typeof value === 'number') {
      return <span className="text-purple-600 dark:text-purple-400">{value}</span>;
    }

    if (typeof value === 'string') {
      if (value.startsWith('http://') || value.startsWith('https://')) {
        return (
          <a 
            href={value} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline break-all"
          >
            "{value}"
          </a>
        );
      }
      return <span className="text-green-600 dark:text-green-400">"{value}"</span>;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="text-gray-500">[]</span>;

      const isCollapsed = collapsed[`${key}-${depth}`];
      return (
        <div className="inline-block w-full">
          <button
            onClick={() => toggleCollapse(`${key}-${depth}`)}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-left"
          >
            {isCollapsed ? '▶' : '▼'} [{value.length} items]
          </button>
          {!isCollapsed && (
            <div className="ml-4 border-l-2 border-gray-200 dark:border-gray-700 pl-2 mt-1">
              {value.map((item, index) => (
                <div key={index} className="py-0.5">
                  <span className="text-gray-500">{index}: </span>
                  {renderValue(item, `${key}-${index}`, depth + 1)}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length === 0) return <span className="text-gray-500">{'{}'}</span>;

      const isCollapsed = collapsed[`${key}-${depth}`];
      return (
        <div className="inline-block w-full">
          <button
            onClick={() => toggleCollapse(`${key}-${depth}`)}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-left"
          >
            {isCollapsed ? '▶' : '▼'} {'{'}{keys.length} fields{'}'}
          </button>
          {!isCollapsed && (
            <div className="ml-4 border-l-2 border-gray-200 dark:border-gray-700 pl-2 mt-1">
              {keys.map(k => (
                <div key={k} className="py-0.5">
                  <span className="text-orange-600 dark:text-orange-400 font-medium">{k}</span>
                  <span className="text-gray-500">: </span>
                  {renderValue(value[k], `${key}-${k}`, depth + 1)}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return <span className="break-all">{String(value)}</span>;
  };

  return (
    <div className="text-xs bg-background/50 p-3 rounded border max-h-96 overflow-y-auto font-mono">
      {typeof data === 'object' && data !== null ? (
        <div className="space-y-1">
          {Object.keys(data).map(key => (
            <div key={key} className="py-0.5">
              <span className="text-orange-600 dark:text-orange-400 font-semibold">{key}</span>
              <span className="text-gray-500">: </span>
              {renderValue(data[key], key, 0)}
            </div>
          ))}
        </div>
      ) : (
        renderValue(data, 'root', 0)
      )}
    </div>
  );
}
