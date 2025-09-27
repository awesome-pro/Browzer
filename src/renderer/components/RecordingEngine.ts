import {
  SmartRecordingSession,
  SemanticAction,
  PageContext,
  TaskGoal,
  ActionType,
  ElementContext,
} from '../types/recording';

export class SmartRecordingEngine {
  private static instance: SmartRecordingEngine;
  private activeSession: SmartRecordingSession | null = null;
  private isRecording = false;
  private pendingActions: Map<string, any> = new Map();
  private lastPageContext: PageContext | null = null;
  private currentTaskGoal: TaskGoal | null = null;
  
  private lastSignificantAction = 0;
  private readonly ACTION_TIMEOUT = 1000; // 1s to aggregate actions
  private readonly TYPING_TIMEOUT = 2800; // 2.5s to aggregate typing actions
  private readonly MIN_ACTION_GAP = 200; // Minimum gap between recorded actions
  private inputBuffer: Map<string, {value: string, element: any, lastUpdate: number}> = new Map();
  private navigationBuffer: {url: string, timestamp: number} | null = null;
  private clickSequence: Array<{target: any, timestamp: number}> = [];
  private readonly SEMANTIC_AGGREGATION_DELAY = 800; // Delay for aggregating semantic actions
  private lastActionHash = '';
  private recentActions: Array<{hash: string, timestamp: number}> = [];
  private readonly DEDUP_WINDOW = 2000; // 2 second window for deduplication
  private observers: Map<string, any> = new Map();
  private eventListeners: Map<string, EventListener> = new Map();
  private recentFocusEvents: Map<string, {timestamp: number, elementContext: any}> = new Map();
  private readonly FOCUS_CLICK_CONSOLIDATION_WINDOW = 1500; // 1.5 seconds to consolidate focus+click

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
    let processedValue = actionData.value;
    if (typeof processedValue === 'object' && processedValue !== null) {
      if (processedValue.toString && processedValue.toString() !== '[object Object]') {
        processedValue = processedValue.toString();
      } else {
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
    if (this.shouldRecordAction(action)) {
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

private handleNativeEvent(eventData: any): void {
  if (!this.isRecording || !this.activeSession) {
    return;
  }
  
  if (!eventData) return;
  
  try {
    switch (eventData.type) {
      case 'in_page_navigation':
      case 'history_push_state':
      case 'history_replace_state':
      case 'spa_navigation':
      case 'turbo_navigation':
      case 'github_navigation':
        this.handleNativeNavigationEvent(eventData);
        break;
      case 'click':
      case 'mousedown':
      case 'mouseup':
        this.handleNativeClickEvent(eventData);
        break;
        
      case 'focus':
      case 'focusin':
        this.handleNativeFocusEvent(eventData);
        break;
        
      case 'input':
      case 'change':
      case 'select':
      case 'reset':
      case 'invalid':
        this.handleInputEvent(eventData);
        break;
        
      case 'keydown':
      case 'keyup':
      case 'keypress':
        this.handleNativeKeyEvent(eventData);
        break;
        
      case 'submit':
      case 'form_submit':
        this.handleNativeFormSubmitEvent(eventData);
        break;
      case 'mouseover':
      case 'mouseenter':
        this.handleHoverEvent(eventData);
        break;  
      case 'react_event':
      case 'react_synthetic_event':
        this.handleReactEvent(eventData);
        break;
      case 'scroll':
        this.handleScrollEvent(eventData);
        break;
      case 'dragstart':
        console.log('Drag start:', eventData);
        break;
      case 'dragend':
        console.log('Drag end:', eventData);
        break;
      case 'drop':
        this.handleDropEvent(eventData);
        break;
      case 'modal_open':
      case 'dialog_open':
        console.log('Modal open:', eventData);
        break;
      case 'modal_close':
      case 'dialog_close':
      case 'cancel':
      case 'close':
        console.log('Modal close:', eventData);
        break;
      case 'dom_change':
      case 'dynamic_content_change':
      case 'dom_significant_change':
        console.log('DOM change:', eventData);
        break;
      case 'animation_start':
      case 'animation_end':
      case 'transition_end':
        this.handleAnimationEvent(eventData);
        break;
      case 'play':
        console.log('Media play:', eventData);
        break;
      case 'pause':
        console.log('Media pause:', eventData);
        break;
      case 'ended':
        console.log('Media ended:', eventData);
        break;
      case 'touch_start':
      case 'touch_end':
      case 'touch_move':
        console.log('Touch event:', eventData);
        break;
      case 'copy':
      case 'cut':
      case 'paste':
        this.handleClipboardEvent(eventData);
        break;
      case 'async_request_start':
        console.log('Async request start:', eventData);
        break;
      case 'async_request_complete':
        console.log('Async request complete:', eventData);
        break;
      case 'async_request_error':
        console.log('Async request error:', eventData);
        break;
      default:
        this.recordNativeAction(eventData);
    }
  } catch (error) {
    console.error('[RecordingEngine] Error handling native event:', error);
  }
}

/**
 * Handle native focus events and track them for consolidation
 */
private handleNativeFocusEvent(eventData: any): void {
  if (!eventData.target) return;
  const elementContext = this.convertNativeElementToElementContext(eventData.target);
  const elementKey = this.generateElementKey(elementContext);
  this.recentFocusEvents.set(elementKey, {
    timestamp: Date.now(),
    elementContext: elementContext
  });
  const isFormElement = ['input', 'textarea', 'select'].includes(eventData.target.tagName?.toLowerCase()) ||
                       elementContext.role?.includes('textbox') || 
                       elementContext.role?.includes('combobox');
                       
  if (isFormElement) {
    const action: SemanticAction = {
      id: this.generateId(),
      type: ActionType.FOCUS,
      timestamp: Date.now(),
      description: `Focus on ${elementContext.description}`,
      target: elementContext,
      context: this.capturePageContext(),
      intent: 'interact'
    };
    this.recordAction(action);
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

  if (this.navigationBuffer && 
      (this.navigationBuffer.url === eventData.url || 
       Date.now() - this.navigationBuffer.timestamp < 500)) {
    return;
  }
  
  this.navigationBuffer = {
    url: eventData.url,
    timestamp: Date.now()
  };
  setTimeout(() => {
    this.processNavigationBuffer(eventData);
  }, 500); // Short delay to aggregate rapid navigations
}

/**
 * Process the navigation buffer to create semantic actions
 */
private processNavigationBuffer(eventData: any): void {
  if (!this.navigationBuffer || this.navigationBuffer.url !== eventData.url) {
    return;
  }
  const pageContext = {
    url: eventData.url,
    title: eventData.title || 'Unknown Page',
    timestamp: eventData.timestamp || Date.now(),
    viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
    userAgent: navigator.userAgent,
    keyElements: []
  };
  this.lastPageContext = pageContext;
  let domain = '';
  try {
    const urlObj = new URL(eventData.url);
    domain = urlObj.hostname.replace('www.', '');
  } catch (e) {
    domain = 'website';
  }
  let isFromSearchEngine = false;
  let searchEngineDomain = '';
  let fromDomain = '';
  let navigationDescription = '';
  if (this.lastPageContext && this.lastPageContext.url) {
    try {
      const previousUrl = new URL(this.lastPageContext.url);
      fromDomain = previousUrl.hostname;
      if (fromDomain.includes('google.') || 
          fromDomain.includes('bing.') || 
          fromDomain.includes('yahoo.') || 
          fromDomain.includes('duckduckgo.') || 
          fromDomain.includes('baidu.')) {
        isFromSearchEngine = true;
        searchEngineDomain = fromDomain.replace('www.', '');
      }
    } catch (e) {
    }
  }
  if (isFromSearchEngine) {
    navigationDescription = `Navigate from ${searchEngineDomain} search results to ${domain}`;
  } else if (fromDomain && fromDomain !== domain) {
    navigationDescription = `Navigate from ${fromDomain.replace('www.', '')} to ${domain}`;
  } else {
    navigationDescription = `Navigate to ${eventData.title || domain}`;
  }
  const cleanUrl = this.cleanGoogleUrl(eventData.url);
  const displayUrl = cleanUrl.length > 60 ? cleanUrl.substring(0, 57) + '...' : cleanUrl;
  const action: SemanticAction = {
    id: this.generateId(),
    type: ActionType.NAVIGATION,
    timestamp: eventData.timestamp || Date.now(),
    description: navigationDescription,
    target: {
      description: `navigation ("${eventData.title || domain}") in ${isFromSearchEngine ? 'search-result' : 'browser'}`,
      selector: '',
      xpath: '',
      role: 'page',
      isVisible: true,
      isInteractive: false,
      context: 'navigation'
    },
    value: JSON.stringify({
      url: displayUrl,
      title: eventData.title || '',
      fromDomain: fromDomain || '',
      toDomain: domain,
      navigationType: isFromSearchEngine ? 'search_result' : 'direct_navigation'
    }),
    context: pageContext,
    intent: 'navigate_to_page'
  };
  
  this.recordAction(action);
  window.dispatchEvent(new CustomEvent('webview-recording-action', {
    detail: {
      type: ActionType.NAVIGATION,
      description: action.description,
      timestamp: action.timestamp
    }
  }));
  if (this.activeSession && !this.activeSession.metadata.pagesVisited.includes(eventData.url)) {
    this.activeSession.metadata.pagesVisited.push(eventData.url);
  }
  this.navigationBuffer = null;
}

  private handleNativeClickEvent(eventData: any): void {
    if (!eventData.target) return;
    if (eventData.type !== 'click') return; // Only process actual clicks, not mousedown/mouseup
    const now = Date.now();
    for (const [key, focusEvent] of this.recentFocusEvents.entries()) {
      if (now - focusEvent.timestamp > this.FOCUS_CLICK_CONSOLIDATION_WINDOW) {
        this.recentFocusEvents.delete(key);
      }
    }
  
  const target = eventData.target;
  const isInteractiveElement = this.isInteractiveElement(target);
  if (!isInteractiveElement && 
      this.clickSequence.length > 0 && 
      Date.now() - this.clickSequence[this.clickSequence.length - 1].timestamp < 500) {
    return;
  }
  this.clickSequence.push({
    target: target,
    timestamp: Date.now()
  });
  setTimeout(() => {
    this.processClickSequence(eventData.url, eventData.title);
  }, this.SEMANTIC_AGGREGATION_DELAY);
}

/**
 * Process the click sequence to create semantic actions
 */
private processClickSequence(url: string, pageTitle: string): void {
  if (this.clickSequence.length === 0) return;
  const lastClick = this.clickSequence[this.clickSequence.length - 1];
  if (Date.now() - lastClick.timestamp < this.SEMANTIC_AGGREGATION_DELAY - 50) {
    return;
  }
  const target = this.findMostSignificantClick();
  const elementContext = this.convertNativeElementToElementContext(target);
  const elementKey = this.generateElementKey(elementContext);
  const recentFocus = this.recentFocusEvents.get(elementKey);
  const isFormElement = ['input', 'textarea', 'select'].includes(target.tagName?.toLowerCase()) ||
                       elementContext.role?.includes('textbox') || 
                       elementContext.role?.includes('combobox');
  const action: SemanticAction = {
    id: this.generateId(),
    type: ActionType.CLICK,
    timestamp: Date.now(),
    description: recentFocus && !isFormElement ? 
      `Click ${elementContext.description || target.tagName}` : 
      `Click ${elementContext.description || target.tagName}`,
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
  if (recentFocus) {
    this.recentFocusEvents.delete(elementKey);
  }
  this.recordAction(action);
  window.dispatchEvent(new CustomEvent('webview-recording-action', {
    detail: {
      type: ActionType.CLICK,
      description: action.description,
      timestamp: action.timestamp
    }
  }));
  this.clickSequence = [];
}

/**
 * Find the most significant click in the sequence
 */
private findMostSignificantClick(): any {
  if (this.clickSequence.length === 1) {
    return this.clickSequence[0].target;
  }
  for (const click of this.clickSequence) {
    if (this.isInteractiveElement(click.target)) {
      return click.target;
    }
  }
  return this.clickSequence[this.clickSequence.length - 1].target;
}

/**
 * Check if an element is interactive
 */
private isInteractiveElement(element: any): boolean {
  if (!element || !element.tagName) return false;
  
  const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'];
  const tagName = element.tagName.toUpperCase();
  if (interactiveTags.includes(tagName)) {
    return true;
  }
  const interactiveRoles = ['button', 'link', 'checkbox', 'menuitem', 'tab', 'radio'];
  const role = element.attributes?.role;
  if (role && interactiveRoles.includes(role)) {
    return true;
  }
  if (element.attributes) {
    const attrs = Object.keys(element.attributes);
    if (attrs.some(attr => attr.startsWith('on'))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Process the input buffer to create semantic actions
 */
private processInputBuffer(inputIdentifier: string, url: string, pageTitle: string): void {
  const inputData = this.inputBuffer.get(inputIdentifier);
  if (!inputData) return;
  const timeSinceLastUpdate = Date.now() - inputData.lastUpdate;
  if (timeSinceLastUpdate < this.SEMANTIC_AGGREGATION_DELAY - 50) {
    return;
  }
  const { value, element } = inputData;
  if (!value || value.length < 2) {
    this.inputBuffer.delete(inputIdentifier);
    return;
  }
  const elementContext = this.convertNativeElementToElementContext(element);
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
  this.recordAction(action);
  this.inputBuffer.delete(inputIdentifier);
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
  const inputIdentifier = `${eventData.url}_${elementId}`;
  this.inputBuffer.set(inputIdentifier, {
    value: eventData.value,
    element: target,
    lastUpdate: Date.now()
  });
  setTimeout(() => {
    this.processInputBuffer(inputIdentifier, eventData.url, eventData.title);
  }, this.SEMANTIC_AGGREGATION_DELAY);
}

/**
 * Handle key events with semantic aggregation
 */
private handleNativeKeyEvent(eventData: any): void {
  if (!eventData.target || !eventData.key) return;
  if (eventData.type !== 'keydown') return;
  const specialKeys = ['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  if (!specialKeys.includes(eventData.key)) return;
  if (eventData.key === 'Enter' && this.isFormElement(eventData.target)) {
    return;
  }
  
  const target = eventData.target;
  const elementContext = this.convertNativeElementToElementContext(target);
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
  let formDescription = 'form';
  if (target.id) {
    formDescription = `form #${target.id}`;
  } else if (target.name) {
    formDescription = `form ${target.name}`;
  } else {
    const inputTypes = this.getFormInputTypes(target);
    
    if (inputTypes.includes('search')) {
      formDescription = 'search form';
    } else if (inputTypes.includes('password')) {
      formDescription = 'login form';
    } else if (inputTypes.includes('email') && !inputTypes.includes('password')) {
      formDescription = 'signup or contact form';
    }
  }
  const action: SemanticAction = {
    id: this.generateId(),
    type: ActionType.SUBMIT,
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
    intent: this.inferIntent(ActionType.SUBMIT, elementContext)
  };
  
  this.recordAction(action);
  window.dispatchEvent(new CustomEvent('webview-recording-action', {
    detail: {
      type: ActionType.SUBMIT,
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
  if (formElement.tagName && formElement.tagName.toUpperCase() === 'FORM') {
    if (formElement.attributes) {
      const inputTypes: string[] = [];
      
      if (formElement.attributes['data-purpose'] === 'search-form') {
        inputTypes.push('search');
      }
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

private handleReactEvent(eventData: any): void {
  if (!eventData.target) return;
  
  const target = eventData.target;
  const elementContext = this.convertNativeElementToElementContext(target);
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

private handleHoverEvent(eventData: any): void {
  if (!eventData.target) return;
  const target = eventData.target;
  const isInteractive = this.isInteractiveElement(target);
  if (!isInteractive) return;
  
  const elementContext = this.convertNativeElementToElementContext(target);
  
  const action: SemanticAction = {
    id: this.generateId(),
    type: ActionType.HOVER,
    timestamp: eventData.timestamp || Date.now(),
    description: `Hover over ${elementContext.description || target.tagName}`,
    target: elementContext,
    coordinates: eventData.coordinates,
    context: {
      url: eventData.url,
      title: eventData.title || 'Unknown Page',
      timestamp: eventData.timestamp || Date.now(),
      viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
      userAgent: navigator.userAgent,
      keyElements: []
    },
    intent: 'hover'
  };
  if (this.shouldRecordAction(action)) {
    this.recordAction(action);
  }
}

private handleScrollEvent(eventData: any): void {
  if (!eventData.scrollPosition) return;
  
  const action: SemanticAction = {
    id: this.generateId(),
    type: ActionType.SCROLL,
    timestamp: eventData.timestamp || Date.now(),
    description: `Scroll to position ${eventData.scrollPercentage || 0}% of page`,
    target: {
      description: 'page scroll',
      selector: 'window',
      xpath: '',
      role: 'scrollable',
      isVisible: true,
      isInteractive: true,
      context: 'scroll'
    },
    value: eventData.scrollPosition,
    context: {
      url: eventData.url,
      title: eventData.title || 'Unknown Page',
      timestamp: eventData.timestamp || Date.now(),
      viewport: { 
        width: eventData.viewportWidth || window.innerWidth, 
        height: eventData.viewportHeight || window.innerHeight, 
        scrollX: eventData.scrollPosition.x, 
        scrollY: eventData.scrollPosition.y 
      },
      userAgent: navigator.userAgent,
      keyElements: []
    },
    intent: 'view_content'
  };
  
  this.recordAction(action);
}


private handleDropEvent(eventData: any): void {
  if (!eventData.target) return;
  
  const target = eventData.target;
  const elementContext = this.convertNativeElementToElementContext(target);
  
  const action: SemanticAction = {
    id: this.generateId(),
    type: ActionType.DROP,
    timestamp: eventData.timestamp || Date.now(),
    description: `Dropped onto ${elementContext.description || target.tagName}`,
    target: elementContext,
    coordinates: eventData.coordinates,
    value: eventData.dataTransfer ? JSON.stringify(eventData.dataTransfer) : undefined,
    context: {
      url: eventData.url,
      title: eventData.title || 'Unknown Page',
      timestamp: eventData.timestamp || Date.now(),
      viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
      userAgent: navigator.userAgent,
      keyElements: []
    },
    intent: 'drop_item'
  };
  
  this.recordAction(action);
}

private handleAnimationEvent(eventData: any): void {
  if (!eventData.target) return;
  
  const target = eventData.target;
  const elementContext = this.convertNativeElementToElementContext(target);
  
  const action: SemanticAction = {
    id: this.generateId(),
    type: ActionType.DYNAMIC_CONTENT,
    timestamp: eventData.timestamp || Date.now(),
    description: `Animation ${eventData.type === 'animationend' ? 'completed' : 'started'} on ${elementContext.description || target.tagName}`,
    target: elementContext,
    context: {
      url: eventData.url,
      title: eventData.title || 'Unknown Page',
      timestamp: eventData.timestamp || Date.now(),
      viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
      userAgent: navigator.userAgent,
      keyElements: []
    },
    intent: 'view_animation'
  };
  if (this.shouldRecordAction(action)) {
    this.recordAction(action);
  }
}

private handleClipboardEvent(eventData: any): void {
  if (!eventData.target) return;
  
  const target = eventData.target;
  const elementContext = this.convertNativeElementToElementContext(target);
  
  let actionType: ActionType;
  let description: string;
  let intent: string;
  
  switch (eventData.type) {
    case 'copy':
      actionType = ActionType.COPY;
      description = `Copied text from ${elementContext.description || target.tagName}`;
      intent = 'copy_text';
      break;
    case 'cut':
      actionType = ActionType.CUT;
      description = `Cut text from ${elementContext.description || target.tagName}`;
      intent = 'cut_text';
      break;
    case 'paste':
      actionType = ActionType.PASTE;
      description = `Pasted text into ${elementContext.description || target.tagName}`;
      intent = 'paste_text';
      break;
    default:
      actionType = ActionType.COPY;
      description = `Clipboard operation on ${elementContext.description || target.tagName}`;
      intent = 'clipboard_operation';
  }
  
  const action: SemanticAction = {
    id: this.generateId(),
    type: actionType,
    timestamp: eventData.timestamp || Date.now(),
    description,
    target: elementContext,
    context: {
      url: eventData.url,
      title: eventData.title || 'Unknown Page',
      timestamp: eventData.timestamp || Date.now(),
      viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
      userAgent: navigator.userAgent,
      keyElements: []
    },
    intent
  };
  
  this.recordAction(action);
}

private recordNativeAction(eventData: any): void {
  if (!eventData.target) return;
  
  const target = eventData.target;
  const elementContext = this.convertNativeElementToElementContext(target);
  
  const action: SemanticAction = {
    id: this.generateId(),
    type: ActionType.UNKNOWN,
    timestamp: eventData.timestamp,
    description: `${eventData.type} on ${elementContext.description || target.tagName}`,
    target: elementContext,
    value: eventData.value,
    coordinates: eventData.coordinates,
    context: {
      url: eventData.url,
      title: eventData.title || 'Unknown Page',
      timestamp: eventData.timestamp || Date.now(),
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
    elementType: webviewElement.elementType,
    purpose: webviewElement.purpose,
    href: webviewElement.href,
    text: webviewElement.text,
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
    const bestSelector = this.getBestSelector(uniqueIdentifiers, text, elementType);
    if (bestSelector) {
      description += ` {${bestSelector}}`;
    }
    
    if (interactionContext && interactionContext !== 'page') {
      description += ` in ${interactionContext}`;
    }
    
    return description;
  }
  let description = elementType;
  if (text) description += ` ("${text.substring(0, 60)}")`;
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
  return uniqueIdentifiers[0] || '';
}

private cleanGoogleUrl(url: string): string {
  if (!url) {
    return url;
  }
  
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('google.com') && urlObj.pathname === '/url') {
      const destinationUrl = urlObj.searchParams.get('url') || urlObj.searchParams.get('q');
      if (destinationUrl) {
        try {
          new URL(destinationUrl);
          return destinationUrl;
        } catch (e) {
        }
      }
    }
    if (url.includes('google.com')) {
      const essentialParams = ['q', 'tbm', 'safe', 'lr', 'hl'];
      const cleanParams = new URLSearchParams();
      
      for (const param of essentialParams) {
        const value = urlObj.searchParams.get(param);
        if (value) {
          cleanParams.set(param, value);
        }
      }
      
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}${cleanParams.toString() ? '?' + cleanParams.toString() : ''}`;
    }
    
    return url;
  } catch (e) {
    console.warn('[RecordingEngine] Failed to clean Google URL:', e);
    return url;
  }
}

private cleanGoogleUrlInDescription(description: string): string {
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
  if (type === 'page_load_complete') {
    if (typeof value === 'string') {
      return this.cleanGoogleUrlInDescription(value);
    }
    return `Page loaded - "${element.text}"`;
  }
  
  if (type === 'search_results_loaded') {
    return typeof value === 'string' ? value : `Search results loaded`;
  }
  
  if (type === 'dynamic_content_loaded') {
    if (typeof value === 'string') {
      return value;
    }
    const pageTitle = element.text || '';
    const context = element.context || 'page';
    
    if (pageTitle && pageTitle.length > 0) {
      return `${pageTitle} on ${context}`;
    }
    
    return `Content loaded on ${context}`;
  }
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
      return `Enter "${value}" in ${elementType}`;
      
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
        
        if (navType === 'google_search_result') {
          try {
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
  if (commandType === 'start') {
    window.dispatchEvent(new CustomEvent('recording:start', {
      detail: { sessionId: this.activeSession?.id }
    }));
  } else {
    window.dispatchEvent(new CustomEvent('recording:stop'));
  }
}
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
    this.notifyWebviewsRecordingState('start');
    return session;
  }

  stopRecording(): SmartRecordingSession | null {
    if (!this.isRecording || !this.activeSession) {
      throw new Error('No active recording session');
    }
    this.processPendingActions();
    
    this.activeSession.endTime = Date.now();
    this.activeSession.isActive = false;
    this.activeSession.metadata.duration = this.activeSession.endTime - this.activeSession.startTime;
    this.activeSession.metadata.totalActions = this.activeSession.actions.length;
    this.notifyWebviewsRecordingState('stop');
    this.cleanupRecording();
    
    const session = this.activeSession;
    this.activeSession = null;
    this.isRecording = false;

    this.saveSession(session);
    return session;
  }
  private initializeRecording(): void {
    this.setupSmartEventListeners();
    this.setupNetworkMonitoring();
    this.setupPageChangeDetection();
  }

  private setupSmartEventListeners(): void {
    const meaningfulEvents = [  
      'click', 'submit', 'change', 'input', 'keydown'
    ];

    meaningfulEvents.forEach(eventType => {
      const listener = (event: Event) => this.handleSmartEvent(event);
      document.addEventListener(eventType, listener, true);
      this.eventListeners.set(eventType, listener);
    });
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
  private handleTextInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (!target || !this.isInteractiveElement(target)) return;

    const elementContext = this.captureElementContext(target);
    if (event.type === 'keydown') {
      const keyEvent = event as KeyboardEvent;
      if (keyEvent.key === 'Enter') {
        this.finalizeTextInput(elementContext, target.value);
        return;
      }
      return;
    }
    const targetKey = `type_${elementContext.selector}`;
    this.debounceAction(targetKey, () => {
      this.finalizeTextInput(elementContext, target.value);
    }, this.TYPING_TIMEOUT); // Use longer timeout for typing events
  }

  private finalizeTextInput(elementContext: ElementContext, finalValue: string): void {
    if (!finalValue?.trim() || finalValue.length < 2) return;
    const lastInput = this.recentActions.find(a => 
      a.hash.includes(elementContext.selector) && 
      a.hash.includes('TYPE')
    );
    if (lastInput) {
      const lastInputValue = JSON.parse(lastInput.hash).value || '';
      if (finalValue.startsWith(lastInputValue) && 
          finalValue.length - lastInputValue.length < 3) {
        return;
      }
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
      type: ActionType.SUBMIT,
      timestamp: Date.now(),
      description: `Submit form with ${Object.keys(formFields).length} fields`,
      target: this.captureElementContext(form),
      value: formFields,
      context: this.capturePageContext(),
      intent: this.inferIntent(ActionType.SUBMIT, this.captureElementContext(form))
    };
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
    if (this.shouldRecordAction(action)) {
      this.recordAction(action);
    }
  }

  private handlePageFocus(): void {
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

  private recordNetworkInteraction(interaction: any): void {
    if (!this.activeSession) return;

    console.log('Recording network interaction:', interaction);
  }
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
      keyElements: this.captureKeyPageElements()
    };
  }

  private captureKeyPageElements(): Array<{ role: string; text: string; selector: string }> {
    const keyElements: Array<{ role: string; text: string; selector: string }> = [];
    document.querySelectorAll('h1, h2').forEach((el, index) => {
      if (index < 3) { // Limit to first 3 headings
        keyElements.push({
          role: 'heading',
          text: el.textContent?.trim().substring(0, 100) || '',
          selector: this.generateSimpleSelector(el)
        });
      }
    });
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
  private async captureScreenshot(type: 'initial' | 'action' | 'page_navigation' | 'final_state' | 'error' = 'action'): Promise<void> {
    if (!this.activeSession) return;

    console.log('Capturing screenshot of type:', type);
  }
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
        if (value === 'Enter') {
          if (description.includes('search')) return 'search';
          return 'submit_form';
        }
        return 'navigate_to_page';

      case ActionType.SUBMIT:
        return 'submit_form';

      case ActionType.SELECT:
        return 'choose_option';

      case ActionType.TOGGLE:
        return 'toggle_checkbox';
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
      case ActionType.COPY:
        return 'copy_text';
        
      case ActionType.CUT:
        return 'cut_text';
        
      case ActionType.PASTE:
        return 'paste_text';
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
  private debounceAction(key: string, action: () => void, customTimeout?: number): void {
    if (this.pendingActions.has(key)) {
      clearTimeout(this.pendingActions.get(key));
    }
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
    this.recentActions = this.recentActions.filter(
      recentAction => now - recentAction.timestamp < this.DEDUP_WINDOW
    );
    const actionHash = this.generateActionHash(action);
    const isDuplicate = this.recentActions.some(
      recentAction => recentAction.hash === actionHash
    );
    
    if (isDuplicate) {
      return false;
    }
    if (now - this.lastSignificantAction < this.MIN_ACTION_GAP) {
      if (![ActionType.TYPE, ActionType.NAVIGATION].includes(action.type)) {
        return false;
      }
    }
    if (this.isLowQualityAction(action)) {
      return false;
    }
    this.recentActions.push({ hash: actionHash, timestamp: now });
    
    return true;
  }

  /**
   * Generate a unique key for an element to match focus and click events
   */
  private generateElementKey(elementContext: any): string {
    const keyParts = [];
    
    if (elementContext.selector) keyParts.push(elementContext.selector);
    if (elementContext.xpath) keyParts.push(elementContext.xpath);
    if (elementContext.description) keyParts.push(elementContext.description);
    
    return keyParts.join('|');
  }
  
  private isLowQualityAction(action: SemanticAction): boolean {
    if ([ActionType.FOCUS, ActionType.BLUR].includes(action.type)) {
      const isFormElement = ['input', 'textarea', 'select', 'textbox'].includes(
        action.target.role?.toLowerCase() || ''
      );
      const isNavigationElement = ['button', 'link', 'tab', 'menuitem'].includes(
        action.target.role?.toLowerCase() || ''
      );
      return !isFormElement && !isNavigationElement;
    }
    if (action.type === ActionType.SCROLL) {
      return false;
    }
    if (action.type === ActionType.CLICK) {
      const hasIdentifier = action.target.selector && 
        (action.target.selector.includes('#') || 
         action.target.selector.includes('.') || 
         action.target.selector.includes('['));
      return !hasIdentifier && !action.target.isInteractive;
    }
    if (action.type === ActionType.TYPE) {
      const value = action.value as string;
      return !value || value.trim().length === 0;
    }
    if (action.type === ActionType.NAVIGATION) {
      return false;
    }
    if (action.type === ActionType.SUBMIT) {
      return false; // Return false because we want to keep form submissions (not low quality)
    }
    if (!action.id.includes('webview_')) {
      window.dispatchEvent(new CustomEvent('webview-recording-action', {
        detail: {
          type: action.type,
          description: action.description,
          timestamp: action.timestamp
        }
      }));
    }
    return true;
  }

  private generateElementDescription(element: Element): string {
    const tagName = element.tagName.toLowerCase();
    const text = element.textContent?.trim().substring(0, 50) || '';
    const id = element.id;
    const className = element.className;
    const role = element.getAttribute('role');
    const type = element.getAttribute('type');
    const name = element.getAttribute('name');
    const href = element.getAttribute('href');
    let description = '';
    if (tagName === 'a') {
      description = 'link';
    } else if (tagName === 'button' || type === 'button' || role === 'button') {
      description = 'button';
    } else if (tagName === 'input') {
      if (type === 'text') description = 'text input';
      else if (type === 'password') description = 'password input';
      else if (type === 'email') description = 'email input';
      else if (type === 'checkbox') description = 'checkbox';
      else if (type === 'radio') description = 'radio button';
      else if (type === 'submit') description = 'submit button';
      else description = `${type || ''} input`;
    } else if (tagName === 'textarea') {
      description = 'textarea';
    } else if (tagName === 'select') {
      description = 'dropdown';
    } else if (role) {
      description = role;
    } else {
      description = tagName;
    }
    if (id) {
      description += ` #${id}`;
    } else if (name) {
      description += ` [name="${name}"]`;
    } else if (className && typeof className === 'string' && className.trim()) {
      const classes = className.split(' ').filter(c => c.trim());
      if (classes.length > 0) {
        const semanticClass = classes.find(c => c.length > 2 && !/^[a-z][A-Z0-9]/.test(c));
        if (semanticClass) {
          description += ` .${semanticClass}`;
        }
      }
    }
    if (text && text.length > 0) {
      description += ` "${text}"`;
    }
    if (tagName === 'a' && href && !href.startsWith('javascript:')) {
      try {
        const url = new URL(href, window.location.href);
        if (url.hostname !== window.location.hostname) {
          description += ` to ${url.hostname.replace('www.', '')}`;
        }
      } catch (e) {
      }
    }
    
    return description;
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
    if (element.id) {
      return `#${element.id}`;
    }
    const testId = element.getAttribute('data-testid') || element.getAttribute('data-test');
    if (testId) {
      return `[data-testid="${testId}"]`;
    }
    const tagName = element.tagName.toLowerCase();
    let selector = tagName;
    const type = element.getAttribute('type');
    const role = element.getAttribute('role');
    const name = element.getAttribute('name');
    
    if (type) selector += `[type="${type}"]`;
    if (role) selector += `[role="${role}"]`;
    if (name) selector += `[name="${name}"]`;
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
    if (value.length > 0 && /^[•*]+$/.test(value)) {
      return '[PASSWORD]';
    }
    if (/^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/.test(value)) {
      return '[CREDIT_CARD]';
    }
    if (/@/.test(value) && value.includes('.')) {
      const [local, domain] = value.split('@');
      return `${local.substring(0, 2)}***@${domain}`;
    }
    
    return value;
  }


  private cleanupRecording(): void {
    this.processPendingActions();
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
    const now = Date.now();
    if (now - this.lastSignificantAction < this.MIN_ACTION_GAP) return;
    const actionHash = this.generateActionHash(action);
    const isDuplicate = this.recentActions.some(recent => 
      recent.hash === actionHash && 
      now - recent.timestamp < this.DEDUP_WINDOW
    );
    
    if (isDuplicate) return;
    if (!this.isSemanticallySigificant(action)) return;
    this.activeSession.actions.push(action);
    this.lastSignificantAction = now;
    this.lastActionHash = actionHash;
    this.recentActions.push({ hash: actionHash, timestamp: now });
    this.recentActions = this.recentActions.filter(recent => now - recent.timestamp < this.DEDUP_WINDOW);
    this.saveSession(this.activeSession);
  }
  
  /**
   * Generate a hash for an action to use for deduplication
   */
  private generateActionHash(action: SemanticAction): string {
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
    if (action.type === ActionType.NAVIGATION) {
      return true;
    }
    if (action.type === ActionType.SUBMIT) {
      return true;
    }
    if (action.type === ActionType.CLICK && action.target?.isInteractive) {
      return true;
    }
    if (action.type === ActionType.TYPE && action.value && typeof action.value === 'string' && action.value.length > 2) {
      return true;
    }
    if (action.type === ActionType.KEYPRESS && action.value && typeof action.value === 'string' && 
        ['Enter', 'Escape', 'Tab'].includes(action.value)) {
      return true;
    }
    if (action.type === ActionType.DYNAMIC_CONTENT) {
      return action.description.includes('loaded') || action.description.includes('updated');
    }
    return false;
  }
  
  private saveSession(session: SmartRecordingSession): void {
    const key = `smart_recording_${session.id}`;
    localStorage.setItem(key, JSON.stringify(session));
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  exportForAI(sessionId: string): any {
    const session = this.getSession(sessionId);
    if (!session) return null;

    return {
      task: session.taskGoal,
      description: session.description,
      success: session.metadata.success,
      complexity: session.metadata.complexity,
      duration: session.metadata.duration,
      steps: session.actions.map((action: SemanticAction, index: number) => ({
        step: index + 1,
        action: action.type,
        description: action.description,
        target: action.target.description,
        value: action.value,
        intent: action.intent,
        timestamp: action.timestamp
      })),
      environment: {
        initialUrl: session.initialContext.url,
        pagesVisited: session.metadata.pagesVisited,
        userAgent: session.initialContext.userAgent,
        viewport: session.initialContext.viewport
      },
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
      case 'keypress': return ActionType.KEYPRESS; // Map keypress (like Enter) to navigation
      case 'change': return ActionType.SELECT;
      case 'submit': return ActionType.SUBMIT;
      case 'focus': return ActionType.FOCUS;
      case 'blur': return ActionType.BLUR;
      case 'scroll': return ActionType.SCROLL;
      case 'navigation': return ActionType.NAVIGATION;
      case 'in_page_navigation': return ActionType.NAVIGATION;
      case 'history_push_state': return ActionType.NAVIGATION;
      case 'history_replace_state': return ActionType.NAVIGATION;
      case 'spa_navigation': return ActionType.SPA_NAVIGATION;
      case 'turbo_navigation': return ActionType.SPA_NAVIGATION;
      case 'github_navigation': return ActionType.SPA_NAVIGATION;
      case 'page_load_complete': return ActionType.PAGE_LOAD;
      case 'search_results': return ActionType.SEARCH_RESULTS;
      case 'dynamic_content': return ActionType.DYNAMIC_CONTENT;
      case 'select': return ActionType.SELECT;
      case 'reset': return ActionType.SUBMIT;
      case 'invalid': return ActionType.SUBMIT;
      case 'select_option': return ActionType.SELECT_OPTION;
      case 'toggle_checkbox': return ActionType.TOGGLE_CHECKBOX;
      case 'select_radio': return ActionType.SELECT_RADIO;
      case 'select_file': return ActionType.SELECT_FILE;
      case 'adjust_slider': return ActionType.ADJUST_SLIDER;
      case 'form_submit': return ActionType.SUBMIT;
      case 'copy': return ActionType.COPY;
      case 'cut': return ActionType.CUT;
      case 'paste': return ActionType.PASTE;
      case 'context_menu': return ActionType.CONTEXT_MENU;
      case 'contextmenu': return ActionType.CONTEXT_MENU;
      case 'mouseover': 
      case 'mouseenter': 
        return ActionType.HOVER;
      case 'dragstart': return ActionType.DRAG_START;
      case 'drag': return ActionType.DRAG;
      case 'dragend': return ActionType.DRAG_END;
      case 'drop': return ActionType.DROP;
      
      case 'react_synthetic_event': return ActionType.REACT_EVENT;
      
      default: return ActionType.UNKNOWN;
    }
  }

}

