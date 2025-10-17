/**
 * AgentHeader - Compact header with small icon buttons only
 */

import { Plus } from 'lucide-react';
import { Button } from '@/renderer/ui/button';
import { SessionListPopover } from './SessionListPopover';
import { useAgent } from './AgentContext';

export function AgentHeader() {
  const { setShowNewChat } = useAgent();

  return (
    <div className="sticky top-0 z-10 border-b bg-background">
      <div className="flex items-center justify-end gap-2 p-2">
        {/* History Popover */}
        <SessionListPopover />
        
        {/* New Chat Button */}
        <Button 
          onClick={() => setShowNewChat(true)}
          size="icon"
          variant="ghost"
          title="New Chat"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
