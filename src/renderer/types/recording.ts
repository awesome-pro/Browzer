
export interface SmartRecordingSession {
  id: string;
  taskGoal: string; // What the user is trying to accomplish
  description?: string;
  startTime: number;
  endTime?: number;
  isActive: boolean;
  initialContext: PageContext;
  actions: SemanticAction[];
  metadata: SmartSessionMetadata;
}

export interface SmartSessionMetadata {
  totalActions: number;
  duration: number;
  pagesVisited: string[];
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
  metadata?: any; // Additional metadata for complex actions
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
  
  // Enhanced properties for better automation
  elementType?: string;           // Detailed element type (e.g., 'search_input', 'submit_button')
  purpose?: string;               // Inferred purpose (e.g., 'search', 'navigation', 'form_submission')
  href?: string;                  // For links, the target URL
  text?: string;                  // Element text content
  
  // New enhanced targeting properties
  targetUrl?: string;             // Resolved target URL for links and forms
  url?: string;                   // Full URL for navigation events
  uniqueIdentifiers?: string[];   // Multiple selector options (ID, data-testid, aria-label, etc.)
  semanticRole?: string;          // More detailed semantic role
  interactionContext?: string;    // Context where interaction occurs (search-result, navigation, etc.)
  parentContext?: {               // Parent element context for better targeting
    tagName: string;
    id?: string;
    className?: string;
    role?: string;
    text?: string;
    href?: string;
  };
  
  // SVG-specific properties
  svgData?: {
    id?: string;
    viewBox?: string;
    path?: string;
    use?: string;
  };
  
  // Parent interactive element for SVG icons
  parentElement?: {
    tagName: string;
    id?: string;
    className?: string;
    text?: string;
  };

  formContext?: {
    action?: string;
    method?: string;
    name?: string;
    id?: string;
    className?: string;
    text?: string;
  };
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

export enum ActionType {
    // Navigation Actions
    NAVIGATE= 'navigate',
    NAVIGATION = 'navigation',
    SPA_NAVIGATION = 'spa_navigation',
    
    // Basic Interaction Actions
    CLICK = 'click',
    TYPE = 'type',
    CLEAR = 'clear',
    SELECT = 'select',
    TOGGLE = 'toggle',
    SUBMIT = 'submit',
    KEYPRESS = 'keypress',
    FOCUS = 'focus',
    BLUR = 'blur',
    HOVER = 'hover',
    SCROLL = 'scroll',
    
    // Enhanced Form Actions
    SELECT_OPTION = 'select_option',
    TOGGLE_CHECKBOX = 'toggle_checkbox',
    SELECT_RADIO = 'select_radio',
    SELECT_FILE = 'select_file',
    ADJUST_SLIDER = 'adjust_slider',
    
    // Clipboard Actions
    COPY = 'copy',
    CUT = 'cut',
    PASTE = 'paste',
    
    // Context Actions
    CONTEXT_MENU = 'context_menu',
    DRAG_START = 'drag_start',
    DRAG = 'drag',
    DRAG_END = 'drag_end',
    DROP = 'drop',
    
    WAIT = 'wait',
    WAIT_FOR_ELEMENT = 'wait_for_element',
    NETWORK_REQUEST = 'network_request',
    NETWORK_RESPONSE = 'network_response',
    NETWORK_ERROR = 'network_error',
    PAGE_LOAD = 'page_load',        // Page finished loading
    SEARCH_RESULTS = 'search_results', // Search results loaded
    DYNAMIC_CONTENT = 'dynamic_content', // Dynamic content loaded
    
    REACT_EVENT = 'react_event',
    MODAL_OPEN = 'modal_open',
    MODAL_CLOSE = 'modal_close',
    
    // Modern Select Actions
    SELECT_OPEN = 'select_open',
    SELECT_CLOSE = 'select_close',
    AUTOCOMPLETE_SEARCH = 'autocomplete_search',

    UNKNOWN = 'unknown',
  }
  
  // Execution step interface aligned with recording
  export interface ExecuteStep {
    id: string;
    action: ActionType;
    target: string;
    value?: string | number;
    reasoning?: string;
    status?: string;
    startTime?: number;
    endTime?: number;
    result?: any;
    error?: string;
    retryCount?: number;
    maxRetries?: number;
  }
  
  export interface ElementIdentifier {
    id?: string;
    name?: string;
    className?: string;
    tagName?: string;
    ariaLabel?: string;
    text?: string;
    href?: string;
    type?: string;
    role?: string;
    selector?: string;
    isMultiSelector?: boolean;
  }

  export interface ExecuteTask {
    id: string;
    instruction: string;
    recordingSessionId: string;
    steps: ExecuteStep[];
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: any;
    error?: string;
  }
  

  export interface ExecuteResult {
    success: boolean;
    data?: any;
    error?: string;
    executionTime: number;
  }
  

  export class ActionValidator {
    static validateStep(step: ExecuteStep): { valid: boolean; errors: string[] } {
      const errors: string[] = [];
      
      if (!step.action || !Object.values(ActionType).includes(step.action)) {
        errors.push('Invalid or missing action type');
      }
      
      // Action-specific validations
      switch (step.action) {
        case ActionType.NAVIGATION:
          if (!step.target && !step.value) {
            errors.push('URL is required for navigate action');
          }
          break;
          
      
        case ActionType.CLICK:
        case ActionType.FOCUS:
        case ActionType.HOVER:
          if (!step.target) errors.push(`Target selector required for ${step.action} action`);
          break;
          
        case ActionType.SELECT:
          if (!step.target) errors.push('Target selector required for select action');
          if (!step.value) errors.push('Option value required for select action');
          break;
          
        case ActionType.WAIT:
          if (!step.value || typeof step.value !== 'number') {
            errors.push('Numeric value (milliseconds) required for wait action');
          }
          break;
          
        case ActionType.WAIT_FOR_ELEMENT:
          if (!step.target) errors.push('Target selector required for wait_for_element action');
          break;
          
        case ActionType.KEYPRESS:
          if (!step.value) errors.push('Key value required for keypress action');
          break;
      }
      
      return {
        valid: errors.length === 0,
        errors
      };
    }
    
    static sanitizeStep(step: Partial<ExecuteStep>): ExecuteStep {
      return {
        id: step.id || `step_${Date.now()}`,
        action: step.action || ActionType.CLICK,
        target: step.target?.trim() || '',
        value: step.value,
        reasoning: step.reasoning?.trim() || 'Automated step',
        status: 'pending',
        maxRetries: step.maxRetries || 3,
        retryCount: 0
      };
    }
  }

