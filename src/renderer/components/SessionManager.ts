// SessionManager - Manages and displays recording sessions
import { RecordingEngine } from './RecordingEngine';
import { RecordingSession, MLContext, EventType } from '../../shared/types/recording';

export class SessionManager {
    private recordingEngine: RecordingEngine;
    private sessions: RecordingSession[] = [];
    private selectedSession: RecordingSession | null = null;

    // DOM elements
    private sessionModal = document.getElementById('sessionManagerModal') as HTMLElement;
    private sessionsList = document.getElementById('sessionsList') as HTMLElement;
    private sessionDetails = document.getElementById('sessionDetails') as HTMLElement;
    private refreshBtn = document.getElementById('refreshSessionsBtn') as HTMLButtonElement;
    private closeBtn = document.getElementById('closeSessionManagerBtn') as HTMLButtonElement;

    constructor() {
        this.recordingEngine = RecordingEngine.getInstance();
        this.initializeDOM();
        this.setupEventListeners();
    }

    private initializeDOM(): void {
        this.sessionModal = document.getElementById('sessionManagerModal') as HTMLElement;
        this.sessionsList = document.getElementById('sessionsList') as HTMLElement;
        this.sessionDetails = document.getElementById('sessionDetails') as HTMLElement;
        this.refreshBtn = document.getElementById('refreshSessionsBtn') as HTMLButtonElement;
        this.closeBtn = document.getElementById('closeSessionManagerBtn') as HTMLButtonElement;
    }

    private setupEventListeners(): void {
        this.refreshBtn.addEventListener('click', () => this.loadSessions());
        this.closeBtn.addEventListener('click', () => this.hide());

        // Modal backdrop click
        this.sessionModal.addEventListener('click', (e) => {
            if (e.target === this.sessionModal) {
                this.hide();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.sessionModal.classList.contains('hidden')) {
                this.hide();
            }
        });
    }

    public show(): void {
        this.sessionModal.classList.remove('hidden');
        this.loadSessions();
    }

    public hide(): void {
        this.sessionModal.classList.add('hidden');
        this.selectedSession = null;
    }

    private async loadSessions(): Promise<void> {
        try {
            this.sessions = this.recordingEngine.getAllSessions();
            this.renderSessionsList();
            
            if (this.sessions.length === 0) {
                this.showEmptyState();
            }
        } catch (error) {
            console.error('Failed to load sessions:', error);
            this.showError('Failed to load recording sessions');
        }
    }

    private renderSessionsList(): void {
        if (this.sessions.length === 0) {
            this.sessionsList.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #666;">
                    <p>No recording sessions found</p>
                    <p style="font-size: 12px;">Start recording to create your first session</p>
                </div>
            `;
            return;
        }

        this.sessionsList.innerHTML = this.sessions.map(session => `
            <div class="session-item" data-session-id="${session.id}">
                <div class="session-item-header">
                    <div class="session-item-name">${this.escapeHtml(session.name)}</div>
                    <div class="session-item-date">${this.formatDate(session.startTime)}</div>
                </div>
                ${session.description ? `<div class="session-item-description">${this.escapeHtml(session.description)}</div>` : ''}
                <div class="session-item-stats">
                    <span>${this.formatDuration(session.metadata.totalDuration)}</span>
                    <span>${session.metadata.totalEvents} events</span>
                    <span>${session.metadata.userInteractions} interactions</span>
                </div>
            </div>
        `).join('');

        // Add click listeners to session items
        this.sessionsList.querySelectorAll('.session-item').forEach(item => {
            item.addEventListener('click', () => {
                const sessionId = item.getAttribute('data-session-id');
                if (sessionId) {
                    this.selectSession(sessionId);
                }
            });
        });
    }

    private selectSession(sessionId: string): void {
        const session = this.sessions.find(s => s.id === sessionId);
        if (!session) return;

        this.selectedSession = session;
        
        // Update selected state in UI
        this.sessionsList.querySelectorAll('.session-item').forEach(item => {
            item.classList.remove('selected');
        });
        this.sessionsList.querySelector(`[data-session-id="${sessionId}"]`)?.classList.add('selected');

        // Show session details
        this.renderSessionDetails(session);
    }

    private renderSessionDetails(session: RecordingSession): void {
        const recentEvents = session.events.slice(-10).reverse();
        
        this.sessionDetails.innerHTML = `
            <div class="session-details-header">
                <div>
                    <h3 class="session-details-title">${this.escapeHtml(session.name)}</h3>
                    ${session.description ? `<p class="session-details-description">${this.escapeHtml(session.description)}</p>` : ''}
                </div>
                <div class="session-details-actions">
                    <button class="session-action-btn" onclick="sessionManager.exportSession('${session.id}')">Export</button>
                    <button class="session-action-btn primary" onclick="sessionManager.exportMLContext('${session.id}')">Export ML</button>
                    <button class="session-action-btn danger" onclick="sessionManager.deleteSession('${session.id}')">Delete</button>
                </div>
            </div>

            <div class="session-metadata-grid">
                <div class="session-metadata-item">
                    <div class="session-metadata-label">Duration</div>
                    <div class="session-metadata-value">${this.formatDuration(session.metadata.totalDuration)}</div>
                </div>
                <div class="session-metadata-item">
                    <div class="session-metadata-label">Events</div>
                    <div class="session-metadata-value">${session.metadata.totalEvents}</div>
                </div>
                <div class="session-metadata-item">
                    <div class="session-metadata-label">Interactions</div>
                    <div class="session-metadata-value">${session.metadata.userInteractions}</div>
                </div>
                <div class="session-metadata-item">
                    <div class="session-metadata-label">Network</div>
                    <div class="session-metadata-value">${session.metadata.networkRequests}</div>
                </div>
            </div>

            <div class="session-events-section">
                <h4>Recent Events (Last 10)</h4>
                <div class="session-events-list">
                    ${recentEvents.map(event => `
                        <div class="session-event-item">
                            <div class="session-event-icon ${event.type}">
                                ${this.getEventIcon(event.type)}
                            </div>
                            <div class="session-event-content">
                                <div class="session-event-type">${this.formatEventType(event.type)}</div>
                                <div class="session-event-details">${this.getEventDetails(event)}</div>
                            </div>
                            <div class="session-event-time">${this.formatTime(event.timestamp)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    private showEmptyState(): void {
        this.sessionDetails.innerHTML = `
            <div class="session-details-empty">
                <svg width="48" height="48" viewBox="0 0 16 16" fill="#9ca3af">
                    <path d="M13 16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V2a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10z"/>
                </svg>
                <p>No recording sessions found</p>
            </div>
        `;
    }

    private showError(message: string): void {
        this.sessionDetails.innerHTML = `
            <div class="session-details-empty">
                <p style="color: #dc2626;">${message}</p>
            </div>
        `;
    }

    // Public methods for button actions
    public exportSession(sessionId: string): void {
        const session = this.sessions.find(s => s.id === sessionId);
        if (!session) return;

        const dataStr = JSON.stringify(session, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `recording_${session.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${new Date(session.startTime).toISOString().split('T')[0]}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
    }

    public exportMLContext(sessionId: string): void {
        const context = this.recordingEngine.exportToMLFormat(sessionId);
        if (!context) {
            alert('Failed to generate ML context for this session');
            return;
        }
        
        const dataStr = JSON.stringify(context, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const session = this.sessions.find(s => s.id === sessionId);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ml_context_${session?.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
    }

    public deleteSession(sessionId: string): void {
        if (!confirm('Are you sure you want to delete this recording session? This action cannot be undone.')) {
            return;
        }

        try {
            localStorage.removeItem(`recording_session_${sessionId}`);
            this.loadSessions();
            
            if (this.selectedSession?.id === sessionId) {
                this.selectedSession = null;
                this.showEmptyState();
            }
            
            console.log('Session deleted:', sessionId);
        } catch (error) {
            console.error('Failed to delete session:', error);
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

    private formatEventType(type: EventType): string {
        return type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    private getEventIcon(type: EventType): string {
        switch (type) {
            case EventType.CLICK: return '👆';
            case EventType.INPUT: return '⌨️';
            case EventType.SCROLL: return '📜';
            case EventType.DOM_MUTATION: return '🔄';
            case EventType.NETWORK_REQUEST: return '🌐';
            case EventType.PAGE_LOAD: return '📄';
            default: return '📝';
        }
    }

    private getEventDetails(event: any): string {
        if (event.data.element?.selector) {
            return event.data.element.selector;
        }
        if (event.data.network?.url) {
            return event.data.network.url;
        }
        return event.context.url;
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global instance for button callbacks
declare global {
    interface Window {
        sessionManager: SessionManager;
    }
}
