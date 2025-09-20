import { SmartRecordingEngine } from './RecordingEngine';

export class SessionSelector {
  private element: HTMLElement | null = null;
  private recordingEngine: SmartRecordingEngine;
  private resolvePromise: ((sessionId: string | null) => void) | null = null;
  private selectedSessionId: string | null = null;

  constructor() {
    this.recordingEngine = SmartRecordingEngine.getInstance();
  }

  public show(): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.createDialog();
      this.loadSessions();
      this.showDialog();
    });
  }

  private createDialog(): void {
    if (this.element) {
      document.body.removeChild(this.element);
    }

    this.element = document.createElement('div');
    this.element.className = 'session-selector-overlay';
    this.element.innerHTML = `
      <div class="session-selector-dialog">
        <div class="session-selector-header">
          <h3>Select a Recording Session</h3>
          <button id="closeSessionSelectorBtn" class="close-btn">&times;</button>
        </div>
        <div class="session-selector-content">
          <p class="session-selector-instruction">Select a recording session to use as context for your task</p>
          <div id="sessionSelectorList" class="session-selector-list">
            <div class="session-selector-loading">Loading sessions...</div>
          </div>
        </div>
        <div class="session-selector-footer">
          <button id="cancelSessionSelectorBtn" class="secondary-btn">Cancel</button>
          <button id="confirmSessionSelectorBtn" class="primary-btn" disabled>Continue</button>
        </div>
      </div>
    `;

    const styleId = 'session-selector-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .session-selector-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        }
        
        .session-selector-dialog {
          background-color: #fff;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          width: 500px;
          max-width: 90%;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
        }
        
        .session-selector-header {
          padding: 16px;
          border-bottom: 1px solid #eee;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .session-selector-header h3 {
          margin: 0;
          font-size: 18px;
        }
        
        .close-btn {
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          color: #666;
        }
        
        .session-selector-content {
          padding: 16px;
          overflow-y: auto;
          flex-grow: 1;
        }
        
        .session-selector-instruction {
          margin-top: 0;
          margin-bottom: 16px;
          color: #666;
        }
        
        .session-selector-list {
          max-height: 300px;
          overflow-y: auto;
          border: 1px solid #eee;
          border-radius: 4px;
        }
        
        .session-selector-item {
          padding: 12px;
          border-bottom: 1px solid #eee;
          cursor: pointer;
        }
        
        .session-selector-item:last-child {
          border-bottom: none;
        }
        
        .session-selector-item:hover {
          background-color: #f5f5f5;
        }
        
        .session-selector-item.selected {
          background-color: #e6f7ff;
          border-left: 3px solid #1890ff;
        }
        
        .session-selector-item-name {
          font-weight: 500;
          margin-bottom: 4px;
        }
        
        .session-selector-item-date {
          font-size: 12px;
          color: #999;
        }
        
        .session-selector-item-description {
          font-size: 13px;
          margin-top: 4px;
          color: #666;
        }
        
        .session-selector-footer {
          padding: 16px;
          border-top: 1px solid #eee;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }
        
        .primary-btn {
          background-color: #1890ff;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
        }
        
        .primary-btn:disabled {
          background-color: #ccc;
          cursor: not-allowed;
        }
        
        .secondary-btn {
          background-color: #f5f5f5;
          color: #666;
          border: 1px solid #d9d9d9;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
        }
        
        .session-selector-loading {
          padding: 20px;
          text-align: center;
          color: #999;
        }
        
        .session-selector-empty {
          padding: 20px;
          text-align: center;
          color: #999;
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(this.element);
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.element) return;

    const closeBtn = this.element.querySelector('#closeSessionSelectorBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.cancel());
    }

    const cancelBtn = this.element.querySelector('#cancelSessionSelectorBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.cancel());
    }

    const confirmBtn = this.element.querySelector('#confirmSessionSelectorBtn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.confirm());
    }

    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) {
        this.cancel();
      }
    });

    document.addEventListener('keydown', this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.cancel();
    }
  };

  private loadSessions(): void {
    const sessions = this.recordingEngine.getAllSessions();
    const listElement = this.element?.querySelector('#sessionSelectorList');
    
    if (!listElement) return;

    if (sessions.length === 0) {
      listElement.innerHTML = `
        <div class="session-selector-empty">
          <p>No recording sessions found</p>
          <p>Record a workflow first to use as context</p>
        </div>
      `;
      return;
    }

    sessions.sort((a, b) => b.startTime - a.startTime);

    listElement.innerHTML = sessions.map(session => `
      <div class="session-selector-item" data-session-id="${session.id}">
        <div class="session-selector-item-name">${this.escapeHtml(session.taskGoal || 'Unnamed Session')}</div>
        <div class="session-selector-item-date">${this.formatDate(session.startTime)}</div>
        ${session.description ? `<div class="session-selector-item-description">${this.escapeHtml(session.description)}</div>` : ''}
      </div>
    `).join('');

    const sessionItems = listElement.querySelectorAll('.session-selector-item');
    sessionItems.forEach(item => {
      item.addEventListener('click', () => {
        sessionItems.forEach(i => i.classList.remove('selected'));
        
        item.classList.add('selected');
        
        this.selectedSessionId = item.getAttribute('data-session-id');
        
        const confirmBtn = this.element?.querySelector('#confirmSessionSelectorBtn') as HTMLButtonElement;
        if (confirmBtn) {
          confirmBtn.disabled = false;
        }
      });
    });
  }

  private showDialog(): void {
    if (this.element) {
      this.element.style.display = 'flex';
    }
  }

  private hideDialog(): void {
    if (this.element) {
      this.element.style.display = 'none';
    }
  }

  private cancel(): void {
    this.hideDialog();
    this.cleanup();
    
    if (this.resolvePromise) {
      this.resolvePromise(null);
      this.resolvePromise = null;
    }
  }

  private confirm(): void {
    this.hideDialog();
    this.cleanup();
    
    if (this.resolvePromise) {
      this.resolvePromise(this.selectedSessionId);
      this.resolvePromise = null;
    }
  }

  private cleanup(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
    
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    
    this.element = null;
  }

  private formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString();
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}