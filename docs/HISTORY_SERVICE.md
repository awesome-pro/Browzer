# History Service

## Overview

Browzer includes a comprehensive browsing history system similar to Chrome's history functionality. The system automatically tracks all page visits, provides powerful search and filtering capabilities, and offers a modern UI for managing browsing history.

## Features

### ✅ Automatic Tracking
- **Page visit tracking** - Every page load is automatically recorded
- **Visit count** - Tracks how many times each URL has been visited
- **Typed count** - Tracks URLs entered directly in address bar
- **Favicon storage** - Stores site favicons for visual recognition
- **Transition types** - Records how navigation occurred (link, typed, reload, etc.)

### ✅ Search & Filter
- **Text search** - Search by page title or URL
- **Date filtering** - Filter by today, last 7 days, or all time
- **Time range queries** - Custom date range filtering
- **Real-time filtering** - Instant search results

### ✅ Management
- **Delete individual entries** - Remove specific history items
- **Bulk delete** - Select and delete multiple entries
- **Clear all history** - Remove all browsing history
- **Date range deletion** - Clear history for specific time periods

### ✅ Statistics
- **Total visits** - Track overall browsing activity
- **Top domains** - See most visited websites
- **Daily/weekly stats** - View recent activity trends
- **Visit counts** - See how many times you've visited each site

### ✅ Modern UI
- **Chrome-like interface** - Familiar, intuitive design
- **Date grouping** - History organized by day
- **Search highlighting** - Easy to find what you're looking for
- **Bulk selection** - Select multiple entries with checkboxes
- **Responsive design** - Works on all screen sizes
- **Dark mode support** - Matches system theme

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Renderer Process                       │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              History Screen (UI)                    │ │
│  │  - Search & Filter                                  │ │
│  │  - Date Grouping                                    │ │
│  │  - Bulk Actions                                     │ │
│  │  - Statistics Dashboard                             │ │
│  └────────────────────┬────────────────────────────────┘ │
│                       │                                   │
│                window.browserAPI                          │
└───────────────────────┼───────────────────────────────────┘
                        │ IPC
┌───────────────────────┼───────────────────────────────────┐
│                 Main Process                              │
│                       │                                   │
│            ┌──────────▼──────────┐                        │
│            │    IPCHandlers      │                        │
│            └──────────┬──────────┘                        │
│                       │                                   │
│     ┌─────────────────┴─────────────────┐                │
│     │                                   │                │
│ ┌───▼──────────┐              ┌────────▼────────┐       │
│ │BrowserManager│              │ HistoryService  │       │
│ │              │              │                 │       │
│ │ - Track      │◄─────────────┤ - Store        │       │
│ │   Navigation │              │ - Search       │       │
│ │ - Add Entry  │              │ - Delete       │       │
│ │   on Load    │              │ - Stats        │       │
│ └──────────────┘              └────────┬────────┘       │
│                                        │                │
│                                 ┌──────▼──────┐         │
│                                 │electron-store│        │
│                                 │  (history)   │        │
│                                 └──────────────┘        │
└──────────────────────────────────────────────────────────┘
```

## Data Models

### HistoryEntry
```typescript
interface HistoryEntry {
  id: string;                    // Unique identifier
  url: string;                   // Full URL
  title: string;                 // Page title
  visitTime: number;             // First visit timestamp
  visitCount: number;            // Total visit count
  lastVisitTime: number;         // Most recent visit timestamp
  favicon?: string;              // Site favicon URL
  typedCount: number;            // Times typed in address bar
  transition: HistoryTransition; // How navigation occurred
}
```

### HistoryTransition
```typescript
enum HistoryTransition {
  LINK = 'link',                 // Clicked a link
  TYPED = 'typed',               // Typed URL
  RELOAD = 'reload',             // Page reload
  FORM_SUBMIT = 'form_submit',   // Form submission
  // ... more types
}
```

### HistoryStats
```typescript
interface HistoryStats {
  totalEntries: number;          // Total unique URLs
  totalVisits: number;           // Total page visits
  topDomains: Array<{            // Most visited domains
    domain: string;
    count: number;
  }>;
  todayVisits: number;           // Visits today
  weekVisits: number;            // Visits this week
}
```

## API Reference

### Browser API (Renderer → Main)

```typescript
// Get all history
const history = await window.browserAPI.getAllHistory(limit?);
// Returns: HistoryEntry[]

// Search history
const results = await window.browserAPI.searchHistory({
  text: 'github',
  startTime: Date.now() - 7 * 24 * 60 * 60 * 1000,
  endTime: Date.now(),
  maxResults: 100
});
// Returns: HistoryEntry[]

// Get today's history
const today = await window.browserAPI.getTodayHistory();
// Returns: HistoryEntry[]

// Get last N days
const week = await window.browserAPI.getLastNDaysHistory(7);
// Returns: HistoryEntry[]

// Delete single entry
await window.browserAPI.deleteHistoryEntry(id);
// Returns: boolean

// Delete multiple entries
const count = await window.browserAPI.deleteHistoryEntries([id1, id2, id3]);
// Returns: number (count deleted)

// Delete by date range
const count = await window.browserAPI.deleteHistoryByDateRange(startTime, endTime);
// Returns: number

// Clear all history
await window.browserAPI.clearAllHistory();
// Returns: boolean

// Get statistics
const stats = await window.browserAPI.getHistoryStats();
// Returns: HistoryStats

// Get most visited
const topSites = await window.browserAPI.getMostVisited(10);
// Returns: HistoryEntry[]

// Get recently visited
const recent = await window.browserAPI.getRecentlyVisited(20);
// Returns: HistoryEntry[]
```

## Storage

### Location
History is stored locally using `electron-store`:
- **macOS**: `~/Library/Application Support/browzer/history.json`
- **Windows**: `%APPDATA%/browzer/history.json`
- **Linux**: `~/.config/browzer/history.json`

### Data Structure
```json
{
  "entries": {
    "entry-id-1": {
      "id": "entry-id-1",
      "url": "https://github.com",
      "title": "GitHub",
      "visitTime": 1234567890,
      "visitCount": 5,
      "lastVisitTime": 1234567890,
      "favicon": "https://github.com/favicon.ico",
      "typedCount": 2,
      "transition": "typed"
    }
  },
  "urlToId": {
    "https://github.com": "entry-id-1"
  }
}
```

## Automatic Tracking

History is automatically tracked when:
1. A page finishes loading (`did-stop-loading` event)
2. The URL is not an internal page (`browzer://`, `chrome://`, `about:`)
3. The page has a valid URL and title

```typescript
// In BrowserManager.ts
webContents.on('did-stop-loading', () => {
  if (info.url && info.title) {
    this.historyService.addEntry(
      info.url,
      info.title,
      HistoryTransition.LINK,
      info.favicon
    );
  }
});
```

## UI Features

### Search
- **Real-time search** - Results update as you type
- **Search by title or URL** - Flexible matching
- **Clear button** - Quick search reset

### Filters
- **All Time** - View complete history
- **Today** - Only today's visits
- **Last 7 Days** - Recent activity

### Grouping
- **Today** - Current day's history
- **Yesterday** - Previous day
- **Date headers** - Older history grouped by date

### Selection
- **Checkboxes** - Select individual entries
- **Select all** - Bulk selection toggle
- **Bulk delete** - Remove multiple entries at once

### Entry Actions
- **Click title** - Open URL in new tab
- **Visit count badge** - Shows multiple visits
- **Timestamp** - Relative time (e.g., "2h ago")
- **Delete button** - Remove individual entry (hover to show)

### Statistics Cards
- **Today's visits** - Current day activity
- **Week's visits** - Last 7 days
- **Total sites** - Unique URLs visited

## Performance Considerations

### Limits
- **Default query limit**: 500 entries (configurable)
- **Search is client-side**: Fast for reasonable history sizes
- **Indexed by URL**: O(1) lookup for existing entries

### Optimization
- **URL-to-ID mapping**: Fast duplicate detection
- **Visit count updates**: Incremental, not full scan
- **Lazy loading**: Only load what's needed
- **Date grouping**: Efficient client-side grouping

## Privacy

### What's Tracked
- ✅ Page URLs
- ✅ Page titles
- ✅ Visit timestamps
- ✅ Visit counts
- ✅ Favicons

### What's NOT Tracked
- ❌ Page content
- ❌ Form data
- ❌ Passwords
- ❌ Cookies
- ❌ Session data
- ❌ Internal pages (`browzer://`, `chrome://`, `about:`)

### User Control
- **Delete individual entries** - Remove specific items
- **Clear all** - Complete history removal
- **Date range deletion** - Selective clearing
- **No cloud sync** - All data stays local

## Best Practices

### For Users
1. **Regular cleanup** - Clear old history periodically
2. **Use search** - Find sites quickly instead of scrolling
3. **Check stats** - Monitor browsing habits
4. **Bulk delete** - Select multiple entries for faster cleanup

### For Developers
1. **Don't track sensitive pages** - Skip internal/private pages
2. **Limit queries** - Use reasonable result limits
3. **Index properly** - Maintain URL-to-ID mapping
4. **Handle errors** - Gracefully handle storage failures

## Future Enhancements

- [ ] **Export history** - Download as JSON/CSV
- [ ] **Import history** - From other browsers
- [ ] **Advanced filters** - By domain, visit count, etc.
- [ ] **History sync** - Across devices (with backend)
- [ ] **Incognito mode** - Don't track private browsing
- [ ] **Auto-cleanup** - Delete old history automatically
- [ ] **Bookmarks integration** - Quick bookmark from history
- [ ] **Timeline view** - Visual timeline of browsing
- [ ] **Domain blocking** - Exclude specific domains
- [ ] **Visit duration** - Track time spent on pages

## Troubleshooting

### History not saving
- Check electron-store permissions
- Verify storage directory exists
- Check console for errors

### Search not working
- Ensure search query is not empty
- Check filter settings
- Try clearing filters

### Performance issues
- Reduce query limit
- Clear old history
- Check history size

### Missing entries
- Verify page finished loading
- Check if URL is internal page
- Look for console errors

## Related Documentation

- `AUTHENTICATION_SYSTEM.md` - User management
- `SETTINGS_ARCHITECTURE.md` - Settings system
- `INTERNAL_PAGES.md` - Internal pages

---

**Status**: ✅ Fully Implemented
**Version**: 1.0.0
**Last Updated**: 2025-10-10
