import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/renderer/ui/card';
import { Label } from '@/renderer/ui/label';
import { Switch } from '@/renderer/ui/switch';
import { Button } from '@/renderer/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/renderer/ui/select';
import { Slider } from '@/renderer/ui/slider';
import { RotateCcw, Moon, Sun, Monitor } from 'lucide-react';
import type { AppSettings } from '@/preload';
import { useTheme } from '@/renderer/ui/theme-provider';

interface AppearanceSettingsProps {
  settings: AppSettings['appearance'];
  onUpdate: (key: string, value: string | number | boolean) => void;
  onReset: () => void;
}

export function AppearanceSettings({ settings, onUpdate, onReset }: AppearanceSettingsProps) {
  const { setTheme } = useTheme();

  const handleThemeChange = (theme: 'light' | 'dark' | 'system') => {
    onUpdate('theme', theme);
    setTheme(theme);
  };

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <div>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Customize the look and feel of your browser</CardDescription>
          </div>
          <Button variant='ghost' size='sm' onClick={onReset}>
            <RotateCcw className='w-4 h-4 mr-2' />
            Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent className='space-y-6'>
        {/* Theme */}
        <div className='space-y-2'>
          <Label>Theme</Label>
          <Select value={settings.theme} onValueChange={handleThemeChange}>
            <SelectTrigger>
              <SelectValue placeholder='Select theme' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='light'>
                <div className='flex items-center gap-2'>
                  <Sun className='w-4 h-4' />
                  Light
                </div>
              </SelectItem>
              <SelectItem value='dark'>
                <div className='flex items-center gap-2'>
                  <Moon className='w-4 h-4' />
                  Dark
                </div>
              </SelectItem>
              <SelectItem value='system'>
                <div className='flex items-center gap-2'>
                  <Monitor className='w-4 h-4' />
                  System
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <p className='text-xs text-muted-foreground'>
            Choose your preferred color scheme
          </p>
        </div>

        {/* Font Size */}
        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <Label>Font Size</Label>
            <span className='text-sm text-muted-foreground'>{settings.fontSize}px</span>
          </div>
          <Slider
            value={[settings.fontSize]}
            onValueChange={([value]) => onUpdate('fontSize', value)}
            min={12}
            max={24}
            step={1}
            className='w-full'
          />
          <p className='text-xs text-muted-foreground'>
            Adjust the default font size for web pages
          </p>
        </div>

        {/* Show Bookmarks Bar */}
        <div className='flex items-center justify-between'>
          <div className='space-y-0.5'>
            <Label htmlFor='bookmarksBar'>Show bookmarks bar</Label>
            <p className='text-xs text-muted-foreground'>
              Display the bookmarks bar below the address bar
            </p>
          </div>
          <Switch
            id='bookmarksBar'
            checked={settings.showBookmarksBar}
            onCheckedChange={(checked) => onUpdate('showBookmarksBar', checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
