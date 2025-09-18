/**
 * RecordingSessionList - Component for displaying and selecting recorded sessions in the chat sidebar
 */

import { RecordingEngine } from './RecordingEngine';
import { RecordingSession } from '../../shared/types/recording';

export class RecordingSessionList {
  private recordingEngine: RecordingEngine;
  private sessions: RecordingSession[] = [];
  private selectedSessionId: string | null = null;
  private container: HTMLElement | null = null;
  private onSessionSelected: (session: RecordingSession) => void;

  constructor(container: HTMLElement, onSessionSelected: (session: RecordingSession) => void) {
    this.recordingEngine = RecordingEngine.getInstance();
    this.container = container;
    this.onSessionSelected = onSessionSelected;
    this.initialize();
  }

  private initialize(): void {
    if (!this.container) {
      console.error('RecordingSessionList: Container element not found');
      return;
    }

    this.loadSessions();
  }

  public loadSessions(): void {
    try {
      this.sessions = this.recordingEngine.getAllSessions();
      this.renderSessionList();
    } catch (error) {
      console.error('Failed to load recording sessions:', error);
      this.renderError('Failed to load recording sessions');
    }
  }

  public getSelectedSession(): RecordingSession | null {
    if (!this.selectedSessionId) return null;
    return this.sessions.find(s => s.id === this.selectedSessionId) || null;
  }

  private renderSessionList(): void {
    if (!this.container) return;

    // Clear the container
    this.container.innerHTML = '';

    if (this.sessions.length === 0) {
      this.renderEmptyState();
      return;
    }

    // Create header
    const header = document.createElement('div');
    header.className = 'session-list-header';
    header.innerHTML = `
      <h3>Recorded Sessions</h3>
      <button id="refreshSessionsListBtn" class="refresh-btn" title="Refresh">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/>
          <path d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/>
        </svg>
      </button>
    `;
    this.container.appendChild(header);

    // Create session list
    const sessionList = document.createElement('div');
    sessionList.className = 'session-list-items';

    // Sort sessions by date (newest first)
    this.sessions.sort((a, b) => b.startTime - a.startTime);

    this.sessions.forEach(session => {
      const sessionItem = document.createElement('div');
      sessionItem.className = 'session-list-item';
      sessionItem.dataset.sessionId = session.id;
      
      if (this.selectedSessionId === session.id) {
        sessionItem.classList.add('selected');
      }
      
      const duration = this.formatDuration(session.metadata.totalDuration);
      const date = this.formatDate(session.startTime);
      
      sessionItem.innerHTML = `
        <div class="session-item-name">${this.escapeHtml(session.name)}</div>
        <div class="session-item-info">
          <span class="session-item-date">${date}</span>
          <span class="session-item-duration">${duration}</span>
          <span class="session-item-events">${session.metadata.totalEvents} events</span>
        </div>
      `;
      
      sessionItem.addEventListener('click', () => {
        this.selectSession(session.id);
      });
      
      sessionList.appendChild(sessionItem);
    });

    this.container.appendChild(sessionList);

    // Add event listener to refresh button
    const refreshBtn = this.container.querySelector('#refreshSessionsListBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadSessions());
    }
  }

  private renderEmptyState(): void {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="session-list-empty">
        <svg width="48" height="48" viewBox="0 0 16 16" fill="#9ca3af">
          <path d="M13 16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V2a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10z"/>
        </svg>
        <p>No recording sessions found</p>
        <p class="session-list-empty-hint">Start recording to create your first session</p>
      </div>
    `;
  }

  private renderError(message: string): void {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="session-list-error">
        <p>${message}</p>
        <button id="retryLoadSessionsBtn" class="retry-btn">Retry</button>
      </div>
    `;
    
    const retryBtn = this.container.querySelector('#retryLoadSessionsBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.loadSessions());
    }
  }

  public selectSession(sessionId: string): void {
    this.selectedSessionId = sessionId;
    
    // Update UI to show selected session
    if (this.container) {
      const items = this.container.querySelectorAll('.session-list-item');
      items.forEach(item => {
        if (item.getAttribute('data-session-id') === sessionId) {
          item.classList.add('selected');
        } else {
          item.classList.remove('selected');
        }
      });
    }
    
    // Find the session and trigger callback
    const session = this.sessions.find(s => s.id === sessionId);
    if (session && this.onSessionSelected) {
      this.onSessionSelected(session);
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

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
