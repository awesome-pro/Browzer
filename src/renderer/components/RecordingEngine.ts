import {
  SmartRecordingSession,
  SemanticAction,
  PageContext,
  TaskGoal,
  ActionType,
  ElementContext,
  ScreenshotCapture,
  NetworkInteraction
} from '../../shared/types/recording';

export class SmartRecordingEngine {
  private static instance: SmartRecordingEngine;
  private activeSession: SmartRecordingSession | null = null;
  private isRecording = false;
  
  // Action aggregation and deduplication
  private pendingActions: Map<string, any> = new Map();
  private lastPageContext: PageContext | null = null;
  private currentTaskGoal: TaskGoal | null = null;
  
  private lastSignificantAction = 0;
  private readonly ACTION_TIMEOUT = 800; // 1s to aggregate actions
  private readonly MIN_ACTION_GAP = 100; // Reduced gap to allow more natural action recording
  
  // Deduplication tracking
  private lastActionHash = '';
  private recentActions: Array<{hash: string, timestamp: number}> = [];
  private readonly DEDUP_WINDOW = 2000; // 2 second window for deduplication
  
  // observers
  private observers: Map<string, any> = new Map();
  private eventListeners: Map<string, EventListener> = new Map();

  private constructor() {
    this.initializeWebviewEventHandlers()
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

    const action: SemanticAction = {
      id: this.generateId(),
      type: this.mapEventTypeToActionType(actionData.type),
      timestamp: actionData.timestamp,
      description: this.generateWebviewActionDescription(actionData),
      target: this.convertWebviewElementToElementContext(actionData.target),
      value: processedValue,
      coordinates: actionData.coordinates,
      context: this.convertWebviewPageContext(actionData.pageContext),
      intent: this.inferIntent(
        this.mapEventTypeToActionType(actionData.type),
        this.convertWebviewElementToElementContext(actionData.target),
        processedValue
      )
    };
    
    // Check for duplicates and filter out low-quality actions
    if (this.shouldRecordAction(action)) {
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
  if (!url || !url.includes('google.com')) {
    return url;
  }
  
  try {
    const urlObj = new URL(url);
    
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
    return typeof value === 'string' ? value : `Dynamic content loaded on page`;
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
      
    case 'text_input':
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
        const linkText = value.linkText;
        
        if (navType === 'google_search_result') {
          try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname.replace('www.', '');
            return `Navigate to ${domain}${linkText ? ` ("${linkText.substring(0, 40)}")` : ''} → ${this.cleanGoogleUrl(url)}`;
          } catch (e) {
            return `Navigate to search result${linkText ? ` ("${linkText.substring(0, 40)}")` : ''} → ${url}`;
          }
        } else if (navType === 'external_link' || navType === 'external_navigation') {
          try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname.replace('www.', '');
            return `Navigate to ${domain}${linkText ? ` ("${linkText.substring(0, 40)}")` : ''} → ${url}`;
          } catch (e) {
            return `Navigate to external page${linkText ? ` ("${linkText.substring(0, 40)}")` : ''} → ${url}`;
          }
        } else if (navType === 'in_page_navigation') {
          return `Navigate within page${linkText ? ` to "${linkText}"` : ''}`;
        } else if (url) {
          try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname.replace('www.', '');
            return `Navigate to ${domain}${linkText ? ` ("${linkText.substring(0, 40)}")` : ''}`;
          } catch (e) {
            return `Navigate to ${url}${linkText ? ` ("${linkText.substring(0, 40)}")` : ''}`;
          }
        }
      }
      return `Navigate to page${text ? ` ("${text.substring(0, 50)}")` : ''}`;
      
    case 'change':
      return `Select "${value}" from ${elementType}`;
      
    case 'submit':
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

    // Handle input events with debouncing
    const targetKey = `text_input_${elementContext.selector}`;
    this.debounceAction(targetKey, () => {
      this.finalizeTextInput(elementContext, target.value);
    });
  }

  private finalizeTextInput(elementContext: ElementContext, finalValue: string): void {
    if (!finalValue?.trim() || finalValue.length < 2) return;

    const action: SemanticAction = {
      id: this.generateId(),
      type: ActionType.TEXT_INPUT,
      timestamp: Date.now(),
      description: `Enter "${this.maskSensitiveValue(finalValue)}" in ${elementContext.description}`,
      target: elementContext,
      value: this.maskSensitiveValue(finalValue),
      context: this.capturePageContext(),
      intent: this.inferIntent(ActionType.TEXT_INPUT, elementContext, finalValue)
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
      case ActionType.TEXT_INPUT:
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
  private debounceAction(key: string, action: () => void): void {
    if (this.pendingActions.has(key)) {
      clearTimeout(this.pendingActions.get(key));
    }
    
    const timeout = setTimeout(() => {
      action();
      this.pendingActions.delete(key);
    }, this.ACTION_TIMEOUT);
    
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
      console.log(`🔄 Skipping duplicate action: ${action.description}`);
      return false;
    }
    
    // Check if action is too soon after last significant action
    if (now - this.lastSignificantAction < this.MIN_ACTION_GAP) {
      // Allow text input and navigation actions even if close together
      if (![ActionType.TEXT_INPUT, ActionType.NAVIGATION].includes(action.type)) {
        console.log(`⏱️ Skipping action too soon after last: ${action.description}`);
        return false;
      }
    }
    
    // Filter out low-quality actions
    if (this.isLowQualityAction(action)) {
      console.log(`🗑️ Skipping low-quality action: ${action.description}`);
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
    if (action.type === ActionType.TEXT_INPUT) {
      const value = action.value as string;
      return !value || value.trim().length === 0;
    }
    
    // Keep navigation actions (like Enter key presses)
    if (action.type === ActionType.NAVIGATION) {
      return false;
    }
    
    return false;
  }

  private recordAction(action: SemanticAction): void {
    if (!this.activeSession) return;

    this.activeSession.actions.push(action);
    this.lastSignificantAction = action.timestamp;

    // Capture screenshot for significant actions
    const significantActions = [
      ActionType.CLICK, ActionType.FORM_SUBMIT, ActionType.NAVIGATION, ActionType.TEXT_INPUT,
      ActionType.PAGE_LOAD, ActionType.SEARCH_RESULTS, ActionType.SELECT_OPTION, 
      ActionType.TOGGLE_CHECKBOX, ActionType.SELECT_RADIO, ActionType.SELECT_FILE,
      ActionType.COPY, ActionType.CUT, ActionType.PASTE
    ];
    
    if (significantActions.includes(action.type)) {
      this.captureScreenshot('action');
    }

    console.log(`📝 Recorded: ${action.description}`);
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

  private isInteractiveElement(element: Element): boolean {
    const interactiveTags = ['button', 'input', 'select', 'textarea', 'a'];
    const tagName = element.tagName.toLowerCase();
    
    return interactiveTags.includes(tagName) || 
           element.hasAttribute('onclick') ||
           element.hasAttribute('tabindex') ||
           element.getAttribute('role') === 'button';
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
      case 'input': return ActionType.TEXT_INPUT;
      case 'text_input': return ActionType.TEXT_INPUT; // Handle aggregated text input from webview
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

