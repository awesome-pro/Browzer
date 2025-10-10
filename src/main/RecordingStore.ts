import Store from 'electron-store';
import { RecordingSession } from '../shared/types';
import fs from 'node:fs/promises';

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
   * Delete recording by ID (including video file)
   */
  async deleteRecording(id: string): Promise<boolean> {
    const recordings = this.store.get('recordings', []);
    const recording = recordings.find(r => r.id === id);
    
    if (!recording) {
      return false;
    }

    // Delete video file if exists
    if (recording.video?.filePath) {
      try {
        await fs.unlink(recording.video.filePath);
        console.log('🗑️ Video file deleted:', recording.video.fileName);
      } catch (error) {
        console.error('Failed to delete video file:', error);
        // Continue with metadata deletion even if video deletion fails
      }
    }

    // Delete metadata
    const filtered = recordings.filter(r => r.id !== id);
    this.store.set('recordings', filtered);
    console.log('🗑️ Recording deleted:', id);
    return true;
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
   * Clear all recordings (including video files)
   */
  async clearAll(): Promise<void> {
    const recordings = this.store.get('recordings', []);
    
    // Delete all video files
    for (const recording of recordings) {
      if (recording.video?.filePath) {
        try {
          await fs.unlink(recording.video.filePath);
        } catch (error) {
          console.error('Failed to delete video file:', error);
        }
      }
    }

    this.store.set('recordings', []);
    console.log('🗑️ All recordings cleared');
  }

  /**
   * Get storage statistics
   */
  getStats(): { 
    count: number; 
    totalActions: number; 
    totalSize: number;
    videoCount: number;
    totalVideoSize: number;
  } {
    const recordings = this.store.get('recordings', []);
    const totalActions = recordings.reduce((sum, r) => sum + r.actionCount, 0);
    const totalSize = JSON.stringify(recordings).length;
    
    const videoCount = recordings.filter(r => r.video).length;
    const totalVideoSize = recordings.reduce((sum, r) => {
      return sum + (r.video?.fileSize || 0);
    }, 0);
    
    return {
      count: recordings.length,
      totalActions,
      totalSize,
      videoCount,
      totalVideoSize
    };
  }

  /**
   * Get video file path for a recording
   */
  getVideoPath(id: string): string | null {
    const recording = this.getRecording(id);
    return recording?.video?.filePath || null;
  }
}
