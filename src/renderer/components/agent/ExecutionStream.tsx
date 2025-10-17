/**
 * ExecutionStream - Real-time display of automation execution
 * Shows Claude's thoughts, actions, and results as they happen
 * Uses Accordion for proper state management and scrolling
 */

import { 
  MessageSquare, Zap, Eye, Sparkles, CheckCircle2, 
  XCircle, Code 
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/renderer/ui/accordion';
import { cn } from '@/renderer/lib/utils';
import { useAgent } from './AgentContext';
import { ExecutionStep } from './types';

export function ExecutionStream() {
  const { executionSteps, isExecuting } = useAgent();


  const getStepIcon = (type: ExecutionStep['type']) => {
    switch (type) {
      case 'thinking':
        return <MessageSquare className="w-4 h-4 text-purple-500" />;
      case 'acting':
        return <Zap className="w-4 h-4 text-blue-500" />;
      case 'observing':
        return <Eye className="w-4 h-4 text-orange-500" />;
      case 'reflecting':
        return <Sparkles className="w-4 h-4 text-green-500" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStepLabel = (type: ExecutionStep['type']) => {
    switch (type) {
      case 'thinking':
        return 'Thinking';
      case 'acting':
        return 'Acting';
      case 'observing':
        return 'Observing';
      case 'reflecting':
        return 'Reflecting';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  if (executionSteps.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2">
          <Sparkles className="w-12 h-12 mx-auto opacity-50" />
          <p className="text-sm">Execution steps will appear here</p>
        </div>
      </div>
    );
  }

  return (
      <Accordion type="multiple" className="space-y-2 px-2">
          {executionSteps.map((step, index) => {
            const hasDetails = step.toolInput || step.toolOutput || step.error;

            return (
              <AccordionItem
                key={index}
                value={`step-${index}`}
                className={cn(
                  "rounded-lg border bg-card",
                  step.type === 'failed' && "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20",
                  step.type === 'completed' && "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20"
                )}
              >
                <AccordionTrigger className="px-3 py-2 hover:no-underline">
                  <div className="flex items-start gap-3 flex-1 text-left">
                    {/* Icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      {getStepIcon(step.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-muted-foreground">
                          {getStepLabel(step.type)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Iteration {step.iteration}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(step.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm mt-1 line-clamp-2">{step.message}</p>
                      
                      {step.toolName && (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <Code className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs font-mono text-muted-foreground">
                            {step.toolName}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>

                {hasDetails && (
                  <AccordionContent className="px-3 pb-3">
                    <div className="ml-10 space-y-2">
                      {/* Tool Input */}
                      {step.toolInput && (
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">
                            Input:
                          </div>
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-40 overflow-y-auto">
                            {JSON.stringify(step.toolInput, null, 2)}
                          </pre>
                        </div>
                      )}

                      {/* Tool Output */}
                      {step.toolOutput && (
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">
                            Output:
                          </div>
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-40 overflow-y-auto">
                            {typeof step.toolOutput === 'string' 
                              ? step.toolOutput 
                              : JSON.stringify(step.toolOutput, null, 2)}
                          </pre>
                        </div>
                      )}

                      {/* Error */}
                      {step.error && (
                        <div>
                          <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                            Error:
                          </div>
                          <pre className="text-xs bg-red-100 dark:bg-red-950/50 text-red-900 dark:text-red-200 p-2 rounded overflow-x-auto max-h-40 overflow-y-auto">
                            {step.error}
                          </pre>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                )}
              </AccordionItem>
            );
          })}
        </Accordion>
  );
}
