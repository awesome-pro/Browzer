import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/renderer/ui/card';
import { Label } from '@/renderer/ui/label';
import { Switch } from '@/renderer/ui/switch';
import { Button } from '@/renderer/ui/button';
import { RotateCcw } from 'lucide-react';
import type { AppSettings } from '@/preload';

interface PrivacySettingsProps {
  settings: AppSettings['privacy'];
  onUpdate: (key: string, value: boolean) => void;
  onReset: () => void;
}

export function PrivacySettings({ settings, onUpdate, onReset }: PrivacySettingsProps) {
  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <div>
            <CardTitle>Privacy & Security</CardTitle>
            <CardDescription>Control your privacy and security preferences</CardDescription>
          </div>
          <Button variant='ghost' size='sm' onClick={onReset}>
            <RotateCcw className='w-4 h-4 mr-2' />
            Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent className='space-y-6'>
        {/* Clear Cache on Exit */}
        <div className='flex items-center justify-between'>
          <div className='space-y-0.5'>
            <Label htmlFor='clearCache'>Clear cache on exit</Label>
            <p className='text-xs text-muted-foreground'>
              Automatically clear browsing cache when closing the browser
            </p>
          </div>
          <Switch
            id='clearCache'
            checked={settings.clearCacheOnExit}
            onCheckedChange={(checked) => onUpdate('clearCacheOnExit', checked)}
          />
        </div>

        {/* Do Not Track */}
        <div className='flex items-center justify-between'>
          <div className='space-y-0.5'>
            <Label htmlFor='doNotTrack'>Send "Do Not Track" request</Label>
            <p className='text-xs text-muted-foreground'>
              Tell websites you don't want to be tracked
            </p>
          </div>
          <Switch
            id='doNotTrack'
            checked={settings.doNotTrack}
            onCheckedChange={(checked) => onUpdate('doNotTrack', checked)}
          />
        </div>

        {/* Block Third-Party Cookies */}
        <div className='flex items-center justify-between'>
          <div className='space-y-0.5'>
            <Label htmlFor='blockCookies'>Block third-party cookies</Label>
            <p className='text-xs text-muted-foreground'>
              Prevent third-party sites from setting cookies
            </p>
          </div>
          <Switch
            id='blockCookies'
            checked={settings.blockThirdPartyCookies}
            onCheckedChange={(checked) => onUpdate('blockThirdPartyCookies', checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
