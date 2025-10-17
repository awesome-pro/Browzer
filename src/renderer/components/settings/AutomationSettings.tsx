import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/renderer/ui/card';
import { Label } from '@/renderer/ui/label';
import { Input } from '@/renderer/ui/input';
import { Switch } from '@/renderer/ui/switch';
import { Button } from '@/renderer/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/renderer/ui/select';
import { RotateCcw, Eye, EyeOff, Sparkles, Key, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/renderer/ui/alert';
import { Link } from '@/renderer/components/Link';
import type { AppSettings } from '@/preload';

interface AutomationSettingsProps {
  settings: AppSettings['automation'];
  onUpdate: (key: string, value: string | boolean) => void;
  onReset: () => void;
}

export function AutomationSettings({ settings, onUpdate, onReset }: AutomationSettingsProps) {
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);


  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <div>
            <CardTitle className='flex items-center gap-2'>
              <Sparkles className='w-5 h-5' />
              Automation Settings
            </CardTitle>
            <CardDescription>Configure AI-powered browser automation</CardDescription>
          </div>
          <Button variant='ghost' size='sm' onClick={onReset}>
            <RotateCcw className='w-4 h-4 mr-2' />
            Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent className='space-y-6'>
        {/* Enable Automation */}
        <div className='flex items-center justify-between'>
          <div className='space-y-0.5'>
            <Label htmlFor='enableAutomation'>Enable Automation</Label>
            <p className='text-xs text-muted-foreground'>
              Allow AI-powered browser automation features
            </p>
          </div>
          <Switch
            id='enableAutomation'
            checked={settings.enableAutomation}
            onCheckedChange={(checked) => onUpdate('enableAutomation', checked)}
          />
        </div>

        {settings.enableAutomation && (
          <>
            {/* LLM Provider Selection */}
            <div className='space-y-2'>
              <Label>LLM Provider</Label>
              <Select 
                value={settings.llmProvider} 
                onValueChange={(value) => onUpdate('llmProvider', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select LLM provider' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='gemini'>
                      Google Gemini
                  </SelectItem>
                  <SelectItem value='claude'>
                      Anthropic Claude
                  </SelectItem>
                  <SelectItem value='openai'>
                      OpenAI GPT
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className='text-xs text-muted-foreground'>
                Choose which AI model to use for automation
              </p>
            </div>

            {/* Gemini API Key */}
            <div className='space-y-2'>
              <Label htmlFor='geminiApiKey' className='flex items-center gap-2'>
                <Key className='w-4 h-4' />
                Google Gemini API Key
              </Label>
              <div className='flex gap-2'>
                <Input
                  id='geminiApiKey'
                  type={showGeminiKey ? 'text' : 'password'}
                  value={settings.geminiApiKey}
                  onChange={(e) => onUpdate('geminiApiKey', e.target.value)}
                  placeholder='Enter your Gemini API key'
                  className='flex-1'
                />
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                >
                  {showGeminiKey ? <EyeOff className='w-4 h-4' /> : <Eye className='w-4 h-4' />}
                </Button>
              </div>
              <p className='text-xs text-muted-foreground'>
                Get your API key from{' '}
                <Link href='https://makersuite.google.com/app/apikey' target='tab'>
                  Google AI Studio
                </Link>
              </p>
            </div>

            {/* Claude API Key */}
            <div className='space-y-2'>
              <Label htmlFor='claudeApiKey' className='flex items-center gap-2'>
                <Key className='w-4 h-4' />
                Anthropic Claude API Key
              </Label>
              <div className='flex gap-2'>
                <Input
                  id='claudeApiKey'
                  type={showClaudeKey ? 'text' : 'password'}
                  value={settings.claudeApiKey}
                  onChange={(e) => onUpdate('claudeApiKey', e.target.value)}
                  placeholder='Enter your Claude API key'
                  className='flex-1'
                />
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={() => setShowClaudeKey(!showClaudeKey)}
                >
                  {showClaudeKey ? <EyeOff className='w-4 h-4' /> : <Eye className='w-4 h-4' />}
                </Button>
              </div>
              <p className='text-xs text-muted-foreground'>
                Get your API key from{' '}
                <Link href='https://console.anthropic.com/settings/keys' target='tab'>
                  Anthropic Console
                </Link>
              </p>
            </div>

            {/* OpenAI API Key */}
            <div className='space-y-2'>
              <Label htmlFor='openaiApiKey' className='flex items-center gap-2'>
                <Key className='w-4 h-4' />
                OpenAI API Key
              </Label>
              <div className='flex gap-2'>
                <Input
                  id='openaiApiKey'
                  type={showOpenAIKey ? 'text' : 'password'}
                  value={settings.openaiApiKey}
                  onChange={(e) => onUpdate('openaiApiKey', e.target.value)}
                  placeholder='Enter your OpenAI API key'
                  className='flex-1'
                />
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                >
                  {showOpenAIKey ? <EyeOff className='w-4 h-4' /> : <Eye className='w-4 h-4' />}
                </Button>
              </div>
              <p className='text-xs text-muted-foreground'>
                Get your API key from{' '}
                <Link href='https://platform.openai.com/api-keys' target='tab'>
                  OpenAI Platform
                </Link>
              </p>
            </div>

            {/* Info Alert */}
            <Alert>
              <AlertCircle className='h-4 w-4' />
              <AlertDescription>
                Your API keys are stored securely on your local machine and are never sent to any third-party servers except the respective AI providers.
              </AlertDescription>
            </Alert>
          </>
        )}
      </CardContent>
    </Card>
  );
}
