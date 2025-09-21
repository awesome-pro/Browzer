import { ElementContext, PageContext } from "./recording";

  // Unified Action Type System - Same actions for recording and execution
export enum UnifiedActionType {
    // Navigation Actions
    NAVIGATE = 'navigate',
    
    // Input Actions
    TYPE = 'type',
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
    VERIFY_URL = 'verify_url'
  }
  
  // Execution step interface aligned with recording
  export interface UnifiedExecuteStep {
    id: string;
    action: UnifiedActionType;
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
  export interface UnifiedSemanticAction {
    id: string;
    type: UnifiedActionType;
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
    static mapDOMEventToAction(eventType: string, element: HTMLElement): UnifiedActionType {
      const tagName = element.tagName.toLowerCase();
      const inputType = element.getAttribute('type')?.toLowerCase();
      
      switch (eventType) {
        case 'click':
          if (tagName === 'input' && inputType === 'checkbox') return UnifiedActionType.TOGGLE;
          if (tagName === 'input' && inputType === 'radio') return UnifiedActionType.TOGGLE;
          if (tagName === 'select') return UnifiedActionType.SELECT;
          return UnifiedActionType.CLICK;
          
        case 'input':
        case 'keyup':
          return UnifiedActionType.TYPE;
          
        case 'change':
          if (tagName === 'select') return UnifiedActionType.SELECT;
          if (inputType === 'checkbox' || inputType === 'radio') return UnifiedActionType.TOGGLE;
          return UnifiedActionType.TYPE;
          
        case 'submit':
          return UnifiedActionType.SUBMIT;
          
        case 'focus':
          return UnifiedActionType.FOCUS;
          
        case 'blur':
          return UnifiedActionType.BLUR;
          
        case 'scroll':
          return UnifiedActionType.SCROLL;
          
        case 'keydown':
          const key = (event as KeyboardEvent).key;
          if (['Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown'].includes(key)) {
            return UnifiedActionType.KEYPRESS;
          }
          return UnifiedActionType.TYPE;
          
        default:
          return UnifiedActionType.CLICK;
      }
    }
    
    // Map action to execution method name
    static getExecutionMethod(action: UnifiedActionType): string {
      const methodMap: Record<UnifiedActionType, string> = {
        [UnifiedActionType.NAVIGATE]: 'navigate',
        [UnifiedActionType.TYPE]: 'type',
        [UnifiedActionType.CLEAR]: 'clear',
        [UnifiedActionType.CLICK]: 'click',
        [UnifiedActionType.SELECT]: 'select',
        [UnifiedActionType.TOGGLE]: 'toggle',
        [UnifiedActionType.SUBMIT]: 'submit',
        
        // Enhanced Form Actions
        [UnifiedActionType.SELECT_OPTION]: 'selectOption',
        [UnifiedActionType.TOGGLE_CHECKBOX]: 'toggleCheckbox',
        [UnifiedActionType.SELECT_RADIO]: 'selectRadio',
        [UnifiedActionType.SELECT_FILE]: 'selectFile',
        [UnifiedActionType.ADJUST_SLIDER]: 'adjustSlider',
        
        // Clipboard Actions
        [UnifiedActionType.COPY]: 'copy',
        [UnifiedActionType.CUT]: 'cut',
        [UnifiedActionType.PASTE]: 'paste',
        
        // Context Actions
        [UnifiedActionType.CONTEXT_MENU]: 'contextMenu',
        
        [UnifiedActionType.WAIT]: 'wait',
        [UnifiedActionType.WAIT_FOR_ELEMENT]: 'waitForElement',
        [UnifiedActionType.WAIT_FOR_DYNAMIC_CONTENT]: 'waitForDynamicContent',
        [UnifiedActionType.FOCUS]: 'focus',
        [UnifiedActionType.BLUR]: 'blur',
        [UnifiedActionType.HOVER]: 'hover',
        [UnifiedActionType.KEYPRESS]: 'keypress',
        [UnifiedActionType.SCROLL]: 'scroll',
        [UnifiedActionType.EXTRACT]: 'extract',
        [UnifiedActionType.VERIFY_ELEMENT]: 'verifyElement',
        [UnifiedActionType.VERIFY_TEXT]: 'verifyText',
        [UnifiedActionType.VERIFY_URL]: 'verifyUrl'
      };
      
      return methodMap[action] || 'click';
    }
    
    // Generate human-readable description
    static generateDescription(action: UnifiedActionType, target?: string, value?: any): string {
      switch (action) {
        case UnifiedActionType.NAVIGATE:
          return `Navigate to ${target || value}`;
        case UnifiedActionType.TYPE:
          return `Type "${value}" in ${target}`;
        case UnifiedActionType.CLEAR:
          return `Clear ${target}`;
        case UnifiedActionType.CLICK:
          return `Click ${target}`;
        case UnifiedActionType.SELECT:
          return `Select "${value}" from ${target}`;
        case UnifiedActionType.TOGGLE:
          return `Toggle ${target}`;
        case UnifiedActionType.SUBMIT:
          return `Submit ${target}`;
          
        // Enhanced Form Actions
        case UnifiedActionType.SELECT_OPTION:
          return `Select "${typeof value === 'object' ? value.text || value.value : value}" from dropdown ${target}`;
        case UnifiedActionType.TOGGLE_CHECKBOX:
          return `${value ? 'Check' : 'Uncheck'} checkbox ${target}`;
        case UnifiedActionType.SELECT_RADIO:
          return `Select radio button "${typeof value === 'object' ? value.value : value}" in ${target}`;
        case UnifiedActionType.SELECT_FILE:
          return `Select ${typeof value === 'object' ? value.fileCount : 1} file(s) in ${target}`;
        case UnifiedActionType.ADJUST_SLIDER:
          return `Adjust slider ${target} to ${value}`;
          
        // Clipboard Actions
        case UnifiedActionType.COPY:
          return `Copy text: "${typeof value === 'string' ? value.substring(0, 50) : 'selected text'}"`;
        case UnifiedActionType.CUT:
          return `Cut text: "${typeof value === 'string' ? value.substring(0, 50) : 'selected text'}"`;
        case UnifiedActionType.PASTE:
          return `Paste text into ${target}`;
          
        // Context Actions
        case UnifiedActionType.CONTEXT_MENU:
          return `Right-click on ${target}`;
          
        case UnifiedActionType.WAIT:
          return `Wait ${value}ms`;
        case UnifiedActionType.WAIT_FOR_ELEMENT:
          return `Wait for ${target} to appear`;
        case UnifiedActionType.WAIT_FOR_DYNAMIC_CONTENT:
          return `Wait for dynamic content to load`;
        case UnifiedActionType.FOCUS:
          return `Focus on ${target}`;
        case UnifiedActionType.BLUR:
          return `Remove focus from ${target}`;
        case UnifiedActionType.HOVER:
          return `Hover over ${target}`;
        case UnifiedActionType.KEYPRESS:
          return `Press ${value} key`;
        case UnifiedActionType.SCROLL:
          return `Scroll to ${target}`;
        case UnifiedActionType.EXTRACT:
          return `Extract data from page`;
        case UnifiedActionType.VERIFY_ELEMENT:
          return `Verify ${target} exists`;
        case UnifiedActionType.VERIFY_TEXT:
          return `Verify text "${value}" exists`;
        case UnifiedActionType.VERIFY_URL:
          return `Verify URL contains "${value}"`;
        default:
          return `Perform ${action} action`;
      }
    }
  }
  
  // Validation utilities
  export class ActionValidator {
    static validateStep(step: UnifiedExecuteStep): { valid: boolean; errors: string[] } {
      const errors: string[] = [];
      
      if (!step.action || !Object.values(UnifiedActionType).includes(step.action)) {
        errors.push('Invalid or missing action type');
      }
      
      if (!step.description?.trim()) {
        errors.push('Description is required');
      }
      
      // Action-specific validations
      switch (step.action) {
        case UnifiedActionType.NAVIGATE:
          if (!step.target && !step.value) {
            errors.push('URL is required for navigate action');
          }
          break;
          
        case UnifiedActionType.TYPE:
          if (!step.target) errors.push('Target selector required for type action');
          if (!step.value) errors.push('Text value required for type action');
          break;
          
        case UnifiedActionType.CLICK:
        case UnifiedActionType.FOCUS:
        case UnifiedActionType.HOVER:
          if (!step.target) errors.push(`Target selector required for ${step.action} action`);
          break;
          
        case UnifiedActionType.SELECT:
          if (!step.target) errors.push('Target selector required for select action');
          if (!step.value) errors.push('Option value required for select action');
          break;
          
        case UnifiedActionType.WAIT:
          if (!step.value || typeof step.value !== 'number') {
            errors.push('Numeric value (milliseconds) required for wait action');
          }
          break;
          
        case UnifiedActionType.WAIT_FOR_ELEMENT:
          if (!step.target) errors.push('Target selector required for wait_for_element action');
          break;
          
        case UnifiedActionType.KEYPRESS:
          if (!step.value) errors.push('Key value required for keypress action');
          break;
      }
      
      return {
        valid: errors.length === 0,
        errors
      };
    }
    
    static sanitizeStep(step: Partial<UnifiedExecuteStep>): UnifiedExecuteStep {
      return {
        id: step.id || `step_${Date.now()}`,
        action: step.action || UnifiedActionType.CLICK,
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