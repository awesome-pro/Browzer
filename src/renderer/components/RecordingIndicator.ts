// RecordingIndicator - Shows recording status overlay with live feedback
import { RecordingEngine } from "./RecordingEngine";
import { RecordingEvent, EventType } from "../../shared/types/recording";

export class RecordingIndicator {
    private recordingEngine: RecordingEngine;
    private isRecording = false;
    private lastEvent: RecordingEvent | null = null;
    private eventCount = 0;

    // DOM elements
    private indicatorOverlay = document.getElementById('recordingIndicator') as HTMLElement;
    private indicatorTimer = document.getElementById('recordingIndicatorTimer') as HTMLElement;
    private indicatorEvents = document.getElementById('recordingIndicatorEvents') as HTMLElement;
    private lastEventDisplay = document.getElementById('recordingLastEvent') as HTMLElement;

    constructor() {
        this.recordingEngine = RecordingEngine.getInstance();
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
            const recordingEvent = customEvent.detail as RecordingEvent;
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

    private handleRecordingEvent(recordingEvent: RecordingEvent): void {
        if (!this.isRecording) return;

        this.lastEvent = recordingEvent;
        this.eventCount++;
        
        this.updateEventCount();
        this.showLastEvent(recordingEvent);
        this.flashEventIndicator();
    }

    private showIndicator(): void {
        this.indicatorOverlay.classList.remove('hidden');
    }

    private hideIndicator(): void {
        this.indicatorOverlay.classList.add('hidden');
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
        this.indicatorEvents.textContent = `${this.eventCount} events`;
    }

    private showLastEvent(event: RecordingEvent): void {
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
        this.lastEventDisplay.classList.add('flash');
        setTimeout(() => {
            this.lastEventDisplay.classList.remove('flash');
        }, 200);
    }

    private getEventDescription(event: RecordingEvent): string {
        const icon = this.getEventIcon(event.type);
        
        switch (event.type) {
            case EventType.CLICK:
                return `${icon} Clicked ${event.data.element?.tagName || 'element'}`;
            case EventType.INPUT:
                return `${icon} Typed in ${event.data.element?.tagName || 'input'}`;
            case EventType.SCROLL:
                return `${icon} Scrolled page`;
            case EventType.DOM_MUTATION:
                return `${icon} DOM changed`;
            case EventType.NETWORK_REQUEST:
                return `${icon} Network request`;
            case EventType.PAGE_LOAD:
                return `${icon} Page loaded`;
            case EventType.NAVIGATION:
                return `${icon} Navigation`;
            case EventType.KEY_DOWN:
                return `${icon} Key pressed`;
            case EventType.FORM_SUBMIT:
                return `${icon} Form submitted`;
            default:
                return `${icon} ${event.type.replace('_', ' ')}`;
        }
    }

    private getEventIcon(eventType: EventType): string {
        switch (eventType) {
            case EventType.CLICK:
            case EventType.DOUBLE_CLICK:
                return '👆';
            case EventType.INPUT:
            case EventType.KEY_DOWN:
            case EventType.KEY_UP:
                return '⌨️';
            case EventType.SCROLL:
                return '📜';
            case EventType.DOM_MUTATION:
                return '🔄';
            case EventType.NETWORK_REQUEST:
                return '🌐';
            case EventType.PAGE_LOAD:
            case EventType.NAVIGATION:
                return '📄';
            case EventType.FORM_SUBMIT:
                return '📝';
            case EventType.FOCUS:
            case EventType.BLUR:
                return '🎯';
            default:
                return '📝';
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
