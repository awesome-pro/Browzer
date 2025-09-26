import {
  SmartRecordingSession,
  SemanticAction,
  PageContext,
  TaskGoal,
  ActionType,
  ElementContext,
  ScreenshotCapture,
  NetworkInteraction
} from '../types/recording';

export class SmartRecordingEngine {
  private static instance: SmartRecordingEngine;
  private activeSession: SmartRecordingSession | null = null;
  private isRecording = false;
  
  // Action aggregation and deduplication
  private pendingActions: Map<string, any> = new Map();
  private lastPageContext: PageContext | null = null;
  private currentTaskGoal: TaskGoal | null = null;
  
  private lastSignificantAction = 0;
  private readonly ACTION_TIMEOUT = 1000; // 1s to aggregate actions
  private readonly TYPING_TIMEOUT = 2000; // 2.5s to aggregate typing actions
  private readonly MIN_ACTION_GAP = 200; // Minimum gap between recorded actions
  
  // Semantic aggregation buffers
  private inputBuffer: Map<string, {value: string, element: any, lastUpdate: number}> = new Map();
  private navigationBuffer: {url: string, timestamp: number} | null = null;
  private clickSequence: Array<{target: any, timestamp: number}> = [];
  private readonly SEMANTIC_AGGREGATION_DELAY = 800; // Delay for aggregating semantic actions
  
  // Deduplication tracking
  private lastActionHash = '';
  private recentActions: Array<{hash: string, timestamp: number}> = [];
  private readonly DEDUP_WINDOW = 2000; // 2 second window for deduplication
  
  // observers
  private observers: Map<string, any> = new Map();
  private eventListeners: Map<string, EventListener> = new Map();

  private constructor() {
    this.initializeWebviewEventHandlers();
    this.initializeNativeEventHandlers();
  }
  
  private initializeNativeEventHandlers(): void {
    window.addEventListener('native-recording-event', ((event: Event) => {
      const customEvent = event as CustomEvent;
      const eventData = customEvent.detail;
      this.handleNativeEvent(eventData);
    }) as EventListener);
    
    console.log('[RecordingEngine] Native event handlers initialized');
  }

  static getInstance(): SmartRecordingEngine {
    if (!SmartRecordingEngine.instance) {
      SmartRecordingEngine.instance = new SmartRecordingEngine();
    }
    return SmartRecordingEngine.instance;
  }

  private initializeWebviewEventHandlers(): void {
    
    const ipcRenderer = (window as any).electronAPI;
    
    if (ipcRenderer && ipcRenderer.ipcOn) {
      ipcRenderer.ipcOn('webview-recording-action', (actionData: any) => {
        this.handleWebviewAction(actionData);
      });
      
      ipcRenderer.ipcOn('webview-recording-context', (contextData: any) => {
        this.handleWebviewContext(contextData);
      });
      
      ipcRenderer.ipcOn('webview-recording-network', (networkData: any) => {
        this.handleWebviewNetwork(networkData);
      });
      
      ipcRenderer.ipcOn('native-event', (eventData: any) => {
        this.handleNativeEvent(eventData);
      });
      
    } else {
      console.warn('[RecordingEngine] IPC renderer not available for webview events');
    }
  }

private handleWebviewAction(actionData: any): void {
  if (!this.isRecording || !this.activeSession) {
    return;
  }
  
  try {
    // Ensure value is properly serialized
    let processedValue = actionData.value;
    if (typeof processedValue === 'object' && processedValue !== null) {
      // If it's an object, convert to a meaningful string
      if (processedValue.toString && processedValue.toString() !== '[object Object]') {
        processedValue = processedValue.toString();
      } else {
        // Try to extract meaningful properties
        if (processedValue.searchQuery || processedValue.resultsCount || processedValue.loadTime) {
          const parts = [];
          if (processedValue.searchQuery) parts.push(`query: "${processedValue.searchQuery}"`);
          if (processedValue.resultsCount) parts.push(`results: ${processedValue.resultsCount}`);
          if (processedValue.loadTime) parts.push(`loadTime: ${processedValue.loadTime}ms`);
          processedValue = parts.join(', ');
        } else {
          processedValue = JSON.stringify(processedValue);
        }
      }
    }

    const description = this.generateWebviewActionDescription(actionData);
    const actionType = this.mapEventTypeToActionType(actionData.type);

    const action: SemanticAction = {
      id: `webview_${this.generateId()}`, // Add webview_ prefix to identify webview actions
      type: actionType,
      timestamp: actionData.timestamp,
      description: description,
      target: this.convertWebviewElementToElementContext(actionData.target),
      value: processedValue,
      coordinates: actionData.coordinates,
      context: this.convertWebviewPageContext(actionData.pageContext),
      intent: this.inferIntent(
        actionType,
        this.convertWebviewElementToElementContext(actionData.target),
        processedValue
      )
    };
    
    // Check for duplicates and filter out low-quality actions
    if (this.shouldRecordAction(action)) {
      // Dispatch custom event for real-time UI updates before recording
      window.dispatchEvent(new CustomEvent('webview-recording-action', {
        detail: {
          type: actionType,
          description: description,
          timestamp: actionData.timestamp
        }
      }));
      
      this.recordAction(action);
    }
  } catch (error) {
    console.error('Error processing webview action:', error);
  }
}

private handleWebviewContext(contextData: any): void {
  if (!this.isRecording || !this.activeSession) return;
  
  
  if (contextData.subtype === 'navigation') {
    const pageContext = this.convertWebviewPageContext(contextData);
    this.handleWebviewNavigation(pageContext);
  }
}

private handleWebviewNetwork(networkData: any): void {
  if (!this.isRecording || !this.activeSession) return;
  
  
  this.recordNetworkInteraction({
    id: this.generateId(),
    timestamp: networkData.timestamp,
    type: networkData.type,
    url: networkData.url,
    method: networkData.method,
    status: networkData.status,
    duration: networkData.duration,
    context: this.convertWebviewPageContext(networkData.pageContext),
    // source: 'webview'
  });
}

/**
 * Handle native events from the main process
 * These events bypass Content Security Policy restrictions
 * and work on sites like Linear.app, Google apps, GitHub, etc.
 */
private handleNativeEvent(eventData: any): void {
  if (!this.isRecording || !this.activeSession) {
    console.log('[RecordingEngine] Skipping event - not recording or no active session');
    return;
  }
  
  if (!eventData) {
    console.error('[RecordingEngine] Received undefined/null event data');
    return;
  }
  
  console.log('[RecordingEngine] Processing native event:', eventData.type, {
    url: eventData.url,
    title: eventData.title,
    timestamp: eventData.timestamp
  });
  
  try {
    // Process different types of native events
    switch (eventData.type) {
      case 'navigation':
      case 'in_page_navigation':
      case 'history_push_state':
      case 'history_replace_state':
        console.log('[RecordingEngine] Handling navigation event:', eventData.url);
        this.handleNativeNavigationEvent(eventData);
        break;
        
      case 'click':
      case 'mousedown':
      case 'mouseup':
        console.log('[RecordingEngine] Handling click event');
        this.handleNativeClickEvent(eventData);
        break;
        
      case 'input':
      case 'change':
        console.log('[RecordingEngine] Handling input event');
        this.handleInputEvent(eventData);
        break;
        
      case 'keydown':
      case 'keyup':
      case 'keypress':
        console.log('[RecordingEngine] Handling key event');
        this.handleNativeKeyEvent(eventData);
        break;
        
      case 'submit':
        console.log('[RecordingEngine] Handling form submit event');
        this.handleNativeFormSubmitEvent(eventData);
        break;
        
      case 'react_synthetic_event':
        console.log('[RecordingEngine] Handling React synthetic event');
        this.handleNativeReactEvent(eventData);
        break;
        
      case 'dom_significant_change':
        console.log('[RecordingEngine] Handling DOM change event');
        this.handleNativeDOMChangeEvent(eventData);
        break;
        
      default:
        console.log('[RecordingEngine] Handling generic event:', eventData.type);
        // For other event types, create a generic action
        this.recordNativeAction(eventData);
    }
  } catch (error) {
    console.error('[RecordingEngine] Error processing native event:', error);
  }
}

/**
 * Handle native navigation events with semantic aggregation
 */
private handleNativeNavigationEvent(eventData: any): void {
  if (!eventData.url) {
    console.error('[RecordingEngine] Navigation event missing URL');
    return;
  }

  console.log('[RecordingEngine] Processing navigation to:', eventData.url);
  
  // Check if this is a duplicate or very recent navigation
  if (this.navigationBuffer && 
      (this.navigationBuffer.url === eventData.url || 
       Date.now() - this.navigationBuffer.timestamp < 500)) {
    console.log('[RecordingEngine] Skipping duplicate or rapid navigation');
    return;
  }
  
  // Update navigation buffer
  this.navigationBuffer = {
    url: eventData.url,
    timestamp: Date.now()
  };
  
  // Schedule processing of this navigation after a delay to avoid duplicates
  setTimeout(() => {
    this.processNavigationBuffer(eventData);
  }, 500); // Short delay to aggregate rapid navigations
}

/**
 * Process the navigation buffer to create semantic actions
 */
private processNavigationBuffer(eventData: any): void {
  // Skip if navigation buffer doesn't match this event (newer navigation occurred)
  if (!this.navigationBuffer || this.navigationBuffer.url !== eventData.url) {
    return;
  }
  
  // Create page context
  const pageContext = {
    url: eventData.url,
    title: eventData.title || 'Unknown Page',
    timestamp: eventData.timestamp || Date.now(),
    viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
    userAgent: navigator.userAgent,
    keyElements: []
  };
  
  // Update last page context
  this.lastPageContext = pageContext;
  
  // Extract domain for more semantic description
  let domain = '';
  try {
    const urlObj = new URL(eventData.url);
    domain = urlObj.hostname.replace('www.', '');
  } catch (e) {
    domain = 'website';
  }
  
  // Create a semantic action for this navigation
  const action: SemanticAction = {
    id: this.generateId(),
    type: ActionType.NAVIGATION,
    timestamp: eventData.timestamp || Date.now(),
    description: `Navigate to ${eventData.title || domain}`,
    target: {
      description: `Page: ${eventData.title || domain}`,
      selector: '',
      xpath: '',
      role: 'page',
      isVisible: true,
      isInteractive: false,
      context: 'navigation'
    },
    context: pageContext,
    intent: 'navigate_to_page'
  };
  
  console.log('[RecordingEngine] Recording navigation action:', action.description);
  this.recordAction(action);
  
  // Dispatch an event for the UI to update
  window.dispatchEvent(new CustomEvent('webview-recording-action', {
    detail: {
      type: ActionType.NAVIGATION,
      description: action.description,
      timestamp: action.timestamp
    }
  }));
  
  // Update pages visited
  if (this.activeSession && !this.activeSession.metadata.pagesVisited.includes(eventData.url)) {
    this.activeSession.metadata.pagesVisited.push(eventData.url);
    console.log('[RecordingEngine] Updated visited pages list');
  }
  
  // Clear navigation buffer
  this.navigationBuffer = null;
}

/**
 * Handle native click events with semantic aggregation
 */
private handleNativeClickEvent(eventData: any): void {
  if (!eventData.target) return;
  if (eventData.type !== 'click') return; // Only process actual clicks, not mousedown/mouseup
  
  const target = eventData.target;
  
  // Check if this is a meaningful click (on interactive elements)
  const isInteractiveElement = this.isInteractiveElement(target);
  
  // If it's not an interactive element and we've had a recent click, skip it
  if (!isInteractiveElement && 
      this.clickSequence.length > 0 && 
      Date.now() - this.clickSequence[this.clickSequence.length - 1].timestamp < 500) {
    return;
  }
  
  // Add to click sequence
  this.clickSequence.push({
    target: target,
    timestamp: Date.now()
  });
  
  // Schedule processing of click sequence
  setTimeout(() => {
    this.processClickSequence(eventData.url, eventData.title);
  }, this.SEMANTIC_AGGREGATION_DELAY);
}

/**
 * Process the click sequence to create semantic actions
 */
private processClickSequence(url: string, pageTitle: string): void {
  // Skip if no clicks in sequence
  if (this.clickSequence.length === 0) return;
  
  // Get the most recent click
  const lastClick = this.clickSequence[this.clickSequence.length - 1];
  
  // Check if enough time has passed since the last click
  if (Date.now() - lastClick.timestamp < this.SEMANTIC_AGGREGATION_DELAY - 50) {
    // Not enough time has passed, more clicks might be coming
    return;
  }
  
  // Get the target of the most significant click
  const target = this.findMostSignificantClick();
  
  // Convert to element context
  const elementContext = this.convertNativeElementToElementContext(target);
  
  // Create a semantic action for this click
  const action: SemanticAction = {
    id: this.generateId(),
    type: ActionType.CLICK,
    timestamp: Date.now(),
    description: `Click ${elementContext.description || target.tagName}`,
    target: elementContext,
    context: {
      url: url,
      title: pageTitle || 'Unknown Page',
      timestamp: Date.now(),
      viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
      userAgent: navigator.userAgent,
      keyElements: []
    },
    intent: this.inferIntent(ActionType.CLICK, elementContext)
  };
  
  // Record the action
  this.recordAction(action);
  
  // Dispatch an event for the UI to update
  window.dispatchEvent(new CustomEvent('webview-recording-action', {
    detail: {
      type: ActionType.CLICK,
      description: action.description,
      timestamp: action.timestamp
    }
  }));
  
  // Clear the click sequence
  this.clickSequence = [];
}

/**
 * Find the most significant click in the sequence
 */
private findMostSignificantClick(): any {
  // If only one click, return it
  if (this.clickSequence.length === 1) {
    return this.clickSequence[0].target;
  }
  
  // Look for clicks on interactive elements
  for (const click of this.clickSequence) {
    if (this.isInteractiveElement(click.target)) {
      return click.target;
    }
  }
  
  // Default to the last click
  return this.clickSequence[this.clickSequence.length - 1].target;
}

/**
 * Check if an element is interactive
 */
private isInteractiveElement(element: any): boolean {
  if (!element || !element.tagName) return false;
  
  const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'];
  const tagName = element.tagName.toUpperCase();
  
  // Check tag name
  if (interactiveTags.includes(tagName)) {
    return true;
  }
  
  // Check for role attributes
  const interactiveRoles = ['button', 'link', 'checkbox', 'menuitem', 'tab', 'radio'];
  const role = element.attributes?.role;
  if (role && interactiveRoles.includes(role)) {
    return true;
  }
  
  // Check for event handlers or pointer cursor
  if (element.attributes) {
    const attrs = Object.keys(element.attributes);
    if (attrs.some(attr => attr.startsWith('on'))) {
      return true;
    }
  }
  
  return false;
}

// This function is defined elsewhere in the file - removed duplicate

/**
 * Process the input buffer to create semantic actions
 */
private processInputBuffer(inputIdentifier: string, url: string, pageTitle: string): void {
  // Check if this input is still in the buffer
  const inputData = this.inputBuffer.get(inputIdentifier);
  if (!inputData) return;
  
  // Check if enough time has passed since the last update
  const timeSinceLastUpdate = Date.now() - inputData.lastUpdate;
  if (timeSinceLastUpdate < this.SEMANTIC_AGGREGATION_DELAY - 50) {
    // Not enough time has passed, input might still be in progress
    return;
  }
  
  // Get the final value and element
  const { value, element } = inputData;
  
  // Skip empty inputs or very short inputs (likely incomplete)
  if (!value || value.length < 2) {
    this.inputBuffer.delete(inputIdentifier);
    return;
  }
  
  // Convert element to our context format
  const elementContext = this.convertNativeElementToElementContext(element);
  
  // Create a semantic action for this input
  const action: SemanticAction = {
    id: this.generateId(),
    type: ActionType.TYPE,
    timestamp: Date.now(),
    description: `Enter "${this.maskSensitiveValue(value)}" in ${elementContext.description || element.tagName}`,
    target: elementContext,
    value: this.maskSensitiveValue(value),
    context: {
      url: url,
      title: pageTitle || 'Unknown Page',
      timestamp: Date.now(),
      viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
      userAgent: navigator.userAgent,
      keyElements: []
    },
    intent: this.inferIntent(ActionType.TYPE, elementContext, value)
  };
  
  // Record the action
  this.recordAction(action);
  
  // Clean up the buffer
  this.inputBuffer.delete(inputIdentifier);
  
  // Dispatch an event for the UI to update
  window.dispatchEvent(new CustomEvent('webview-recording-action', {
    detail: {
      type: ActionType.TYPE,
      description: action.description,
      timestamp: action.timestamp
    }
  }));
}

/**
 * Handle input events with semantic aggregation
 */
private handleInputEvent(eventData: any): void {
  if (!eventData.target) return;
  if (!eventData.value) return;
  
  const target = eventData.target;
  const elementId = target.id || target.name || `${target.tagName}_${target.type || ''}_${Date.now()}`;
  
  // Create a unique identifier for this input element
  const inputIdentifier = `${eventData.url}_${elementId}`;
  
  // Update the input buffer with the latest value
  this.inputBuffer.set(inputIdentifier, {
    value: eventData.value,
    element: target,
    lastUpdate: Date.now()
  });
  
  // Schedule processing of this input after a delay to aggregate multiple keystrokes
  setTimeout(() => {
    this.processInputBuffer(inputIdentifier, eventData.url, eventData.title);
  }, this.SEMANTIC_AGGREGATION_DELAY);
}

/**
 * Handle key events with semantic aggregation
 */
private handleNativeKeyEvent(eventData: any): void {
  if (!eventData.target || !eventData.key) return;
  
  // Only process keydown events to avoid duplicates
  if (eventData.type !== 'keydown') return;
  
  // Only record special keys like Enter, Escape, etc.
  const specialKeys = ['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  if (!specialKeys.includes(eventData.key)) return;
  
  // For Enter key on form elements, don't record as it will likely trigger a form submission
  if (eventData.key === 'Enter' && this.isFormElement(eventData.target)) {
    return;
  }
  
  const target = eventData.target;
  const elementContext = this.convertNativeElementToElementContext(target);
  
  // Create a more descriptive action based on the key and context
  let description = `Press ${eventData.key} key`;
  let intent = 'keyboard_navigation';
  
  if (eventData.key === 'Enter') {
    description = `Press Enter to confirm`;
    intent = 'confirm_action';
  } else if (eventData.key === 'Escape') {
    description = `Press Escape to cancel`;
    intent = 'cancel_action';
  } else if (eventData.key.startsWith('Arrow')) {
    const direction = eventData.key.replace('Arrow', '').toLowerCase();
    description = `Navigate ${direction} using keyboard`;
  }
  
  const action: SemanticAction = {
    id: this.generateId(),
    type: ActionType.KEYPRESS,
    timestamp: eventData.timestamp || Date.now(),
    description: description,
    target: elementContext,
    value: eventData.key,
    context: {
      url: eventData.url,
      title: eventData.title || 'Unknown Page',
      timestamp: eventData.timestamp || Date.now(),
      viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
      userAgent: navigator.userAgent,
      keyElements: []
    },
    intent: intent
  };
  
  this.recordAction(action);
  
  // Dispatch an event for the UI to update
  window.dispatchEvent(new CustomEvent('webview-recording-action', {
    detail: {
      type: ActionType.KEYPRESS,
      description: action.description,
      timestamp: action.timestamp
    }
  }));
}

/**
 * Check if an element is a form element
 */
private isFormElement(element: any): boolean {
  if (!element || !element.tagName) return false;
  
  const formTags = ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'];
  const tagName = element.tagName.toUpperCase();
  
  return formTags.includes(tagName) || element.form != null;
}

/**
 * Handle native form submit events with semantic enhancement
 */
private handleNativeFormSubmitEvent(eventData: any): void {
  if (!eventData.target) return;
  
  const target = eventData.target;
  const elementContext = this.convertNativeElementToElementContext(target);
  
  // Try to find a more descriptive name for the form
  let formDescription = 'form';
  
  // Check if the form has an id or name
  if (target.id) {
    formDescription = `form #${target.id}`;
  } else if (target.name) {
    formDescription = `form ${target.name}`;
  } else {
    // Try to infer form purpose from its inputs
    const inputTypes = this.getFormInputTypes(target);
    
    if (inputTypes.includes('search')) {
      formDescription = 'search form';
    } else if (inputTypes.includes('password')) {
      formDescription = 'login form';
    } else if (inputTypes.includes('email') && !inputTypes.includes('password')) {
      formDescription = 'signup or contact form';
    }
  }
  
  // Create a semantic action for this form submission
  const action: SemanticAction = {
    id: this.generateId(),
    type: ActionType.FORM_SUBMIT,
    timestamp: eventData.timestamp || Date.now(),
    description: `Submit ${formDescription}`,
    target: elementContext,
    context: {
      url: eventData.url,
      title: eventData.title || 'Unknown Page',
      timestamp: eventData.timestamp || Date.now(),
      viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
      userAgent: navigator.userAgent,
      keyElements: []
    },
    intent: this.inferIntent(ActionType.FORM_SUBMIT, elementContext)
  };
  
  this.recordAction(action);
  
  // Dispatch an event for the UI to update
  window.dispatchEvent(new CustomEvent('webview-recording-action', {
    detail: {
      type: ActionType.FORM_SUBMIT,
      description: action.description,
      timestamp: action.timestamp
    }
  }));
}

/**
 * Get the types of inputs in a form
 */
private getFormInputTypes(formElement: any): string[] {
  if (!formElement) return [];
  
  // If this is already a form element
  if (formElement.tagName && formElement.tagName.toUpperCase() === 'FORM') {
    // Try to extract input types from the form's attributes
    if (formElement.attributes) {
      const inputTypes: string[] = [];
      
      if (formElement.attributes['data-purpose'] === 'search-form') {
        inputTypes.push('search');
      }
      
      // Look for common input types
      if (formElement.elements) {
        for (const element of formElement.elements) {
          if (element.type) {
            inputTypes.push(element.type);
          }
        }
      }
      
      return inputTypes;
    }
  }
  
  return [];
}

/**
 * Handle native React synthetic events
 */
private handleNativeReactEvent(eventData: any): void {
  if (!eventData.target) return;
  
  const target = eventData.target;
  const elementContext = this.convertNativeElementToElementContext(target);
  
  // Map React event names to our action types
  const reactEventMap: Record<string, ActionType> = {
    'onClick': ActionType.CLICK,
    'onChange': ActionType.TYPE,
    'onSubmit': ActionType.SUBMIT,
    'onKeyDown': ActionType.KEYPRESS,
    'onKeyUp': ActionType.KEYPRESS
  };
  
  const actionType = reactEventMap[eventData.reactType] || ActionType.CLICK;
  
  const action: SemanticAction = {
    id: this.generateId(),
    type: actionType,
    timestamp: eventData.timestamp,
    description: `React ${eventData.reactType.replace('on', '')} on ${elementContext.description || target.tagName}`,
    target: elementContext,
    context: {
      url: eventData.url,
      title: eventData.title || 'Unknown Page',
      timestamp: eventData.timestamp,
      viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
      userAgent: navigator.userAgent,
      keyElements: []
    },
    intent: this.inferIntent(actionType, elementContext)
  };
  
  this.recordAction(action);
}

/**
 * Handle native DOM change events
 */
private handleNativeDOMChangeEvent(eventData: any): void {
  const action: SemanticAction = {
    id: this.generateId(),
    type: ActionType.DYNAMIC_CONTENT,
    timestamp: eventData.timestamp,
    description: `Content updated on ${eventData.title || eventData.url}`,
    target: {
      description: 'Dynamic content',
      selector: '',
      xpath: '',
      role: 'region',
      isVisible: true,
      isInteractive: false,
      context: 'dom_change'
    },
    context: {
      url: eventData.url,
      title: eventData.title || 'Unknown Page',
      timestamp: eventData.timestamp,
      viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
      userAgent: navigator.userAgent,
      keyElements: []
    },
    intent: 'view_content'
  };
  
  this.recordAction(action);
}

/**
 * Record a generic native action
 */
private recordNativeAction(eventData: any): void {
  if (!eventData.target) return;
  
  const target = eventData.target;
  const elementContext = this.convertNativeElementToElementContext(target);
  
  const action: SemanticAction = {
    id: this.generateId(),
    type: ActionType.CLICK,
    timestamp: eventData.timestamp,
    description: `${eventData.type} on ${elementContext.description || target.tagName}`,
    target: elementContext,
    value: eventData.value,
    coordinates: eventData.coordinates,
    context: {
      url: eventData.url,
      title: eventData.title || 'Unknown Page',
      timestamp: eventData.timestamp,
      viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
      userAgent: navigator.userAgent,
      keyElements: []
    },
    intent: 'interact'
  };
  
  this.recordAction(action);
}

/**
 * Convert a native element to our ElementContext format
 */
private convertNativeElementToElementContext(nativeElement: any): ElementContext {
  if (!nativeElement) {
    return {
      description: 'Unknown element',
      selector: '',
      xpath: '',
      role: 'unknown',
      boundingRect: { x: 0, y: 0, width: 0, height: 0 },
      isVisible: true,
      isInteractive: true,
      context: 'native_event'
    };
  }
  
  // Generate a descriptive string based on the element's properties
  let description = nativeElement.tagName?.toLowerCase() || 'element';
  
  if (nativeElement.type) {
    description = `${nativeElement.type} ${description}`;
  }
  
  if (nativeElement.id) {
    description += ` #${nativeElement.id}`;
  } else if (nativeElement.className) {
    const classes = nativeElement.className.toString().split(' ');
    if (classes.length > 0 && classes[0]) {
      description += ` .${classes[0]}`;
    }
  }
  
  if (nativeElement.text) {
    description += ` "${nativeElement.text.substring(0, 30)}${nativeElement.text.length > 30 ? '...' : ''}"`;  
  }
  
  // Generate a selector
  let selector = nativeElement.tagName?.toLowerCase() || '';
  if (nativeElement.id) {
    selector = `#${nativeElement.id}`;
  } else if (nativeElement.attributes && nativeElement.attributes['data-testid']) {
    selector = `[data-testid="${nativeElement.attributes['data-testid']}"]`;
  } else if (nativeElement.className) {
    const classes = nativeElement.className.toString().split(' ');
    if (classes.length > 0 && classes[0]) {
      selector = `${selector}.${classes[0]}`;
    }
  }
  
  return {
    description,
    selector,
    xpath: '',
    role: nativeElement.attributes?.role || 'generic',
    boundingRect: nativeElement.boundingRect || { x: 0, y: 0, width: 0, height: 0 },
    isVisible: true,
    isInteractive: true,
    context: 'native_event',
    elementType: nativeElement.type || nativeElement.tagName?.toLowerCase(),
    text: nativeElement.text
  };
}

private convertWebviewElementToElementContext(webviewElement: any): ElementContext {
  return {
    description: this.generateEnhancedElementDescription(webviewElement),
    selector: webviewElement.selector || '',
    xpath: webviewElement.xpath || '',
    role: webviewElement.elementType || webviewElement.tagName || 'unknown',
    boundingRect: webviewElement.boundingRect || { x: 0, y: 0, width: 0, height: 0 },
    isVisible: webviewElement.isVisible !== false,
    isInteractive: true,
    context: webviewElement.context || 'in webview',
    // Enhanced properties for better automation
    elementType: webviewElement.elementType,
    purpose: webviewElement.purpose,
    href: webviewElement.href,
    text: webviewElement.text,
    // New enhanced targeting properties
    targetUrl: webviewElement.targetUrl,
    uniqueIdentifiers: webviewElement.uniqueIdentifiers || [],
    semanticRole: webviewElement.semanticRole,
    interactionContext: webviewElement.interactionContext,
    parentContext: webviewElement.parentContext
  };
}

private generateEnhancedElementDescription(element: any): string {
  const elementType = element.elementType || element.tagName || 'element';
  const text = element.text || '';
  const purpose = element.purpose || '';
  const context = element.context || '';
  const targetUrl = element.targetUrl;
  const uniqueIdentifiers = element.uniqueIdentifiers || [];
  const interactionContext = element.interactionContext || '';
  
  // Create more descriptive element descriptions with targeting info
  if (elementType === 'link') {
    let description = 'Link';
    
    if (targetUrl) {
      try {
        const url = new URL(targetUrl);
        const domain = url.hostname.replace('www.', '');
        description = `Link to ${domain}`;
      } catch (e) {
        description = 'Link';
      }
    }
    
    if (text) {
      description += ` ("${text.substring(0, 30)}")`;
    }
    
    // Add the most reliable selector for AI targeting
    const bestSelector = this.getBestSelector(uniqueIdentifiers, text, elementType);
    if (bestSelector) {
      description += ` [${bestSelector}]`;
    }
    
    if (interactionContext && interactionContext !== 'page') {
      description += ` in ${interactionContext}`;
    }
    
    return description;
  }
  
  if (elementType === 'button' || purpose.includes('button')) {
    let description = 'Button';
    if (purpose === 'search') description = 'Search button';
    else if (purpose === 'form_submission') description = 'Submit button';
    else if (purpose === 'toggle_setting') description = 'Toggle button';
    else if (purpose === 'navigation_menu') description = 'Menu button';
    else if (purpose === 'authentication') description = 'Authentication button';
    
    if (text) {
      description += ` ("${text.substring(0, 30)}")`;
    }
    
    // Add the most reliable selector for AI targeting
    const bestSelector = this.getBestSelector(uniqueIdentifiers, text, elementType);
    if (bestSelector) {
      description += ` [${bestSelector}]`;
    }
    
    if (interactionContext && interactionContext !== 'page') {
      description += ` in ${interactionContext}`;
    }
    
    return description;
  }
  
  if (elementType.includes('input')) {
    let description = 'Input field';
    if (purpose === 'search_input') description = 'Search input';
    else if (purpose === 'email_input') description = 'Email input';
    else if (purpose === 'password_input') description = 'Password input';
    else if (purpose === 'name_input') description = 'Name input';
    
    if (text) {
      description += ` [${text.substring(0, 30)}]`;
    }
    
    // Add the most reliable selector for AI targeting
    const bestSelector = this.getBestSelector(uniqueIdentifiers, text, elementType);
    if (bestSelector) {
      description += ` {${bestSelector}}`;
    }
    
    if (interactionContext && interactionContext !== 'page') {
      description += ` in ${interactionContext}`;
    }
    
    return description;
  }
  
  // Default description with context and targeting info
  let description = elementType;
  if (text) description += ` ("${text.substring(0, 60)}")`;
  
  // Add the most reliable selector for AI targeting
  const bestSelector = this.getBestSelector(uniqueIdentifiers, text, elementType);
  if (bestSelector) {
    description += ` [${bestSelector}]`;
  }
  
  if (interactionContext && interactionContext !== 'page') {
    description += ` in ${interactionContext}`;
  } else if (context && context !== 'on_page') {
    description += ` ${context}`;
  }
  
  return description;
}

private getBestSelector(uniqueIdentifiers: string[], text: string, elementType: string): string {
  if (!uniqueIdentifiers || uniqueIdentifiers.length === 0) return '';
  
  // Priority order for selectors (most reliable first)
  const priorities = [
    (selector: string) => selector.startsWith('#'), // ID selectors
    (selector: string) => selector.includes('data-testid'), // Test ID selectors
    (selector: string) => selector.includes('aria-label'), // Aria label selectors
    (selector: string) => selector.includes('name='), // Name attribute selectors
    (selector: string) => selector.includes(':contains('), // Text-based selectors
    (selector: string) => selector.startsWith('.') // Class selectors
  ];
  
  for (const priorityCheck of priorities) {
    const selector = uniqueIdentifiers.find(priorityCheck);
    if (selector) return selector;
  }
  
  // Return the first available selector as fallback
  return uniqueIdentifiers[0] || '';
}

private cleanGoogleUrl(url: string): string {
  if (!url) {
    return url;
  }
  
  try {
    const urlObj = new URL(url);
    
    // Handle Google redirect URLs
    if (urlObj.hostname.includes('google.com') && urlObj.pathname === '/url') {
      // Extract the actual destination URL from the 'url' parameter
      const destinationUrl = urlObj.searchParams.get('url') || urlObj.searchParams.get('q');
      if (destinationUrl) {
        try {
          // Validate that it's a proper URL
          new URL(destinationUrl);
          return destinationUrl;
        } catch (e) {
          // If parsing fails, fall through to normal Google URL cleaning
        }
      }
    }
    
    // If it's a regular Google search URL, clean it up
    if (url.includes('google.com')) {
      // Only keep essential Google search parameters
      const essentialParams = ['q', 'tbm', 'safe', 'lr', 'hl'];
      const cleanParams = new URLSearchParams();
      
      for (const param of essentialParams) {
        const value = urlObj.searchParams.get(param);
        if (value) {
          cleanParams.set(param, value);
        }
      }
      
      // Reconstruct URL with only essential parameters
      const cleanUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}${cleanParams.toString() ? '?' + cleanParams.toString() : ''}`;
      
      console.log(`🔧[RecordingEngine] Cleaned Google URL: ${url.substring(0, 100)}... → ${cleanUrl}`);
      return cleanUrl;
    }
    
    return url;
  } catch (e) {
    console.warn('[RecordingEngine] Failed to clean Google URL:', e);
    return url;
  }
}

private cleanGoogleUrlInDescription(description: string): string {
  // Use regex to find and clean Google URLs in descriptions
  const googleUrlRegex = /(https:\/\/www\.google\.com\/search\?[^\s)]+)/g;
  
  return description.replace(googleUrlRegex, (match) => {
    return this.cleanGoogleUrl(match);
  });
}

private convertWebviewPageContext(webviewContext: any): PageContext {
  return {
    url: webviewContext.url || 'unknown',
    title: webviewContext.title || 'unknown',
    timestamp: webviewContext.timestamp || Date.now(),
    viewport: webviewContext.viewport || { width: 0, height: 0, scrollX: 0, scrollY: 0 },
    userAgent: navigator.userAgent,
    keyElements: []
  };
}

private generateWebviewActionDescription(actionData: any): string {
  const element = actionData.target;
  const type = actionData.type;
  const value = actionData.value;
  
  // Handle special action types first
  if (type === 'page_load_complete') {
    // Value is already a string from webview, but clean up Google URLs
    if (typeof value === 'string') {
      return this.cleanGoogleUrlInDescription(value);
    }
    return `Page loaded - "${element.text}"`;
  }
  
  if (type === 'search_results_loaded') {
    // Value is already a formatted string from webview
    return typeof value === 'string' ? value : `Search results loaded`;
  }
  
  if (type === 'dynamic_content_loaded') {
    // Value is already a formatted string from webview
    if (typeof value === 'string') {
      return value;
    }
    
    // Fallback with more context
    const pageTitle = element.text || '';
    const context = element.context || 'page';
    
    if (pageTitle && pageTitle.length > 0) {
      return `${pageTitle} on ${context}`;
    }
    
    return `Content loaded on ${context}`;
  }
  
  // Generate more meaningful descriptions based on element type and purpose
  const elementType = element.elementType || element.tagName;
  const purpose = element.purpose || 'interactive_element';
  const text = element.text || '';
  const targetUrl = element.targetUrl;
  
  switch (type) {
    case 'click':
      if (elementType === 'link') {
        if (targetUrl) {
          try {
            const cleanUrl = this.cleanGoogleUrl(targetUrl);
            const url = new URL(cleanUrl);
            const domain = url.hostname.replace('www.', '');
            return `Click link to ${domain}${text ? ` ("${text.substring(0, 30)}")` : ''} → ${cleanUrl}`;
          } catch (e) {
            const cleanUrl = this.cleanGoogleUrl(targetUrl);
            return `Click link${text ? ` ("${text.substring(0, 30)}")` : ''} → ${cleanUrl}`;
          }
        } else if (purpose === 'in_page_navigation') {
          return `Click in-page link${text ? ` ("${text.substring(0, 30)}")` : ''}`;
        } else {
          return `Click link${text ? ` ("${text.substring(0, 30)}")` : ''}`;
        }
      } else if (elementType === 'button' || purpose.includes('button')) {
        let buttonDescription = 'button';
        if (purpose === 'search') {
          buttonDescription = 'search button';
        } else if (purpose === 'form_submission') {
          buttonDescription = 'submit button';
        } else if (purpose === 'toggle_setting') {
          buttonDescription = 'toggle button';
        } else if (purpose === 'authentication') {
          buttonDescription = 'authentication button';
        }
        
        const elementContext = element.interactionContext || '';
        const contextSuffix = elementContext ? ` in ${elementContext}` : '';
        
        return `Click ${buttonDescription}${text ? ` ("${text.substring(0, 30)}")` : ''}${contextSuffix}`;
      } else {
        const elementContext = element.interactionContext || '';
        const contextSuffix = elementContext ? ` in ${elementContext}` : '';
        return `Click ${elementType}${text ? ` ("${text.substring(0, 30)}")` : ''}${contextSuffix}`;
      }
      
    case 'type':
      if (purpose === 'search_input') {
        return `Search for "${value}"`;
      } else if (purpose === 'email_input') {
        return `Enter email "${value}"`;
      } else if (purpose === 'password_input') {
        return `Enter password`;
      } else if (purpose === 'name_input') {
        return `Enter name "${value}"`;
      } else {
        return `Type "${value}" in ${elementType}`;
      }
      
    case 'keypress':
      if (value === 'Enter') {
        if (purpose === 'search_input') {
          return `Press Enter to search`;
        }
        return `Press Enter${text ? ` in ${elementType}` : ''}`;
      }
      return `Press ${value} key`;
      
    case 'navigation':
      if (value && typeof value === 'object') {
        const navType = value.navigationType;
        const url = value.url || value.toUrl;
        // const linkText = value.linkText;
        
        if (navType === 'google_search_result') {
          try {
            // Check if this is a Google redirect URL or the actual destination
            const isRedirect = value.isRedirect;
            const actualUrl = isRedirect ? value.url : url;
            const urlObj = new URL(actualUrl);
            const domain = urlObj.hostname.replace('www.', '');
            
            return `Navigate from search results to ${domain} → ${this.cleanGoogleUrl(actualUrl)}`;
          } catch (e) {
            return `Navigate from search results to website ${url}`;
          }
        } else if (navType === 'external_link' || navType === 'external_navigation') {
          try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname.replace('www.', '');
            return `Navigate to ${domain} → ${url}`;
          } catch (e) {
            return `Navigate to external page → ${url}`;
          }
        } else if (navType === 'in_page_navigation') {
          return `Navigate within page`;
        } else if (url) {
          try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname.replace('www.', '');
            return `Navigate to ${domain}`;
          } catch (e) {
            return `Navigate to ${url}`;
          }
        }
      }
      return `Navigate to page ${text ? ` ("${text.substring(0, 50)}")` : ''}`;
      
    case 'change':
      return `Select "${value}" from ${elementType}`;
      
    case 'submit':
    case 'form_submit':
      // Handle both old submit events and new form_submit events
      if (typeof value === 'object' && value !== null) {
        if (value.buttonText) {
          return `Click "${value.buttonText}" button to submit form`;
        } else if (value.fields) {
          const fieldCount = value.fieldCount || Object.keys(value.fields).length || 0;
          return `Submit form with ${fieldCount} fields`;
        }
      }
      return `Submit form`;
      
    default:
      return `${type} on ${elementType}${text ? ` ("${text.substring(0, 30)}")` : ''}`;
  }
}


private handleWebviewNavigation(pageContext: PageContext): void {
  if (!this.activeSession) return;
  
  
  if (!this.activeSession.metadata.pagesVisited.includes(pageContext.url)) {
    this.activeSession.metadata.pagesVisited.push(pageContext.url);
  }
  
  const action: SemanticAction = {
    id: this.generateId(),
    type: ActionType.NAVIGATION,
    timestamp: Date.now(),
    description: `Navigate to ${pageContext.title || pageContext.url} (webview)`,
    target: {
      description: `Webview Page: ${pageContext.title}`,
      selector: '',
      xpath: '',
      role: 'page',
      isVisible: true,
      isInteractive: false,
      context: 'webview navigation'
    },
    context: pageContext,
    intent: 'navigate_to_page'
  };
  
  this.recordAction(action);
  this.lastPageContext = pageContext;
}

public initializeWebviewRecording(): void {
  this.initializeWebviewEventHandlers();
}

public setupWebviewRecording(webview: any): void {
  
  if (this.isRecording && this.activeSession) {
    try {
      webview.send('start-recording', this.activeSession.id);
    } catch (error) {
      console.error('[RecordingEngine] Failed to send start-recording command:', error);
    }
  }
}

private notifyWebviewsRecordingState(commandType: 'start' | 'stop'): void {
  
  // Dispatch custom event that index.ts can listen for
  if (commandType === 'start') {
    window.dispatchEvent(new CustomEvent('recording:start', {
      detail: { sessionId: this.activeSession?.id }
    }));
  } else {
    window.dispatchEvent(new CustomEvent('recording:stop'));
  }
}

  // Session Management
  startRecording(taskGoal: string, description?: string): SmartRecordingSession {
    if (this.isRecording) {
      throw new Error('Recording already in progress');
    }

    const session: SmartRecordingSession = {
      id: this.generateId(),
      taskGoal,
      description,
      startTime: Date.now(),
      isActive: true,
      initialContext: this.capturePageContext(),
      actions: [],
      screenshots: [],
      networkInteractions: [],
      metadata: {
        totalActions: 0,
        duration: 0,
        pagesVisited: [window.location.href],
        complexity: 'simple',
        success: false
      }
    };

    this.activeSession = session;
    this.isRecording = true;
    this.lastPageContext = session.initialContext;
    this.currentTaskGoal = { goal: taskGoal, steps: [], completed: false };
    
    this.initializeRecording();
    // this.captureInitialScreenshot();
    this.notifyWebviewsRecordingState('start');

    return session;
  }

  stopRecording(): SmartRecordingSession | null {
    if (!this.isRecording || !this.activeSession) {
      throw new Error('No active recording session');
    }

    // Process any pending actions
    this.processPendingActions();
    
    this.activeSession.endTime = Date.now();
    this.activeSession.isActive = false;
    this.activeSession.metadata.duration = this.activeSession.endTime - this.activeSession.startTime;
    this.activeSession.metadata.totalActions = this.activeSession.actions.length;
    this.activeSession.metadata.complexity = this.calculateComplexity();
    
    // Capture final screenshot
    // this.captureScreenshot('final_state');
    this.notifyWebviewsRecordingState('stop');
    this.cleanupRecording();
    
    const session = this.activeSession;
    this.activeSession = null;
    this.isRecording = false;

    this.saveSession(session);
    return session;
  }

  // Core Recording Logic
  private initializeRecording(): void {
    this.setupSmartEventListeners();
    this.setupNetworkMonitoring();
    this.setupPageChangeDetection();
  }

  private setupSmartEventListeners(): void {
    // Focus on high-level user intentions only
    const meaningfulEvents = [  
      'click', 'submit', 'change', 'input', 'keydown'
    ];

    meaningfulEvents.forEach(eventType => {
      const listener = (event: Event) => this.handleSmartEvent(event);
      document.addEventListener(eventType, listener, true);
      this.eventListeners.set(eventType, listener);
    });

    // Page navigation and visibility
    window.addEventListener('beforeunload', () => this.processPendingActions());
    window.addEventListener('pagehide', () => this.processPendingActions());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.handlePageFocus();
      }
    });
  }

  private handleSmartEvent(event: Event): void {
    const target = event.target as Element;
    if (!target || !this.isInteractiveElement(target)) return;

    switch (event.type) {
      case 'input':
      case 'keydown':
        this.handleTextInput(event);
        break;
      case 'click':
        this.handleClick(event);
        break;
      case 'submit':
        this.handleFormSubmit(event);
        break;
      case 'change':
        this.handleValueChange(event);
        break;
    }
  }
  

  // Smart Event Handlers
  private handleTextInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (!target || !this.isInteractiveElement(target)) return;

    const elementContext = this.captureElementContext(target);
    
    // Handle keydown events
    if (event.type === 'keydown') {
      const keyEvent = event as KeyboardEvent;
      if (keyEvent.key === 'Enter') {
        // Flush any pending text input and record Enter as separate action
        this.finalizeTextInput(elementContext, target.value);
        return;
      }
      // Skip other keydown events - we'll handle via input events
      return;
    }

    // Handle input events with debouncing - use longer timeout for typing
    const targetKey = `type_${elementContext.selector}`;
    this.debounceAction(targetKey, () => {
      this.finalizeTextInput(elementContext, target.value);
    }, this.TYPING_TIMEOUT); // Use longer timeout for typing events
  }

  private finalizeTextInput(elementContext: ElementContext, finalValue: string): void {
    // Skip empty or very short inputs
    if (!finalValue?.trim() || finalValue.length < 2) return;
    
    // Check if this is a duplicate of a recent input to the same field
    const inputKey = `input_${elementContext.selector}`;
    const lastInput = this.recentActions.find(a => 
      a.hash.includes(elementContext.selector) && 
      a.hash.includes('TYPE')
    );
    
    // If we have a recent input to the same field, check if it's similar
    // Skip recording if it's just a minor change (e.g., "gith" -> "github")
    if (lastInput) {
      const lastInputValue = JSON.parse(lastInput.hash).value || '';
      
      // If the new value is just a small addition to the previous value, skip it
      if (finalValue.startsWith(lastInputValue) && 
          finalValue.length - lastInputValue.length < 3) {
        return;
      }
      
      // If the new value is just a small edit of the previous value, skip it
      if (lastInputValue.length > 0 && 
          Math.abs(finalValue.length - lastInputValue.length) < 3) {
        return;
      }
    }

    const action: SemanticAction = {
      id: this.generateId(),
      type: ActionType.TYPE,
      timestamp: Date.now(),
      description: `Enter "${this.maskSensitiveValue(finalValue)}" in ${elementContext.description}`,
      target: elementContext,
      value: this.maskSensitiveValue(finalValue),
      context: this.capturePageContext(),
      intent: this.inferIntent(ActionType.TYPE, elementContext, finalValue)
    };

    this.recordAction(action);
  }

  private handleClick(event: Event): void {
    const target = event.target as Element;
    if (!target || !this.isInteractiveElement(target)) return;

    const elementContext = this.captureElementContext(target);
    const mouseEvent = event as MouseEvent;

    const action: SemanticAction = {
      id: this.generateId(),
      type: ActionType.CLICK,
      timestamp: Date.now(),
      description: `Click ${elementContext.description}`,
      target: elementContext,
      coordinates: {
        x: mouseEvent.clientX,
        y: mouseEvent.clientY
      },
      context: this.capturePageContext(),
      intent: this.inferIntent(ActionType.CLICK, elementContext)
    };

    // Apply quality filtering
    if (this.shouldRecordAction(action)) {
      this.recordAction(action);
    }
  }

  private handleFormSubmit(event: Event): void {
    const form = event.target as HTMLFormElement;
    if (!form) return;

    const formData = new FormData(form);
    const formFields: Record<string, string> = {};
    
    formData.forEach((value, key) => {
      formFields[key] = this.maskSensitiveValue(value.toString());
    });

    const action: SemanticAction = {
      id: this.generateId(),
      type: ActionType.FORM_SUBMIT,
      timestamp: Date.now(),
      description: `Submit form with ${Object.keys(formFields).length} fields`,
      target: this.captureElementContext(form),
      value: formFields,
      context: this.capturePageContext(),
      intent: this.inferIntent(ActionType.FORM_SUBMIT, this.captureElementContext(form))
    };

    // Form submissions are always high-quality actions
    this.recordAction(action);
  }

  private handleValueChange(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (!target || !this.isInteractiveElement(target)) return;

    const elementContext = this.captureElementContext(target);
    let actionType: ActionType;
    let description: string;

    if (target.tagName.toLowerCase() === 'select') {
      actionType = ActionType.SELECT;
      const selectedOption = (target as HTMLSelectElement).selectedOptions[0];
      description = `Select "${selectedOption?.textContent}" from ${elementContext.description}`;
    } else if (target.type === 'checkbox') {
      actionType = ActionType.TOGGLE;
      description = `${(target as HTMLInputElement).checked ? 'Check' : 'Uncheck'} ${elementContext.description}`;
    } else if (target.type === 'radio') {
      actionType = ActionType.SELECT;
      description = `Select ${elementContext.description}`;
    } else {
      return; // Other input types handled by text input
    }

    const action: SemanticAction = {
      id: this.generateId(),
      type: actionType,
      timestamp: Date.now(),
      description,
      target: elementContext,
      value: target.value,
      context: this.capturePageContext(),
      intent: this.inferIntent(actionType, elementContext)
    };

    // Value changes are generally high-quality actions
    if (this.shouldRecordAction(action)) {
      this.recordAction(action);
    }
  }

  private handlePageFocus(): void {
    // Check if we're on a new page
    const currentContext = this.capturePageContext();
    if (!this.lastPageContext || currentContext.url !== this.lastPageContext.url) {
      this.handlePageNavigation(currentContext);
    }
  }

  private handlePageNavigation(newContext: PageContext): void {
    if (this.activeSession) {
      this.activeSession.metadata.pagesVisited.push(newContext.url);
    }

    const action: SemanticAction = {
      id: this.generateId(),
      type: ActionType.NAVIGATION,
      timestamp: Date.now(),
      description: `Navigate to ${this.getPageTitle(newContext) || newContext.url}`,
      target: {
        description: `Page: ${newContext.title}`,
        selector: '',
        xpath: '',
        role: 'page',
        isVisible: true,
        isInteractive: false
      },
      context: newContext,
      intent: this.inferNavigationIntent(this.lastPageContext, newContext)
    };

    this.recordAction(action);
    this.captureScreenshot('page_navigation');
    this.lastPageContext = newContext;
  }

  // Network Monitoring
  private setupNetworkMonitoring(): void {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const startTime = Date.now();
      const response = await originalFetch(...args);
      
      if (this.isSignificantRequest(args[0])) {
        this.recordNetworkInteraction({
          type: 'fetch',
          url: typeof args[0] === 'string' ? args[0] : args[0].toString(),
          method: args[1]?.method || 'GET',
          status: response.status,
          duration: Date.now() - startTime,
          timestamp: startTime
        });
      }
      
      return response;
    };
  }

  private isSignificantRequest(url: string | Request | URL): boolean {
    const urlString = typeof url === 'string' ? url : url.toString();
    
    // Filter out internal/dev requests
    const ignoredPatterns = [
      'chrome-extension://',
      'localhost:5173',
      '/vite/',
      'hot-update',
      '.css',
      '.js',
      '.map',
      'favicon.ico'
    ];
    
    return !ignoredPatterns.some(pattern => urlString.includes(pattern));
  }

  private recordNetworkInteraction(interaction: Partial<NetworkInteraction>): void {
    if (!this.activeSession) return;

    const networkInteraction: NetworkInteraction = {
      id: this.generateId(),
      timestamp: interaction.timestamp || Date.now(),
      type: interaction.type || 'fetch',
      url: interaction.url || '',
      method: interaction.method || 'GET',
      status: interaction.status,
      duration: interaction.duration,
      context: this.capturePageContext()
    };

    this.activeSession.networkInteractions.push(networkInteraction);
  }

  // Context Capture
  private capturePageContext(): PageContext {
    return {
      url: window.location.href,
      title: document.title,
      timestamp: Date.now(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY
      },
      userAgent: navigator.userAgent,
      // Only capture essential page elements
      keyElements: this.captureKeyPageElements()
    };
  }

  private captureKeyPageElements(): Array<{ role: string; text: string; selector: string }> {
    const keyElements: Array<{ role: string; text: string; selector: string }> = [];
    
    // Capture main headings
    document.querySelectorAll('h1, h2').forEach((el, index) => {
      if (index < 3) { // Limit to first 3 headings
        keyElements.push({
          role: 'heading',
          text: el.textContent?.trim().substring(0, 100) || '',
          selector: this.generateSimpleSelector(el)
        });
      }
    });
    
    // Capture main navigation elements
    document.querySelectorAll('nav a, .nav a, [role="navigation"] a').forEach((el, index) => {
      if (index < 5) { // Limit to first 5 nav items
        keyElements.push({
          role: 'navigation',
          text: el.textContent?.trim().substring(0, 50) || '',
          selector: this.generateSimpleSelector(el)
        });
      }
    });
    
    return keyElements;
  }

  private captureElementContext(element: Element): ElementContext {
    const role = this.determineElementRole(element);
    const rect = element.getBoundingClientRect();

    return {
      description: this.generateElementDescription(element),
      selector: this.generateRobustSelector(element),
      xpath: this.generateSimpleXPath(element),
      role,
      boundingRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      },
      isVisible: this.isElementVisible(element),
      isInteractive: this.isInteractiveElement(element),
      context: this.getElementContext(element)
    };
  }

  // Screenshot Management
  private async captureScreenshot(type: 'initial' | 'action' | 'page_navigation' | 'final_state' | 'error' = 'action'): Promise<void> {
    if (!this.activeSession) return;

    try {
      // In Electron, you would use screen capture APIs
      // For now, using a placeholder implementation
      const screenshot: ScreenshotCapture = {
        id: this.generateId(),
        timestamp: Date.now(),
        type,
        base64Data: '', // Would capture actual screen data
        context: this.capturePageContext()
      };

      this.activeSession.screenshots.push(screenshot);
    } catch (error) {
      console.warn('Failed to capture screenshot:', error);
    }
  }


  // Intent Inference
  private inferIntent(actionType: ActionType, elementContext: ElementContext, value?: string): string {
    const role = elementContext.role;
    const description = elementContext.description.toLowerCase();

    switch (actionType) {
      case ActionType.TYPE:
        if (description.includes('search')) return 'search';
        if (description.includes('email')) return 'enter_email';
        if (description.includes('password')) return 'enter_password';
        if (description.includes('address') || description.includes('url')) return 'navigate';
        if (description.includes('name')) return 'enter_name';
        return 'fill_form_field';

      case ActionType.CLICK:
        if (role === 'link' || description.includes('link')) {
          return 'navigate_to_page';
        }
        if (role === 'button' || description.includes('button')) {
          if (description.includes('submit') || description.includes('save')) return 'submit_form';
          if (description.includes('login') || description.includes('sign in')) return 'authenticate';
          if (description.includes('search')) return 'search';
          if (description.includes('toggle') || description.includes('switch')) return 'toggle_setting';
          if (description.includes('menu') || description.includes('nav')) return 'open_menu';
          if (description.includes('next') || description.includes('continue')) return 'proceed';
        }
        return 'interact';

      case ActionType.NAVIGATION:
        // This is for keypress events like Enter
        if (value === 'Enter') {
          if (description.includes('search')) return 'search';
          return 'submit_form';
        }
        return 'navigate_to_page';

      case ActionType.FORM_SUBMIT:
        return 'submit_form';

      case ActionType.SELECT:
        return 'choose_option';

      case ActionType.TOGGLE:
        return 'toggle_checkbox';

      // Enhanced Form Actions
      case ActionType.SELECT_OPTION:
        return 'choose_dropdown_option';
      
      case ActionType.TOGGLE_CHECKBOX:
        return 'toggle_checkbox';
        
      case ActionType.SELECT_RADIO:
        return 'select_radio_option';
        
      case ActionType.SELECT_FILE:
        return 'upload_file';
        
      case ActionType.ADJUST_SLIDER:
        return 'adjust_value';
        
      // Clipboard Actions
      case ActionType.COPY:
        return 'copy_text';
        
      case ActionType.CUT:
        return 'cut_text';
        
      case ActionType.PASTE:
        return 'paste_text';
        
      // Context Actions
      case ActionType.CONTEXT_MENU:
        return 'open_context_menu';

      default:
        return 'interact';
    }
  }

  private inferNavigationIntent(fromContext: PageContext | null, toContext: PageContext): string {
    if (!fromContext) return 'initial_navigation';
    
    const fromDomain = new URL(fromContext.url).hostname;
    const toDomain = new URL(toContext.url).hostname;
    
    if (fromDomain !== toDomain) {
      return 'cross_domain_navigation';
    }
    
    return 'same_domain_navigation';
  }

  // Utility Methods
  private debounceAction(key: string, action: () => void, customTimeout?: number): void {
    if (this.pendingActions.has(key)) {
      clearTimeout(this.pendingActions.get(key));
    }
    
    // Use custom timeout if provided, otherwise use default ACTION_TIMEOUT
    const timeoutDuration = customTimeout || this.ACTION_TIMEOUT;
    
    const timeout = setTimeout(() => {
      action();
      this.pendingActions.delete(key);
    }, timeoutDuration);
    
    this.pendingActions.set(key, timeout);
  }

  private processPendingActions(): void {
    this.pendingActions.forEach((timeout) => {
      clearTimeout(timeout);
    });
    this.pendingActions.clear();
  }

  private shouldRecordAction(action: SemanticAction): boolean {
    const now = Date.now();
    
    // Clean up old actions from recent actions list
    this.recentActions = this.recentActions.filter(
      recentAction => now - recentAction.timestamp < this.DEDUP_WINDOW
    );
    
    // Create a hash for the action to detect duplicates
    const actionHash = this.createActionHash(action);
    
    // Check if we've seen this exact action recently
    const isDuplicate = this.recentActions.some(
      recentAction => recentAction.hash === actionHash
    );
    
    if (isDuplicate) {
      return false;
    }

    // Check if action is too soon after last significant action
    if (now - this.lastSignificantAction < this.MIN_ACTION_GAP) {
      // Allow text input and navigation actions even if close together
      if (![ActionType.TYPE, ActionType.NAVIGATION].includes(action.type)) {
        return false;
      }
    }
    
    // Filter out low-quality actions
    if (this.isLowQualityAction(action)) {
      return false;
    }
    
    // Add to recent actions
    this.recentActions.push({ hash: actionHash, timestamp: now });
    
    return true;
  }

  private createActionHash(action: SemanticAction): string {
    // Create a hash based on action type, target selector, and value
    const hashData = {
      type: action.type,
      selector: action.target.selector,
      value: action.value,
      description: action.description
    };
    return JSON.stringify(hashData);
  }

  private isLowQualityAction(action: SemanticAction): boolean {
    // Filter out actions that don't provide meaningful workflow information
    
    // Be more lenient with focus/blur events - only skip if clearly not useful
    if ([ActionType.FOCUS, ActionType.BLUR].includes(action.type)) {
      // Skip focus/blur on non-form elements only if they're not part of navigation
      const isFormElement = ['input', 'textarea', 'select', 'textbox'].includes(
        action.target.role?.toLowerCase() || ''
      );
      const isNavigationElement = ['button', 'link', 'tab', 'menuitem'].includes(
        action.target.role?.toLowerCase() || ''
      );
      return !isFormElement && !isNavigationElement;
    }
    
    // Keep scroll events - they can be important for context
    if (action.type === ActionType.SCROLL) {
      return false;
    }
    
    // Be more inclusive with clicks - only skip if clearly not interactive
    if (action.type === ActionType.CLICK) {
      // Allow clicks even if not marked as interactive, as long as they have some identifying features
      const hasIdentifier = action.target.selector && 
        (action.target.selector.includes('#') || 
         action.target.selector.includes('.') || 
         action.target.selector.includes('['));
      return !hasIdentifier && !action.target.isInteractive;
    }
    
    // Skip only completely empty text inputs
    if (action.type === ActionType.TYPE) {
      const value = action.value as string;
      return !value || value.trim().length === 0;
    }
    
    // Keep navigation actions (like Enter key presses)
    if (action.type === ActionType.NAVIGATION) {
      return false;
    }
    
    // Form submissions are always significant
    if (action.type === ActionType.FORM_SUBMIT) {
      return false; // Return false because we want to keep form submissions (not low quality)
    }
    
    const significantActions = [
      ActionType.CLICK, ActionType.TOGGLE_CHECKBOX, ActionType.SELECT_RADIO, ActionType.SELECT_FILE,
      ActionType.COPY, ActionType.CUT, ActionType.PASTE
    ];
    
    if (significantActions.includes(action.type)) {
      this.captureScreenshot('action');
      return false; // Return false because these are significant actions (not low quality)
    }

    // Dispatch custom event for real-time UI updates
    // Note: For webview actions, the event is already dispatched in handleWebviewAction
    if (!action.id.includes('webview_')) {
      window.dispatchEvent(new CustomEvent('webview-recording-action', {
        detail: {
          type: action.type,
          description: action.description,
          timestamp: action.timestamp
        }
      }));
    }
    
    // Default to considering actions as low quality unless explicitly marked as high quality above
    return true;
  }

  private generateElementDescription(element: Element): string {
    const tagName = element.tagName.toLowerCase();
    const text = element.textContent?.trim().substring(0, 50) || '';
    const id = element.id;
    const className = element.className;
    
    if (id) return `${tagName}#${id}${text ? ` (${text})` : ''}`;
    if (text && text.length > 3) return `${tagName} "${text}"`;
    if (className && typeof className === 'string') {
      const mainClass = className.split(' ')[0];
      return `${tagName}.${mainClass}`;
    }
    
    return tagName;
  }

  private determineElementRole(element: Element): string {
    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute('role');
    const type = element.getAttribute('type');
    
    if (role) return role;
    
    switch (tagName) {
      case 'button': return 'button';
      case 'a': return 'link';
      case 'input':
        switch (type) {
          case 'submit': return 'button';
          case 'button': return 'button';
          case 'checkbox': return 'checkbox';
          case 'radio': return 'radio';
          default: return 'textbox';
        }
      case 'select': return 'combobox';
      case 'textarea': return 'textbox';
      case 'form': return 'form';
      default: return 'generic';
    }
  }

  private isElementVisible(element: Element): boolean {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           rect.width > 0 && 
           rect.height > 0;
  }

  private generateRobustSelector(element: Element): string {
    // Generate a robust selector that AI can understand and use
    if (element.id) {
      return `#${element.id}`;
    }
    
    // Use data attributes if available
    const testId = element.getAttribute('data-testid') || element.getAttribute('data-test');
    if (testId) {
      return `[data-testid="${testId}"]`;
    }
    
    // Generate semantic selector
    const tagName = element.tagName.toLowerCase();
    let selector = tagName;
    
    // Add meaningful attributes
    const type = element.getAttribute('type');
    const role = element.getAttribute('role');
    const name = element.getAttribute('name');
    
    if (type) selector += `[type="${type}"]`;
    if (role) selector += `[role="${role}"]`;
    if (name) selector += `[name="${name}"]`;
    
    // Add text content for unique identification
    const text = element.textContent?.trim().substring(0, 20);
    if (text && text.length > 2 && !['input', 'select', 'textarea'].includes(tagName)) {
      selector += `:contains("${text}")`;
    }
    
    return selector;
  }

  private generateSimpleSelector(element: Element): string {
    if (element.id) return `#${element.id}`;
    
    const tagName = element.tagName.toLowerCase();
    const className = element.className;
    
    if (className && typeof className === 'string') {
      const mainClass = className.split(' ')[0];
      return `${tagName}.${mainClass}`;
    }
    
    return tagName;
  }

  private generateSimpleXPath(element: Element): string {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }
    
    const tagName = element.tagName.toLowerCase();
    const parent = element.parentElement;
    
    if (!parent) return `/${tagName}`;
    
    const siblings = Array.from(parent.children).filter(child => 
      child.tagName.toLowerCase() === tagName
    );
    
    if (siblings.length === 1) {
      return `${this.generateSimpleXPath(parent)}/${tagName}`;
    } else {
      const index = siblings.indexOf(element) + 1;
      return `${this.generateSimpleXPath(parent)}/${tagName}[${index}]`;
    }
  }

  private getElementContext(element: Element): string {
    // Get meaningful context about where this element is located
    const section = element.closest('section, article, main, nav, header, footer');
    if (section) {
      const sectionRole = section.tagName.toLowerCase();
      const sectionId = section.id;
      const sectionClass = section.className;
      
      if (sectionId) return `in ${sectionRole}#${sectionId}`;
      if (sectionClass) return `in ${sectionRole}.${sectionClass.split(' ')[0]}`;
      return `in ${sectionRole}`;
    }
    
    return 'on page';
  }

  private getPageTitle(context: PageContext): string {
    return context.title || new URL(context.url).pathname;
  }

  private maskSensitiveValue(value: string): string {
    if (!value || typeof value !== 'string') return '';
    
    // Mask passwords
    if (value.length > 0 && /^[•*]+$/.test(value)) {
      return '[PASSWORD]';
    }
    
    // Mask credit card numbers
    if (/^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/.test(value)) {
      return '[CREDIT_CARD]';
    }
    
    // Mask emails in some contexts
    if (/@/.test(value) && value.includes('.')) {
      const [local, domain] = value.split('@');
      return `${local.substring(0, 2)}***@${domain}`;
    }
    
    return value;
  }

  private calculateComplexity(): 'simple' | 'medium' | 'complex' {
    if (!this.activeSession) return 'simple';
    
    const actionCount = this.activeSession.actions.length;
    const pageCount = this.activeSession.metadata.pagesVisited.length;
    const networkCount = this.activeSession.networkInteractions.length;
    
    if (actionCount > 15 || pageCount > 3 || networkCount > 10) return 'complex';
    if (actionCount > 8 || pageCount > 1 || networkCount > 5) return 'medium';
    return 'simple';
  }

  private cleanupRecording(): void {
    this.processPendingActions();
    
    // Clear deduplication tracking
    this.recentActions = [];
    this.lastActionHash = '';
    
    this.observers.forEach(observer => {
      if (observer && typeof observer === 'object' && 'disconnect' in observer) {
        observer.disconnect();
      }
    });
    this.observers.clear();

    this.eventListeners.forEach((listener, event) => {
      document.removeEventListener(event, listener, true);
    });
    this.eventListeners.clear();
  }

  private setupPageChangeDetection(): void {
    // Detect URL changes (for SPAs)
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        this.handlePageNavigation(this.capturePageContext());
      }
    }).observe(document, { subtree: true, childList: true });
  }

  /**
   * Record a semantic action with smart filtering and deduplication
   */
  private recordAction(action: SemanticAction): void {
    if (!this.activeSession) return;
    
    // Skip if we're recording too many actions too quickly
    const now = Date.now();
    if (now - this.lastSignificantAction < this.MIN_ACTION_GAP) {
      console.log('[RecordingEngine] Skipping action due to rate limiting:', action.description);
      return;
    }
    
    // Generate a hash for deduplication
    const actionHash = this.generateActionHash(action);
    
    // Check for duplicate actions within the deduplication window
    const isDuplicate = this.recentActions.some(recent => 
      recent.hash === actionHash && 
      now - recent.timestamp < this.DEDUP_WINDOW
    );
    
    if (isDuplicate) {
      console.log('[RecordingEngine] Skipping duplicate action:', action.description);
      return;
    }
    
    // Apply semantic filtering based on action type
    if (!this.isSemanticallySigificant(action)) {
      console.log('[RecordingEngine] Skipping non-semantically significant action:', action.description);
      return;
    }
    
    // Record the action
    console.log('[RecordingEngine] Recording semantic action:', action.description);
    this.activeSession.actions.push(action);
    
    // Update tracking variables
    this.lastSignificantAction = now;
    this.lastActionHash = actionHash;
    this.recentActions.push({ hash: actionHash, timestamp: now });
    
    // Prune old actions from the recent actions list
    this.recentActions = this.recentActions.filter(recent => now - recent.timestamp < this.DEDUP_WINDOW);
    
    // Save the session
    this.saveSession(this.activeSession);
  }
  
  /**
   * Generate a hash for an action to use for deduplication
   */
  private generateActionHash(action: SemanticAction): string {
    // Create a simplified representation of the action for hashing
    const hashObj = {
      type: action.type,
      description: action.description,
      url: action.context?.url,
      target: action.target?.description
    };
    
    return JSON.stringify(hashObj);
  }
  
  /**
   * Check if an action is semantically significant
   */
  private isSemanticallySigificant(action: SemanticAction): boolean {
    // Navigation events are always significant
    if (action.type === ActionType.NAVIGATION) {
      return true;
    }
    
    // Form submissions are always significant
    if (action.type === ActionType.FORM_SUBMIT) {
      return true;
    }
    
    // Clicks on interactive elements are significant
    if (action.type === ActionType.CLICK && action.target?.isInteractive) {
      return true;
    }
    
    // Text inputs with meaningful content are significant
    if (action.type === ActionType.TYPE && action.value && typeof action.value === 'string' && action.value.length > 2) {
      return true;
    }
    
    // Special key presses are significant
    if (action.type === ActionType.KEYPRESS && action.value && typeof action.value === 'string' && 
        ['Enter', 'Escape', 'Tab'].includes(action.value)) {
      return true;
    }
    
    // Dynamic content changes might be significant
    if (action.type === ActionType.DYNAMIC_CONTENT) {
      // Only record significant content changes
      return action.description.includes('loaded') || action.description.includes('updated');
    }
    
    // By default, consider actions not significant unless explicitly allowed above
    return false;
  }
  
  private saveSession(session: SmartRecordingSession): void {
    const key = `smart_recording_${session.id}`;
    localStorage.setItem(key, JSON.stringify(session));
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Export to AI-friendly format
  exportForAI(sessionId: string): any {
    const session = this.getSession(sessionId);
    if (!session) return null;

    return {
      task: session.taskGoal,
      description: session.description,
      success: session.metadata.success,
      complexity: session.metadata.complexity,
      duration: session.metadata.duration,
      
      // High-level action sequence
      steps: session.actions.map((action: SemanticAction, index: number) => ({
        step: index + 1,
        action: action.type,
        description: action.description,
        target: action.target.description,
        value: action.value,
        intent: action.intent,
        timestamp: action.timestamp
      })),
      
      // Context information
      environment: {
        initialUrl: session.initialContext.url,
        pagesVisited: session.metadata.pagesVisited,
        userAgent: session.initialContext.userAgent,
        viewport: session.initialContext.viewport
      },
      
      // Key screenshots for visual context
      screenshots: session.screenshots.filter((s: ScreenshotCapture) => 
        ['initial', 'final_state', 'page_navigation'].includes(s.type)
      ),
      
      // Significant network interactions
      networkActivity: session.networkInteractions.filter((ni: NetworkInteraction) => 
        ni.status && ni.status < 400 // Only successful requests
      )
    };
  }

  public getSession(sessionId: string): SmartRecordingSession | null {
    const key = `smart_recording_${sessionId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  }

  public getAllSessions(): SmartRecordingSession[] {
    const sessions: SmartRecordingSession[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('smart_recording_')) {
        const data = localStorage.getItem(key);
        if (data) {
          sessions.push(JSON.parse(data));
        }
      }
    }
    return sessions;
  }

  // Public API
  getActiveSession(): SmartRecordingSession | null {
    return this.activeSession;
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  private mapEventTypeToActionType(eventType: string): ActionType {
    switch (eventType) {
      case 'click': return ActionType.CLICK;
      case 'input': return ActionType.TYPE;
      case 'type': return ActionType.TYPE; // Handle aggregated text input from webview
      case 'keypress': return ActionType.NAVIGATION; // Map keypress (like Enter) to navigation
      case 'change': return ActionType.SELECT;
      case 'submit': return ActionType.FORM_SUBMIT;
      case 'focus': return ActionType.FOCUS;
      case 'blur': return ActionType.BLUR;
      case 'scroll': return ActionType.SCROLL;
      case 'navigation': return ActionType.NAVIGATION;
      
      // Enhanced loading and dynamic content actions
      case 'page_load_complete': return ActionType.PAGE_LOAD;
      case 'search_results_loaded': return ActionType.SEARCH_RESULTS;
      case 'dynamic_content_loaded': return ActionType.DYNAMIC_CONTENT;
      
      // Enhanced Form Actions
      case 'select_option': return ActionType.SELECT_OPTION;
      case 'toggle_checkbox': return ActionType.TOGGLE_CHECKBOX;
      case 'select_radio': return ActionType.SELECT_RADIO;
      case 'select_file': return ActionType.SELECT_FILE;
      case 'adjust_slider': return ActionType.ADJUST_SLIDER;
      case 'form_submit': return ActionType.FORM_SUBMIT;
      
      // Clipboard Actions
      case 'copy': return ActionType.COPY;
      case 'cut': return ActionType.CUT;
      case 'paste': return ActionType.PASTE;
      
      // Context Actions
      case 'context_menu': return ActionType.CONTEXT_MENU;
      
      default: return ActionType.CLICK;
    }
  }

}

