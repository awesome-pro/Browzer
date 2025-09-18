// Smart Recording Types - Optimized for AI model consumption
// Focus on semantic actions rather than low-level events

export interface SmartRecordingSession {
  id: string;
  taskGoal: string; // What the user is trying to accomplish
  description?: string;
  startTime: number;
  endTime?: number;
  isActive: boolean;
  
  // Context
  initialContext: PageContext;
  
  // High-level actions only
  actions: SemanticAction[];
  screenshots: ScreenshotCapture[];
  networkInteractions: NetworkInteraction[];
  
  metadata: SmartSessionMetadata;
}

export interface SmartSessionMetadata {
  totalActions: number;
  duration: number;
  pagesVisited: string[];
  complexity: 'simple' | 'medium' | 'complex';
  success: boolean; // Whether the task was completed successfully
}

export interface SemanticAction {
  id: string;
  type: ActionType;
  timestamp: number;
  description: string; // Human-readable description of what happened
  target: ElementContext; // Where the action occurred
  value?: any; // What value was entered/selected
  coordinates?: { x: number; y: number }; // For click actions
  context: PageContext; // Page state when action occurred
  intent: string; // Inferred user intent (e.g., 'search', 'login', 'navigate')
}

export enum ActionType {
  // High-level user intentions only
  TEXT_INPUT = 'text_input',      // User entered text (aggregated)
  CLICK = 'click',                // User clicked something meaningful
  SELECT = 'select',              // User selected from dropdown/radio
  TOGGLE = 'toggle',              // User checked/unchecked checkbox
  FORM_SUBMIT = 'submit',         // User submitted a form
  NAVIGATION = 'navigation',       // User navigated to new page
  SCROLL = 'scroll',              // Significant scroll action
  WAIT = 'wait',                   // Explicit wait for something
  FOCUS = 'focus',                // User focused on an element
  BLUR = 'blur'                   // User blurred from an element
}

export interface ElementContext {
  description: string;            // Human-readable element description
  selector: string;               // Robust CSS selector for AI to use
  xpath: string;                  // XPath as fallback
  role: string;                   // Element's semantic role
  boundingRect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isVisible: boolean;
  isInteractive: boolean;
  context?: string;               // Where on page (e.g., "in navigation", "in main content")
}

export interface PageContext {
  url: string;
  title: string;
  timestamp: number;
  viewport: {
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
  };
  userAgent: string;
  // Key page elements for context
  keyElements: Array<{
    role: string;                 // 'heading', 'navigation', 'button', etc.
    text: string;                 // Element text content
    selector: string;             // How to find it
  }>;
}

export interface ScreenshotCapture {
  id: string;
  timestamp: number;
  type: 'initial' | 'action' | 'page_navigation' | 'final_state' | 'error';
  base64Data: string;            // Base64 encoded screenshot
  context: PageContext;
}

export interface NetworkInteraction {
  id: string;
  timestamp: number;
  type: 'fetch' | 'xhr' | 'form_submit';
  url: string;
  method: string;
  status?: number;
  duration?: number;
  context: PageContext;
}

export interface TaskGoal {
  goal: string;                   // High-level task description
  steps: string[];                // Expected steps (if known)
  completed: boolean;
}

// AI-optimized export format
export interface AIReadyContext {
  // Task information
  task: string;
  description?: string;
  success: boolean;
  complexity: 'simple' | 'medium' | 'complex';
  duration: number;
  
  // Action sequence (the most important part)
  steps: Array<{
    step: number;
    action: ActionType;
    description: string;          // What the user did in plain English
    target: string;               // What element they interacted with
    value?: any;                  // What they entered/selected
    intent: string;               // Why they did it
    timestamp: number;
    screenshot?: string;          // Key screenshots only
  }>;
  
  // Environment context
  environment: {
    initialUrl: string;
    pagesVisited: string[];
    userAgent: string;
    viewport: {
      width: number;
      height: number;
    };
  };
  
  // Visual context (key screenshots only)
  screenshots: Array<{
    type: string;
    timestamp: number;
    base64Data: string;
  }>;
  
  // Network activity (significant requests only)
  networkActivity: Array<{
    url: string;
    method: string;
    status: number;
    timestamp: number;
  }>;
  
  // Page structure context
  pageStructure: Array<{
    url: string;
    title: string;
    keyElements: Array<{
      role: string;
      text: string;
      selector: string;
    }>;
  }>;
}

// Configuration for smart recording
export interface SmartRecordingConfig {
  // Screenshot settings
  captureScreenshots: boolean;
  screenshotQuality: 'low' | 'medium' | 'high';
  maxScreenshots: number;
  
  // Action aggregation
  actionTimeout: number;          // How long to wait before finalizing an action
  minActionGap: number;           // Minimum time between significant actions
  
  // Context capture
  capturePageStructure: boolean;
  maxKeyElements: number;         // Max elements to capture per page
  
  // Network monitoring
  recordNetworkRequests: boolean;
  ignoreStaticResources: boolean;
  
  // Privacy
  maskSensitiveData: boolean;
  sensitiveFields: string[];      // Field names/types to mask
  
  // Performance
  maxActionsPerSession: number;
  maxSessionDuration: number;     // in minutes
}

export const DEFAULT_SMART_CONFIG: SmartRecordingConfig = {
  captureScreenshots: true,
  screenshotQuality: 'medium',
  maxScreenshots: 10,
  
  actionTimeout: 1500,
  minActionGap: 500,
  
  capturePageStructure: true,
  maxKeyElements: 10,
  
  recordNetworkRequests: true,
  ignoreStaticResources: true,
  
  maskSensitiveData: true,
  sensitiveFields: ['password', 'credit-card', 'ssn'],
  
  maxActionsPerSession: 50,       // Much lower than before
  maxSessionDuration: 30
};