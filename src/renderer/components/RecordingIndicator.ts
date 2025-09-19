// RecordingIndicator - Shows recording status overlay with live feedback
import { SmartRecordingEngine } from "./RecordingEngine";
import { SemanticAction, ActionType } from "../../shared/types/recording";

export class RecordingIndicator {
    private recordingEngine: SmartRecordingEngine;
    private isRecording = false;
    private lastEvent: SemanticAction | null = null;
    private eventCount = 0;

    // DOM elements
    private indicatorOverlay = document.getElementById('recordingIndicator') as HTMLElement;
    private indicatorTimer = document.getElementById('recordingIndicatorTimer') as HTMLElement;
    private indicatorEvents = document.getElementById('recordingIndicatorEvents') as HTMLElement;
    private lastEventDisplay = document.getElementById('recordingLastEvent') as HTMLElement;

    constructor() {
        this.recordingEngine = SmartRecordingEngine.getInstance();
        this.initializeDOM();
        this.setupEventListeners();
        this.checkInitialState();
    }

    private initializeDOM(): void {
        this.indicatorOverlay = document.getElementById('recordingIndicator') as HTMLElement;
        this.indicatorTimer = document.getElementById('recordingIndicatorTimer') as HTMLElement;
        this.indicatorEvents = document.getElementById('recordingIndicatorEvents') as HTMLElement;
        this.lastEventDisplay = document.getElementById('recordingLastEvent') as HTMLElement;
    }

    private setupEventListeners(): void {
        // Listen for recording events
        window.addEventListener('recording:event', (e: Event) => {
            const customEvent = e as CustomEvent;
            const recordingEvent = customEvent.detail as SemanticAction;
            this.handleRecordingEvent(recordingEvent);
        });

        // Listen for recording state changes
        window.addEventListener('recording:start', () => {
            this.handleRecordingStart();
        });

        window.addEventListener('recording:stop', () => {
            this.handleRecordingStop();
        });

        window.addEventListener('recording:pause', () => {
            this.handleRecordingPause();
        });

        window.addEventListener('recording:resume', () => {
            this.handleRecordingResume();
        });
    }

    private checkInitialState(): void {
        // Check if there's already an active recording
        this.isRecording = this.recordingEngine.isCurrentlyRecording();
        if (this.isRecording) {
            this.showIndicator();
        }
    }

    private handleRecordingStart(): void {
        this.isRecording = true;
        this.eventCount = 0;
        this.lastEvent = null;
        this.showIndicator();
        this.startTimer();
    }

    private handleRecordingStop(): void {
        this.isRecording = false;
        this.lastEvent = null;
        this.eventCount = 0;
        this.hideIndicator();
        this.stopTimer();
    }

    private handleRecordingPause(): void {
        this.stopTimer();
        // Maybe add visual indication of pause state
    }

    private handleRecordingResume(): void {
        this.startTimer();
    }

    private handleRecordingEvent(recordingEvent: SemanticAction): void {
        if (!this.isRecording) return;

        this.lastEvent = recordingEvent;
        this.eventCount++;
        
        this.updateEventCount();
        this.showLastEvent(recordingEvent);
        this.flashEventIndicator();
    }

    private showIndicator(): void {
        this.indicatorOverlay?.classList.remove('hidden');
    }

    private hideIndicator(): void {
        this.indicatorOverlay?.classList.add('hidden');
        this.lastEventDisplay.textContent = '';
    }

    private startTimer(): void {
        // Timer is updated by the main recording controls
        // We just need to ensure the indicator is visible
    }

    private stopTimer(): void {
        // Timer cleanup handled by recording controls
    }

    private updateEventCount(): void {
        this.indicatorEvents.textContent = `${this.eventCount} actions`;
    }

    private showLastEvent(event: SemanticAction): void {
        const eventDescription = this.getEventDescription(event);
        this.lastEventDisplay.textContent = eventDescription;
        
        // Auto-hide the event description after 3 seconds
        setTimeout(() => {
            if (this.lastEventDisplay.textContent === eventDescription) {
                this.lastEventDisplay.textContent = '';
            }
        }, 3000);
    }

    private flashEventIndicator(): void {
        this.lastEventDisplay?.classList.add('flash');
        setTimeout(() => {
            this.lastEventDisplay?.classList.remove('flash');
        }, 200);
    }

    private getEventDescription(event: SemanticAction): string {
        
        switch (event.type) {
            case ActionType.CLICK:
                return `Clicked ${event.target.description || 'element'}`;
            case ActionType .TEXT_INPUT:
                return `Typed in ${event.target.description || 'input'}`;
            case ActionType.SCROLL:
                return `Scrolled page`;
            case ActionType.NAVIGATION:
                return `DOM changed`;
            case ActionType.FORM_SUBMIT:
                return `Form submitted`;
            case ActionType.SELECT:
                return `Selected ${event.target.description || 'element'}`;
            case ActionType.TOGGLE:
                return `Toggled ${event.target.description || 'element'}`;
            case ActionType.WAIT:
            default:
                return `${event.type.replace('_', ' ')}`;
        }
    }

    // Public API
    public updateTimer(timeString: string): void {
        this.indicatorTimer.textContent = timeString;
    }

    public destroy(): void {
        this.hideIndicator();
    }
}
