import { useEffect, useState } from 'react';
import { Loader2Icon, Globe, Shield, Palette, Bot, Download, FileText, SettingsIcon } from 'lucide-react';
import type { AppSettings } from '../../preload';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { GeneralSettings } from '../components/settings/GeneralSettings';
import { PrivacySettings } from '../components/settings/PrivacySettings';
import { AppearanceSettings } from '../components/settings/AppearanceSettings';
import { AutomationSettings } from '../components/settings/AutomationSettings';
import { Button } from '../ui/button';
import { toast } from 'sonner';

export function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      if (!window.browserAPI) {
        console.error('browserAPI not available');
        setError('Settings API not available');
        setLoading(false);
        return;
      }
      
      const allSettings = await window.browserAPI.getAllSettings();
      console.log('Settings loaded:', allSettings);
      setSettings(allSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
      setError(error instanceof Error ? error.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSetting = async <K extends keyof AppSettings>(
    category: K,
    key: string,
    value: string | number | boolean
  ) => {
    try {
      await window.browserAPI.updateSetting(category, key, value);
      
      // Update local state
      setSettings(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          [category]: {
            ...prev[category],
            [key]: value
          }
        };
      });
      
      toast.success('Setting updated successfully');
    } catch (error) {
      console.error('Failed to update setting:', error);
      toast.error('Failed to update setting');
    }
  };

  const handleResetCategory = async (category: keyof AppSettings) => {
    try {
      await window.browserAPI.resetSettingsCategory(category);
      await loadSettings();
      toast.success(`${category} settings reset to defaults`);
    } catch (error) {
      console.error('Failed to reset category:', error);
      toast.error('Failed to reset settings');
    }
  };

  const handleExportSettings = async () => {
    try {
      const jsonString = await window.browserAPI.exportSettings();
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `browzer-settings-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Settings exported successfully');
    } catch (error) {
      console.error('Failed to export settings:', error);
      toast.error('Failed to export settings');
    }
  };

  const handleImportSettings = async () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        
        const text = await file.text();
        const success = await window.browserAPI.importSettings(text);
        
        if (success) {
          await loadSettings();
          toast.success('Settings imported successfully');
        } else {
          toast.error('Invalid settings file');
        }
      };
      input.click();
    } catch (error) {
      console.error('Failed to import settings:', error);
      toast.error('Failed to import settings');
    }
  };

  if (loading) {
    return (
      <main className='w-full h-full flex items-center justify-center bg-background'>
        <Loader2Icon className="animate-spin w-8 h-8 text-muted-foreground" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex flex-col items-center justify-center h-screen bg-background gap-4">
        <h2 className="text-xl font-semibold text-foreground">Error Loading Settings</h2>
        <p className="text-muted-foreground">{error}</p>
        <Button onClick={loadSettings}>Retry</Button>
      </main>
    );
  }

  if (!settings) return null;

  return (
    <main className='w-full h-full bg-background overflow-auto'>
      <div className='max-w-5xl mx-auto p-8'>
        {/* Header */}
        <div className='mb-8'>
          <div className='flex items-center gap-3 mb-2'>
            <SettingsIcon className='w-8 h-8 text-primary' />
            <h1 className='text-3xl font-bold text-foreground'>Settings</h1>
          </div>
          <p className='text-muted-foreground'>Manage your browser preferences and configuration</p>
        </div>

        {/* Settings Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className='w-full'>
          <TabsList className='grid w-full grid-cols-4 mb-8'>
            <TabsTrigger value='general' className='flex items-center gap-2'>
              <Globe className='w-4 h-4' />
              General
            </TabsTrigger>
            <TabsTrigger value='privacy' className='flex items-center gap-2'>
              <Shield className='w-4 h-4' />
              Privacy
            </TabsTrigger>
            <TabsTrigger value='appearance' className='flex items-center gap-2'>
              <Palette className='w-4 h-4' />
              Appearance
            </TabsTrigger>
            <TabsTrigger value='automation' className='flex items-center gap-2'>
              <Bot className='w-4 h-4' />
              Automation
            </TabsTrigger>
          </TabsList>

          <TabsContent value='general' className='space-y-4'>
            <GeneralSettings
              settings={settings.general}
              onUpdate={(key, value) => handleUpdateSetting('general', key, value)}
              onReset={() => handleResetCategory('general')}
            />
          </TabsContent>

          <TabsContent value='privacy' className='space-y-4'>
            <PrivacySettings
              settings={settings.privacy}
              onUpdate={(key, value) => handleUpdateSetting('privacy', key, value)}
              onReset={() => handleResetCategory('privacy')}
            />
          </TabsContent>

          <TabsContent value='appearance' className='space-y-4'>
            <AppearanceSettings
              settings={settings.appearance}
              onUpdate={(key, value) => handleUpdateSetting('appearance', key, value)}
              onReset={() => handleResetCategory('appearance')}
            />
          </TabsContent>

          <TabsContent value='automation' className='space-y-4'>
            <AutomationSettings
              settings={settings.automation}
              onUpdate={(key, value) => handleUpdateSetting('automation', key, value)}
              onReset={() => handleResetCategory('automation')}
            />
          </TabsContent>
        </Tabs>

        {/* Import/Export Section */}
        <Card className='mt-8'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <FileText className='w-5 h-5' />
              Import / Export
            </CardTitle>
            <CardDescription>
              Backup your settings or restore from a previous backup
            </CardDescription>
          </CardHeader>
          <CardContent className='flex gap-4'>
            <Button onClick={handleExportSettings} variant='outline'>
              <Download className='w-4 h-4 mr-2' />
              Export Settings
            </Button>
            <Button onClick={handleImportSettings} variant='outline'>
              <FileText className='w-4 h-4 mr-2' />
              Import Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
