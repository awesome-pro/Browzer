import { useState, useEffect, useRef } from 'react';
import { useAgent } from '../hooks/useAgent';
import { RecordingSession } from '@/shared/types';
import { 
  Bot, 
  Send, 
  Loader2, 
  Trash2, 
  Settings, 
  CheckCircle2, 
  XCircle, 
  Clock,
  Video,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

export default function AgentView() {
  const {
    isInitialized,
    isExecuting,
    messages,
    agentState,
    initializeAgent,
    executeAutomation,
    resetAgent,
    clearMessages
  } = useAgent();

  const [userInput, setUserInput] = useState('');
  const [recordings, setRecordings] = useState<RecordingSession[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<RecordingSession | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [provider, setProvider] = useState<'anthropic' | 'google'>('google'); // Default to Google now
  const [apiKey, setApiKey] = useState('');
  const [constraints, setConstraints] = useState<string[]>(['']);
  const [expectedOutcome, setExpectedOutcome] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load recordings on mount
  useEffect(() => {
    loadRecordings();
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load API key and provider from localStorage
  useEffect(() => {
    const savedProvider = localStorage.getItem('ai_provider') as 'anthropic' | 'google' | null;
    const savedKey = localStorage.getItem(savedProvider === 'anthropic' ? 'anthropic_api_key' : 'google_api_key');
    
    if (savedProvider) {
      setProvider(savedProvider);
    }
    
    if (savedKey) {
      setApiKey(savedKey);
      // Auto-initialize if key exists
      initializeAgent(savedKey, { provider: savedProvider || 'google' });
    }
  }, [initializeAgent]);

  const loadRecordings = async () => {
    try {
      const data = await window.browserAPI.getAllRecordings();
      setRecordings(data.sort((a, b) => b.createdAt - a.createdAt));
    } catch (error) {
      console.error('Failed to load recordings:', error);
      toast.error('Failed to load recordings');
    }
  };

  const handleInitialize = async () => {
    if (!apiKey.trim()) {
      toast.error(`Please enter your ${provider === 'anthropic' ? 'Anthropic' : 'Google'} API key`);
      return;
    }

    // Save to localStorage
    localStorage.setItem('ai_provider', provider);
    localStorage.setItem(provider === 'anthropic' ? 'anthropic_api_key' : 'google_api_key', apiKey);

    const config = provider === 'google' ? {
      provider: 'google' as const,
      model: 'gemini-2.5-pro-latest',
      maxIterations: 15,
      maxRetries: 3,
      temperature: 0.7
    } : {
      provider: 'anthropic' as const,
      model: 'claude-sonnet-4-20250514',
      maxIterations: 15,
      maxRetries: 3,
      temperature: 0.7
    };

    const success = await initializeAgent(apiKey, config);

    if (success) {
      setIsSettingsOpen(false);
    }
  };

  const handleSubmit = async () => {
    if (!userInput.trim()) {
      toast.error('Please enter your automation intent');
      return;
    }

    if (!selectedRecording) {
      toast.error('Please select a recorded session first');
      return;
    }

    if (!isInitialized) {
      toast.error('Please initialize the agent first');
      setIsSettingsOpen(true);
      return;
    }

    // Prepare request
    const request = {
      userIntent: userInput.trim(),
      recordedSession: selectedRecording,
      constraints: constraints.filter(c => c.trim()),
      expectedOutcome: expectedOutcome.trim() || undefined
    };

    // Clear input
    setUserInput('');
    setExpectedOutcome('');

    // Execute automation
    await executeAutomation(request);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isExecuting) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const addConstraint = () => {
    setConstraints([...constraints, '']);
  };

  const updateConstraint = (index: number, value: string) => {
    const updated = [...constraints];
    updated[index] = value;
    setConstraints(updated);
  };

  const removeConstraint = (index: number) => {
    setConstraints(constraints.filter((_, i) => i !== index));
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!isInitialized) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 p-8">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8">
          <div className="flex items-center justify-center mb-6">
            <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-full">
              <Bot className="w-12 h-12 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-center mb-2 text-gray-900 dark:text-white">
            Initialize Agent
          </h2>
          <p className="text-center text-sm text-gray-600 dark:text-gray-400 mb-6">
            Select your AI provider and enter API key to start automation
          </p>

          <div className="space-y-4">
            <div>
              <Label htmlFor="provider">AI Provider</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as 'anthropic' | 'google')}>
                <SelectTrigger id="provider" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="google">Google Gemini 2.5 Pro (Recommended)</SelectItem>
                  <SelectItem value="anthropic">Anthropic Claude Sonnet 4</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="api-key">
                {provider === 'google' ? 'Google AI' : 'Anthropic'} API Key
              </Label>
              <Input
                id="api-key"
                type="password"
                placeholder={provider === 'google' ? 'AIza...' : 'sk-ant-...'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleInitialize()}
                className="mt-1.5"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Your API key is stored locally and never sent to our servers
              </p>
            </div>

            <Button 
              onClick={handleInitialize} 
              className="w-full"
              disabled={!apiKey.trim()}
            >
              <Bot className="w-4 h-4 mr-2" />
              Initialize Agent
            </Button>
          </div>

          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-900 dark:text-blue-100">
              <strong>How it works:</strong> The agent uses {provider === 'google' ? 'Gemini 2.5 Pro' : 'Claude Sonnet 4.5'} to understand your automation intent, 
              learn from recorded sessions, and execute browser actions intelligently with self-debugging capabilities.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                AI Agent
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isExecuting ? 'Executing automation...' : 'Ready to automate'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {agentState && (
              <Badge variant="outline" className="text-xs">
                Step {agentState.currentStep}/{agentState.plan?.steps?.length || 0}
              </Badge>
            )}
            <Popover open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="ghost">
                  <Settings className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-96" align="center">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-sm mb-1">Agent Settings</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Configure your AI agent provider and credentials
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="settings-provider" className="text-xs">AI Provider</Label>
                      <Select value={provider} onValueChange={(v) => setProvider(v as 'anthropic' | 'google')}>
                        <SelectTrigger id="settings-provider" className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="google">Google Gemini 2.5 Pro</SelectItem>
                          <SelectItem value="anthropic">Anthropic Claude Sonnet 4</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="settings-api-key" className="text-xs">API Key</Label>
                      <Input
                        id="settings-api-key"
                        // type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={provider === 'google' ? 'AIza...' : 'sk-ant-...'}
                        className="mt-1"
                      />
                    </div>

                    <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                      <h5 className="text-xs font-medium mb-2">Current Configuration</h5>
                      <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                        <p>• Model: {provider === 'google' ? 'Gemini 2.5 Pro' : 'Claude Sonnet 4'}</p>
                        <p>• Max Iterations: 15</p>
                        <p>• Max Retries: 3</p>
                        <p>• Temperature: 0.7</p>
                      </div>
                    </div>

                    <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                      <p className="text-xs text-yellow-900 dark:text-yellow-100">
                        <strong>Note:</strong> Changing settings will reinitialize the agent session.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      onClick={() => setIsSettingsOpen(false)}
                      className="flex-1"
                      size="sm"
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleInitialize}
                      className="flex-1"
                      size="sm"
                    >
                      Save & Reinitialize
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearMessages}
              disabled={isExecuting}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Agent State Indicator */}
        {agentState && isExecuting && (
          <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span className="text-blue-900 dark:text-blue-100">
                {agentState.isReplanning 
                  ? 'Replanning strategy...' 
                  : `Executing step ${agentState.currentStep + 1}...`}
              </span>
            </div>
            {agentState.plan && agentState.plan.steps && agentState.plan.steps[agentState.currentStep] && (
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1 ml-6">
                {agentState.plan.steps[agentState.currentStep].reasoning}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 px-6 py-4">
        <div className="space-y-4 pb-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <Bot className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Ready to automate
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                Select a recorded session below and describe what you want to automate. 
                The agent will learn from your recording and adapt to the current page.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${
                message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              {/* Avatar */}
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : message.role === 'system'
                    ? 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                    : 'bg-purple-600 text-white'
                }`}
              >
                {message.role === 'user' ? (
                  <span className="text-sm font-semibold">U</span>
                ) : message.role === 'system' ? (
                  <AlertCircle className="w-4 h-4" />
                ) : (
                  <Bot className="w-5 h-5" />
                )}
              </div>

              {/* Message Content */}
              <div
                className={`flex-1 max-w-[80%] ${
                  message.role === 'user' ? 'text-right' : 'text-left'
                }`}
              >
                <div
                  className={`inline-block rounded-2xl px-4 py-2.5 ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : message.role === 'system'
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                      : 'bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  
                  {/* Metadata */}
                  {message.metadata && (
                    <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600 space-y-1">
                      {message.metadata.hasRecordedSession && (
                        <div className="flex items-center gap-1.5 text-xs opacity-80">
                          <Video className="w-3 h-3" />
                          <span>{message.metadata.sessionName}</span>
                        </div>
                      )}
                      {message.metadata.success !== undefined && (
                        <div className="flex items-center gap-1.5 text-xs">
                          {message.metadata.success ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-green-500" />
                              <span>Success</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3 text-red-500" />
                              <span>Failed</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 px-2">
                  {formatTimestamp(message.timestamp)}
                </p>
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="flex-shrink-0 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
        {/* Recording Session Selector - MANDATORY */}
        <div className="space-y-2">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Video className="w-3.5 h-3.5" />
            Recorded Session <span className="text-red-500">*</span>
          </Label>
          <div className="flex gap-2">
            <Select
              value={selectedRecording?.id || ''}
              onValueChange={(value) => {
                const recording = recordings.find(r => r.id === value);
                setSelectedRecording(recording || null);
              }}
              disabled={isExecuting}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select a recording session to learn from..." />
              </SelectTrigger>
              <SelectContent>
                {recordings.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500">
                    No recordings available. Create one first.
                  </div>
                ) : (
                  recordings.map((recording) => (
                    <SelectItem key={recording.id} value={recording.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{recording.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {recording.actionCount} actions
                        </Badge>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button
              size="icon"
              variant="outline"
              onClick={loadRecordings}
              disabled={isExecuting}
              title="Refresh recordings"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
          {selectedRecording && (
            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              {(selectedRecording.duration / 1000).toFixed(1)}s • {selectedRecording.actionCount} actions
              {selectedRecording.videoPath && ' • With video'}
            </p>
          )}
        </div>

        {/* User Intent Input */}
        <div className="space-y-2">
          <Label htmlFor="user-intent" className="text-xs font-medium">
            Your Automation Intent
          </Label>
          <Textarea
            id="user-intent"
            ref={textareaRef}
            placeholder="Describe what you want to automate... (e.g., 'Fill out the contact form and submit it with test data')"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={handleKeyPress}
            disabled={isExecuting}
            className="min-h-[80px] resize-none"
          />
        </div>

        {/* Optional: Constraints */}
        {constraints.some(c => c.trim()) && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Constraints (Optional)</Label>
            {constraints.map((constraint, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder="e.g., Use email: test@example.com"
                  value={constraint}
                  onChange={(e) => updateConstraint(index, e.target.value)}
                  disabled={isExecuting}
                  className="text-sm"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeConstraint(index)}
                  disabled={isExecuting}
                >
                  <XCircle className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleSubmit}
            disabled={!userInput.trim() || !selectedRecording || isExecuting}
            className="flex-1"
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Executing...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Execute Automation
              </>
            )}
          </Button>
          
          {!constraints.some(c => c.trim()) && (
            <Button
              variant="outline"
              onClick={addConstraint}
              disabled={isExecuting}
            >
              Add Constraint
            </Button>
          )}
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          The agent will use {provider === 'google' ? 'Gemini 2.5 Pro' : 'Claude Sonnet 4.5'} to plan and execute your automation
        </p>
      </div>
    </div>
  );
}
