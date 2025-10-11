/* eslint-disable @typescript-eslint/no-explicit-any */
import { desktopCapturer, WebContentsView, app } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { VideoRecordingMetadata } from '../shared/types';

/**
 * VideoRecorder - Captures screen recording of WebContentsView
 * 
 * Uses Electron's desktopCapturer API to capture the active tab's screen
 * and MediaRecorder to encode it into WebM format.
 * 
 * Features:
 * - High-quality screen capture (up to 60fps)
 * - Efficient WebM encoding (VP9 codec)
 * - Synchronized with action recording timestamps
 * - Automatic file management in user data directory
 */
export class VideoRecorder {
  private view: WebContentsView;
  private isRecording = false;
  private mediaRecorder: any = null;
  private recordedChunks: Blob[] = [];
  private startTimestamp = 0;
  private recordingId: string | null = null;
  private videoFilePath: string | null = null;
  private displayInfo: { width: number; height: number; scaleFactor: number } | null = null;

  constructor(view: WebContentsView) {
    this.view = view;
  }

  /**
   * Start video recording of the WebContentsView
   */
  public async startRecording(recordingId: string): Promise<boolean> {
    if (this.isRecording) {
      console.warn('Video recording already in progress');
      return false;
    }

    try {
      this.recordingId = recordingId;
      this.startTimestamp = Date.now();
      this.recordedChunks = [];

      // Get available video sources
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      });

      // Find the source that matches our WebContentsView
      // For now, we'll capture the entire screen or the main window
      // In production, you might want to filter by window title or ID
      const primarySource = sources[0];

      if (!primarySource) {
        throw new Error('No video source available');
      }

      console.log('🎥 Selected video source:', primarySource.name);

      // Get display information
      const bounds = this.view.getBounds();
      this.displayInfo = {
        width: bounds.width,
        height: bounds.height,
        scaleFactor: 1 // Will be updated from actual capture
      };

      // Inject MediaRecorder script into the WebContentsView
      await this.setupMediaRecorder(primarySource.id);

      this.isRecording = true;
      console.log('🎬 Video recording started:', this.recordingId);

      return true;
    } catch (error) {
      console.error('Failed to start video recording:', error);
      this.isRecording = false;
      return false;
    }
  }

  /**
   * Stop video recording and save to file
   */
  public async stopRecording(): Promise<VideoRecordingMetadata | null> {
    if (!this.isRecording || !this.recordingId) {
      console.warn('No video recording in progress');
      return null;
    }

    try {
      console.log('⏹️ Stopping video recording...');

      // Stop the MediaRecorder
      await this.stopMediaRecorder();

      // Wait a bit for chunks to be collected
      await new Promise(resolve => setTimeout(resolve, 500));

      // Save video file
      const metadata = await this.saveVideoFile();

      this.isRecording = false;
      this.recordingId = null;

      console.log('✅ Video recording saved:', metadata.filePath);
      return metadata;
    } catch (error) {
      console.error('Failed to stop video recording:', error);
      this.isRecording = false;
      return null;
    }
  }

  /**
   * Check if currently recording
   */
  public isActive(): boolean {
    return this.isRecording;
  }

  /**
   * Get current recording file path
   */
  public getFilePath(): string | null {
    return this.videoFilePath;
  }

  /**
   * Delete video file
   */
  public async deleteVideo(filePath: string): Promise<boolean> {
    try {
      await fs.unlink(filePath);
      console.log('🗑️ Video file deleted:', filePath);
      return true;
    } catch (error) {
      console.error('Failed to delete video file:', error);
      return false;
    }
  }

  /**
   * Setup MediaRecorder in the WebContentsView
   */
  private async setupMediaRecorder(sourceId: string): Promise<void> {
    const script = `
      (async function() {
        try {
          // Get media stream from desktop capturer
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: '${sourceId}',
                minWidth: 1280,
                maxWidth: 1920,
                minHeight: 720,
                maxHeight: 1080,
                minFrameRate: 30,
                maxFrameRate: 60
              }
            }
          });

          // Create MediaRecorder with optimal settings
          const options = {
            mimeType: 'video/webm;codecs=vp9',
            videoBitsPerSecond: 2500000 // 2.5 Mbps for good quality
          };

          // Fallback to VP8 if VP9 is not supported
          if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options.mimeType = 'video/webm;codecs=vp8';
          }

          window.__browzerMediaRecorder = new MediaRecorder(stream, options);
          window.__browzerRecordedChunks = [];

          window.__browzerMediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              window.__browzerRecordedChunks.push(event.data);
            }
          };

          window.__browzerMediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error:', event);
          };

          // Start recording with 1 second timeslice
          window.__browzerMediaRecorder.start(1000);

          console.log('✅ MediaRecorder started');
          return { success: true };
        } catch (error) {
          console.error('MediaRecorder setup failed:', error);
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.view.webContents.executeJavaScript(script);
    
    if (!result.success) {
      throw new Error(`MediaRecorder setup failed: ${result.error}`);
    }
  }

  /**
   * Stop MediaRecorder and collect chunks
   */
  private async stopMediaRecorder(): Promise<void> {
    const script = `
      (function() {
        return new Promise((resolve) => {
          if (window.__browzerMediaRecorder && window.__browzerMediaRecorder.state !== 'inactive') {
            window.__browzerMediaRecorder.onstop = () => {
              // Stop all tracks
              const stream = window.__browzerMediaRecorder.stream;
              stream.getTracks().forEach(track => track.stop());
              resolve({ success: true, chunkCount: window.__browzerRecordedChunks.length });
            };
            window.__browzerMediaRecorder.stop();
          } else {
            resolve({ success: false, error: 'MediaRecorder not active' });
          }
        });
      })();
    `;

    await this.view.webContents.executeJavaScript(script);
  }

  /**
   * Save video file to disk
   */
  private async saveVideoFile(): Promise<VideoRecordingMetadata> {
    // Get recorded chunks from WebContentsView
    const chunksScript = `
      (function() {
        if (window.__browzerRecordedChunks && window.__browzerRecordedChunks.length > 0) {
          // Convert Blob chunks to base64
          return Promise.all(
            window.__browzerRecordedChunks.map(chunk => 
              new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(chunk);
              })
            )
          );
        }
        return [];
      })();
    `;

    const base64Chunks = await this.view.webContents.executeJavaScript(chunksScript);

    if (!base64Chunks || base64Chunks.length === 0) {
      throw new Error('No video chunks recorded');
    }

    // Convert base64 chunks to Buffer
    const buffers = base64Chunks.map((chunk: string) => Buffer.from(chunk, 'base64'));
    const videoBuffer = Buffer.concat(buffers);

    // Create recordings directory
    const recordingsDir = path.join(app.getPath('userData'), 'recordings', 'videos');
    await fs.mkdir(recordingsDir, { recursive: true });

    // Generate filename
    const fileName = `${this.recordingId}.webm`;
    const filePath = path.join(recordingsDir, fileName);

    // Save file
    await fs.writeFile(filePath, videoBuffer);

    // Get file stats
    const stats = await fs.stat(filePath);
    const endTimestamp = Date.now();
    const duration = endTimestamp - this.startTimestamp;

    // Create metadata
    const metadata: VideoRecordingMetadata = {
      filePath,
      fileName,
      fileSize: stats.size,
      format: 'webm',
      codec: 'vp9', // or 'vp8' depending on what was used
      duration,
      fps: 30, // Default, could be detected from stream
      startTimestamp: this.startTimestamp,
      endTimestamp,
      displayInfo: this.displayInfo || {
        width: 1920,
        height: 1080,
        scaleFactor: 1
      },
      status: 'completed'
    };

    this.videoFilePath = filePath;

    return metadata;
  }

  /**
   * Get video directory path
   */
  public static getVideosDirectory(): string {
    return path.join(app.getPath('userData'), 'recordings', 'videos');
  }

  /**
   * Clean up old video files (optional utility)
   */
  public static async cleanupOldVideos(daysOld = 30): Promise<number> {
    try {
      const videosDir = VideoRecorder.getVideosDirectory();
      const files = await fs.readdir(videosDir);
      const now = Date.now();
      const maxAge = daysOld * 24 * 60 * 60 * 1000;
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(videosDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtimeMs > maxAge) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      console.log(`🧹 Cleaned up ${deletedCount} old video files`);
      return deletedCount;
    } catch (error) {
      console.error('Failed to cleanup old videos:', error);
      return 0;
    }
  }
}
