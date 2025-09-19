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
  
  // Action aggregation
  private pendingActions: Map<string, any> = new Map();
  private lastPageContext: PageContext | null = null;
  private currentTaskGoal: TaskGoal | null = null;
  
  private lastSignificantAction = 0;
  private readonly ACTION_TIMEOUT = 1500; // 1.5s to aggregate actions
  private readonly MIN_ACTION_GAP = 500; // Minimum gap between significant actions
  
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
    const action: SemanticAction = {
      id: this.generateId(),
      type: this.mapEventTypeToActionType(actionData.type),
      timestamp: actionData.timestamp,
      description: this.generateWebviewActionDescription(actionData),
      target: this.convertWebviewElementToElementContext(actionData.target),
      value: actionData.value,
      coordinates: actionData.coordinates,
      context: this.convertWebviewPageContext(actionData.pageContext),
      intent: this.inferIntent(
        this.mapEventTypeToActionType(actionData.type),
        this.convertWebviewElementToElementContext(actionData.target),
        actionData.value
      )
    };
    
    this.recordAction(action);
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
    description: this.generateElementDescriptionFromWebview(webviewElement),
    selector: webviewElement.selector || '',
    xpath: webviewElement.xpath || '',
    role: webviewElement.tagName || 'unknown',
    boundingRect: webviewElement.boundingRect || { x: 0, y: 0, width: 0, height: 0 },
    isVisible: webviewElement.isVisible !== false,
    isInteractive: true,
    context: 'in webview',
    // attributes: webviewElement.attributes || {}
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

private generateWebviewActionDescription(actionData: any): string {
  const element = actionData.target;
  const type = actionData.type;
  
  const elementDesc = element.text ? 
    `${element.tagName}${element.id ? '#' + element.id : ''} "${element.text.substring(0, 30)}"` :
    `${element.tagName}${element.id ? '#' + element.id : ''}`;
  
  switch (type) {
    case 'click':
      return `Click ${elementDesc}`;
    case 'input':
      return `Enter text in ${elementDesc}`;
    case 'change':
      return `Change value in ${elementDesc}`;
    case 'submit':
      return `Submit form with ${elementDesc}`;
    case 'focus':
      return `Focus on ${elementDesc}`;
    case 'blur':
      return `Blur from ${elementDesc}`;
    default:
      return `${type} on ${elementDesc}`;
  }
}

private generateElementDescriptionFromWebview(element: any): string {
  const tagName = element.tagName || 'unknown';
  const text = element.text || '';
  const id = element.id;
  
  if (id) return `${tagName}#${id}${text ? ` (${text})` : ''}`;
  if (text && text.length > 3) return `${tagName} "${text}"`;
  
  const className = element.className;
  if (className && typeof className === 'string') {
    const mainClass = className.split(' ')[0];
    return `${tagName}.${mainClass}`;
  }
  
  return tagName;
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
  const webviewId = webview.id;
  
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
    // Focus on high-level user intentions
    const meaningfulEvents = [  
      'click', 'submit', 'change', 'input', 'keydown', 'focus', 'blur', 'scroll'
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
    const now = Date.now();
    
    // Skip if too soon after last significant action
    if (now - this.lastSignificantAction < this.MIN_ACTION_GAP) {
      return;
    }

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
      case 'focus':
        this.handleFocusChange(event, 'focus');
        break;
      case 'blur':
        this.handleFocusChange(event, 'blur');
      case 'scroll':
        this.handleScroll(event);
        break;
    }
  }
  
  private handleScroll(event: Event): void {
    const action: SemanticAction = {
      id: this.generateId(),
      type: ActionType.SCROLL,
      timestamp: Date.now(),
      description: 'Scroll',
      target: this.captureElementContext(event.target as Element),
      context: this.capturePageContext(),
      intent: this.inferIntent(ActionType.SCROLL, this.captureElementContext(event.target as Element))
    };
    this.recordAction(action);
  }

  private handleFocusChange(event: Event, type: 'focus' | 'blur'): void {
    const target = event.target as HTMLElement;
    if (!target || !this.isInteractiveElement(target)) return;

    const elementContext = this.captureElementContext(target);
    const action: SemanticAction = {
      id: this.generateId(),
      type: type === 'focus' ? ActionType.FOCUS : ActionType.BLUR,
      timestamp: Date.now(),
      description: `${type} on ${elementContext.description}`,
      target: elementContext,
      context: this.capturePageContext(),
      intent: this.inferIntent(type === 'focus' ? ActionType.FOCUS : ActionType.BLUR, elementContext)
    };

    this.recordAction(action);
  }

  // Smart Event Handlers
  private handleTextInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (!target || !this.isInteractiveElement(target)) return;

    const elementContext = this.captureElementContext(target);
    
    // Aggregate text input over time
    if (event.type === 'keydown') {
      const keyEvent = event as KeyboardEvent;
      if (keyEvent.key === 'Enter') {
        this.finalizeTextInput(elementContext, target.value);
        return;
      }
      // Buffer other keys but don't record individual keystrokes
      return;
    }

    // Debounce input events
    this.debounceAction('text_input', () => {
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

    this.recordAction(action);
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

    this.recordAction(action);
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
        return 'fill_form_field';

      case ActionType.CLICK:
        if (role === 'button' || role === 'link') {
          if (description.includes('submit') || description.includes('save')) return 'submit_form';
          if (description.includes('login') || description.includes('sign in')) return 'authenticate';
          if (description.includes('search')) return 'search';
          if (description.includes('next') || description.includes('continue')) return 'proceed';
        }
        return 'interact';

      case ActionType.NAVIGATION:
        return 'navigate_to_page';

      case ActionType.FORM_SUBMIT:
        return 'submit_form';

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

  private recordAction(action: SemanticAction): void {
    if (!this.activeSession) return;

    this.activeSession.actions.push(action);
    this.lastSignificantAction = action.timestamp;

    // Capture screenshot for significant actions
    if ([ActionType.CLICK, ActionType.FORM_SUBMIT, ActionType.NAVIGATION].includes(action.type)) {
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
    const session = this.loadSession(sessionId);
    if (!session) return null;

    return {
      task: session.taskGoal,
      description: session.description,
      success: session.metadata.success,
      complexity: session.metadata.complexity,
      duration: session.metadata.duration,
      
      // High-level action sequence
      steps: session.actions.map((action, index) => ({
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
      screenshots: session.screenshots.filter(s => 
        ['initial', 'final_state', 'page_navigation'].includes(s.type)
      ),
      
      // Significant network interactions
      networkActivity: session.networkInteractions.filter(ni => 
        ni.status && ni.status < 400 // Only successful requests
      )
    };
  }

  private loadSession(sessionId: string): SmartRecordingSession | null {
    const key = `smart_recording_${sessionId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  }

  getAllSessions(): SmartRecordingSession[] {
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
      case 'change': return ActionType.SELECT;
      case 'submit': return ActionType.FORM_SUBMIT;
      case 'focus': return ActionType.FOCUS;
      case 'blur': return ActionType.BLUR;
      case 'scroll': return ActionType.SCROLL;
      
      default: return ActionType.CLICK;
    }
  }

}
