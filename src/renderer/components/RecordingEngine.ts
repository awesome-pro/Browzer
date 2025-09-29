import {
  SmartRecordingSession,
  SemanticAction,
  PageContext,
  ActionType,
  ElementContext,
} from '../types/recording';
import { RecordingUtil } from '../utils';

export class SmartRecordingEngine {
  private static instance: SmartRecordingEngine;
  private activeSession: SmartRecordingSession | null = null;
  private isRecording = false;
  private pendingActions: Map<string, any> = new Map();
  private lastPageContext: PageContext | null = null;
  
  private lastSignificantAction = 0;
  private readonly MIN_ACTION_GAP = 200;
  private inputBuffer: Map<string, {value: string, element: any, lastUpdate: number}> = new Map();
  private navigationBuffer: {url: string, timestamp: number} | null = null;
  private clickSequence: Array<{target: any, timestamp: number}> = [];
  private readonly SEMANTIC_AGGREGATION_DELAY = 800;
  private recentActions: Array<{hash: string, timestamp: number}> = [];
  private readonly DEDUP_WINDOW = 2000;
  private observers: Map<string, any> = new Map();
  private eventListeners: Map<string, EventListener> = new Map();
  private recentFocusEvents: Map<string, {timestamp: number, elementContext: any}> = new Map();
  private readonly FOCUS_CLICK_CONSOLIDATION_WINDOW = 1500;

  private constructor() {
    this.initializeWebviewEventHandlers();
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
      ipcRenderer.ipcOn('recording-action', (actionData: any) => {
        this.handleWebviewAction(actionData);
      });
      
      ipcRenderer.ipcOn('native-event', (eventData: any) => {
        this.handleEvent(eventData);
      });
      
    } else {
      console.warn('❌[RecordingEngine] IPC renderer not available for webview events');
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

    const description = RecordingUtil.generateWebviewActionDescription(actionData);
    const actionType = RecordingUtil.mapEventTypeToActionType(actionData.type);

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
      window.dispatchEvent(new CustomEvent('recording-action', {
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

private handleEvent(eventData: any): void {
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
        this.handleNavigationEvent(eventData);
        break;
      case 'click':
      case 'mousedown':
      case 'mouseup':
        this.handleClickEvent(eventData);
        break;
        
      case 'focus':
      case 'focusin':
        this.handleFocusEvent(eventData);
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
        this.handleKeyEvent(eventData);
        break;
        
      case 'submit':
      case 'form_submit':
        this.handleFormSubmitEvent(eventData);
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
          // console.log('Modal open:', eventData);
          break;
        case 'modal_close':
        case 'dialog_close':
        case 'cancel':
        case 'close':
          // console.log('Modal close:', eventData);
          break;
      case 'dom_change':
      case 'dynamic_content_change':
        case 'dom_significant_change':
          // console.log('DOM change:', eventData);
          break;
        case 'animation_start':
        case 'animation_end':
        case 'transition_end':
          this.handleAnimationEvent(eventData);
          break;
        case 'play':
          // console.log('Media play:', eventData);
          break;
        case 'pause':
          // console.log('Media pause:', eventData);
          break;
        case 'ended':
          // console.log('Media ended:', eventData);
          break;
        case 'touch_start':
        case 'touch_end':
        case 'touch_move':
          // console.log('Touch event:', eventData);
          break;
        case 'copy':
        case 'cut':
        case 'paste':
          this.handleClipboardEvent(eventData);
          break;
        case 'async_request_start':
          // console.log('Async request start:', eventData);
          break;
        case 'async_request_complete':
          // console.log('Async request complete:', eventData);
          break;
        case 'async_request_error':
          // console.log('Async request error:', eventData);
          break;
        default:
        this.recordDefaultAction(eventData);
    }
  } catch (error) {
    console.error('[RecordingEngine] Error handling native event:', error);
  }
}

private handleFocusEvent(eventData: any): void {
  if (!eventData.target) return;
  const elementContext = this.convertElementContext(eventData.target);
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

private handleNavigationEvent(eventData: any): void {
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
  }, 500);
}

private processNavigationBuffer(eventData: any): void {
  if (!this.navigationBuffer || this.navigationBuffer.url !== eventData.url) {
    return;
  }
  console.log("eventdata1: ", eventData)
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
  let navigationDescription = '';
  navigationDescription = `Navigate to "${eventData.url}"`;
  const cleanUrl = RecordingUtil.cleanGoogleUrl(eventData.url);
  
  const action: SemanticAction = {
    id: this.generateId(),
    type: ActionType.NAVIGATION,
    timestamp: eventData.timestamp || Date.now(),
    description: navigationDescription,
    target: {
      description: `Navigation "${eventData.url}"`,
      selector: '',
      xpath: '',
      role: 'page',
      isVisible: true,
      isInteractive: false,
      context: 'navigation',
      url: eventData.url
    },
    value: JSON.stringify({
      url: cleanUrl,
      title: eventData.title || '',
    }),
    context: pageContext,
    intent: 'navigate_to_page'
  };
  
  this.recordAction(action);
  window.dispatchEvent(new CustomEvent('recording-action', {
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

private handleClickEvent(eventData: any): void {
  if (!eventData.target) return;
  if (eventData.type !== 'click') return; // Only process actual clicks, not mousedown/mouseup
  const now = Date.now();
  for (const [key, focusEvent] of this.recentFocusEvents.entries()) {
    if (now - focusEvent.timestamp > this.FOCUS_CLICK_CONSOLIDATION_WINDOW) {
      this.recentFocusEvents.delete(key);
    }
  }
  
  const target = eventData.target;
  const isInteractiveElement = RecordingUtil.isInteractiveElement(target);
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

private processClickSequence(url: string, pageTitle: string): void {
  if (this.clickSequence.length === 0) return;
  const lastClick = this.clickSequence[this.clickSequence.length - 1];
  if (Date.now() - lastClick.timestamp < this.SEMANTIC_AGGREGATION_DELAY - 50) {
    return;
  }
  const target = this.findMostSignificantClick();
  const linkElement = RecordingUtil.findLinkElementInHierarchy(target);
  const elementContext = this.convertElementContext(target);
  const elementKey = this.generateElementKey(elementContext);
  const recentFocus = this.recentFocusEvents.get(elementKey);
  const isNavigationClick = linkElement && linkElement.href && linkElement.href !== url;
  
  if (isNavigationClick) {
    const targetUrl = isNavigationClick && linkElement ? linkElement.href : (target.href || '');
    const linkText = isNavigationClick && linkElement ? 
      (linkElement.href || linkElement.title) : 
      (target.href || target.title);

    const navigationAction: SemanticAction = {
      id: this.generateId(),
      type: ActionType.NAVIGATION,
      timestamp: Date.now(),
      description: `Navigate to > "${RecordingUtil.cleanGoogleUrl(linkText ?? targetUrl)}"`,
      target: {
        description: `Navigate to > "${RecordingUtil.cleanGoogleUrl(linkText ?? targetUrl)}" by clicking on "${elementContext.description}"`,
        selector: isNavigationClick && linkElement ? this.generateCompleteSelector(linkElement) : '',
        xpath: '',
        role: 'page',
        isVisible: true,
        isInteractive: false,
        context: 'navigation',
        url: targetUrl
      },
      value: JSON.stringify({
        url: RecordingUtil.cleanGoogleUrl(targetUrl),
        clickedElement: elementContext.description
      }),
      context: {
        url: url,
        title: pageTitle || 'Unknown Page',
        timestamp: Date.now(),
        viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 },
        userAgent: navigator.userAgent,
        keyElements: []
      },
      intent: 'navigate_to_page'
    };
    
    this.recordAction(navigationAction);
    window.dispatchEvent(new CustomEvent('recording-action', {
      detail: {
        type: ActionType.NAVIGATION,
        description: navigationAction.description,
        timestamp: navigationAction.timestamp
      }
    }));
  } else {

    const action: SemanticAction = {
      id: this.generateId(),
      type: ActionType.CLICK,
      timestamp: Date.now(),
      description: `Click "${elementContext.description}`,
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
    window.dispatchEvent(new CustomEvent('recording-action', {
      detail: {
        type: ActionType.CLICK,
        description: action.description,
        timestamp: action.timestamp
      }
    }));
  }
  this.clickSequence = [];
}

private generateCompleteSelector(element: any): string {
  try {
    if (!element) return '';
    
    // Store all potential selectors
    const selectorParts: string[] = [];
    const uniqueIdentifiers: string[] = [];
    
    // Basic element info
    const tagName = element.tagName?.toLowerCase();
    if (tagName) {
      selectorParts.push(`element ${tagName}| `);
    }
    
    // ID is the most reliable selector
    if (element.id && typeof element.id === 'string' && element.id.trim()) {
      selectorParts.push(`id: ${element.id}| `);
      uniqueIdentifiers.push(`#${element.id}`);
    }
    
    // Process attributes (data attributes, name, role, aria)
    if (element.attributes && typeof element.attributes !== 'undefined') {
      try {
        const attributes = Array.from(element.attributes) as Array<{name: string, value: string}>;
        for (const attr of attributes) {
          if (!attr || !attr.name || typeof attr.name !== 'string') continue;
          
          const attrValue = attr.value && typeof attr.value === 'string' ? attr.value : '';
          
          // Prioritize test-related data attributes
          if (attr.name.startsWith('data-test') || 
              attr.name.startsWith('data-cy') || 
              attr.name.startsWith('data-qa') || 
              attr.name.startsWith('data-testid')) {
            selectorParts.push(`${attr.name}: ${attrValue}| `);
            uniqueIdentifiers.push(`[${attr.name}="${attrValue}"]`);
          }
          // Other important attributes
          else if (attr.name.startsWith('data-') || 
                   attr.name === 'name' || 
                   attr.name === 'role' || 
                   attr.name === 'aria-label' ||
                   attr.name === 'title' ||
                   attr.name === 'type') {
            selectorParts.push(`${attr.name}: ${attrValue}| `);
            
            if (attr.name === 'name') {
              uniqueIdentifiers.push(`[name="${attrValue}"]`);
            } else if (attr.name === 'role') {
              uniqueIdentifiers.push(`[role="${attrValue}"]`);
            } else if (attr.name === 'aria-label') {
              uniqueIdentifiers.push(`[aria-label="${attrValue}"]`);
            } else if (attr.name === 'title') {
              uniqueIdentifiers.push(`[title="${attrValue}"]`);
            } else if (attr.name === 'type') {
              uniqueIdentifiers.push(`${tagName}[type="${attrValue}"]`);
            } else {
              uniqueIdentifiers.push(`[${attr.name}="${attrValue}"]`);
            }
          }
        }
      } catch (attrError) {
        console.error('[RecordingEngine] Error processing attributes:', attrError);
      }
    }
    
    // Class names
    if (element.className && typeof element.className === 'string' && element.className.trim()) {
      const classNames = element.className.split(' ').filter(Boolean);
      if (classNames.length > 0) {
        selectorParts.push(`class: ${element.className}| `);
        
        // Add the most specific class (usually the longest one)
        const sortedClasses = [...classNames].sort((a, b) => b.length - a.length);
        if (sortedClasses.length > 0) {
          uniqueIdentifiers.push(`${tagName}.${sortedClasses[0]}`);
          
          // Also add a selector with multiple classes for better specificity
          if (sortedClasses.length > 1) {
            uniqueIdentifiers.push(`${tagName}.${sortedClasses[0]}.${sortedClasses[1]}`);
          }
        }
      }
    }
    
    // Text content is very useful for buttons and links
    if (element.textContent && typeof element.textContent === 'string' && element.textContent.trim()) {
      const text = element.textContent.trim();
      const shortText = text.length > 30 ? text.substring(0, 30) + '...' : text;
      selectorParts.push(`text: "${shortText}"| `);
      
      // For buttons and links, text content is often a reliable identifier
      if ((tagName === 'button' || tagName === 'a' || 
           (element.role && (element.role === 'button' || element.role === 'link')))) {
        // Store text-based selector for buttons and links
        uniqueIdentifiers.push(`${tagName}:has(text="${shortText}")`);
      }
    }
    
    // Add nth-child for position-based selection as a last resort
    try {
      const parent = element.parentElement || element.parentContext;
      if (parent && parent.children && Array.isArray(parent.children)) {
        const siblings = Array.from(parent.children);
        const index = siblings.indexOf(element);
        if (index !== -1) {
          selectorParts.push(`:nth-child(${index + 1})| `);
          
          // If parent has an ID, create a more specific selector
          if (parent.id && typeof parent.id === 'string' && parent.id.trim()) {
            uniqueIdentifiers.push(`#${parent.id} > ${tagName}:nth-child(${index + 1})`);
          }
        }
      }
    } catch (parentError) {
      console.error('[RecordingEngine] Error accessing parent:', parentError);
    }
    
    // Store unique identifiers in the element for later use
    if (uniqueIdentifiers.length > 0) {
      element.uniqueIdentifiers = uniqueIdentifiers;
    }
    
    return selectorParts.join('') || tagName || 'unknown';
  } catch (error) {
    console.error('[RecordingEngine] Error in generateCompleteSelector:', error);
    return element.tagName?.toLowerCase() || 'unknown';
  }
}

private findMostSignificantClick(): any {
  if (this.clickSequence.length === 1) {
    return this.clickSequence[0].target;
  }
  for (const click of this.clickSequence) {
    if (RecordingUtil.isInteractiveElement(click.target)) {
      return click.target;
    }
  }
  return this.clickSequence[this.clickSequence.length - 1].target;
}

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
  const elementContext = this.convertElementContext(element);
  const action: SemanticAction = {
    id: this.generateId(),
    type: ActionType.TYPE,
    timestamp: Date.now(),
    description: `Enter "${value}" in "${elementContext.description}"`,
    target: elementContext,
    value: value,
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
  window.dispatchEvent(new CustomEvent('recording-action', {
    detail: {
      type: ActionType.TYPE,
      description: action.description,
      timestamp: action.timestamp
    }
  }));
}

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

private handleKeyEvent(eventData: any): void {
  if (!eventData.target || !eventData.key) return;
  if (eventData.type !== 'keydown') return;
  const specialKeys = ['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Delete', 'Ctrl', 'Alt', 'Shift'];
  if (!specialKeys.includes(eventData.key)) return;
  if (eventData.key === 'Enter' && this.isFormElement(eventData.target) && 
      this.hasVisibleSubmitButton(eventData.target)) {
    return;
  }
  
  const target = eventData.target;
  const elementContext = this.convertElementContext(target);
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
    description = `Navigate "${direction}" using keyboard`;
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
  window.dispatchEvent(new CustomEvent('recording-action', {
    detail: {
      type: ActionType.KEYPRESS,
      description: action.description,
      timestamp: action.timestamp
    }
  }));
}

private isFormElement(element: any): boolean {
  if (!element || !element.tagName) return false;
  
  const formTags = ['input', 'select', 'textarea', 'button', 'form'];
  const tagName = element.tagName.toLowerCase();
  
  return formTags.includes(tagName) || element.form != null;
}

private hasVisibleSubmitButton(element: any): boolean {
  try {
    const form = element.form || (element.tagName?.toLowerCase() === 'form' ? element : null);
    if (!form) return false;
    const submitButtons = form.querySelectorAll('button[type="submit"], input[type="submit"]');
    return submitButtons.length > 0;
  } catch (e) {
    return false;
  }
}

private handleFormSubmitEvent(eventData: any): void {
  if (!eventData.target) return;
  
  const target = eventData.target;
  const now = Date.now();
  const recentClickThreshold = 800; // ms - Increased to catch more cases
  let hasRecentSubmitButtonClick = false;
  const recentActions = this.recentActions.filter(action => now - action.timestamp < recentClickThreshold);
  for (const action of recentActions) {
    const actionHash = action.hash;
    if (actionHash.includes('submit') || 
        actionHash.includes('form') || 
        actionHash.includes('create') || 
        actionHash.includes('sign') || 
        actionHash.includes('login') || 
        actionHash.includes('register')) {
      hasRecentSubmitButtonClick = true;
      break;
    }
  }
  if (!hasRecentSubmitButtonClick && this.activeSession && this.activeSession.actions && this.activeSession.actions.length > 0) {
    hasRecentSubmitButtonClick = this.activeSession.actions.some((action: any) => {
      if (action.type !== ActionType.CLICK || now - action.timestamp > recentClickThreshold) {
        return false;
      }
      const clickedElement = action.target;
      if (!clickedElement) return false;
      
      const description = clickedElement.description?.toLowerCase() || '';
      const isSubmitButton = 
        (clickedElement.role === 'button') ||
        (clickedElement.elementType === 'submit') ||
        (description.includes('submit')) ||
        (description.includes('create')) ||
        (description.includes('sign')) ||
        (description.includes('login')) ||
        (description.includes('register')) ||
        (description.includes('save'));
        
      return isSubmitButton;
    });
  }
  if (hasRecentSubmitButtonClick) {
    console.log('[RecordingEngine] Skipping duplicate form submission event');
    return;
  }
  
  const elementContext = this.convertElementContext(target);
  console.log("form target: ", target)
  let formDescription = 'form';
  if (target.id) {
    formDescription = `form #${target.id}`;
  } else if (target.name) {
    formDescription = `form ${target.name}`;
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
  window.dispatchEvent(new CustomEvent('recording-action', {
    detail: {
      type: ActionType.SUBMIT,
      description: action.description,
      timestamp: action.timestamp
    }
  }));
}

private handleReactEvent(eventData: any): void {
  if (!eventData.target) return;
  
  const target = eventData.target;
  const elementContext = this.convertElementContext(target);
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
  const isInteractive = RecordingUtil.isInteractiveElement(target);
  if (!isInteractive) return;
  
  const elementContext = this.convertElementContext(target);
  
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
  const elementContext = this.convertElementContext(target);
  
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
  const elementContext = this.convertElementContext(target);
  
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
  const elementContext = this.convertElementContext(target);
  
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

private recordDefaultAction(eventData: any): void {
  if (!eventData.target) return;
  
  const target = eventData.target;
  const elementContext = this.convertElementContext(target);
  
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

private convertElementContext(nativeElement: any): ElementContext {
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
  
  const isSvg = nativeElement.isSvg || nativeElement.tagName?.toLowerCase() === 'svg';
  
  let description = 'element: ' + nativeElement.tagName?.toLowerCase() + '| ';
  
  if (isSvg && nativeElement.parentInteractiveElement) {
    const parent = nativeElement.parentInteractiveElement;
    
    if (parent.id) {
      description += `parent-id: #${parent.id}| `;
    }
    
    if (parent.className) {
      description += `parent-class: ${parent.className}| `;
    }
    
    if (parent.role) {
      description += `parent-role: ${parent.role}| `;
    }
    
    // Add text content from parent or nearest text
    if (parent.text) {
      description += `text: "${parent.text.substring(0, 30)}${parent.text.length > 30 ? '...' : ''}"| `;
    } else if (nativeElement.nearestTextContent) {
      description += `text: "${nativeElement.nearestTextContent.substring(0, 30)}${nativeElement.nearestTextContent.length > 30 ? '...' : ''}"| `;
    }
    
    if (parent.ariaLabel) {
      description += `aria-label: ${parent.ariaLabel}| `;
    }
  } else {
    if (nativeElement.type && nativeElement.type !== description) {
      description = `${nativeElement.type} ${description}`;
    }
    
    if (nativeElement.id) {
      description += `id: #${nativeElement.id}| `;
    } else if (nativeElement.className) {
      description += `class: ${nativeElement.className}| `;
    } 
    
    if (nativeElement.name) {
      description += `name: ${nativeElement.name}| `;
    }
    
    if (nativeElement.text) {
      description += `text: "${nativeElement.text.substring(0, 30)}${nativeElement.text.length > 30 ? '...' : ''}"| `;
    }
    
    if (nativeElement.attributes && nativeElement.attributes['aria-label']) {
      description += `aria-label: ${nativeElement.attributes['aria-label']}| `;
    }
  }
  
  // Add SVG-specific data to the description if available
  if (isSvg && nativeElement.svgData) {
    if (nativeElement.svgData.id) {
      description += `svg-id: ${nativeElement.svgData.id}| `;
    }
    
    if (nativeElement.dataAttributes) {
      const testIds = Object.entries(nativeElement.dataAttributes)
        .filter(([key]) => key.includes('test') || key.includes('id') || key.includes('qa'))
        .map(([key, value]) => `${key}="${value}"`)
        .join(', ');
      
      if (testIds) {
        description += `data: ${testIds}| `;
      }
    }
  }
  
  let selector = this.generateCompleteSelector(nativeElement);
  let role = nativeElement.role || nativeElement.attributes?.role || 'generic';
  
  // For SVG elements, enhance the selector with parent information if available
  if (isSvg && nativeElement.parentInteractiveElement) {
    const parent = nativeElement.parentInteractiveElement;
    if (parent.id) {
      selector = `#${parent.id} ${selector}`;
    } else if (parent.className) {
      const mainClass = parent.className.split(' ')[0];
      selector = `.${mainClass} ${selector}`;
    }
  }
  
  return {
    description,
    selector,
    xpath: '',
    role: role,
    boundingRect: nativeElement.boundingRect || { x: 0, y: 0, width: 0, height: 0 },
    isVisible: nativeElement.isVisible !== false,
    isInteractive: nativeElement.isInteractive !== false,
    context: 'native_event',
    elementType: nativeElement.type || nativeElement.tagName?.toLowerCase(),
    text: nativeElement.text || nativeElement.nearestTextContent,
    parentElement: nativeElement.parentInteractiveElement ? {
      tagName: nativeElement.parentInteractiveElement.tagName,
      id: nativeElement.parentInteractiveElement.id,
      className: nativeElement.parentInteractiveElement.className,
      text: nativeElement.parentInteractiveElement.text
    } : undefined,
    svgData: nativeElement.svgData
  };
}

private convertWebviewElementToElementContext(webviewElement: any): ElementContext {
  return {
    description: RecordingUtil.generateEnhancedElementDescription(webviewElement),
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

public initializeWebviewRecording(): void {
  this.initializeWebviewEventHandlers();
}

public setupRecording(webview: any): void {
  
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
      }
    };

    this.activeSession = session;
    this.isRecording = true;
    this.lastPageContext = session.initialContext;
    
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
      window.dispatchEvent(new CustomEvent('recording-action', {
        detail: {
          type: action.type,
          description: action.description,
          timestamp: action.timestamp
        }
      }));
    }
    return true;
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

  private cleanupRecording(): void {
    this.processPendingActions();
    this.recentActions = [];
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
    this.recentActions.push({ hash: actionHash, timestamp: now });
    this.recentActions = this.recentActions.filter(recent => now - recent.timestamp < this.DEDUP_WINDOW);
    this.saveSession(this.activeSession);
  }
  
  private generateActionHash(action: SemanticAction): string {
    const hashObj = {
      type: action.type,
      description: action.description,
      url: action.context?.url,
      target: action.target?.description
    };
    
    return JSON.stringify(hashObj);
  }
  
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
    if (action.type === ActionType.KEYPRESS && action.value && typeof action.value === 'string') {
      // Include all special keys that are detected in handleKeyEvent
      const specialKeys = ['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Delete', 'Ctrl', 'Alt', 'Shift'];
      return specialKeys.includes(action.value);
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
}