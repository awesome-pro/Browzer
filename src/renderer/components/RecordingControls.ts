// RecordingControls - Manages recording UI controls in the toolbar
import { SmartRecordingEngine } from "./RecordingEngine";
import { SmartRecordingSession, TaskGoal } from "../../shared/types/recording";

export class RecordingControls {
    private recordingEngine: SmartRecordingEngine;
    private isRecording = false;
    private isPaused = false;
    private activeSession: SmartRecordingSession | null = null;
    private elapsedTime = 0;
    private eventCount = 0;
    private timerInterval: number | null = null;

    // DOM elements
    private startRecordingBtn = document.getElementById('startRecordingBtn') as HTMLButtonElement;
    private recordingActiveControls = document.getElementById('recordingActiveControls') as HTMLElement;
    // private pauseRecordingBtn = document.getElementById('pauseRecordingBtn') as HTMLButtonElement;
    // private resumeRecordingBtn = document.getElementById('resumeRecordingBtn') as HTMLButtonElement;
    private stopRecordingBtn = document.getElementById('stopRecordingBtn') as HTMLButtonElement;
    private recordingTimer = document.getElementById('recordingTimer') as HTMLElement;
    private recordingEventCount = document.getElementById('recordingEventCount') as HTMLElement;

    // Modal elements
    private sessionModal = document.getElementById('recordingSessionModal') as HTMLElement;
    private sessionNameInput = document.getElementById('recordingSessionName') as HTMLInputElement;
    private sessionDescriptionInput = document.getElementById('recordingSessionDescription') as HTMLTextAreaElement;
    private confirmStartRecordingBtn = document.getElementById('confirmStartRecordingBtn') as HTMLButtonElement;

    constructor() {
        this.recordingEngine = SmartRecordingEngine.getInstance();
        this.initializeDOM();   
        this.setupEventListeners();
        this.checkExistingSession();
    }

    private initializeDOM(): void {
        // Main controls
        this.startRecordingBtn = document.getElementById('startRecordingBtn') as HTMLButtonElement;
        this.recordingActiveControls = document.getElementById('recordingActiveControls') as HTMLElement;
        // this.pauseRecordingBtn = document.getElementById('pauseRecordingBtn') as HTMLButtonElement;
        // this.resumeRecordingBtn = document.getElementById('resumeRecordingBtn') as HTMLButtonElement;
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
        this.startRecordingBtn.addEventListener('click', () => this.startRecordingDirectly());
        // this.pauseRecordingBtn.addEventListener('click', () => this.pauseRecording());
        // this.resumeRecordingBtn.addEventListener('click', () => this.resumeRecording());
        this.stopRecordingBtn.addEventListener('click', () => this.stopRecordingWithDialog());

        // Modal controls
        this.confirmStartRecordingBtn.addEventListener('click', () => this.startRecording());
        document.getElementById('cancelRecordingBtn')?.addEventListener('click', () => this.cancelSaveDialog());
        document.getElementById('closeRecordingModal')?.addEventListener('click', () => this.cancelSaveDialog());

        // Modal backdrop click
        this.sessionModal.addEventListener('click', (e) => {
            if (e.target === this.sessionModal) {
                this.hideSessionModal();
            }
        });

        // Listen for action events from SmartRecordingEngine
        window.addEventListener('recording:action', (e: Event) => {
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
        // Update modal content for save workflow
        const modalTitle = this.sessionModal.querySelector('h3');
        const confirmButton = this.confirmStartRecordingBtn;
        
        if (modalTitle) modalTitle.textContent = 'Save Recording Session';
        if (confirmButton) confirmButton.textContent = 'Save Recording';
        
        this.sessionModal.classList.remove('hidden');
        this.sessionNameInput.focus();
        this.sessionNameInput.select();
    }

    private hideSessionModal(): void {
        this.sessionModal.classList.add('hidden');
        this.sessionNameInput.value = '';
        this.sessionDescriptionInput.value = '';
    }

    private cancelSaveDialog(): void {
        // User cancelled saving - discard the recording
        if (this.activeSession) {
            console.log('🗑️ Recording discarded by user');
            this.showToast('Recording discarded', 'info');
        }
        
        this.activeSession = null;
        this.hideSessionModal();
        this.stopRecording();
    }

    private startRecordingDirectly(): void {
        try {
            // Start recording immediately with auto-generated name
            const autoName = `Recording ${new Date().toLocaleString()}`;
            
            // Use taskGoal parameter instead of name for SmartRecordingEngine
            this.activeSession = this.recordingEngine.startRecording(autoName, '');
            this.isRecording = true;
            this.isPaused = false;
            this.elapsedTime = 0;
            this.eventCount = 0;

            this.showRecordingControls();
            this.startTimer();

            console.log('🎬 Smart Recording started:', autoName);
            this.showToast('Recording started!', 'info');
        } catch (error) {
            console.error('Failed to start recording:', error);
            alert('Failed to start recording. Please try again.');
        }
    }

    private startRecording(): void {
        const sessionName = this.sessionNameInput.value.trim();
        const description = this.sessionDescriptionInput.value.trim();

        if (!sessionName) {
            alert('Please enter a session name');
            return;
        }

        try {
            // Update the existing session with user-provided name and description
            if (this.activeSession) {
                this.activeSession.taskGoal = sessionName;
                this.activeSession.description = description;
                
                // Save the updated session to localStorage
                const key = `smart_recording_${this.activeSession.id}`;
                localStorage.setItem(key, JSON.stringify(this.activeSession));
                
                this.hideSessionModal();
                this.showToast(`Recording "${sessionName}" saved successfully!`, 'success');
                console.log('✅ Smart Recording saved:', sessionName);
            }
        } catch (error) {
            console.error('Failed to save recording:', error);
            alert('Failed to save recording. Please try again.');
        }
    }

    private stopRecordingWithDialog(): void {
        try {
            // Stop the recording engine (this saves it automatically with temp name)
            const session = this.recordingEngine.stopRecording();
            if (session) {
                this.activeSession = session;
                
                // Show the save dialog with current session name
                this.sessionNameInput.value = session.taskGoal || `Recording ${new Date().toLocaleString()}`;
                this.sessionDescriptionInput.value = session.description || '';
                this.showSessionModal();
                
                console.log('⏹️ Smart Recording stopped, showing save dialog');
            }

            this.isRecording = false;
            this.isPaused = false;
            this.elapsedTime = 0;
            this.eventCount = 0;

            this.hideRecordingControls();
            this.stopTimer();
        } catch (error) {
            console.error('Failed to stop recording:', error);
            alert('Failed to stop recording. Please try again.');
        }
    }

    private stopRecording(): void {
        // This method is now only used internally for cleanup
        try {
            this.isRecording = false;
            this.isPaused = false;
            this.activeSession = null;
            this.elapsedTime = 0;
            this.eventCount = 0;

            this.hideRecordingControls();
            this.stopTimer();
        } catch (error) {
            console.error('Failed to cleanup recording state:', error);
        }
    }

    private showRecordingControls(): void {
        this.startRecordingBtn.classList.add('hidden');
        this.recordingActiveControls.classList.remove('hidden');
    }

    private hideRecordingControls(): void {
        this.startRecordingBtn.classList.remove('hidden');
        this.recordingActiveControls.classList.add('hidden');
        // this.pauseRecordingBtn.classList.remove('hidden');
        // this.resumeRecordingBtn.classList.add('hidden');
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
        if (this.activeSession) {
            // For SmartRecordingEngine, use actions count instead of events
            const actionCount = this.activeSession.actions?.length || this.eventCount;
            this.recordingEventCount.textContent = `${actionCount} actions`;
        } else {
            this.recordingEventCount.textContent = `${this.eventCount} actions`;
        }
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

    public getActiveSession(): SmartRecordingSession | null {
        return this.activeSession;
    }

    public destroy(): void {
        this.stopTimer();
        // Remove event listeners if needed
    }
}
