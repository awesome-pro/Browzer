/**
 * ChatFooter - Fixed input group at bottom for sending messages
 * Uses InputGroup component for professional chat input
 */

import { useState } from 'react';
import { ArrowUpIcon, Loader2 } from 'lucide-react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/renderer/ui/input-group';
import { useAgent } from './AgentContext';

export function ChatFooter() {
  const { isExecuting, startAutomation, selectedSession, pendingRecordingId } = useAgent();
  const [prompt, setPrompt] = useState('');

  const handleSubmit = async () => {
    // Get recording ID from either active session or pending selection
    const recordingId = selectedSession?.recordingSessionId || pendingRecordingId;
    
    if (!prompt.trim() || isExecuting || !recordingId) return;
    
    await startAutomation(prompt, recordingId);
    setPrompt('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <section className="p-3 flex-shrink-0">
       <InputGroup>
          <InputGroupTextarea
            placeholder={selectedSession ? "Continue the conversation..." : "Describe what you want to automate..."}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isExecuting}
            rows={2}
            className="rounded-3xl"
          />
          <InputGroupAddon align="block-end">
            <InputGroupButton
              variant="default"
              className="rounded-full"
              size="icon-xs"
              disabled={!prompt.trim() || isExecuting}
              onClick={handleSubmit}
            >
              {isExecuting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowUpIcon className="w-4 h-4" />
              )}
              <span className="sr-only">Send</span>
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
    </section>
  );
}
