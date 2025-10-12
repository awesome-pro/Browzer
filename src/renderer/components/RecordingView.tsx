import { useState, useEffect } from 'react';
import { Circle, Clock } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { LiveRecordingView, SessionsListView } from './recording';
import { toast } from 'sonner';
import { useRecordingStore } from '../store/useRecordingStore';

export function RecordingView() {
  const [recordingTab, setRecordingTab] = useState('live');
  
  // Get state from global store
  const {
    actions,
    isRecording,
    sessions,
    showSaveForm,
    recordingData,
    clearActions,
    setSessions,
    initializeFromIPC
  } = useRecordingStore();

  useEffect(() => {
    // Initialize state from IPC on mount
    initializeFromIPC();
  }, [initializeFromIPC]);

  const loadSessions = async () => {
    const allSessions = await window.browserAPI.getAllRecordings();
    setSessions(allSessions);
  };

  const handleSaveRecording = async (name: string, description: string) => {
    if (recordingData) {
      await window.browserAPI.saveRecording(name, description, recordingData.actions);
      setRecordingTab('sessions');
    }
  };

  const handleDiscardRecording = () => {
    clearActions();
  };

  const handleDeleteSession = async (id: string) => {
    const confirmed = confirm('Are you sure you want to delete this recording? This action cannot be undone.');
    if (confirmed) {
      await window.browserAPI.deleteRecording(id);
      toast.success('Recording deleted successfully');
    }
  };

  return (
    <Tabs value={recordingTab} onValueChange={setRecordingTab}>
      <TabsList className="w-full rounded-none border-b p-0 h-auto">
        <TabsTrigger 
          value="live" 
        >
          <Circle className="w-3 h-3 mr-1.5" />
          Live
        </TabsTrigger>
        <TabsTrigger 
          value="sessions"
        >
          <Clock className="w-3 h-3 mr-1.5" />
          Sessions
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

      <TabsContent value="sessions" className="flex-1 m-0 p-0">
        <SessionsListView
          sessions={sessions} 
          onRefresh={loadSessions}
          onDelete={handleDeleteSession}
        />
      </TabsContent>
    </Tabs>
  );
}
