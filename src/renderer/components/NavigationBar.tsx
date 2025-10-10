import { useState, useEffect, KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, X, Lock, Globe, PanelRightOpen, PanelRightClose, Circle, Square, Settings, Clock, User } from 'lucide-react';
import type { TabInfo } from '../../preload';
import { cn } from '../lib/utils';
import { useSidebarStore } from '../store/useSidebarStore';
import { useRecording } from '../hooks/useRecording';
import { Input } from '../ui/input';
import ThemeToggle from '../ui/theme-toggle';
import { Button } from '../ui/button';

interface NavigationBarProps {
  activeTab: TabInfo | null;
  onNavigate: (url: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onStop: () => void;
}

export function NavigationBar({
  activeTab,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onStop,
}: NavigationBarProps) {
  const [urlInput, setUrlInput] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const { isVisible: isSidebarVisible, toggleSidebar } = useSidebarStore();
  const { isRecording, toggleRecording } = useRecording();

  // Update URL input when active tab changes
  useEffect(() => {
    if (activeTab && !isEditing) {
      setUrlInput(activeTab.url);
    }
  }, [activeTab, isEditing]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onNavigate(urlInput);
      setIsEditing(false);
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setUrlInput(activeTab?.url || '');
      setIsEditing(false);
      (e.target as HTMLInputElement).blur();
    }
  };

  const isSecure = activeTab?.url.startsWith('https://');

  return (
    <div className="flex items-center h-12 px-3 gap-2">
      {/* Navigation Buttons */}
      <div className="flex items-center gap-1">
        <NavButton
          onClick={onBack}
          disabled={!activeTab?.canGoBack}
          title="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </NavButton>

        <NavButton
          onClick={onForward}
          disabled={!activeTab?.canGoForward}
          title="Forward"
        >
          <ArrowRight className="w-4 h-4" />
        </NavButton>

        <NavButton
          onClick={activeTab?.isLoading ? onStop : onReload}
          disabled={!activeTab}
          title={activeTab?.isLoading ? 'Stop' : 'Reload'}
        >
          {activeTab?.isLoading ? (
            <X className="w-4 h-4" />
          ) : (
            <RotateCw className="w-4 h-4" />
          )}
        </NavButton>
      </div>

      {/* Address Bar */}
      <div className="flex-1 flex items-center rounded-lg pl-3 h-9 gap-2">
        {/* Security Icon */}
        <div className="flex-shrink-0">
          {isSecure ? (
            <Lock className="w-4 h-4 text-green-500" />
          ) : (
            <Globe className="w-4 h-4 text-gray-500" />
          )}
        </div>

        {/* URL Input */}
        <Input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={() => setIsEditing(false)}
          onKeyDown={handleKeyDown}
          placeholder="Search or enter address"
          className="rounded-full  border-primary"
        />
      </div>

      {/* Record Button */}
      <Button variant="outline" size="icon" onClick={toggleRecording} title={isRecording ? 'Stop Recording' : 'Start Recording'}>
        {isRecording ? (
          <Square className="w-4 h-4 fill-current" />
        ) : (
          <Circle className="w-4 h-4 bg-red-500 rounded-full hover:bg-red-700" />
        )}
      </Button>

      {/* History Button */}
      <Button variant="outline" size="icon" onClick={() => onNavigate('browzer://history')} title="History">
        <Clock className="w-4 h-4" />
      </Button>

      {/* Profile Button */}
      <Button variant="outline" size="icon" onClick={() => onNavigate('browzer://profile')} title="Profile">
        <User className="w-4 h-4" />
      </Button>

      {/* Settings Button */}
      <Button variant="outline" size="icon" onClick={() => onNavigate('browzer://settings')} title="Settings">
        <Settings className="w-4 h-4" />
      </Button>

      <ThemeToggle />

      {/* Sidebar Toggle Button */}
      <Button variant="outline" size="icon" onClick={toggleSidebar} title={isSidebarVisible ? 'Hide Agent Panel' : 'Show Agent Panel'}>
        {isSidebarVisible ? (
          <PanelRightClose className="w-4 h-4" />
        ) : (
          <PanelRightOpen className="w-4 h-4" />
        )}
      </Button>
    </div>
  );
}

interface NavButtonProps {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function NavButton({ onClick, disabled, title, children }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-200 transition-colors',
        disabled && 'opacity-30 cursor-not-allowed hover:bg-transparent'
      )}
    >
      {children}
    </button>
  );
}
