/**
 * NewChatForm - Form to start a new automation session
 */

import { useState, useEffect } from 'react';
import { Sparkles, Play, Loader2 } from 'lucide-react';
import { Button } from '@/renderer/ui/button';
import { Input } from '@/renderer/ui/input';
import { useAgent } from './AgentContext';
import { Textarea } from '@/renderer/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/renderer/ui/select';
import { RecordingSession } from '@/shared/types';

export function NewChatForm() {
  const { startAutomation, isExecuting } = useAgent();
  const [userPrompt, setUserPrompt] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [sessions, setSessions] = useState<RecordingSession[]>([]);

  // Load recordings on mount
  useEffect(() => {
    loadRecordings();
  }, []);

  const loadRecordings = async () => {
    try {
      const recordings = await window.browserAPI.getAllRecordings();
      setSessions(recordings || []);
      // Auto-select first if only one
      if (recordings && recordings.length === 1) {
        setSelectedSession(recordings[0].id);
      }
    } catch (error) {
      console.error('Failed to load recordings:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await startAutomation(userPrompt, apiKey);
    setUserPrompt(''); // Clear prompt after starting
  };

  return (
    <section className="flex-1 flex items-center justify-center p-8">
       <form onSubmit={handleSubmit} className="space-y-4">
          {/* API Key */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Claude API Key
            </label>
            <Input
              type="password"
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={isExecuting}
              required
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Get your API key from{' '}
              <a 
                href="https://console.anthropic.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                console.anthropic.com
              </a>
            </p>
          </div>

          {/* Recording Session Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Select Recording Session *
            </label>
            <Select
              value={selectedSession}
              onValueChange={setSelectedSession}
              disabled={isExecuting}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a recorded session..." />
              </SelectTrigger>
              <SelectContent>
                {sessions.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No recordings available
                  </SelectItem>
                ) : (
                  sessions.map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      {session.name} ({session.actions.length} actions)
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The recorded session provides context for the automation
            </p>
          </div>

          {/* User Prompt */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              What would you like to automate?
            </label>
            <Textarea
              placeholder="Example: Invite user 'rahulkumaran' to my GitHub organization 'Abhinandan-Org'..."
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              disabled={isExecuting}
              required
            />
            <p className="text-xs text-muted-foreground">
              Be specific about what you want to accomplish. Claude will analyze the page and take the necessary actions.
            </p>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isExecuting || !userPrompt.trim() || !apiKey.trim() || !selectedSession}
            className="w-full"
            size="lg"
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running Automation...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Start Automation
              </>
            )}
          </Button>
        </form>
    </section>
  );
}
