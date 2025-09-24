/**
 * RecordingActionsOverlay.ts
 * 
 * This component shows a real-time list of actions being recorded
 * in the sidebar area during an active recording session.
 */

export class RecordingActionsOverlay {
  private overlayContainer: HTMLElement | null = null;
  private actionsList: HTMLElement | null = null;
  private isVisible: boolean = false;
  private maxActions: number = 20; // Maximum number of actions to display
  private recentActionHashes: Map<string, number> = new Map(); // Store recent action hashes with timestamps
  private deduplicationWindow: number = 1000; // Time window in ms to detect duplicates

  constructor() {
    this.createOverlayElements();
  }

  /**
   * Create the overlay DOM elements
   */
  private createOverlayElements(): void {
    // Create container
    this.overlayContainer = document.createElement('div');
    this.overlayContainer.id = 'recordingActionsOverlay';
    this.overlayContainer.className = 'recording-actions-overlay hidden';

    // Create header
    const header = document.createElement('div');
    header.className = 'recording-actions-header';
    
    const titleContainer = document.createElement('div');
    titleContainer.className = 'recording-actions-title';
    
    const recordingDot = document.createElement('div');
    recordingDot.className = 'recording-actions-dot';
    
    const titleText = document.createElement('h4');
    titleText.textContent = 'Recording Actions';
    
    titleContainer.appendChild(recordingDot);
    titleContainer.appendChild(titleText);
    
    const actionCounter = document.createElement('div');
    actionCounter.className = 'recording-actions-counter';
    actionCounter.id = 'recordingActionsCounter';
    actionCounter.textContent = '0 actions';
    
    header.appendChild(titleContainer);
    header.appendChild(actionCounter);
    
    // Create actions list container
    this.actionsList = document.createElement('div');
    this.actionsList.className = 'recording-actions-list';
    this.actionsList.id = 'recordingActionsList';
    
    // Create empty state
    const emptyState = document.createElement('div');
    emptyState.className = 'recording-actions-empty';
    emptyState.id = 'recordingActionsEmpty';
    emptyState.textContent = 'Actions will appear here as you interact with the browser...';
    this.actionsList.appendChild(emptyState);
    
    // Assemble the overlay
    this.overlayContainer.appendChild(header);
    this.overlayContainer.appendChild(this.actionsList);
    
    // Add to DOM when ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.attachToDom());
    } else {
      this.attachToDom();
    }
  }

  /**
   * Attach the overlay to the DOM
   */
  private attachToDom(): void {
    const agentResults = document.getElementById('agentResults');
    if (agentResults && this.overlayContainer) {
      agentResults.appendChild(this.overlayContainer);
    }
  }

  /**
   * Show the overlay
   */
  public show(): void {
    if (this.overlayContainer) {
      this.overlayContainer.classList.remove('hidden');
      this.isVisible = true;
    }
  }

  /**
   * Hide the overlay
   */
  public hide(): void {
    if (this.overlayContainer) {
      this.overlayContainer.classList.add('hidden');
      this.isVisible = false;
      this.clearActions();
      // Clear deduplication map
      this.recentActionHashes.clear();
    }
  }

  /**
   * Add a new action to the list
   * @param action The action to add
   */
  public addAction(action: { type: string; description: string; timestamp: number }): void {
    if (!this.actionsList || !this.isVisible) return;

    // Check for duplicates
    const actionHash = this.generateActionHash(action);
    const now = Date.now();
    
    // Clean up old hashes
    this.cleanupOldHashes(now);
    
    // Check if this is a duplicate action within the deduplication window
    if (this.recentActionHashes.has(actionHash)) {
      const lastTime = this.recentActionHashes.get(actionHash) || 0;
      if (now - lastTime < this.deduplicationWindow) {
        // Skip duplicate action 
        return;
      }
    }
    
    // Store this action hash
    this.recentActionHashes.set(actionHash, now);

    // Remove empty state if present
    const emptyState = document.getElementById('recordingActionsEmpty');
    if (emptyState) {
      emptyState.remove();
    }

    // Create action item
    const actionItem = document.createElement('div');
    actionItem.className = 'recording-action-item';
    
    // Add animation class for entrance effect
    actionItem.classList.add('recording-action-item-new');
    
    // Create action icon based on type
    const actionIcon = document.createElement('div');
    actionIcon.className = 'recording-action-icon';
    actionIcon.innerHTML = this.getActionIcon(action.type);
    
    // Create action content
    const actionContent = document.createElement('div');
    actionContent.className = 'recording-action-content';
    
    const actionDescription = document.createElement('div');
    actionDescription.className = 'recording-action-description';
    actionDescription.textContent = action.description;
    
    const actionTime = document.createElement('div');
    actionTime.className = 'recording-action-time';
    actionTime.textContent = this.formatTime(action.timestamp);
    
    actionContent.appendChild(actionDescription);
    actionContent.appendChild(actionTime);
    
    actionItem.appendChild(actionIcon);
    actionItem.appendChild(actionContent);
    
    // Add to list
    this.actionsList.insertBefore(actionItem, this.actionsList.firstChild);
    
    // Limit the number of displayed actions
    this.limitActionsList();
    
    // Update counter
    this.updateActionCounter();
    
    // Remove animation class after animation completes
    setTimeout(() => {
      actionItem.classList.remove('recording-action-item-new');
    }, 500);
  }
  
  /**
   * Generate a hash for an action to detect duplicates
   * @param action The action to hash
   * @returns A string hash
   */
  private generateActionHash(action: { type: string; description: string; timestamp: number }): string {
    return `${action.type}:${action.description}`;
  }
  
  /**
   * Clean up old action hashes that are outside the deduplication window
   * @param currentTime The current timestamp
   */
  private cleanupOldHashes(currentTime: number): void {
    this.recentActionHashes.forEach((timestamp, hash) => {
      if (currentTime - timestamp > this.deduplicationWindow) {
        this.recentActionHashes.delete(hash);
      }
    });
  }

  /**
   * Clear all actions from the list
   */
  public clearActions(): void {
    if (this.actionsList) {
      this.actionsList.innerHTML = '';
      
      // Add empty state back
      const emptyState = document.createElement('div');
      emptyState.className = 'recording-actions-empty';
      emptyState.id = 'recordingActionsEmpty';
      emptyState.textContent = 'Actions will appear here as you interact with the browser...';
      this.actionsList.appendChild(emptyState);
      
      // Reset counter
      const counter = document.getElementById('recordingActionsCounter');
      if (counter) {
        counter.textContent = '0 actions';
      }
    }
  }

  /**
   * Update the action counter
   */
  private updateActionCounter(): void {
    const counter = document.getElementById('recordingActionsCounter');
    if (counter && this.actionsList) {
      const count = this.actionsList.querySelectorAll('.recording-action-item').length;
      counter.textContent = `${count} action${count !== 1 ? 's' : ''}`;
    }
  }

  /**
   * Limit the number of actions displayed
   */
  private limitActionsList(): void {
    if (!this.actionsList) return;
    
    const actions = this.actionsList.querySelectorAll('.recording-action-item');
    if (actions.length > this.maxActions) {
      // Remove oldest actions (at the bottom)
      for (let i = this.maxActions; i < actions.length; i++) {
        actions[i].remove();
      }
    }
  }

  /**
   * Get an icon for the action type
   * @param actionType The type of action
   * @returns SVG icon string
   */
  private getActionIcon(actionType: string): string {
    const iconMap: Record<string, string> = {
      'click': '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z"/></svg>',
      'type': '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 3a.5.5 0 0 1 .5.5V11a.5.5 0 0 1-.5.5H2.5a.5.5 0 0 1-.5-.5V3.5a.5.5 0 0 1 .5-.5h11zm-11-1A1.5 1.5 0 0 0 1 3.5V11a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V3.5A1.5 1.5 0 0 0 13.5 2h-11z"/><path d="M3 4.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5z"/></svg>',
      'navigation': '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zM4.5 7.5a.5.5 0 0 0 0 1h5.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3a.5.5 0 0 0 0-.708l-3-3a.5.5 0 1 0-.708.708L10.293 7.5H4.5z"/></svg>',
      'select': '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M7.5 1.018a7 7 0 0 0-4.79 11.566L1.13 14.25a1 1 0 0 0 1.027 1.624L6.5 13.642l4.343 2.232a1 1 0 0 0 1.027-1.624l-1.58-1.666a7 7 0 0 0-2.79-11.566zM7.5 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"/></svg>',
      'form_submit': '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11ZM6.636 10.07l2.761 4.338L14.13 2.576 6.636 10.07Zm6.787-8.201L1.591 6.602l4.339 2.76 7.494-7.493Z"/></svg>',
      'toggle': '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5 3a5 5 0 0 0 0 10h6a5 5 0 0 0 0-10H5zm6 9a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/></svg>',
      'keypress': '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14 5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h12zM2 4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H2z"/><path d="M13 10.25a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm0-2a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-5 0A.25.25 0 0 1 8.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 8 8.75v-.5zm2 0a.25.25 0 0 1 .25-.25h1.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-1.5a.25.25 0 0 1-.25-.25v-.5zm1 2a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-5-2A.25.25 0 0 1 6.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 6 8.75v-.5zm-2 0A.25.25 0 0 1 4.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 4 8.75v-.5zm-2 0A.25.25 0 0 1 2.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 2 8.75v-.5zm11-2a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-2 0a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-2 0a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-2 0A.25.25 0 0 1 7.25 6h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 7 6.75v-.5zm-2 0A.25.25 0 0 1 5.25 6h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 5 6.75v-.5zm-3 0A.25.25 0 0 1 2.25 6h1.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-1.5A.25.25 0 0 1 2 6.75v-.5zm0 4a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm0-2a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5z"/></svg>',
      'copy': '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>',
      'paste': '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>',
      'page_load': '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8.186 1.113a.5.5 0 0 0-.372 0L1.846 3.5l2.404.961L10.404 2l-2.218-.887zm3.564 1.426L5.596 5 8 5.961 14.154 3.5l-2.404-.961zm3.25 1.7-6.5 2.6v7.922l6.5-2.6V4.24zM7.5 14.762V6.838L1 4.239v7.923l6.5 2.6zM7.443.184a1.5 1.5 0 0 1 1.114 0l7.129 2.852A.5.5 0 0 1 16 3.5v8.662a1 1 0 0 1-.629.928l-7.185 2.874a.5.5 0 0 1-.372 0L.63 13.09a1 1 0 0 1-.63-.928V3.5a.5.5 0 0 1 .314-.464L7.443.184z"/></svg>',
      'search_results': '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>'
    };
    
    // Default icon for unknown action types
    return iconMap[actionType] || '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M5.255 5.786a.237.237 0 0 0 .241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286zm1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94z"/></svg>';
  }

  /**
   * Format timestamp to time string
   * @param timestamp The timestamp to format
   * @returns Formatted time string (HH:MM:SS)
   */
  private formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}
