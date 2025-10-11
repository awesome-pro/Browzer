# Recordings Internal Page Implementation

## Overview

The Recordings internal page (`browzer://recordings`) provides a comprehensive interface for users to view, manage, and playback their recorded workflows with synchronized video and action data.

## Architecture

### Component Hierarchy

```
Recordings (Screen)
├── RecordingCard (Component)
│   └── Card UI with recording metadata
└── VideoPlayerDialog (Component)
    ├── Video Player with controls
    ├── Actions Timeline
    └── Synchronized playback
```

### Files Created

1. **`src/renderer/screens/Recordings.tsx`** - Main recordings page
2. **`src/renderer/components/RecordingCard.tsx`** - Individual recording card
3. **`src/renderer/components/VideoPlayerDialog.tsx`** - Video player with actions
4. **`src/renderer/ui/slider.tsx`** - Slider component for video controls
5. **`src/renderer/ui/scroll-area.tsx`** - Scrollable area component

### Files Modified

1. **`src/renderer/router/InternalRouter.tsx`** - Added recordings route
2. **`src/preload.ts`** - Updated recording API types
3. **`src/renderer/lib/utils.ts`** - Added `formatFileSize` utility
4. **`package.json`** - Added Radix UI dependencies

## Features

### 1. Recordings List View

**Features:**
- Grid layout with responsive cards (1/2/3 columns)
- Search functionality (by name, description, URL)
- Grouped by date (Today, Yesterday, specific dates)
- Statistics dashboard showing:
  - Total recordings count
  - Total actions captured
  - Recordings with video
  - Total storage used

**UI/UX:**
- Modern card-based design
- Hover effects and transitions
- Video badge indicator
- Action count and duration display
- Quick access to play/delete

### 2. Recording Card Component

**Displays:**
- Recording name and description
- Starting URL
- Action count with icon
- Duration with icon
- Video metadata (resolution, file size)
- Creation date
- Video availability badge

**Actions:**
- Play/View button (opens player dialog)
- Delete button (with confirmation)

### 3. Video Player Dialog

**Features:**
- Full-featured video player with:
  - Play/Pause controls
  - Progress bar with seek
  - Volume control with slider
  - Skip forward/backward (10s)
  - Fullscreen support
  - Time display (current/total)

**Tabs:**
- **Video Tab**: Video player with synchronized controls
- **Actions Tab**: Scrollable list of all recorded actions

**Action Timeline:**
- Each action displayed as a card
- Color-coded by action type:
  - Blue: Click
  - Green: Input
  - Purple: Navigate
  - Orange: Submit
  - Pink: Select
- Shows:
  - Action type badge
  - Timestamp
  - Target element info
  - Selector details
  - Value (if applicable)
  - Effects summary
- Click action to jump to that point in video
- Highlights currently playing action

**Synchronization:**
- Actions are synchronized with video timeline
- Clicking an action jumps video to that timestamp
- Current action highlighted during playback

### 4. Delete Confirmation

**Features:**
- Alert dialog for confirmation
- Shows if video file will be deleted
- Prevents accidental deletions

## User Flows

### Viewing Recordings

```
1. Navigate to browzer://recordings
2. See all recordings grouped by date
3. Use search to filter recordings
4. View statistics at the top
```

### Playing a Recording

```
1. Click "Play Video" or "View Actions" on a card
2. Dialog opens with video player (if available)
3. Watch video with synchronized controls
4. Switch to Actions tab to see detailed action list
5. Click any action to jump to that point in video
6. Close dialog when done
```

### Deleting a Recording

```
1. Click delete button on recording card
2. Confirmation dialog appears
3. Confirm deletion
4. Recording and video file removed
5. List refreshes automatically
```

## Technical Implementation

### Data Flow

```
User Action → Recordings Component
    ↓
window.browserAPI.getAllRecordings()
    ↓
IPC: 'browser:get-all-recordings'
    ↓
BrowserManager.getAllRecordings()
    ↓
RecordingStore.getAllRecordings()
    ↓
Returns RecordingSession[]
    ↓
Component renders cards
```

### Video Playback

```
User clicks Play → VideoPlayerDialog opens
    ↓
Video element loads: file://{videoPath}
    ↓
Video metadata loaded (duration, dimensions)
    ↓
User can:
  - Play/pause video
  - Seek to any position
  - Adjust volume
  - Enter fullscreen
  - Jump to specific actions
```

### Action Synchronization

```typescript
// Calculate action time relative to video start
const actionTime = action.timestamp - recording.video.startTimestamp;
const videoTime = actionTime / 1000; // Convert to seconds

// Jump video to action
videoRef.current.currentTime = videoTime;
```

## Styling

### Design System

- **Colors**: Tailwind CSS with dark mode support
- **Components**: shadcn/ui (Radix UI primitives)
- **Icons**: Lucide React
- **Animations**: Smooth transitions and hover effects

### Responsive Design

- **Mobile**: Single column grid
- **Tablet**: Two column grid
- **Desktop**: Three column grid
- **Large screens**: Three column with max-width container

### Dark Mode

- Full dark mode support
- Automatic theme switching
- Consistent color scheme across all components

## Performance Optimizations

### 1. Lazy Loading
- Videos loaded only when player dialog opens
- Large action lists virtualized with ScrollArea

### 2. Efficient Rendering
- React memo for RecordingCard components
- Debounced search filtering
- Grouped rendering by date

### 3. Memory Management
- Video element cleanup on dialog close
- Event listener cleanup
- Proper React hooks dependencies

## Accessibility

### Keyboard Navigation
- Tab navigation through cards
- Enter to play recording
- Escape to close dialog
- Space to play/pause video

### Screen Readers
- Semantic HTML structure
- ARIA labels on controls
- Descriptive button text
- Alt text for icons

### Visual Accessibility
- High contrast colors
- Clear focus indicators
- Readable font sizes
- Color-blind friendly badges

## Installation & Setup

### 1. Install Dependencies

```bash
pnpm install
```

This will install the new Radix UI packages:
- `@radix-ui/react-slider`
- `@radix-ui/react-scroll-area`

### 2. Build & Run

```bash
pnpm start
```

### 3. Access Recordings Page

Navigate to `browzer://recordings` in the browser

## Usage Examples

### Accessing from Browser Chrome

```typescript
// In your navigation component
<Button onClick={() => navigate('browzer://recordings')}>
  View Recordings
</Button>
```

### Programmatic Navigation

```typescript
// Navigate to recordings page
window.location.href = 'browzer://recordings';
```

## API Reference

### BrowserAPI Methods Used

```typescript
// Get all recordings
const recordings = await window.browserAPI.getAllRecordings();
// Returns: RecordingSession[]

// Delete a recording
const success = await window.browserAPI.deleteRecording(id);
// Returns: boolean
```

### RecordingSession Type

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
  video?: VideoRecordingMetadata;
}
```

### VideoRecordingMetadata Type

```typescript
interface VideoRecordingMetadata {
  filePath: string;
  fileName: string;
  fileSize: number;
  format: 'webm' | 'mp4';
  codec: string;
  duration: number;
  fps: number;
  startTimestamp: number;
  endTimestamp: number;
  displayInfo: {
    width: number;
    height: number;
    scaleFactor: number;
  };
  status: 'recording' | 'completed' | 'failed' | 'processing';
  error?: string;
}
```

## Troubleshooting

### Video Not Playing

**Issue**: Video element shows black screen

**Solutions:**
1. Check video file exists at path
2. Verify file permissions
3. Check browser codec support
4. Inspect console for errors

### Actions Not Synchronized

**Issue**: Clicking action doesn't jump to correct time

**Solutions:**
1. Verify `startTimestamp` in video metadata
2. Check action timestamps are valid
3. Ensure video duration is loaded

### Search Not Working

**Issue**: Search doesn't filter recordings

**Solutions:**
1. Check search query state
2. Verify filter function logic
3. Ensure recordings array is populated

### Cards Not Displaying

**Issue**: Empty state shows even with recordings

**Solutions:**
1. Check `getAllRecordings()` returns data
2. Verify component state updates
3. Check for console errors

## Future Enhancements

### Planned Features

1. **Export Recordings**
   - Export as JSON
   - Export video separately
   - Share with others

2. **Playback Speed Control**
   - 0.5x, 1x, 1.5x, 2x speeds
   - Keyboard shortcuts

3. **Action Filtering**
   - Filter by action type
   - Search within actions
   - Hide/show specific types

4. **Bulk Operations**
   - Select multiple recordings
   - Bulk delete
   - Bulk export

5. **Recording Analytics**
   - Most common actions
   - Average session duration
   - Storage trends over time

6. **Video Editing**
   - Trim video
   - Add annotations
   - Create highlights

7. **Cloud Sync**
   - Upload to cloud storage
   - Share via link
   - Collaborate on recordings

8. **Replay Automation**
   - Replay recorded actions
   - Edit and re-run workflows
   - Create test scripts

## Best Practices

### Component Organization

1. Keep components focused and single-purpose
2. Extract reusable logic into hooks
3. Use TypeScript for type safety
4. Document complex logic with comments

### State Management

1. Use local state for UI-only state
2. Lift state up when needed by multiple components
3. Use refs for DOM manipulation
4. Clean up effects and listeners

### Performance

1. Memoize expensive computations
2. Debounce user input
3. Lazy load heavy components
4. Optimize re-renders

### Testing

1. Test user flows end-to-end
2. Test edge cases (empty states, errors)
3. Test accessibility features
4. Test on different screen sizes

## Contributing

When adding features to the Recordings page:

1. Follow existing code style
2. Maintain TypeScript types
3. Add proper error handling
4. Update documentation
5. Test thoroughly
6. Consider accessibility
7. Optimize for performance

## License

Same as main Browzer project license.
