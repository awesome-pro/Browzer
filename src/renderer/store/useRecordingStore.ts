import { create } from 'zustand';
import { RecordedAction, RecordingSession, TabContext } from '../../shared/types';

interface RecordingData {
  actions: RecordedAction[];
  duration: number;
  startUrl: string;
  videoPath?: string;
  tabs?: TabContext[];
}

interface RecordingStore {
  // Recording state
  isRecording: boolean;
  actions: RecordedAction[];
  recordingData: RecordingData | null;
  showSaveForm: boolean;
  
  // Sessions
  sessions: RecordingSession[];
  
  // Actions
  setIsRecording: (isRecording: boolean) => void;
  addAction: (action: RecordedAction) => void;
  setActions: (actions: RecordedAction[]) => void;
  clearActions: () => void;
  setRecordingData: (data: RecordingData | null) => void;
  setShowSaveForm: (show: boolean) => void;
  setSessions: (sessions: RecordingSession[]) => void;
  
  // Initialize from IPC
  initializeFromIPC: () => Promise<void>;
}

export const useRecordingStore = create<RecordingStore>((set) => ({
  // Initial state
  isRecording: false,
  actions: [],
  recordingData: null,
  showSaveForm: false,
  sessions: [],
  
  // Actions
  setIsRecording: (isRecording) => set({ isRecording }),
  
  addAction: (action) => set((state) => {
    // Check for duplicates based on timestamp and type
    const isDuplicate = state.actions.some(
      existing => existing.timestamp === action.timestamp && existing.type === action.type
    );
    
    if (isDuplicate) {
      console.warn('⚠️ Duplicate action detected, skipping:', action.type, action.timestamp);
      return state;
    }
    
    // Add new action and keep sorted by timestamp (newest first)
    const newActions = [action, ...state.actions].sort((a, b) => b.timestamp - a.timestamp);
    return { actions: newActions };
  }),
  
  setActions: (actions) => set({ actions }),
  
  clearActions: () => set({ actions: [], recordingData: null, showSaveForm: false }),
  
  setRecordingData: (data) => set({ recordingData: data }),
  
  setShowSaveForm: (show) => set({ showSaveForm: show }),
  
  setSessions: (sessions) => set({ sessions }),
  
  // Initialize from IPC
  initializeFromIPC: async () => {
    try {
      const isRecording = await window.browserAPI.isRecording();
      const sessions = await window.browserAPI.getAllRecordings();
      
      // If recording is active, get current actions
      let actions: RecordedAction[] = [];
      if (isRecording) {
        actions = await window.browserAPI.getRecordedActions();
      }
      
      set({ 
        isRecording, 
        sessions,
        actions 
      });
    } catch (error) {
      console.error('Failed to initialize recording store:', error);
    }
  }
}));

// Track if listeners are already set up to prevent duplicates
let listenersSetup = false;
let unsubscribeFunctions: (() => void)[] = [];

// Setup IPC event listeners (call this once in App.tsx or main component)
export function setupRecordingListeners() {
  // Prevent duplicate listener setup
  if (listenersSetup) {
    console.log('⚠️ Recording listeners already set up, skipping');
    return;
  }
  
  const store = useRecordingStore.getState();
  
  console.log('🔧 Setting up recording listeners (one-time)');
  
  // Recording started
  const unsubStart = window.browserAPI.onRecordingStarted(() => {
    console.log('📡 Recording started event received');
    useRecordingStore.setState({
      isRecording: true,
      actions: [],
      showSaveForm: false,
      recordingData: null
    });
  });
  unsubscribeFunctions.push(unsubStart);
  
  // Recording stopped
  const unsubStop = window.browserAPI.onRecordingStopped((data) => {
    console.log('📡 Recording stopped event received:', data);
    useRecordingStore.setState({
      isRecording: false,
      recordingData: data,
      showSaveForm: data.actions && data.actions.length > 0
    });
  });
  unsubscribeFunctions.push(unsubStop);
  
  // Action captured
  const unsubAction = window.browserAPI.onRecordingAction((action: RecordedAction) => {
    console.log('📡 Action captured:', action.type, action.tabId);
    store.addAction(action);
  });
  unsubscribeFunctions.push(unsubAction);
  
  // Recording saved
  const unsubSaved = window.browserAPI.onRecordingSaved(async () => {
    console.log('📡 Recording saved event received');
    const sessions = await window.browserAPI.getAllRecordings();
    useRecordingStore.setState({
      actions: [],
      recordingData: null,
      showSaveForm: false,
      sessions
    });
  });
  unsubscribeFunctions.push(unsubSaved);
  
  // Recording deleted
  const unsubDeleted = window.browserAPI.onRecordingDeleted(async () => {
    console.log('📡 Recording deleted event received');
    const sessions = await window.browserAPI.getAllRecordings();
    useRecordingStore.setState({
      sessions
    });
  });
  unsubscribeFunctions.push(unsubDeleted);
  
  listenersSetup = true;
}

// Cleanup function (call on app unmount if needed)
export function cleanupRecordingListeners() {
  unsubscribeFunctions.forEach(unsub => unsub());
  unsubscribeFunctions = [];
  listenersSetup = false;
}
