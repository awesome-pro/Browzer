
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
  uniqueIdentifiers?: string[];   // Multiple selector options (ID, data-testid, aria-label, etc.)
  semanticRole?: string;          // More detailed semantic role
  interactionContext?: string;    // Context where interaction occurs (search-result, navigation, etc.)
  parentContext?: {               // Parent element context for better targeting
    tagName: string;
    id?: string;
    className?: string;
    role?: string;
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

export interface ActionCandidate {
  type: ActionType;
  timestamp: number;
  element: ElementContext;
  value?: any;
  coordinates?: { x: number; y: number };
  rawEvent: string;
  intent: string;
}

export interface ActionBuffer {
  type: ActionType;
  element: ElementContext;
  aggregatedValue?: string;
  startTimestamp: number;
  lastTimestamp: number;
  timeout: NodeJS.Timeout | null;
  intent: string;
}

  // Action Action Type System - Same actions for recording and execution
export enum ActionType {
    // Navigation Actions
    NAVIGATE = 'navigate',
    
    // Input Actions
    TEXT_INPUT = 'text_input',
    CLEAR = 'clear',
    
    // Click Actions
    CLICK = 'click',
    
    // Form Actions
    SELECT = 'select',
    TOGGLE = 'toggle',
    SUBMIT = 'submit',
    
    // Enhanced Form Actions
    SELECT_OPTION = 'select_option',        // Dropdown selection
    TOGGLE_CHECKBOX = 'toggle_checkbox',    // Checkbox toggle
    SELECT_RADIO = 'select_radio',          // Radio button selection
    SELECT_FILE = 'select_file',            // File input selection
    ADJUST_SLIDER = 'adjust_slider',        // Range input adjustment
    
    // Clipboard Actions
    COPY = 'copy',
    CUT = 'cut',
    PASTE = 'paste',
    
    // Context Actions
    CONTEXT_MENU = 'context_menu',          // Right-click context menu
    
    // Wait Actions
    WAIT = 'wait',
    WAIT_FOR_ELEMENT = 'wait_for_element',
    WAIT_FOR_DYNAMIC_CONTENT = 'wait_for_dynamic_content',
    
    // Focus Actions
    FOCUS = 'focus',
    BLUR = 'blur',
    HOVER = 'hover',
    
    // Key Actions
    KEYPRESS = 'keypress',
    
    // Scroll Actions
    SCROLL = 'scroll',
    
    // Data Actions
    EXTRACT = 'extract',
    
    // Verification Actions
    VERIFY_ELEMENT = 'verify_element',
    VERIFY_TEXT = 'verify_text',
    VERIFY_URL = 'verify_url',

    FORM_SUBMIT = 'submit',         // User submitted a form
    NAVIGATION = 'navigation',       // User navigated to new page
    NETWORK_REQUEST = 'network_request',
    NETWORK_ERROR = 'network_error',
  
  // Enhanced loading and dynamic content actions
    PAGE_LOAD = 'page_load',        // Page finished loading
    SEARCH_RESULTS = 'search_results', // Search results appeared
    DYNAMIC_CONTENT = 'dynamic_content', // Dynamic content loaded
  }
  
  // Execution step interface aligned with recording
  export interface ExecuteStep {
    id: string;
    action: ActionType;
    description: string;
    target?: string;          // CSS selector or URL
    value?: string | number;  // Text to type, option to select, milliseconds to wait
    reasoning: string;        // Why this step is needed
    
    // Execution state
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: any;
    error?: string;
    startTime?: number;
    endTime?: number;
    
    // Context for verification
    expectedOutcome?: string;
    retryCount?: number;
    maxRetries?: number;
  }
  
  // Enhanced semantic action for recording (aligned with execution)
  export interface ActionSemanticAction {
    id: string;
    type: ActionType;
    timestamp: number;
    description: string;
    target: ElementContext;
    value?: any;
    coordinates?: { x: number; y: number };
    context: PageContext;
    intent: ActionIntent;
    
    // Execution metadata
    duration?: number;
    success?: boolean;
    retryAttempts?: number;
  }
  
  // Standardized action intents
  export enum ActionIntent {
    // Navigation intents
    NAVIGATE_TO_PAGE = 'navigate_to_page',
    GO_BACK = 'go_back',
    GO_FORWARD = 'go_forward',
    REFRESH_PAGE = 'refresh_page',
    
    // Form filling intents
    ENTER_TEXT = 'enter_text',
    ENTER_EMAIL = 'enter_email',
    ENTER_PASSWORD = 'enter_password',
    ENTER_NAME = 'enter_name',
    ENTER_SEARCH_QUERY = 'enter_search_query',
    
    // Selection intents
    CHOOSE_OPTION = 'choose_option',
    TOGGLE_CHECKBOX = 'toggle_checkbox',
    SELECT_RADIO = 'select_radio',
    
    // Action intents
    SUBMIT_FORM = 'submit_form',
    SEARCH = 'search',
    LOGIN = 'login',
    LOGOUT = 'logout',
    SAVE = 'save',
    DELETE = 'delete',
    EDIT = 'edit',
    CREATE = 'create',
    
    // Content intents
    READ_CONTENT = 'read_content',
    EXTRACT_DATA = 'extract_data',
    VERIFY_INFORMATION = 'verify_information',
    
    // UI intents
    OPEN_MENU = 'open_menu',
    CLOSE_MODAL = 'close_modal',
    SCROLL_TO_VIEW = 'scroll_to_view',
    FOCUS_ELEMENT = 'focus_element',
    
    // General
    INTERACT = 'interact',
    WAIT_FOR_LOAD = 'wait_for_load',
    HANDLE_ERROR = 'handle_error'
  }
  
  // Action mapping utilities
  export class ActionTypeMapper {
    // Map raw DOM events to unified actions
    static mapDOMEventToAction(eventType: string, element: HTMLElement): ActionType {
      const tagName = element.tagName.toLowerCase();
      const inputType = element.getAttribute('type')?.toLowerCase();
      
      switch (eventType) {
        case 'click':
          if (tagName === 'input' && inputType === 'checkbox') return ActionType.TOGGLE;
          if (tagName === 'input' && inputType === 'radio') return ActionType.TOGGLE;
          if (tagName === 'select') return ActionType.SELECT;
          return ActionType.CLICK;
          
        case 'input':
        case 'keyup':
          return ActionType.TEXT_INPUT;
          
        case 'change':
          if (tagName === 'select') return ActionType.SELECT;
          if (inputType === 'checkbox' || inputType === 'radio') return ActionType.TOGGLE;
          return ActionType.TEXT_INPUT;
          
        case 'submit':
          return ActionType.SUBMIT;
          
        case 'focus':
          return ActionType.FOCUS;
          
        case 'blur':
          return ActionType.BLUR;
          
        case 'scroll':
          return ActionType.SCROLL;
          
        case 'keydown':
          const key = (event as KeyboardEvent).key;
          if (['Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown'].includes(key)) {
            return ActionType.KEYPRESS;
          }
          return ActionType.TEXT_INPUT;
          
        default:
          return ActionType.CLICK;
      }
    }
    
    // Map action to execution method name
    static getExecutionMethod(action: ActionType): string {
      const methodMap: Record<ActionType, string> = {
        [ActionType.NAVIGATE]: 'navigate',
        [ActionType.TEXT_INPUT]: 'textInput',
        [ActionType.CLEAR]: 'clear',
        [ActionType.CLICK]: 'click',
        [ActionType.SELECT]: 'select',
        [ActionType.TOGGLE]: 'toggle',
        [ActionType.SUBMIT]: 'submit',
        
        // Enhanced Form Actions
        [ActionType.SELECT_OPTION]: 'selectOption',
        [ActionType.TOGGLE_CHECKBOX]: 'toggleCheckbox',
        [ActionType.SELECT_RADIO]: 'selectRadio',
        [ActionType.SELECT_FILE]: 'selectFile',
        [ActionType.ADJUST_SLIDER]: 'adjustSlider',
        
        // Clipboard Actions
        [ActionType.COPY]: 'copy',
        [ActionType.CUT]: 'cut',
        [ActionType.PASTE]: 'paste',
        
        // Context Actions
        [ActionType.CONTEXT_MENU]: 'contextMenu',
        
        [ActionType.WAIT]: 'wait',
        [ActionType.WAIT_FOR_ELEMENT]: 'waitForElement',
        [ActionType.WAIT_FOR_DYNAMIC_CONTENT]: 'waitForDynamicContent',
        [ActionType.FOCUS]: 'focus',
        [ActionType.BLUR]: 'blur',
        [ActionType.HOVER]: 'hover',
        [ActionType.KEYPRESS]: 'keypress',
        [ActionType.SCROLL]: 'scroll',
        [ActionType.EXTRACT]: 'extract',
        [ActionType.VERIFY_ELEMENT]: 'verifyElement',
        [ActionType.VERIFY_TEXT]: 'verifyText',
        [ActionType.VERIFY_URL]: 'verifyUrl',
        [ActionType.NAVIGATION]: 'navigate',
        [ActionType.NETWORK_REQUEST]: 'networkRequest',
        [ActionType.NETWORK_ERROR]: 'networkError',
        [ActionType.PAGE_LOAD]: 'pageLoad',
        [ActionType.SEARCH_RESULTS]: 'searchResults',
        [ActionType.DYNAMIC_CONTENT]: 'dynamicContent'
      };
      
      return methodMap[action] || 'click';
    }
    
    // Generate human-readable description
    static generateDescription(action: ActionType, target?: string, value?: any): string {
      switch (action) {
        case ActionType.NAVIGATE:
          return `Navigate to ${target || value}`;
        case ActionType.TEXT_INPUT:
          return `Type "${value}" in ${target}`;
        case ActionType.CLEAR:
          return `Clear ${target}`;
        case ActionType.CLICK:
          return `Click ${target}`;
        case ActionType.SELECT:
          return `Select "${value}" from ${target}`;
        case ActionType.TOGGLE:
          return `Toggle ${target}`;
        case ActionType.SUBMIT:
          return `Submit ${target}`;
          
        // Enhanced Form Actions
        case ActionType.SELECT_OPTION:
          return `Select "${typeof value === 'object' ? value.text || value.value : value}" from dropdown ${target}`;
        case ActionType.TOGGLE_CHECKBOX:
          return `${value ? 'Check' : 'Uncheck'} checkbox ${target}`;
        case ActionType.SELECT_RADIO:
          return `Select radio button "${typeof value === 'object' ? value.value : value}" in ${target}`;
        case ActionType.SELECT_FILE:
          return `Select ${typeof value === 'object' ? value.fileCount : 1} file(s) in ${target}`;
        case ActionType.ADJUST_SLIDER:
          return `Adjust slider ${target} to ${value}`;
          
        // Clipboard Actions
        case ActionType.COPY:
          return `Copy text: "${typeof value === 'string' ? value.substring(0, 50) : 'selected text'}"`;
        case ActionType.CUT:
          return `Cut text: "${typeof value === 'string' ? value.substring(0, 50) : 'selected text'}"`;
        case ActionType.PASTE:
          return `Paste text into ${target}`;
          
        // Context Actions
        case ActionType.CONTEXT_MENU:
          return `Right-click on ${target}`;
          
        case ActionType.WAIT:
          return `Wait ${value}ms`;
        case ActionType.WAIT_FOR_ELEMENT:
          return `Wait for ${target} to appear`;
        case ActionType.WAIT_FOR_DYNAMIC_CONTENT:
          return `Wait for dynamic content to load`;
        case ActionType.FOCUS:
          return `Focus on ${target}`;
        case ActionType.BLUR:
          return `Remove focus from ${target}`;
        case ActionType.HOVER:
          return `Hover over ${target}`;
        case ActionType.KEYPRESS:
          return `Press ${value} key`;
        case ActionType.SCROLL:
          return `Scroll to ${target}`;
        case ActionType.EXTRACT:
          return `Extract data from page`;
        case ActionType.VERIFY_ELEMENT:
          return `Verify ${target} exists`;
        case ActionType.VERIFY_TEXT:
          return `Verify text "${value}" exists`;
        case ActionType.VERIFY_URL:
          return `Verify URL contains "${value}"`;
        default:
          return `Perform ${action} action`;
      }
    }
  }
  
  // Validation utilities
  export class ActionValidator {
    static validateStep(step: ExecuteStep): { valid: boolean; errors: string[] } {
      const errors: string[] = [];
      
      if (!step.action || !Object.values(ActionType).includes(step.action)) {
        errors.push('Invalid or missing action type');
      }
      
      if (!step.description?.trim()) {
        errors.push('Description is required');
      }
      
      // Action-specific validations
      switch (step.action) {
        case ActionType.NAVIGATE:
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
        description: step.description?.trim() || 'Automated action',
        target: step.target?.trim() || '',
        value: step.value,
        reasoning: step.reasoning?.trim() || 'Automated step',
        status: 'pending',
        maxRetries: step.maxRetries || 3,
        retryCount: 0
      };
    }
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
  