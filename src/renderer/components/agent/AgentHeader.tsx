/**
 * AgentHeader - Header with recording session selector and action buttons
 */

import { useState, useEffect } from 'react';
import { Plus, FileText } from 'lucide-react';
import { Button } from '@/renderer/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/renderer/ui/select';
import { SessionListPopover } from './SessionListPopover';
import { useAgent } from './AgentContext';
import { RecordingSession } from '@/shared/types';

export function AgentHeader() {
  const { selectedSession, recordingSessionId, setRecordingSessionId } = useAgent();
  const [recordings, setRecordings] = useState<RecordingSession[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<RecordingSession | null>(null);

  // Load recordings on mount
  useEffect(() => {
    loadRecordings();
  }, []);

  // Find selected recording details
  useEffect(() => {
    if (recordingSessionId) {
      const recording = recordings.find(r => r.id === recordingSessionId);
      setSelectedRecording(recording || null);
    } else {
      setSelectedRecording(null);
    }
  }, [recordingSessionId, recordings]);

  const loadRecordings = async () => {
    try {
      const data = await window.browserAPI.getAllRecordings();
      setRecordings(data || []);
    } catch (error) {
      console.error('Failed to load recordings:', error);
    }
  };

  const handleNewChat = () => {
    // Clear selection to show recent sessions
    window.location.reload(); // Simple way to reset state
  };

  return (
    <div className="sticky top-0 z-10 border-b bg-background">
      <div className="flex items-center justify-between gap-2 p-2">
        {/* Left: Recording Session Selector or Locked Display */}
        <div className="flex-1 min-w-0">
          {selectedSession ? (
            /* Show locked recording session */
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-2">
              <FileText className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">
                {selectedRecording?.name || 'Unknown Session'}
              </span>
            </div>
          ) : (
            /* Show selector when no active session */
            <Select
              value={recordingSessionId || ''}
              onValueChange={setRecordingSessionId}
            >
              <SelectTrigger className="h-8 text-xs border-none shadow-none focus:ring-0">
                <SelectValue placeholder="Select recording session..." />
              </SelectTrigger>
              <SelectContent>
                {recordings.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No recordings available
                  </SelectItem>
                ) : (
                  recordings.map((recording) => (
                    <SelectItem key={recording.id} value={recording.id} className="text-xs">
                      {recording.name} ({recording.actions.length} actions)
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Right: Action Buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <SessionListPopover />
          <Button 
            onClick={handleNewChat}
            size="icon"
            variant="ghost"
            title="New Chat"
            className="h-8 w-8"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
