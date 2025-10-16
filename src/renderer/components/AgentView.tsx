import { useState, useEffect, useRef } from 'react';
import { Bot, Loader2, CheckCircle2, XCircle, Circle, Play, StopCircle, Settings } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { RecordingSession } from '../../shared/types';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Item } from '../ui/item';

interface ChatMessage {
  id: string;
  type: 'user' | 'system' | 'plan' | 'step' | 'result';
  content: string;
  timestamp: number;
  data?: unknown;
}

interface AutomationStep {
  id: string;
  action: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

// Agent View - AI chat and automation
export default function AgentView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userPrompt, setUserPrompt] = useState('');
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [currentSteps, setCurrentSteps] = useState<AutomationStep[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load recordings on mount
  useEffect(() => {
    loadRecordings();
    loadApiKey();
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentSteps]);

  const loadRecordings = async () => {
    try {
      const recordings = await window.browserAPI.getAllRecordings();
      setSessions(recordings || []);
    } catch (error) {
      console.error('Failed to load recordings:', error);
    }
  };

  const loadApiKey = async () => {
    try {
      const settings = await window.browserAPI.getSettingsCategory('automation');
      if (settings?.apiKey) {
        setApiKey(settings.apiKey);
      }
    } catch (error) {
      console.error('Failed to load API key:', error);
    }
  };

  const saveApiKey = async () => {
    try {
      await window.browserAPI.updateSetting('automation', 'apiKey', apiKey);
      await window.browserAPI.initializeAutomation(apiKey);
      toast.success('API key saved successfully');
      setShowSettings(false);
    } catch (error) {
      toast.error('Failed to save API key');
      console.error(error);
    }
  };

  const addMessage = (message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMessage: ChatMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random()}`,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const handleExecute = async () => {
    if (!userPrompt.trim() || !selectedSession) {
      toast.error('Please enter a prompt and select a recording');
      return;
    }

    if (!apiKey) {
      toast.error('Please configure your Anthropic API key in settings');
      setShowSettings(true);
      return;
    }

    setIsExecuting(true);
    setCurrentSteps([]);

    // Add user message
    addMessage({
      type: 'user',
      content: userPrompt
    });

    // Find selected session
    const session = sessions.find(s => s.id === selectedSession);
    if (!session) {
      toast.error('Selected recording not found');
      setIsExecuting(false);
      return;
    }

    try {
      // Initialize automation
      await window.browserAPI.initializeAutomation(apiKey);

      // Set up progress listener
      const unsubscribe = window.browserAPI.onAutomationProgress((data: { step: AutomationStep; index: number; total: number }) => {
        const { step } = data;
        
        setCurrentSteps(prev => {
          const newSteps = [...prev];
          const existingIndex = newSteps.findIndex(s => s.id === step.id);
          
          if (existingIndex >= 0) {
            newSteps[existingIndex] = step;
          } else {
            newSteps.push(step);
          }
          
          return newSteps;
        });
      });

      addMessage({
        type: 'system',
        content: `🤖 Generating automation plan using recording: "${session.name}"...`
      });

      // Execute automation
      const result = await window.browserAPI.executeAutomation({
        userPrompt,
        recordingSession: session,
        apiKey
      });

      unsubscribe();

      if (result.success) {
        addMessage({
          type: 'result',
          content: `✅ Automation completed successfully!\n\nCompleted: ${result.plan.completedSteps}/${result.plan.steps.length} steps\nDuration: ${(result.executionTime / 1000).toFixed(2)}s`,
          data: result
        });
        toast.success('Automation completed!');
      } else {
        addMessage({
          type: 'result',
          content: `❌ Automation failed: ${result.error}\n\nCompleted: ${result.plan.completedSteps}/${result.plan.steps.length} steps`,
          data: result
        });
        toast.error('Automation failed');
      }

    } catch (error) {
      addMessage({
        type: 'result',
        content: `❌ Error: ${(error as Error).message}`
      });
      toast.error('Automation failed');
      console.error('Automation error:', error);
    } finally {
      setIsExecuting(false);
      setUserPrompt('');
    }
  };

  const handleCancel = async () => {
    try {
      await window.browserAPI.cancelAutomation();
      addMessage({
        type: 'system',
        content: '🛑 Automation cancelled by user'
      });
      setIsExecuting(false);
      toast.info('Automation cancelled');
    } catch (error) {
      console.error('Failed to cancel:', error);
    }
  };

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <Circle className="w-4 h-4 text-gray-400" />;
    }
  };

  if (showSettings) {
    return (
      <div className="h-full flex flex-col p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Automation Settings
          </h3>
          <Button variant="ghost" size="sm" onClick={() => setShowSettings(false)}>
            Back
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-key">Anthropic API Key</Label>
            <Input
              id="api-key"
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-gray-500">
              Get your API key from{' '}
              <a
                href="https://console.anthropic.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                console.anthropic.com
              </a>
            </p>
          </div>

          <Button onClick={saveApiKey} className="w-full">
            Save API Key
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with Recording Selector */}
        <div className="flex items-center justify-between px-3 py-2">
          <Select
            value={selectedSession}
            onValueChange={setSelectedSession}
            disabled={isExecuting}
          >
            <SelectTrigger className="w-[90%] h-8 text-xs">
              <SelectValue placeholder="Select a recording..." />
            </SelectTrigger>
            <SelectContent>
              {sessions.length === 0 ? (
                <div className="p-2 text-xs text-gray-500 text-center">
                  No recordings available
                </div>
              ) : (
                sessions.map((session) => (
                  <SelectItem key={session.id} value={session.id}>
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs">{session.name}</span>
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">
                        {session.actionCount}
                      </Badge>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(true)}
            title="Settings"
            className="h-7 w-7"
          >
            <Settings className="w-3.5 h-3.5" />
          </Button>
        </div>


      {/* Chat Messages */}
      <ScrollArea className="flex-1 px-3 py-2">
        <div ref={scrollRef} className="space-y-2">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <Bot className="w-12 h-12 mx-auto text-gray-600 mb-3" />
              <h3 className="text-lg font-semibold text-gray-300 mb-2">
                AI Browser Automation
              </h3>
              <p className="text-sm text-gray-500 max-w-sm mx-auto">
                Select a recorded session and describe what you want to automate.
                The AI will generate and execute the automation plan.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <Item
                className={`max-w-[85%] ${
                  message.type === 'user'
                    ? 'bg-blue-600 text-white'
                    : message.type === 'system'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-800'
                }`}
              >
                <p className="text-xs whitespace-pre-wrap">{message.content}</p>
              </Item>
            </div>
          ))}

          {/* Current Execution Steps */}
          {isExecuting && currentSteps.length > 0 && (
            <Item className="bg-gray-50 dark:bg-gray-900">
                <div className="flex items-center gap-2 mb-3">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm font-medium">Executing Steps...</span>
                </div>
                {currentSteps.map((step, index) => (
                  <div
                    key={step.id}
                    className="flex items-start gap-3 p-2 rounded bg-white dark:bg-gray-800"
                  >
                    <div className="mt-0.5">{getStepIcon(step.status)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500">
                          Step {index + 1}
                        </span>
                        <Badge
                          variant={step.status === 'completed' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {step.status}
                        </Badge>
                      </div>
                      <p className="text-sm mt-1">{step.description}</p>
                      {step.error && (
                        <p className="text-xs text-red-500 mt-1">{step.error}</p>
                      )}
                    </div>
                  </div>
                ))}
            </Item>
          )}
        </div>
      </ScrollArea>

      {/* Input Area - Sticky at bottom */}
      <div className="border-t bg-background">
        <div className="px-3 py-2 space-y-2">
          {/* Prompt Input */}
          <Textarea
            placeholder="E.g., Create a repository called 'my-awesome-project'"
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            disabled={isExecuting}
            className="min-h-[50px] resize-none text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleExecute();
              }
            }}
          />

          {/* Action Buttons */}
          <div className="flex gap-2">
            {!isExecuting ? (
              <Button
                onClick={handleExecute}
                disabled={!userPrompt.trim() || !selectedSession}
                className="flex-1 h-8 text-xs"
              >
                <Play className="w-3.5 h-3.5 mr-1.5" />
                Execute
              </Button>
            ) : (
              <Button onClick={handleCancel} variant="destructive" className="flex-1 h-8 text-xs">
                <StopCircle className="w-3.5 h-3.5 mr-1.5" />
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}