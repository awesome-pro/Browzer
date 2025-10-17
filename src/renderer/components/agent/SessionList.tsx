/**
 * SessionList - Left sidebar showing all chat sessions
 */

import { Plus, Trash2, CheckCircle2, XCircle, Loader2, StopCircle } from 'lucide-react';
import { Button } from '@/renderer/ui/button';
import { ScrollArea } from '@/renderer/ui/scroll-area';
import { cn } from '@/renderer/lib/utils';
import { useAgent } from './AgentContext';
import { ChatSession } from './types';

export function SessionList() {
  const { sessions, selectedSession, selectSession, deleteSession, setShowNewChat } = useAgent();

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return date.toLocaleDateString();
  };

  const getStatusIcon = (status: ChatSession['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="w-3 h-3 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle2 className="w-3 h-3 text-green-500" />;
      case 'failed':
        return <XCircle className="w-3 h-3 text-red-500" />;
      case 'cancelled':
        return <StopCircle className="w-3 h-3 text-gray-500" />;
    }
  };

  return (
    <div className="w-64 border-r flex flex-col bg-background">
      {/* Header */}
      <div className="p-3 border-b">
        <Button
          onClick={() => setShowNewChat(true)}
          className="w-full"
          size="sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Chat
        </Button>
      </div>

      {/* Sessions List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {sessions.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground p-4">
              No chat sessions yet
            </div>
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => selectSession(session.id)}
                className={cn(
                  "w-full text-left p-2.5 rounded-md hover:bg-accent transition-colors group",
                  selectedSession?.id === session.id && "bg-accent"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {/* Title */}
                    <div className="text-sm font-medium truncate leading-tight">
                      {session.title}
                    </div>
                    
                    {/* Status & Time */}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {getStatusIcon(session.status)}
                      <span className="text-xs text-muted-foreground">
                        {formatTimestamp(session.createdAt)}
                      </span>
                    </div>
                    
                    {/* Metrics */}
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      {session.iterations > 0 && (
                        <span>{session.iterations} iter</span>
                      )}
                      {session.totalCost > 0 && (
                        <span>${session.totalCost.toFixed(4)}</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Delete Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(session.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded transition-opacity"
                    title="Delete session"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
