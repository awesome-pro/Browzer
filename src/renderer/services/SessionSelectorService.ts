import { ISessionSelectorService } from './interfaces';
import { SessionSelector } from '../components/SessionSelector';

export class SessionSelectorService implements ISessionSelectorService {
  private selectedRecordingSessionId: string | null = null;
  private sessionSelector: SessionSelector;

  constructor() {
    this.sessionSelector = new SessionSelector();
  }

  public async show(): Promise<string | null> {
    return await this.sessionSelector.show();
  }

  public setSelectedSessionId(sessionId: string): void {
    this.selectedRecordingSessionId = sessionId;
    console.log('[SessionSelectorService] Selected recording session ID:', sessionId);
  }

  public getSelectedSessionId(): string | null {
    return this.selectedRecordingSessionId;
  }
}
