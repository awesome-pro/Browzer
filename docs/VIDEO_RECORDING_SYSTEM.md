# Video Recording System

## Overview

The Browzer recording system has been enhanced to include **screen recording** capabilities alongside semantic action recording. This provides a complete visual record of user workflows synchronized with captured actions.

## Architecture

### Components

1. **VideoRecorder** (`src/main/VideoRecorder.ts`)
   - Captures screen video using Electron's `desktopCapturer` API
   - Encodes video using MediaRecorder API (WebM format, VP9/VP8 codec)
   - Manages video file storage in user data directory
   - Provides utilities for video file management

2. **ActionRecorder** (`src/main/ActionRecorder.ts`)
   - Enhanced to coordinate video recording with action capture
   - Synchronizes video and action timestamps
   - Returns both actions and video metadata on stop

3. **RecordingStore** (`src/main/RecordingStore.ts`)
   - Updated to handle video file paths
   - Automatically deletes video files when recordings are deleted
   - Provides statistics including video storage usage

4. **BrowserManager** (`src/main/BrowserManager.ts`)
   - Orchestrates recording lifecycle
   - Passes video enable/disable flag to recorder
   - Handles video metadata in recording sessions

5. **IPCHandlers** (`src/main/ipc/IPCHandlers.ts`)
   - Updated IPC handlers to support video recording parameters
   - Passes video metadata between main and renderer processes

## Data Flow

```
User clicks "Start Recording"
    ↓
BrowserManager.startRecording(enableVideo)
    ↓
ActionRecorder.startRecording(recordingId, enableVideo)
    ↓
├─→ CDP Debugger attached (for actions)
└─→ VideoRecorder.startRecording(recordingId) (if enabled)
        ↓
        desktopCapturer.getSources()
        ↓
        MediaRecorder starts capturing
        ↓
        Video chunks buffered in memory

User clicks "Stop Recording"
    ↓
BrowserManager.stopRecording()
    ↓
ActionRecorder.stopRecording()
    ↓
├─→ CDP Debugger detached
└─→ VideoRecorder.stopRecording()
        ↓
        MediaRecorder stopped
        ↓
        Video chunks saved to file
        ↓
        Returns VideoRecordingMetadata

User saves recording
    ↓
BrowserManager.saveRecording(name, description, actions, video)
    ↓
RecordingStore.saveRecording(session)
    ↓
Session saved with video metadata
```

## Video Storage

### File Location
Videos are stored in the user data directory:
```
{userData}/recordings/videos/{recordingId}.webm
```

### File Format
- **Format**: WebM
- **Codec**: VP9 (fallback to VP8 if not supported)
- **Bitrate**: 2.5 Mbps (configurable)
- **Frame Rate**: 30-60 fps (depending on system capabilities)

### Storage Management
- Videos are stored separately from action metadata
- Metadata contains file path reference
- Automatic cleanup when recordings are deleted
- Optional cleanup utility for old videos (30+ days)

## Types

### VideoRecordingMetadata
```typescript
interface VideoRecordingMetadata {
  // File information
  filePath: string;           // Absolute path to video file
  fileName: string;           // Video file name
  fileSize: number;           // Size in bytes
  
  // Video properties
  format: 'webm' | 'mp4';     // Video format
  codec: string;              // Video codec (e.g., 'vp8', 'vp9', 'h264')
  duration: number;           // Video duration in milliseconds
  fps: number;                // Frames per second
  
  // Recording metadata
  startTimestamp: number;     // When recording started (Unix timestamp)
  endTimestamp: number;       // When recording ended (Unix timestamp)
  
  // Display information
  displayInfo: {
    width: number;            // Video width
    height: number;           // Video height
    scaleFactor: number;      // Display scale factor
  };
  
  // Status
  status: 'recording' | 'completed' | 'failed' | 'processing';
  error?: string;             // Error message if failed
}
```

### RecordingSession (Updated)
```typescript
interface RecordingSession {
  id: string;
  name: string;
  description?: string;
  actions: RecordedAction[];
  createdAt: number;
  duration: number;
  actionCount: number;
  url?: string;
  
  // NEW: Video recording metadata
  video?: VideoRecordingMetadata;
}
```

## Usage

### Starting a Recording with Video

```typescript
// From renderer process
const success = await window.electron.ipcRenderer.invoke(
  'browser:start-recording',
  true  // enableVideo = true
);
```

### Starting a Recording without Video (Actions Only)

```typescript
const success = await window.electron.ipcRenderer.invoke(
  'browser:start-recording',
  false  // enableVideo = false
);
```

### Stopping a Recording

```typescript
const result = await window.electron.ipcRenderer.invoke(
  'browser:stop-recording'
);

// result = {
//   actions: RecordedAction[],
//   video?: VideoRecordingMetadata
// }
```

### Saving a Recording

```typescript
const sessionId = await window.electron.ipcRenderer.invoke(
  'browser:save-recording',
  'My Workflow',           // name
  'Login and checkout',    // description
  result.actions,          // actions array
  result.video             // video metadata (optional)
);
```

### Accessing Video Files

Video files can be accessed using the file path from metadata:

```typescript
const recordings = await window.electron.ipcRenderer.invoke(
  'browser:get-all-recordings'
);

const recording = recordings[0];
if (recording.video) {
  const videoPath = recording.video.filePath;
  // Use videoPath to display video in <video> element
  // Example: <video src={`file://${videoPath}`} />
}
```

## Performance Considerations

### Memory Usage
- Video chunks are buffered in memory during recording
- Typical memory usage: ~50-100 MB per minute of recording
- Chunks are written to disk on stop to free memory

### CPU Usage
- VP9 encoding: Moderate CPU usage (10-20%)
- VP8 encoding: Lower CPU usage (5-10%)
- Automatic codec selection based on browser support

### Disk Space
- Typical video size: ~20-30 MB per minute
- WebM format provides good compression
- Consider implementing storage limits or cleanup policies

## Best Practices

### 1. Enable Video Selectively
Not all recordings need video. Consider:
- Enable for complex UI workflows
- Disable for API-heavy tasks
- Let users toggle video recording

### 2. Implement Storage Limits
```typescript
// Check storage before recording
const stats = recordingStore.getStats();
if (stats.totalVideoSize > MAX_VIDEO_STORAGE) {
  // Prompt user to delete old recordings
  // Or auto-cleanup old videos
  await VideoRecorder.cleanupOldVideos(30);
}
```

### 3. Handle Errors Gracefully
```typescript
try {
  await startRecording(true);
} catch (error) {
  console.error('Video recording failed:', error);
  // Fallback to actions-only recording
  await startRecording(false);
}
```

### 4. Provide User Feedback
- Show recording indicator with video status
- Display video file size in recordings list
- Show storage usage statistics

## Troubleshooting

### Video Recording Fails to Start

**Possible causes:**
1. No screen capture permissions (macOS)
2. MediaRecorder not supported
3. Insufficient disk space

**Solutions:**
- Request screen recording permissions on macOS
- Check browser compatibility
- Implement storage checks before recording

### Video File Not Found

**Possible causes:**
1. File was manually deleted
2. Recording was interrupted
3. Path is incorrect

**Solutions:**
- Validate file existence before playback
- Show error message to user
- Offer to re-record or delete metadata

### Large Video Files

**Solutions:**
- Reduce bitrate in VideoRecorder (currently 2.5 Mbps)
- Implement video compression post-recording
- Limit recording duration
- Use lower resolution capture

## Future Enhancements

### Planned Features
1. **Video Compression**: Post-processing to reduce file size
2. **Multiple Formats**: Support for MP4 export
3. **Video Editing**: Trim, crop, annotate videos
4. **Cloud Storage**: Upload videos to cloud
5. **Video Streaming**: Stream instead of download for playback
6. **Picture-in-Picture**: Show video alongside actions
7. **Thumbnail Generation**: Create preview thumbnails
8. **Audio Recording**: Capture system audio or microphone

### Technical Improvements
1. **Incremental Saving**: Write chunks to disk during recording
2. **Hardware Acceleration**: Use GPU encoding if available
3. **Adaptive Bitrate**: Adjust quality based on content
4. **Multi-tab Recording**: Record multiple tabs simultaneously
5. **Selective Area Capture**: Record specific regions only

## API Reference

### VideoRecorder Class

#### Methods

##### `startRecording(recordingId: string): Promise<boolean>`
Starts video recording with the given recording ID.

##### `stopRecording(): Promise<VideoRecordingMetadata | null>`
Stops recording and returns video metadata.

##### `isActive(): boolean`
Returns whether recording is currently active.

##### `getFilePath(): string | null`
Returns the current recording file path.

##### `deleteVideo(filePath: string): Promise<boolean>`
Deletes a video file from disk.

##### `static getVideosDirectory(): string`
Returns the videos storage directory path.

##### `static cleanupOldVideos(daysOld: number): Promise<number>`
Deletes videos older than specified days. Returns count of deleted files.

### RecordingStore Updates

#### Methods

##### `deleteRecording(id: string): Promise<boolean>`
Now async - deletes recording and associated video file.

##### `clearAll(): Promise<void>`
Now async - clears all recordings and video files.

##### `getStats()`
Returns extended statistics including video count and size:
```typescript
{
  count: number;
  totalActions: number;
  totalSize: number;
  videoCount: number;        // NEW
  totalVideoSize: number;    // NEW
}
```

##### `getVideoPath(id: string): string | null`
Returns video file path for a recording.

## Security Considerations

### Screen Capture Permissions
- macOS requires explicit screen recording permission
- Windows may require admin privileges for some capture modes
- Linux requires appropriate X11/Wayland permissions

### File Access
- Videos stored in user data directory (sandboxed)
- File paths are absolute but within app sandbox
- No external file access without user permission

### Privacy
- Videos may contain sensitive information
- Implement encryption for video files if needed
- Provide clear user consent for recording
- Add watermarks or indicators during recording

## Testing

### Manual Testing Checklist
- [ ] Start recording with video enabled
- [ ] Start recording with video disabled
- [ ] Stop recording and verify video file created
- [ ] Save recording and verify metadata stored
- [ ] Play back video from recordings list
- [ ] Delete recording and verify video file removed
- [ ] Check storage statistics accuracy
- [ ] Test on different screen resolutions
- [ ] Test with multiple monitors
- [ ] Test recording duration limits

### Automated Testing
Consider implementing:
- Unit tests for VideoRecorder class
- Integration tests for recording lifecycle
- Performance tests for memory/CPU usage
- Storage tests for file management

## Migration Guide

### For Existing Recordings
Old recordings without video will continue to work:
- `video` field is optional in `RecordingSession`
- UI should handle missing video gracefully
- No migration script needed

### For Renderer Code
Update recording UI to:
1. Add video toggle option
2. Display video metadata in recordings list
3. Add video player component
4. Show storage usage statistics
5. Handle video loading errors

Example:
```typescript
// Before
const result = await stopRecording();
saveRecording(name, description, result);

// After
const result = await stopRecording();
saveRecording(name, description, result.actions, result.video);
```

## Support

For issues or questions:
1. Check console logs for error messages
2. Verify screen recording permissions
3. Check disk space availability
4. Review browser compatibility
5. Check Electron version compatibility (requires 38.2.1+)

## License

Same as main Browzer project license.
