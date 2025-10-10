import { useEffect, useState } from 'react';
import { Loader2Icon } from 'lucide-react';
import type { AppSettings } from '../../preload';
import ThemeToggle from '../ui/theme-toggle';

export function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <main className='w-full h-full flex items-center justify-center'>
        <Loader2Icon className="animate-spin w-4 h-4" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex items-center justify-center h-screen bg-gray-50">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Settings</h2>
        <p className="text-gray-600">{error}</p>
      </main>
    );
  }

  return (
    <main className='flex items-center justify-center'>
      <h1>Settings</h1>
      <ThemeToggle />
    </main>
  );
}
