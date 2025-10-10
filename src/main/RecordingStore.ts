import Store from 'electron-store';
import { RecordingSession } from '../shared/types';

interface StoreSchema {
  recordings: RecordingSession[];
}

/**
 * RecordingStore - Persistent storage for recorded sessions
 * Uses electron-store for reliable cross-platform storage
 */
export class RecordingStore {
  private store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'browzer-recordings',
      defaults: {
        recordings: []
      },
      // Encrypt sensitive data
      encryptionKey: 'browzer-secure-key-2024'
    });
  }

  /**
   * Save a new recording session
   */
  saveRecording(session: RecordingSession): void {
    const recordings = this.store.get('recordings', []);
    recordings.unshift(session); // Add to beginning (newest first)
    this.store.set('recordings', recordings);
    console.log('✅ Recording saved:', session.name);
  }

  /**
   * Get all recordings
   */
  getAllRecordings(): RecordingSession[] {
    return this.store.get('recordings', []);
  }

  /**
   * Get recording by ID
   */
  getRecording(id: string): RecordingSession | undefined {
    const recordings = this.store.get('recordings', []);
    return recordings.find(r => r.id === id);
  }

  /**
   * Delete recording by ID
   */
  deleteRecording(id: string): boolean {
    const recordings = this.store.get('recordings', []);
    const filtered = recordings.filter(r => r.id !== id);
    
    if (filtered.length < recordings.length) {
      this.store.set('recordings', filtered);
      console.log('🗑️ Recording deleted:', id);
      return true;
    }
    
    return false;
  }

  /**
   * Update recording metadata
   */
  updateRecording(id: string, updates: Partial<RecordingSession>): boolean {
    const recordings = this.store.get('recordings', []);
    const index = recordings.findIndex(r => r.id === id);
    
    if (index !== -1) {
      recordings[index] = { ...recordings[index], ...updates };
      this.store.set('recordings', recordings);
      console.log('✏️ Recording updated:', id);
      return true;
    }
    
    return false;
  }

  /**
   * Clear all recordings
   */
  clearAll(): void {
    this.store.set('recordings', []);
    console.log('🗑️ All recordings cleared');
  }

  /**
   * Get storage statistics
   */
  getStats(): { count: number; totalActions: number; totalSize: number } {
    const recordings = this.store.get('recordings', []);
    const totalActions = recordings.reduce((sum, r) => sum + r.actionCount, 0);
    const totalSize = JSON.stringify(recordings).length;
    
    return {
      count: recordings.length,
      totalActions,
      totalSize
    };
  }
}
