import { useState, useCallback, useEffect } from 'react';
import { useSidebarStore } from '../store/useSidebarStore';
import { toast } from 'sonner';

/**
 * React hook for action recording
 */
export function useRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const [actions, setActions] = useState<any[]>([]);
  const { showSidebar } = useSidebarStore();

  // Check recording status on mount
  useEffect(() => {
    window.browserAPI.isRecording().then(setIsRecording);
  }, []);

  const startRecording = useCallback(async () => {
    const success = await window.browserAPI.startRecording();
    if (success) {
      setIsRecording(true);
      setActions([]);
      toast.success('Recording started successfully');
      // Auto-open sidebar when recording starts
      showSidebar();
    }
    return success;
  }, [showSidebar]);

  const stopRecording = useCallback(async () => {
    const recordedActions = await window.browserAPI.stopRecording();
    setIsRecording(false);
    setActions(recordedActions.actions);
    toast.success('Recording stopped successfully');
    return recordedActions;
  }, []);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      return await stopRecording();
    } else {
      return await startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const getActions = useCallback(async () => {
    const recordedActions = await window.browserAPI.getRecordedActions();
    setActions(recordedActions || []);
    return recordedActions;
  }, []);

  return {
    isRecording,
    actions,
    startRecording,
    stopRecording,
    toggleRecording,
    getActions,
  };
}
