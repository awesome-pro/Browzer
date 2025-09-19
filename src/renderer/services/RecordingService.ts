import { IRecordingService } from '../types';
import { SmartRecordingEngine } from '../components/RecordingEngine';
import { RecordingControls } from '../components/RecordingControls';
import { RecordingIndicator } from '../components/RecordingIndicator';

/**
 * RecordingService integrates all recording-related components and functionality
 */
export class RecordingService implements IRecordingService {
  private recordingEngine: SmartRecordingEngine;
  private recordingControls: RecordingControls | null = null;
  private recordingIndicator: RecordingIndicator | null = null;
  private isInitialized: boolean = false;

  constructor() {
    this.recordingEngine = SmartRecordingEngine.getInstance();
  }

  public async initialize(): Promise<void> {
    try {
      console.log('[RecordingService] Initializing recording system...');
      
      // Initialize recording components
      this.recordingControls = new RecordingControls();
      this.recordingIndicator = new RecordingIndicator();
      
      // Make session manager available globally for backward compatibility
      (window as any).sessionManager = {
        show: () => {
          console.log('[RecordingService] Opening session manager modal');
          this.showSessionManager();
        }
      };
      
      // Initialize webview recording integration
      this.recordingEngine.initializeWebviewRecording();
      
      // Setup recording event listeners for webviews
      this.setupRecordingEventListeners();
      
      // Add session manager button to UI
      this.addSessionManagerButton();
      
      // Setup session manager modal event listeners
      this.setupSessionManagerEventListeners();
      
      this.isInitialized = true;
      console.log('[RecordingService] Recording system initialized successfully');
    } catch (error) {
      console.error('[RecordingService] Failed to initialize recording system:', error);
      throw error;
    }
  }

  private setupRecordingEventListeners(): void {
    // Listen for recording start/stop events and notify webviews
    window.addEventListener('recording:start', (e: Event) => {
      console.log('[RecordingService] Recording started, notifying webviews');
      const sessionId = (e as CustomEvent).detail?.sessionId || 
        this.recordingEngine.getActiveSession()?.id || 'unknown';
      
      this.notifyAllWebviews('start-recording', sessionId);
    });
    
    window.addEventListener('recording:stop', () => {
      console.log('[RecordingService] Recording stopped, notifying webviews');
      this.notifyAllWebviews('stop-recording');
    });
    
    window.addEventListener('show-toast', (e: Event) => {
      const customEvent = e as CustomEvent;
      const { message, type } = customEvent.detail;
      this.showToast(message, type);
    });
  }

  private notifyAllWebviews(message: string, data?: any): void {
    document.querySelectorAll('webview').forEach((webview: any) => {
      try {
        console.log(`[RecordingService] Sending ${message} to webview ${webview.id}`);
        webview.send(message, data);
      } catch (error) {
        console.error(`[RecordingService] Failed to send ${message} to webview:`, error);
      }
    });
  }

  private addSessionManagerButton(): void {
    const toolbarActions = document.querySelector('.toolbar-actions') as HTMLDivElement;
    if (!toolbarActions) {
      console.warn('[RecordingService] Toolbar actions container not found');
      return;
    }
    
    // Check if button already exists
    if (document.getElementById('sessionManagerBtn')) {
      console.log('[RecordingService] Session manager button already exists');
      return;
    }
    
    const sessionManagerBtn = document.createElement('button');
    sessionManagerBtn.id = 'sessionManagerBtn';
    sessionManagerBtn.className = 'action-btn';
    sessionManagerBtn.title = 'Recording Sessions';
    sessionManagerBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm1 0v10h10V3H3z"/>
        <path d="M5 5.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5z"/>
      </svg>
    `;
    
    sessionManagerBtn.addEventListener('click', () => {
      if ((window as any).sessionManager) {
        (window as any).sessionManager.show();
      }
    });
    
    // Insert before extensions button if it exists, otherwise append
    const extensionsBtn = document.getElementById('extensionsBtn') as HTMLButtonElement;
    if (extensionsBtn) {
      toolbarActions.insertBefore(sessionManagerBtn, extensionsBtn);
    } else {
      toolbarActions.appendChild(sessionManagerBtn);
    }
    
    console.log('[RecordingService] Session manager button added to toolbar');
  }

  public setupWebviewRecording(webview: any): void {
    if (!this.isInitialized) {
      console.warn('[RecordingService] Recording service not initialized, skipping webview setup');
      return;
    }

    console.log('[RecordingService] Setting up recording for webview:', webview.id);
    try {
      this.recordingEngine.setupWebviewRecording(webview);
      console.log('[RecordingService] ✅ Recording setup complete for webview:', webview.id);
    } catch (error) {
      console.error('[RecordingService] Failed to setup recording for webview:', error);
    }
  }

  public getRecordingEngine(): SmartRecordingEngine {
    return this.recordingEngine;
  }

  public getRecordingControls(): RecordingControls | null {
    return this.recordingControls;
  }

  public getRecordingIndicator(): RecordingIndicator | null {
    return this.recordingIndicator;
  }

  public isRecording(): boolean {
    return this.recordingEngine.isCurrentlyRecording();
  }

  public getActiveSession(): any {
    return this.recordingEngine.getActiveSession();
  }

  public startRecording(taskGoal: string, description?: string): any {
    try {
      return this.recordingEngine.startRecording(taskGoal, description);
    } catch (error) {
      console.error('[RecordingService] Failed to start recording:', error);
      throw error;
    }
  }

  public stopRecording(): any {
    try {
      return this.recordingEngine.stopRecording();
    } catch (error) {
      console.error('[RecordingService] Failed to stop recording:', error);
      throw error;
    }
  }

  private setupSessionManagerEventListeners(): void {
    // Close button
    const closeBtn = document.getElementById('closeSessionManagerBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.hideSessionManager();
      });
    }

    // Refresh button
    const refreshBtn = document.getElementById('refreshSessionsBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.loadAndDisplaySessions();
      });
    }

    // Modal backdrop click
    const sessionModal = document.getElementById('sessionManagerModal');
    if (sessionModal) {
      sessionModal.addEventListener('click', (e) => {
        if (e.target === sessionModal) {
          this.hideSessionManager();
        }
      });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const sessionModal = document.getElementById('sessionManagerModal');
        if (sessionModal && !sessionModal.classList.contains('hidden')) {
          this.hideSessionManager();
        }
      }
    });
  }

  private showSessionManager(): void {
    const sessionModal = document.getElementById('sessionManagerModal');
    if (sessionModal) {
      sessionModal.classList.remove('hidden');
      this.loadAndDisplaySessions();
    } else {
      console.error('[RecordingService] Session manager modal not found in DOM');
    }
  }

  private hideSessionManager(): void {
    const sessionModal = document.getElementById('sessionManagerModal');
    if (sessionModal) {
      sessionModal.classList.add('hidden');
    }
  }

  private loadAndDisplaySessions(): void {
    try {
      const sessions = this.recordingEngine.getAllSessions();
      const sessionsList = document.getElementById('sessionsList');
      
      if (!sessionsList) {
        console.error('[RecordingService] Sessions list element not found');
        return;
      }

      if (sessions.length === 0) {
        sessionsList.innerHTML = `
          <div style="text-align: center; padding: 40px 20px; color: #666;">
            <p>No recording sessions found</p>
            <p style="font-size: 12px;">Start recording to create your first session</p>
          </div>
        `;
        return;
      }

      // Render sessions list
      sessionsList.innerHTML = sessions.map(session => `
        <div class="session-item" data-session-id="${session.id}">
          <div class="session-item-header">
            <div class="session-item-name">${this.escapeHtml(session.taskGoal || 'Unnamed Session')}</div>
            <div class="session-item-date">${this.formatDate(session.startTime)}</div>
          </div>
          ${session.description ? `<div class="session-item-description">${this.escapeHtml(session.description)}</div>` : ''}
          <div class="session-item-stats">
            <span>${this.formatDuration(session.metadata?.duration || 0)}</span>
            <span>${session.metadata?.totalActions || session.actions?.length || 0} actions</span>
            <span>${session.metadata?.complexity || 'unknown'} complexity</span>
          </div>
        </div>
      `).join('');

      // Add click listeners to session items
      sessionsList.querySelectorAll('.session-item').forEach(item => {
        item.addEventListener('click', () => {
          const sessionId = item.getAttribute('data-session-id');
          if (sessionId) {
            this.selectSession(sessionId, sessions);
          }
        });
      });

      console.log(`[RecordingService] Loaded ${sessions.length} sessions`);
    } catch (error) {
      console.error('[RecordingService] Failed to load sessions:', error);
    }
  }

  private selectSession(sessionId: string, sessions: any[]): void {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    // Update selected state in UI
    document.querySelectorAll('.session-item').forEach(item => {
      item.classList.remove('selected');
    });
    document.querySelector(`[data-session-id="${sessionId}"]`)?.classList.add('selected');

    // Show session details
    const sessionDetails = document.getElementById('sessionDetails');
    if (sessionDetails) {
      const recentActions = (session.actions || []).slice(-10).reverse();
      
      sessionDetails.innerHTML = `
        <div class="session-details-header">
          <div>
            <h3 class="session-details-title">${this.escapeHtml(session.taskGoal || 'Unnamed Session')}</h3>
            ${session.description ? `<p class="session-details-description">${this.escapeHtml(session.description)}</p>` : ''}
          </div>
          <div class="session-details-actions">
            <button class="session-action-btn" onclick="window.browzerApp.recordingService.exportSession('${session.id}')">Export</button>
            <button class="session-action-btn danger" onclick="window.browzerApp.recordingService.deleteSession('${session.id}')">Delete</button>
          </div>
        </div>

        <div class="session-metadata-grid">
          <div class="session-metadata-item">
            <div class="session-metadata-label">Duration</div>
            <div class="session-metadata-value">${this.formatDuration(session.metadata?.duration || 0)}</div>
          </div>
          <div class="session-metadata-item">
            <div class="session-metadata-label">Actions</div>
            <div class="session-metadata-value">${session.metadata?.totalActions || session.actions?.length || 0}</div>
          </div>
          <div class="session-metadata-item">
            <div class="session-metadata-label">Complexity</div>
            <div class="session-metadata-value">${session.metadata?.complexity || 'unknown'}</div>
          </div>
          <div class="session-metadata-item">
            <div class="session-metadata-label">Pages</div>
            <div class="session-metadata-value">${session.metadata?.pagesVisited?.length || 0}</div>
          </div>
        </div>

        <div class="session-events-section">
          <h4>Recent Actions (Last 10)</h4>
          <div class="session-events-list">
            ${recentActions.map((action: any) => `
              <div class="session-event-item">
                <div class="session-event-content">
                  <div class="session-event-type">${this.formatActionType(action.type || 'UNKNOWN')}</div>
                  <div class="session-event-details">${action.description || 'No description'}</div>
                </div>
                <div class="session-event-time">${this.formatTime(action.timestamp || Date.now())}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
  }

  public exportSession(sessionId: string): void {
    try {
      const sessions = this.recordingEngine.getAllSessions();
      const session = sessions.find(s => s.id === sessionId);
      if (!session) {
        alert('Session not found');
        return;
      }

      const dataStr = JSON.stringify(session, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `recording_${(session.taskGoal || 'session').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${new Date(session.startTime).toISOString().split('T')[0]}.json`;
      link.click();
      
      URL.revokeObjectURL(url);
      console.log('[RecordingService] Session exported:', sessionId);
    } catch (error) {
      console.error('[RecordingService] Failed to export session:', error);
      alert('Failed to export session');
    }
  }

  public deleteSession(sessionId: string): void {
    if (!confirm('Are you sure you want to delete this recording session? This action cannot be undone.')) {
      return;
    }

    try {
      localStorage.removeItem(`smart_recording_${sessionId}`);
      this.loadAndDisplaySessions();
      
      // Clear session details
      const sessionDetails = document.getElementById('sessionDetails');
      if (sessionDetails) {
        sessionDetails.innerHTML = `
          <div class="session-details-empty">
            <p>Select a session to view details</p>
          </div>
        `;
      }
      
      console.log('[RecordingService] Session deleted:', sessionId);
      this.showToast('Session deleted successfully', 'success');
    } catch (error) {
      console.error('[RecordingService] Failed to delete session:', error);
      alert('Failed to delete session');
    }
  }

  // Utility methods
  private formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString();
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m ${seconds % 60}s`;
  }

  private formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  private formatActionType(type: string): string {
    return type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private showToast(message: string, type: string = 'info'): void {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
      toast!.className = 'toast';
    }, 3000);
  }

  public destroy(): void {
    try {
      // Cleanup recording components
      if (this.recordingControls) {
        this.recordingControls.destroy();
        this.recordingControls = null;
      }
      
      if (this.recordingIndicator) {
        this.recordingIndicator.destroy();
        this.recordingIndicator = null;
      }
      
      // Remove session manager button
      const sessionManagerBtn = document.getElementById('sessionManagerBtn');
      if (sessionManagerBtn) {
        sessionManagerBtn.remove();
      }
      
      // Clear global session manager
      if ((window as any).sessionManager) {
        delete (window as any).sessionManager;
      }
      
      this.isInitialized = false;
      console.log('[RecordingService] Recording service destroyed successfully');
    } catch (error) {
      console.error('[RecordingService] Error during destruction:', error);
    }
  }
}
