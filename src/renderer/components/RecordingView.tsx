import { useState, useEffect } from 'react';
import { Circle, SparkleIcon } from 'lucide-react';
import { RecordedAction } from '@/shared/types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/renderer/ui/tabs';
import { LiveRecordingView } from './recording';
import { cn } from '@/renderer/lib/utils';
import { AgentView } from './agent';

export function RecordingView() {
  const [recordingTab, setRecordingTab] = useState('live');
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [recordingData, setRecordingData] = useState<{ 
    actions: RecordedAction[]; 
    duration: number; 
    startUrl: string 
  } | null>(null);

  useEffect(() => {
    // Initialize state
    window.browserAPI.isRecording().then(setIsRecording);

    // Setup event listeners
    const unsubStart = window.browserAPI.onRecordingStarted(() => {
      setIsRecording(true);
      setActions([]);
      setShowSaveForm(false);
      setRecordingTab('live');
    });

    const unsubStop = window.browserAPI.onRecordingStopped((data) => {
      setIsRecording(false);
      setRecordingData(data);
      if (data.actions && data.actions.length > 0) {
        setShowSaveForm(true);
      }
    });

    const unsubAction = window.browserAPI.onRecordingAction((action: RecordedAction) => {
      setActions(prev => {
        // Check for duplicates based on timestamp and type
        const isDuplicate = prev.some(a => 
          a.timestamp === action.timestamp && 
          a.type === action.type &&
          JSON.stringify(a.target) === JSON.stringify(action.target)
        );
        
        if (isDuplicate) {
          console.warn('Duplicate action detected, skipping:', action);
          return prev;
        }
        
        // Add new action and sort by timestamp (newest first)
        const updated = [...prev, action];
        return updated.sort((a, b) => b.timestamp - a.timestamp);
      });
    });

    const unsubSaved = window.browserAPI.onRecordingSaved(() => {
      setActions([]);
    });

    const unsubDeleted = window.browserAPI.onRecordingDeleted(() => {
      setActions([]);
    });
    
    return () => {
      unsubStart();
      unsubStop();
      unsubAction();
      unsubSaved();
      unsubDeleted();
    };
  }, []);

  const handleSaveRecording = async (name: string, description: string) => {
    if (recordingData) {
      await window.browserAPI.saveRecording(name, description, recordingData.actions);
      setShowSaveForm(false);
      setRecordingData(null);
      setActions([]);
      setRecordingTab('automation');
    }
  };

  const handleDiscardRecording = () => {
    setShowSaveForm(false);
    setRecordingData(null);
    setActions([]);
  };


  return (
    <Tabs value={recordingTab} onValueChange={setRecordingTab} className='h-full'>
      <TabsList className="w-full text-xs">
        <TabsTrigger 
          value="live" 
        >
          <Circle className={cn('size-3 rounded-full bg-red-300', isRecording && 'bg-red-600 animate-pulse')} />
          Live
        </TabsTrigger>
         <TabsTrigger 
          value="automation" 
        >
          <SparkleIcon className='size-3 text-primary' />
          Automation
        </TabsTrigger>
      </TabsList>

      <TabsContent value="live">
        <LiveRecordingView 
          actions={actions} 
          isRecording={isRecording}
          showSaveForm={showSaveForm}
          recordingData={recordingData}
          onSave={handleSaveRecording}
          onDiscard={handleDiscardRecording}
        />
      </TabsContent>

      <TabsContent value="automation">
        <AgentView />
      </TabsContent>
    </Tabs>
  );
}
