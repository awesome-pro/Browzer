import { useEffect } from 'react';
import { Bot, Video } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/renderer/ui/tabs';
import { RecordingView } from './RecordingView';
import { useSidebarStore } from '@/renderer/store/useSidebarStore';
import { AgentView } from './agent';

/**
 * Sidebar - Agent UI with tabbed interface
 * 
 * Features:
 * - Agent tab: AI chat and automation
 * - Recording tab: Live recording and session history
 */
export function Sidebar() {
  const { activeTab, setActiveTab } = useSidebarStore();
  
  // Listen for recording events to auto-switch tabs
  useEffect(() => {
    const unsubStart = window.browserAPI.onRecordingStarted(() => {
      setActiveTab('recording');
    });
    
     const unsubStop = window.browserAPI.onRecordingStopped(() => {
      setActiveTab('recording');
    });

    return () => {
      unsubStart();
      unsubStop();
    };
  }, [setActiveTab]);

  return (
     <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
        <TabsList className="w-full p-0 h-auto flex-shrink-0">
          <TabsTrigger 
            value="agent"
            className="text-xs"
          >
            <Bot className="w-3.5 h-3.5 mr-1.5" />
            Automation
          </TabsTrigger>
          <TabsTrigger 
            value="recording"
            className="text-xs"
          >
            <Video className="w-3.5 h-3.5 mr-1.5" />
            Recording
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agent" className="flex-1 m-0 overflow-hidden">
           <AgentView />
        </TabsContent>

        <TabsContent value="recording" className="flex-1 m-0 overflow-hidden">
          <RecordingView />
        </TabsContent>
      </Tabs>
  );
}
