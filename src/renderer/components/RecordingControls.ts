// RecordingControls - Manages recording UI controls in the toolbar
import { RecordingEngine } from "./RecordingEngine";
import { RecordingSession } from "../../shared/types/recording";

export class RecordingControls {
    private recordingEngine: RecordingEngine;
    private isRecording = false;
    private isPaused = false;
    private activeSession: RecordingSession | null = null;
    private elapsedTime = 0;
    private eventCount = 0;
    private timerInterval: number | null = null;

    // DOM elements
    private startRecordingBtn = document.getElementById('startRecordingBtn') as HTMLButtonElement;
    private recordingActiveControls = document.getElementById('recordingActiveControls') as HTMLElement;
    private pauseRecordingBtn = document.getElementById('pauseRecordingBtn') as HTMLButtonElement;
    private resumeRecordingBtn = document.getElementById('resumeRecordingBtn') as HTMLButtonElement;
    private stopRecordingBtn = document.getElementById('stopRecordingBtn') as HTMLButtonElement;
    private recordingTimer = document.getElementById('recordingTimer') as HTMLElement;
    private recordingEventCount = document.getElementById('recordingEventCount') as HTMLElement;

    // Modal elements
    private sessionModal = document.getElementById('recordingSessionModal') as HTMLElement;
    private sessionNameInput = document.getElementById('recordingSessionName') as HTMLInputElement;
    private sessionDescriptionInput = document.getElementById('recordingSessionDescription') as HTMLTextAreaElement;
    private confirmStartRecordingBtn = document.getElementById('confirmStartRecordingBtn') as HTMLButtonElement;

    constructor() {
        this.recordingEngine = RecordingEngine.getInstance();
        this.initializeDOM();
        this.setupEventListeners();
        this.checkExistingSession();
    }

    private initializeDOM(): void {
        // Main controls
        this.startRecordingBtn = document.getElementById('startRecordingBtn') as HTMLButtonElement;
        this.recordingActiveControls = document.getElementById('recordingActiveControls') as HTMLElement;
        this.pauseRecordingBtn = document.getElementById('pauseRecordingBtn') as HTMLButtonElement;
        this.resumeRecordingBtn = document.getElementById('resumeRecordingBtn') as HTMLButtonElement;
        this.stopRecordingBtn = document.getElementById('stopRecordingBtn') as HTMLButtonElement;
        this.recordingTimer = document.getElementById('recordingTimer') as HTMLElement;
        this.recordingEventCount = document.getElementById('recordingEventCount') as HTMLElement;

        // Modal elements
        this.sessionModal = document.getElementById('recordingSessionModal') as HTMLElement;
        this.sessionNameInput = document.getElementById('recordingSessionName') as HTMLInputElement;
        this.sessionDescriptionInput = document.getElementById('recordingSessionDescription') as HTMLTextAreaElement;
        this.confirmStartRecordingBtn = document.getElementById('confirmStartRecordingBtn') as HTMLButtonElement;
    }

    private setupEventListeners(): void {
        // Main recording controls
        this.startRecordingBtn.addEventListener('click', () => this.showSessionModal());
        this.pauseRecordingBtn.addEventListener('click', () => this.pauseRecording());
        this.resumeRecordingBtn.addEventListener('click', () => this.resumeRecording());
        this.stopRecordingBtn.addEventListener('click', () => this.stopRecording());

        // Modal controls
        this.confirmStartRecordingBtn.addEventListener('click', () => this.startRecording());
        document.getElementById('cancelRecordingBtn')?.addEventListener('click', () => this.hideSessionModal());
        document.getElementById('closeRecordingModal')?.addEventListener('click', () => this.hideSessionModal());

        // Modal backdrop click
        this.sessionModal.addEventListener('click', (e) => {
            if (e.target === this.sessionModal) {
                this.hideSessionModal();
            }
        });

        // Listen for recording events
        window.addEventListener('recording:event', (e: Event) => {
            const customEvent = e as CustomEvent;
            const { type, timestamp, data, context } = customEvent.detail;
            this.eventCount++;
            this.updateEventCount();
        });

        // Enter key in session name input
        this.sessionNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && this.sessionNameInput.value.trim()) {
                this.startRecording();
            }
        });
    }

    private checkExistingSession(): void {
        const session = this.recordingEngine.getActiveSession();
        if (session) {
            this.activeSession = session;
            this.isRecording = true;
            this.showRecordingControls();
            this.startTimer();
        }
    }

    private showSessionModal(): void {
        this.sessionModal.classList.remove('hidden');
        this.sessionNameInput.focus();
        this.sessionNameInput.value = `Recording ${new Date().toLocaleString()}`;
        this.sessionNameInput.select();
    }

    private hideSessionModal(): void {
        this.sessionModal.classList.add('hidden');
        this.sessionNameInput.value = '';
        this.sessionDescriptionInput.value = '';
    }

    private startRecording(): void {
        const sessionName = this.sessionNameInput.value.trim();
        const description = this.sessionDescriptionInput.value.trim();

        if (!sessionName) {
            alert('Please enter a session name');
            return;
        }

        try {
            this.activeSession = this.recordingEngine.startRecording(sessionName, description);
            this.isRecording = true;
            this.isPaused = false;
            this.elapsedTime = 0;
            this.eventCount = 0;

            this.hideSessionModal();
            this.showRecordingControls();
            this.startTimer();

            console.log('🎬 Recording started:', sessionName);
        } catch (error) {
            console.error('Failed to start recording:', error);
            alert('Failed to start recording. Please try again.');
        }
    }

    private pauseRecording(): void {
        this.recordingEngine.pauseRecording();
        this.isPaused = true;
        this.pauseRecordingBtn.classList.add('hidden');
        this.resumeRecordingBtn.classList.remove('hidden');
        this.stopTimer();
        console.log('⏸️ Recording paused');
    }

    private resumeRecording(): void {
        this.recordingEngine.resumeRecording();
        this.isPaused = false;
        this.pauseRecordingBtn.classList.remove('hidden');
        this.resumeRecordingBtn.classList.add('hidden');
        this.startTimer();
        console.log('▶️ Recording resumed');
    }

    private stopRecording(): void {
        try {
            const session = this.recordingEngine.stopRecording();
            if (session) {
                console.log('⏹️ Recording stopped:', session.name, `(${session.metadata.totalEvents} events)`);
                this.showToast(`Recording "${session.name}" saved successfully!`, 'success');
            }

            this.isRecording = false;
            this.isPaused = false;
            this.activeSession = null;
            this.elapsedTime = 0;
            this.eventCount = 0;

            this.hideRecordingControls();
            this.stopTimer();
        } catch (error) {
            console.error('Failed to stop recording:', error);
            alert('Failed to stop recording. Please try again.');
        }
    }

    private showRecordingControls(): void {
        this.startRecordingBtn.classList.add('hidden');
        this.recordingActiveControls.classList.remove('hidden');
    }

    private hideRecordingControls(): void {
        this.startRecordingBtn.classList.remove('hidden');
        this.recordingActiveControls.classList.add('hidden');
        this.pauseRecordingBtn.classList.remove('hidden');
        this.resumeRecordingBtn.classList.add('hidden');
    }

    private startTimer(): void {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        this.timerInterval = window.setInterval(() => {
            if (this.activeSession && !this.isPaused) {
                this.elapsedTime = Date.now() - this.activeSession.startTime;
                this.updateTimer();
            }
        }, 1000);
    }

    private stopTimer(): void {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    private updateTimer(): void {
        const formattedTime = this.formatTime(this.elapsedTime);
        this.recordingTimer.textContent = formattedTime;
    }

    private updateEventCount(): void {
        this.recordingEventCount.textContent = `${this.eventCount} events`;
    }

    private formatTime(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
        }
        return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
    }

    private showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
        // Use existing toast system
        const event = new CustomEvent('show-toast', {
            detail: { message, type }
        });
        window.dispatchEvent(event);
    }

    // Public API
    public isCurrentlyRecording(): boolean {
        return this.isRecording;
    }

    public getActiveSession(): RecordingSession | null {
        return this.activeSession;
    }

    public destroy(): void {
        this.stopTimer();
        // Remove event listeners if needed
    }
}
