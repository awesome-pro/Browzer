/**
 * RecentSessions - Shows last 5 chat sessions when no session is selected
 * User can click to open a previous conversation
 */

import { MessageSquare, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useAgent } from './AgentContext';
import { ChatSession } from './types';
import { cn } from '@/renderer/lib/utils';

export function RecentSessions() {
  const { sessions, selectSession } = useAgent();
  
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
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'cancelled':
        return <XCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  if (sessions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3 text-muted-foreground">
          <MessageSquare className="w-16 h-16 mx-auto opacity-20" />
          <div>
            <p className="text-sm font-medium">No conversations yet</p>
            <p className="text-xs mt-1">Start by typing a prompt below</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-2xl mx-auto space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Clock className="w-4 h-4" />
          <span>Recent Conversations</span>
        </div>

        <div className="space-y-2">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => selectSession(session.id)}
              className={cn(
                "w-full text-left p-4 rounded-lg border bg-card hover:bg-accent transition-colors group"
              )}
            >
              <div className="flex items-start gap-3">
                {/* Status Icon */}
                <div className="flex-shrink-0 mt-1">
                  {getStatusIcon(session.status)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm line-clamp-1">
                    {session.title}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {session.userPrompt}
                  </p>
                  
                  {/* Metadata */}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>{formatTimestamp(session.createdAt)}</span>
                    {session.iterations > 0 && (
                      <span>{session.iterations} iterations</span>
                    )}
                    {session.totalCost > 0 && (
                      <span>${session.totalCost.toFixed(4)}</span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
