import { ActionRecorder } from './ActionRecorder';
import { RecordedAction, TabContext } from '../shared/types';

/**
 * MultiTabRecorder - Manages recording across multiple tabs
 * 
 * Dynamically tracks actions in whichever tab is currently active.
 * When user switches tabs, automatically switches recording to the new active tab.
 */
export class MultiTabRecorder {
  private isRecording = false;
  private actions: RecordedAction[] = [];
  private tabContexts = new Map<string, TabContext>();
  private activeRecorders = new Map<string, ActionRecorder>();
  private currentTabId: string | null = null;
  private startTabId: string | null = null;
  private onActionCallback?: (action: RecordedAction) => void;

  /**
   * Set callback for real-time action notifications
   */
  public setActionCallback(callback: (action: RecordedAction) => void): void {
    this.onActionCallback = callback;
  }

  /**
   * Start recording on the specified tab
   */
  public async startRecording(tabId: string, tabTitle: string, tabUrl: string): Promise<void> {
    if (this.isRecording) {
      console.warn('Recording already in progress');
      return;
    }

    this.isRecording = true;
    this.actions = [];
    this.tabContexts.clear();
    this.currentTabId = tabId;
    this.startTabId = tabId;

    // Initialize tab context
    this.addOrUpdateTabContext(tabId, tabTitle, tabUrl);

    // Start recording on the active tab's recorder
    const recorder = this.activeRecorders.get(tabId);
    if (recorder) {
      await recorder.startRecording();
      console.log('▶️ Started ActionRecorder on tab:', tabId);
    } else {
      console.warn('⚠️ No recorder found for tab:', tabId);
    }

    console.log('🎬 Multi-tab recording started on tab:', tabId);
  }

  /**
   * Register a tab's recorder (called when tab is created or becomes active)
   * Uses the existing ActionRecorder from the tab
   */
  public registerTabRecorder(tabId: string, recorder: ActionRecorder): void {
    if (this.activeRecorders.has(tabId)) {
      console.log('📝 Recorder already registered for tab:', tabId);
      return; // Already registered
    }
    
    // Set up action callback to capture actions with tab context
    // This callback will ONLY fire for NEW actions, not old ones
    recorder.setActionCallback((action) => {
      // Only process if:
      // 1. Recording is active
      // 2. This is the current active tab
      // 3. Action is verified (to avoid duplicates during verification)
      if (this.isRecording && this.currentTabId === tabId && action.verified) {
        // Check if this action is already in our list (by timestamp)
        const isDuplicate = this.actions.some(
          existing => existing.timestamp === action.timestamp && existing.type === action.type
        );
        
        if (isDuplicate) {
          console.warn('⚠️ Duplicate action in MultiTabRecorder, skipping:', action.type, tabId);
          return;
        }
        
        // Add tab context to the action
        const enrichedAction: RecordedAction = {
          ...action,
          tabId,
          tabTitle: this.tabContexts.get(tabId)?.title,
          tabUrl: this.tabContexts.get(tabId)?.url,
        };

        this.actions.push(enrichedAction);

        // Update tab context action count
        const tabContext = this.tabContexts.get(tabId);
        if (tabContext) {
          tabContext.actionCount++;
          tabContext.lastAccessTime = Date.now();
        }

        // Notify callback
        if (this.onActionCallback) {
          this.onActionCallback(enrichedAction);
        }
      }
    });

    this.activeRecorders.set(tabId, recorder);
    console.log('📝 Registered recorder for tab:', tabId);
  }

  /**
   * Unregister a tab's recorder (called when tab is closed)
   */
  public unregisterTabRecorder(tabId: string): void {
    const recorder = this.activeRecorders.get(tabId);
    if (recorder && recorder.isActive()) {
      recorder.stopRecording();
    }
    this.activeRecorders.delete(tabId);
    console.log('🗑️ Unregistered recorder for tab:', tabId);
  }

  /**
   * Switch recording to a different tab
   * This is called when user switches tabs during recording
   */
  public async switchToTab(
    newTabId: string,
    newTabTitle: string,
    newTabUrl: string,
    oldTabId: string | null
  ): Promise<void> {
    if (!this.isRecording) {
      return;
    }

    console.log(`🔄 Switching recording from tab ${oldTabId} to ${newTabId}`);

    // Stop recording on old tab if it exists
    if (oldTabId && this.activeRecorders.has(oldTabId)) {
      const oldRecorder = this.activeRecorders.get(oldTabId);
      if (oldRecorder && oldRecorder.isActive()) {
        oldRecorder.stopRecording();
        console.log('⏸️ Paused recording on tab:', oldTabId);
      }
    }

    // Record tab switch action
    const tabSwitchAction: RecordedAction = {
      type: 'tab-switch',
      timestamp: Date.now(),
      url: newTabUrl,
      metadata: {
        fromTabId: oldTabId,
        toTabId: newTabId,
        toTabTitle: newTabTitle,
      },
      tabId: newTabId,
      tabTitle: newTabTitle,
      tabUrl: newTabUrl,
      verified: true,
    };

    this.actions.push(tabSwitchAction);
    if (this.onActionCallback) {
      this.onActionCallback(tabSwitchAction);
    }

    // Update current tab
    this.currentTabId = newTabId;

    // Add or update tab context
    this.addOrUpdateTabContext(newTabId, newTabTitle, newTabUrl);

    // Start recording on new tab if recorder exists
    const newRecorder = this.activeRecorders.get(newTabId);
    if (newRecorder) {
      if (!newRecorder.isActive()) {
        await newRecorder.startRecording();
        console.log('▶️ Started recording on tab:', newTabId);
      }
    } else {
      console.warn('⚠️ No recorder found for tab:', newTabId);
    }
  }

  /**
   * Stop recording and return all actions
   */
  public stopRecording(): RecordedAction[] {
    if (!this.isRecording) {
      console.warn('No recording in progress');
      return [];
    }

    // Stop all active recorders
    for (const [tabId, recorder] of this.activeRecorders.entries()) {
      if (recorder.isActive()) {
        recorder.stopRecording();
        console.log('⏹️ Stopped recorder on tab:', tabId);
      }
    }

    this.isRecording = false;

    // Sort actions by timestamp (newest first for display)
    this.actions.sort((a, b) => b.timestamp - a.timestamp);

    console.log(`⏹️ Multi-tab recording stopped. Captured ${this.actions.length} actions across ${this.tabContexts.size} tabs`);

    return [...this.actions];
  }

  /**
   * Get all tab contexts
   */
  public getTabContexts(): TabContext[] {
    return Array.from(this.tabContexts.values());
  }

  /**
   * Get start tab ID
   */
  public getStartTabId(): string | null {
    return this.startTabId;
  }

  /**
   * Check if currently recording
   */
  public isActive(): boolean {
    return this.isRecording;
  }

  /**
   * Get current tab ID being recorded
   */
  public getCurrentTabId(): string | null {
    return this.currentTabId;
  }

  /**
   * Get current actions without stopping recording
   * Returns actions sorted by timestamp (newest first)
   */
  public getActions(): RecordedAction[] {
    return [...this.actions].sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Add or update tab context
   */
  private addOrUpdateTabContext(tabId: string, title: string, url: string): void {
    const existing = this.tabContexts.get(tabId);
    const now = Date.now();

    if (existing) {
      // Update existing context
      existing.title = title;
      existing.url = url;
      existing.lastAccessTime = now;
    } else {
      // Create new context
      this.tabContexts.set(tabId, {
        tabId,
        title,
        url,
        firstAccessTime: now,
        lastAccessTime: now,
        actionCount: 0,
      });
    }
  }

  /**
   * Clean up all resources
   */
  public destroy(): void {
    if (this.isRecording) {
      this.stopRecording();
    }
    
    for (const recorder of this.activeRecorders.values()) {
      if (recorder.isActive()) {
        recorder.stopRecording();
      }
    }
    
    this.activeRecorders.clear();
    this.tabContexts.clear();
    this.actions = [];
  }
}
