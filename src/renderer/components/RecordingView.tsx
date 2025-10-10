import { useState, useEffect } from 'react';
import { Circle, Clock } from 'lucide-react';
import { RecordedAction, RecordingSession } from '../../shared/types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { LiveRecordingView, SessionsListView } from './recording';

export function RecordingView() {
  const [recordingTab, setRecordingTab] = useState('live');
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [recordingData, setRecordingData] = useState<{ 
    actions: RecordedAction[]; 
    duration: number; 
    startUrl: string 
  } | null>(null);

  useEffect(() => {
    // Initialize state
    window.browserAPI.isRecording().then(setIsRecording);
    loadSessions();

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
      setShowSaveForm(true);
    });

    const unsubAction = window.browserAPI.onRecordingAction((action: RecordedAction) => {
      setActions(prev => [action, ...prev]);
    });

    const unsubSaved = window.browserAPI.onRecordingSaved(() => {
      loadSessions();
    });

    const unsubDeleted = window.browserAPI.onRecordingDeleted(() => {
      loadSessions();
    });

    return () => {
      unsubStart();
      unsubStop();
      unsubAction();
      unsubSaved();
      unsubDeleted();
    };
  }, []);

  const loadSessions = async () => {
    const allSessions = await window.browserAPI.getAllRecordings();
    setSessions(allSessions);
  };

  const handleSaveRecording = async (name: string, description: string) => {
    if (recordingData) {
      await window.browserAPI.saveRecording(name, description, recordingData.actions);
      setShowSaveForm(false);
      setRecordingData(null);
      setActions([]);
      setRecordingTab('sessions');
    }
  };

  const handleDiscardRecording = () => {
    setShowSaveForm(false);
    setRecordingData(null);
    setActions([]);
  };

  const handleDeleteSession = async (id: string) => {
    const confirmed = confirm('Are you sure you want to delete this recording? This action cannot be undone.');
    if (confirmed) {
      await window.browserAPI.deleteRecording(id);
    }
  };

  return (
    <Tabs value={recordingTab} onValueChange={setRecordingTab} className="flex-1 flex flex-col h-full">
      <TabsList className="w-full rounded-none border-b p-0 h-auto">
        <TabsTrigger 
          value="live" 
          // className="flex-1 rounded-none data-[state=active]:bg-[#1a1a1a] data-[state=active]:border-b-2 data-[state=active]:border-green-500 data-[state=active]:text-white text-gray-400 hover:text-gray-300 py-2.5 text-xs"
        >
          <Circle className="w-3 h-3 mr-1.5" />
          Live
        </TabsTrigger>
        <TabsTrigger 
          value="sessions"
          // className="flex-1 rounded-none data-[state=active]:bg-[#1a1a1a] data-[state=active]:border-b-2 data-[state=active]:border-green-500 data-[state=active]:text-white text-gray-400 hover:text-gray-300 py-2.5 text-xs"
        >
          <Clock className="w-3 h-3 mr-1.5" />
          Sessions
        </TabsTrigger>
      </TabsList>

      <TabsContent value="live" className="flex-1 m-0 p-0 overflow-hidden flex flex-col">
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
