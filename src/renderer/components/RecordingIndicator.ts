// RecordingIndicator - Shows recording status overlay with live feedback
import { SmartRecordingEngine } from "./RecordingEngine";
import { SemanticAction } from "../types";

export class RecordingIndicator {
    private recordingEngine: SmartRecordingEngine;
    private isRecording = false;
    private lastEvent: SemanticAction | null = null;
    private eventCount = 0;

    // DOM elements
    private indicatorOverlay = document.getElementById('recordingIndicator') as HTMLElement;
    private indicatorTimer = document.getElementById('recordingIndicatorTimer') as HTMLElement;


    constructor() {
        this.recordingEngine = SmartRecordingEngine.getInstance();
        this.initializeDOM();
        this.setupEventListeners();
        this.checkInitialState();
    }

    private initializeDOM(): void {
        this.indicatorOverlay = document.getElementById('recordingIndicator') as HTMLElement;
        this.indicatorTimer = document.getElementById('recordingIndicatorTimer') as HTMLElement;
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
    }

    private handleRecordingStop(): void {
        this.isRecording = false;
        this.lastEvent = null;
        this.eventCount = 0;
        this.hideIndicator();
    }

    private handleRecordingPause(): void {
        // Maybe add visual indication of pause state
    }

    private handleRecordingResume(): void {
    }

    private handleRecordingEvent(recordingEvent: SemanticAction): void {
        if (!this.isRecording) return;

        this.lastEvent = recordingEvent;
        this.eventCount++;
        // this.flashIndicator();
    }

    private showIndicator(): void {
        this.indicatorOverlay?.classList.remove('hidden');
    }

    private hideIndicator(): void {
        this.indicatorOverlay?.classList.add('hidden');
    }

    public destroy(): void {
        this.hideIndicator();
    }
}
