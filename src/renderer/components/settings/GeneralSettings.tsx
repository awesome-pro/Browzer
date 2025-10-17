import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/renderer/ui/card';
import { Label } from '@/renderer/ui/label';
import { Input } from '@/renderer/ui/input';
import { Button } from '@/renderer/ui/button';
import { RotateCcw } from 'lucide-react';
import type { AppSettings } from '@/preload';

interface GeneralSettingsProps {
  settings: AppSettings['general'];
  onUpdate: (key: string, value: string) => void;
  onReset: () => void;
}

export function GeneralSettings({ settings, onUpdate, onReset }: GeneralSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <div>
            <CardTitle>General Settings</CardTitle>
            <CardDescription>Configure your default browser behavior</CardDescription>
          </div>
          <Button variant='ghost' size='sm' onClick={onReset}>
            <RotateCcw className='w-4 h-4 mr-2' />
            Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent className='space-y-6'>
        {/* Default Search Engine */}
        <div className='space-y-2'>
          <Label htmlFor='searchEngine'>Default Search Engine</Label>
          <Input
            id='searchEngine'
            type='url'
            value={settings.defaultSearchEngine}
            onChange={(e) => onUpdate('defaultSearchEngine', e.target.value)}
            placeholder='https://www.google.com/search?q='
          />
          <p className='text-xs text-muted-foreground'>
            URL template for search queries (e.g., https://www.google.com/search?q=)
          </p>
        </div>

        {/* Homepage */}
        <div className='space-y-2'>
          <Label htmlFor='homepage'>Homepage</Label>
          <Input
            id='homepage'
            type='url'
            value={settings.homepage}
            onChange={(e) => onUpdate('homepage', e.target.value)}
            placeholder='https://www.google.com'
          />
          <p className='text-xs text-muted-foreground'>
            The page that opens when you start the browser
          </p>
        </div>

        {/* New Tab Page */}
        <div className='space-y-2'>
          <Label htmlFor='newTabPage'>New Tab Page</Label>
          <Input
            id='newTabPage'
            type='url'
            value={settings.newTabPage}
            onChange={(e) => onUpdate('newTabPage', e.target.value)}
            placeholder='https://www.google.com'
          />
          <p className='text-xs text-muted-foreground'>
            The page that opens when you create a new tab
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
