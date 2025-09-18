// Advanced recording types for ML-ready context capture

export interface RecordingSession {
  id: string;
  name: string;
  description?: string;
  startTime: number;
  endTime?: number;
  isActive: boolean;
  url: string;
  userAgent: string;
  viewport: ViewportInfo;
  events: RecordingEvent[];
  metadata: SessionMetadata;
  // context: RecordingContext;
}

export interface SessionMetadata {
  totalEvents: number;
  totalDuration: number;
  pageChanges: number;
  userInteractions: number;
  networkRequests: number;
  domMutations: number;
  tags: string[]; // User-defined tags for categorization
}

export interface ViewportInfo {
  width: number;
  height: number;
  devicePixelRatio: number;
  scrollX: number;
  scrollY: number;
}

export interface RecordingEvent {
  id: string;
  timestamp: number;
  type: EventType;
  data: EventData;
  context: EventContext;
}

export enum EventType {
  // User Interactions
  CLICK = 'click',
  DOUBLE_CLICK = 'dblclick',
  RIGHT_CLICK = 'contextmenu',
  KEY_DOWN = 'keydown',
  KEY_UP = 'keyup',
  INPUT = 'input',
  FOCUS = 'focus',
  BLUR = 'blur',
  SCROLL = 'scroll',
  FORM_SUBMIT = 'submit',
  
  // DOM Changes
  DOM_MUTATION = 'dom_mutation',
  
  // Navigation
  PAGE_LOAD = 'page_load',
  URL_CHANGE = 'url_change',
  NAVIGATION = 'navigation',
  PAGE_VISIBILITY = 'page_visibility',
  
  // Network
  NETWORK_REQUEST = 'network_request',
  NETWORK_RESPONSE = 'network_response',
  
  // State Changes
  STORAGE_CHANGE = 'storage_change',
  COOKIE_CHANGE = 'cookie_change',
  VIEWPORT_CHANGE = 'viewport_change',
  
  // Custom Events
  WAIT = 'wait',
  SCREENSHOT = 'screenshot'
}

export interface EventContext {
  url: string;
  viewport: ViewportInfo;
  // timestamp: number;
  sessionTime: number; // Time since recording started
}

export interface EventData {
  // Element information (for UI events)
  element?: ElementInfo;
  
  // Event-specific data
  value?: any;
  previousValue?: any;
  
  // Coordinates (for click events)
  coordinates?: {
    x: number;
    y: number;
    pageX: number;
    pageY: number;
  };
  
  // Network data
  network?: NetworkEventData;
  
  // DOM mutation data
  mutation?: DOMutationData;
  
  // Storage data
  storage?: StorageEventData;
}

export interface ElementInfo {
  // Robust element identification
  selector: string; // CSS selector
  xpath: string; // XPath for fallback
  // textContent?: string;
  attributes: Record<string, string>;
  tagName: string;
  id?: string;
  // className?: string;
  
  // Position information
  boundingRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  
  // Context
  parentSelector?: string;
  // siblingIndex?: number;
  isVisible: boolean;
  // isInteractable: boolean;
}

export interface NetworkEventData {
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  requestHeaders: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  responseSize?: string;
  responseType?: string;
  duration?: number;
  requestId: string;
  cached?: boolean;
  redirected?: boolean;
  finalUrl?: string;
}

export interface DOMutationData {
  type: 'childList' | 'attributes' | 'characterData';
  target: ElementInfo;
  addedNodes?: ElementInfo[];
  removedNodes?: ElementInfo[];
  attributeName?: string;
  oldValue?: string;
  newValue?: string;
}

export interface StorageEventData {
  type: 'localStorage' | 'sessionStorage' | 'cookie';
  key: string;
  oldValue?: string;
  newValue?: string;
  action: 'set' | 'remove' | 'clear';
}

// Recording configuration
export interface RecordingConfig {
  // What to record
  recordClicks: boolean;
  recordKeystrokes: boolean;
  recordScrolling: boolean;
  recordDOMMutations: boolean;
  recordNetworkRequests: boolean;
  recordStorageChanges: boolean;
  
  // Filtering options
  ignoreMouseMoves: boolean;
  ignoreInternalRequests: boolean;
  ignoreCSSChanges: boolean;
  minActionDelay: number; // Minimum time between actions (ms)
  
  // Privacy settings
  maskPasswords: boolean;
  maskCreditCards: boolean;
  maskEmails: boolean;
  
  // Performance settings
  maxEventsPerSession: number;
  maxSessionDuration: number; // in minutes
  compressionEnabled: boolean;
}

// Default recording configuration
export const DEFAULT_RECORDING_CONFIG: RecordingConfig = {
  recordClicks: true,
  recordKeystrokes: true,
  recordScrolling: true,
  recordDOMMutations: true,
  recordNetworkRequests: true,
  recordStorageChanges: true,
  
  ignoreMouseMoves: true,
  ignoreInternalRequests: true,
  ignoreCSSChanges: true,
  minActionDelay: 100,
  
  maskPasswords: true,
  maskCreditCards: true,
  maskEmails: false,
  
  maxEventsPerSession: 10000,
  maxSessionDuration: 60,
  compressionEnabled: true,
};

// ML-ready context export format
export interface MLContext {
  sessionId: string;
  task: string;
  steps: MLStep[];
  environment: MLEnvironment;
  metadata: MLMetadata;
}

export interface MLStep {
  stepNumber: number;
  action: string;
  target: string;
  value?: string;
  context: string;
  timestamp: number;
  screenshot?: string; // Base64 encoded
}

export interface MLEnvironment {
  userAgent: string;
  viewport: ViewportInfo;
  url: string;
  cookies: Array<{ name: string; value: string; domain: string }>;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

export interface MLMetadata {
  totalSteps: number;
  duration: number;
  complexity: 'simple' | 'medium' | 'complex';
  tags: string[];
  success: boolean;
}


export interface RecordingContext {
  domMutations: DOMRecordingEvent[];
  userActions: UserActionEvent[];
  networkCalls: NetworkEvent[];
  stateChanges: StateChangeEvent[];
  environment: EnvironmentSnapshot;
}

export interface DOMRecordingEvent {
  timestamp: number;
  type: 'childList' | 'attributes' | 'characterData';
  target: string; // CSS selector
  changes: any;
}

export interface UserActionEvent {
  timestamp: number;
  type: 'click' | 'keydown' | 'scroll' | 'input' | 'focus' | 'blur';
  target: string; // CSS selector
  data: any;
}

export interface NetworkEvent {
  timestamp: number;
  url: string;
  method: string;
  status: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody?: any;
  responseBody?: any;
}

export interface StateChangeEvent {
  timestamp: number;
  type: 'localStorage' | 'sessionStorage' | 'cookies' | 'url' | 'viewport';
  before: any;
  after: any;
}

export interface EnvironmentSnapshot {
  userAgent: string;
  viewport: { width: number; height: number };
  cookies: any[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  url: string;
  timestamp: number;
}