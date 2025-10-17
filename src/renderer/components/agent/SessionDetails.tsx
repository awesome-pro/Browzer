/**
 * SessionDetails - Header showing current session info and controls
 */

import { 
  Clock, DollarSign, ChevronRight, Download, StopCircle,
  CheckCircle2, XCircle, Loader2
} from 'lucide-react';
import { Button } from '@/renderer/ui/button';
import { useAgent } from './AgentContext';

export function SessionDetails() {
  const { selectedSession, isExecuting, cancelAutomation, exportSession } = useAgent();

  if (!selectedSession) return null;

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
    return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString();
  };

  const getStatusBadge = () => {
    switch (selectedSession.status) {
      case 'running':
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-medium">
            <Loader2 className="w-3 h-3 animate-spin" />
            Running
          </div>
        );
      case 'completed':
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 text-xs font-medium">
            <CheckCircle2 className="w-3 h-3" />
            Completed
          </div>
        );
      case 'failed':
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 text-xs font-medium">
            <XCircle className="w-3 h-3" />
            Failed
          </div>
        );
      case 'cancelled':
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-medium">
            <StopCircle className="w-3 h-3" />
            Cancelled
          </div>
        );
    }
  };

  return (
    <div className="border-b bg-card">
      <div className="p-4 space-y-3">
        {/* Title & Status */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {getStatusBadge()}
            </div>
            <h3 className="font-semibold text-lg leading-tight">
              {selectedSession.title}
            </h3>
            <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
              {selectedSession.userPrompt}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {selectedSession.status === 'running' && isExecuting && (
              <Button
                onClick={cancelAutomation}
                variant="destructive"
                size="sm"
              >
                <StopCircle className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            )}
            <Button
              onClick={() => exportSession(selectedSession.id)}
              variant="outline"
              size="sm"
              title="Export session"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Metrics */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span>{formatTimestamp(selectedSession.createdAt)}</span>
          </div>
          
          {selectedSession.iterations > 0 && (
            <div className="flex items-center gap-1">
              <ChevronRight className="w-4 h-4" />
              <span>{selectedSession.iterations} iterations</span>
            </div>
          )}
          {selectedSession.totalTokens > 0 && (
            <div className="flex items-center gap-1">
              <span className="font-mono">{selectedSession.totalTokens.toLocaleString()} tokens</span>
            </div>
          )}
          
          {selectedSession.totalCost > 0 && (
            <div className="flex items-center gap-1">
              <DollarSign className="w-4 h-4" />
              <span className="font-mono">${selectedSession.totalCost.toFixed(4)}</span>
            </div>
          )}
        </div>
        
        {/* Error Message */}
        {selectedSession.error && (
          <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
            <div className="text-sm font-medium text-red-900 dark:text-red-200 mb-1">
              Error
            </div>
            <div className="text-sm text-red-700 dark:text-red-300">
              {selectedSession.error}
            </div>
          </div>
        )}

        {/* Summary */}
        {selectedSession.summary && selectedSession.status === 'completed' && (
          <div className="p-3 rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
            <div className="text-sm font-medium text-green-900 dark:text-green-200 mb-1">
              Summary
            </div>
            <div className="text-sm text-green-700 dark:text-green-300">
              {selectedSession.summary}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
