/* eslint-disable no-case-declarations */
// Advanced recording engine for capturing ML-ready browser interactions

import {
  RecordingSession,
  RecordingEvent,
  RecordingConfig,
  EventType,
  EventData,
  ElementInfo,
  NetworkEventData,
  DOMutationData,
  DEFAULT_RECORDING_CONFIG,
  MLContext,
  ViewportInfo,
} from '../../shared/types';

export class RecordingEngine {
  private static instance: RecordingEngine;
  private activeSession: RecordingSession | null = null;
  private config: RecordingConfig = DEFAULT_RECORDING_CONFIG;
  private observers: Map<string, MutationObserver | unknown> = new Map();
  private eventListeners: Map<string, EventListener> = new Map();
  private lastEventTime = 0;
  private eventQueue: RecordingEvent[] = [];
  private isRecording = false;

  private constructor() {
    // Initialize recording engine
  }

  static getInstance(): RecordingEngine {
    if (!RecordingEngine.instance) {
      RecordingEngine.instance = new RecordingEngine();
    }
    return RecordingEngine.instance;
  }

  // Session Management
  startRecording(name: string, description?: string): RecordingSession {
    if (this.isRecording) {
      throw new Error('Recording already in progress');
    }

    const session: RecordingSession = {
      id: this.generateId(),
      name,
      description,
      startTime: Date.now(),
      isActive: true,
      url: window.location.href,
      userAgent: navigator.userAgent,
      viewport: this.captureViewport(),
      events: [],
      metadata: {
        totalEvents: 0,
        totalDuration: 0,
        pageChanges: 0,
        userInteractions: 0,
        networkRequests: 0,
        domMutations: 0,
        tags: [],
      },
    };

    this.activeSession = session;
    this.isRecording = true;
    this.eventQueue = [];
    
    this.initializeRecording();
    this.recordEvent(EventType.PAGE_LOAD, {});

    console.log('🎬 Recording started:', session.name);
    return session;
  }

  stopRecording(): RecordingSession | null {
    if (!this.isRecording || !this.activeSession) {
      throw new Error('No active recording session');
    }

    this.activeSession.endTime = Date.now();
    this.activeSession.isActive = false;
    this.activeSession.metadata.totalDuration = this.activeSession.endTime - this.activeSession.startTime;
    this.activeSession.metadata.totalEvents = this.activeSession.events.length;

    this.cleanupRecording();
    
    const session = this.activeSession;
    this.activeSession = null;
    this.isRecording = false;

    // Save session to storage
    this.saveSession(session);

    console.log('⏹️ Recording stopped:', session.name, `(${session.metadata.totalEvents} events)`);
    return session;
  }

  pauseRecording(): void {
    if (!this.isRecording) return;
    
    this.cleanupRecording();
    console.log('⏸️ Recording paused');
  }

  resumeRecording(): void {
    if (!this.activeSession) return;
    
    this.initializeRecording();
    console.log('▶️ Recording resumed');
  }

  // Core Recording Methods
  private initializeRecording(): void {
    this.setupDOMObserver();
    this.setupEventListeners();
    this.setupNetworkInterception();
    this.setupStorageMonitoring();
  }

  private cleanupRecording(): void {
    // Cleanup observers
    this.observers.forEach((observer) => {
      if (observer && typeof observer === 'object' && 'disconnect' in observer) {
        (observer as MutationObserver).disconnect();
      }
    });
    this.observers.clear();

    // Cleanup event listeners
    this.eventListeners.forEach((listener, event) => {
      document.removeEventListener(event, listener, true);
    });
    this.eventListeners.clear();

    // Cleanup network interception
    this.cleanupNetworkInterception();
  }

  // DOM Mutation Observer
  private setupDOMObserver(): void {
    if (!this.config.recordDOMMutations) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (this.shouldRecordMutation(mutation)) {
          this.recordDOMMutation(mutation);
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      attributes: true,
      characterData: true,
      subtree: true,
      attributeOldValue: true,
      characterDataOldValue: true,
    });

    this.observers.set('dom', observer);
  }

  private shouldRecordMutation(mutation: MutationRecord): boolean {
    const target = mutation.target as Element;
    
    // Ignore script and style changes
    if (this.config.ignoreCSSChanges && 
        (target.tagName === 'STYLE' || target.tagName === 'SCRIPT')) {
      return false;
    }

    // Ignore internal browser changes
    if (target.classList?.contains('recording-ui') || 
        target.id?.includes('recording')) {
      return false;
    }

    // Only record meaningful mutations
    if (mutation.type === 'attributes') {
      const attrName = mutation.attributeName;
      if (attrName && ['style', 'class', 'data-*'].some(attr => 
          attrName.startsWith(attr.replace('*', '')))) {
        return true;
      }
    }

    return mutation.type === 'childList' || mutation.type === 'characterData';
  }

  private recordDOMMutation(mutation: MutationRecord): void {
    const mutationData: DOMutationData = {
      type: mutation.type as 'childList' | 'attributes' | 'characterData',
      target: this.captureElementInfo(mutation.target as Element),
      attributeName: mutation.attributeName || undefined,
      oldValue: mutation.oldValue || undefined,
      newValue: mutation.type === 'attributes' && mutation.attributeName ? 
        (mutation.target as Element).getAttribute(mutation.attributeName) || undefined : undefined,
    };

    if (mutation.type === 'childList') {
      mutationData.addedNodes = Array.from(mutation.addedNodes)
        .filter(node => node.nodeType === Node.ELEMENT_NODE)
        .map(node => this.captureElementInfo(node as Element));
      
      mutationData.removedNodes = Array.from(mutation.removedNodes)
        .filter(node => node.nodeType === Node.ELEMENT_NODE)
        .map(node => this.captureElementInfo(node as Element));
    }

    this.recordEvent(EventType.DOM_MUTATION, { mutation: mutationData });
    if (this.activeSession) {
      this.activeSession.metadata.domMutations++;
    }
  }

  // Event Listeners
  private setupEventListeners(): void {
    const events = [
      'click', 'dblclick', 'contextmenu',
      'keydown', 'keyup', 'input',
      'focus', 'blur', 'submit', 'scroll'
    ];

    events.forEach(eventType => {
      const listener = (event: Event) => this.handleEvent(event);
      document.addEventListener(eventType, listener, true);
      this.eventListeners.set(eventType, listener);
    });
  }

  private handleEvent(event: Event): void {
    const now = Date.now();
    
    // Throttle events
    if (now - this.lastEventTime < this.config.minActionDelay) {
      return;
    }

    const eventData = this.captureEventData(event);
    if (eventData) {
      this.recordEvent(event.type as EventType, eventData);
      if (this.activeSession) {
        this.activeSession.metadata.userInteractions++;
      }
      this.lastEventTime = now;
    }
  }

  private captureEventData(event: Event): EventData | null {
    const target = event.target as Element;
    if (!target) return null;

    const data: EventData = {
      element: this.captureElementInfo(target),
    };

    // Capture event-specific data
    switch (event.type) {
      case 'click':
      case 'dblclick':
      case 'contextmenu':
        const mouseEvent = event as MouseEvent;
        data.coordinates = {
          x: mouseEvent.clientX,
          y: mouseEvent.clientY,
          pageX: mouseEvent.pageX,
          pageY: mouseEvent.pageY,
        };
        break;

      case 'keydown':
      case 'keyup':
        const keyEvent = event as KeyboardEvent;
        data.value = {
          key: keyEvent.key,
          code: keyEvent.code,
          ctrlKey: keyEvent.ctrlKey,
          shiftKey: keyEvent.shiftKey,
          altKey: keyEvent.altKey,
          metaKey: keyEvent.metaKey,
        };
        break;

      case 'input':
        const inputElement = target as HTMLInputElement;
        data.value = this.maskSensitiveData(inputElement.value, inputElement.type);
        break;

      case 'scroll':
        data.value = {
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        };
        break;
    }

    return data;
  }

  // Network Interception
  private setupNetworkInterception(): void {
    if (!this.config.recordNetworkRequests) return;

    // Intercept fetch
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const requestId = this.generateId();
      const startTime = Date.now();
      
      try {
        const response = await originalFetch(...args);
        this.recordNetworkEvent(args, response, requestId, startTime);
        return response;
      } catch (error) {
        // Log network error but don't record it for now
        console.warn('Network request failed:', error);
        throw error;
      }
    };

    // Intercept XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method: string, url: string, async: boolean = true, username?: string, password?: string) {
      (this as XMLHttpRequest & { _recordingData: unknown })._recordingData = { method, url, startTime: Date.now(), requestId: Date.now().toString() };
      return originalXHROpen.call(this, method, url, async, username, password);
    };

    XMLHttpRequest.prototype.send = function(body) {
      const recordingData = (this as XMLHttpRequest & { _recordingData: unknown })._recordingData;
      
      this.addEventListener('loadend', () => {
        if (recordingData) {
          RecordingEngine.getInstance().recordXHREvent(this, recordingData as { method: string; url: string; startTime: number; requestId: string }, body);
        }
      });
      
      return originalXHRSend.call(this, body);
    };
  }

  private recordNetworkEvent(args: [RequestInfo | URL, RequestInit?], response: Response, requestId: string, startTime: number): void {
    const [input, init] = args;
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    
    if (this.shouldIgnoreRequest(url)) return;

    const networkData: NetworkEventData = {
      requestId,
      method: init?.method || 'GET',
      url,
      status: response.status,
      statusText: response.statusText,
      requestHeaders: this.normalizeHeaders(init?.headers) || {},
      responseHeaders: this.extractHeaders(response.headers),
      duration: Date.now() - startTime,
    };

    this.recordEvent(EventType.NETWORK_REQUEST, { network: networkData });
    if (this.activeSession) {
      this.activeSession.metadata.networkRequests++;
    }
  }

  private recordXHREvent(xhr: XMLHttpRequest, recordingData: { method: string; url: string; startTime: number; requestId: string }, body: unknown): void {
    if (this.shouldIgnoreRequest(recordingData.url)) return;

    const networkData: NetworkEventData = {
      requestId: recordingData.requestId,
      method: recordingData.method,
      url: recordingData.url,
      status: xhr.status,
      statusText: xhr.statusText,
      requestHeaders: {},
      responseHeaders: this.parseXHRHeaders(xhr.getAllResponseHeaders()),
      requestBody: body ? String(body) : undefined,
      duration: Date.now() - recordingData.startTime,
    };

    this.recordEvent(EventType.NETWORK_REQUEST, { network: networkData });
    if (this.activeSession) {
      this.activeSession.metadata.networkRequests++;
    }
  }

  private shouldIgnoreRequest(url: string): boolean {
    if (!this.config.ignoreInternalRequests) return false;
    
    return url.includes('chrome-extension://') ||
           url.includes('localhost:5173') ||
           url.includes('/vite/') ||
           url.includes('hot-update');
  }

  private cleanupNetworkInterception(): void {
    // Note: In a real implementation, you'd want to restore original methods
    // This is a simplified version for demonstration
  }

  // Storage Monitoring
  private setupStorageMonitoring(): void {
    if (!this.config.recordStorageChanges) return;

    // Monitor localStorage
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = (key: string, value: string) => {
      const oldValue = localStorage.getItem(key);
      originalSetItem.call(localStorage, key, value);
      this.recordStorageChange('localStorage', key, oldValue, value, 'set');
    };

    // Monitor sessionStorage
    const originalSessionSetItem = sessionStorage.setItem;
    sessionStorage.setItem = (key: string, value: string) => {
      const oldValue = sessionStorage.getItem(key);
      originalSessionSetItem.call(sessionStorage, key, value);
      this.recordStorageChange('sessionStorage', key, oldValue, value, 'set');
    };
  }

  private recordStorageChange(type: string, key: string, oldValue: string | null, newValue: string, action: string): void {
    this.recordEvent(EventType.STORAGE_CHANGE, {
      storage: { 
        type: type as 'localStorage' | 'sessionStorage' | 'cookie', 
        key, 
        oldValue: oldValue ?? undefined, 
        newValue, 
        action: action as 'set' | 'remove' | 'clear' 
      }
    });
  }

  // Utility Methods
  private captureElementInfo(element: Element): ElementInfo {

    const rect = element.getBoundingClientRect();
    
    return {
      selector: this.generateSelector(element),
      xpath: this.generateXPath(element),
      // textContent: element.textContent?.trim().substring(0, 100),
      attributes: this.extractAttributes(element),
      tagName: element.tagName.toLowerCase(),
      id: element.id || undefined,
      // className: element.className || undefined,
      boundingRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      parentSelector: element.parentElement ? this.generateSelector(element.parentElement) : undefined,
      // siblingIndex: Array.from(element.parentElement?.children || []).indexOf(element),
      isVisible: this.isElementVisible(element),
      // isInteractable: this.isElementInteractable(element),
    };
  }

  private generateSelector(element: Element): string {
    // Generate a robust CSS selector
    if (element.id) {
      return `#${element.id}`;
    }

    const path = [];
    let current = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      if (current.className && typeof current.className === 'string') {
        selector += `.${current.className.split(' ').join('.')}`;
      }
      
      // Add nth-child if needed for uniqueness
      const siblings = Array.from(current.parentElement?.children || [])
        .filter(sibling => sibling.tagName === current.tagName);
      
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
      
      path.unshift(selector);
      if (current.parentElement) {
        current = current.parentElement;
      } else {
        break;
      }
    }

    return path.join(' > ');
  }

  private generateXPath(element: Element): string {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }

    const path = [];
    let current = element;

    while (current && current !== document.body) {
      const tagName = current.tagName.toLowerCase();
      const siblings = Array.from(current.parentElement?.children || [])
        .filter(sibling => sibling.tagName === current.tagName);
      
      if (siblings.length === 1) {
        path.unshift(tagName);
      } else {
        const index = siblings.indexOf(current) + 1;
        path.unshift(`${tagName}[${index}]`);
      }
      
      if (current.parentElement) {
        current = current.parentElement;
      } else {
        break;
      }
    }

    return '/' + path.join('/');
  }

  private extractAttributes(element: Element): Record<string, string> {
    const attrs: Record<string, string> = {};
    for (const attr of Array.from(element.attributes)) {
      attrs[attr.name] = attr.value;
    }
    return attrs;
  }

  private extractHeaders(headers: Headers): Record<string, string> {
    const headerObj: Record<string, string> = {};
    headers.forEach((value, key) => {
      headerObj[key] = value;
    });
    return headerObj;
  }

  private normalizeHeaders(headers?: HeadersInit): Record<string, string> {
    if (!headers) return {};
    
    if (headers instanceof Headers) {
      return this.extractHeaders(headers);
    }
    
    if (Array.isArray(headers)) {
      const headerObj: Record<string, string> = {};
      headers.forEach(([key, value]) => {
        headerObj[key] = value;
      });
      return headerObj;
    }
    
    return headers as Record<string, string>;
  }

  private parseXHRHeaders(headerString: string): Record<string, string> {
    const headers: Record<string, string> = {};
    headerString.split('\r\n').forEach(line => {
      const [key, value] = line.split(': ');
      if (key && value) {
        headers[key] = value;
      }
    });
    return headers;
  }

  private isElementVisible(element: Element): boolean {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  private isElementInteractable(element: Element): boolean {
    const interactableTags = ['button', 'input', 'select', 'textarea', 'a'];
    return interactableTags.includes(element.tagName.toLowerCase()) || 
           element.hasAttribute('onclick') || 
           element.hasAttribute('tabindex');
  }

  private maskSensitiveData(value: string, inputType?: string): string {
    if (!value) return value;

    if (this.config.maskPasswords && inputType === 'password') {
      return '*'.repeat(value.length);
    }

    if (this.config.maskCreditCards && this.isCreditCard(value)) {
      return value.replace(/\d{4}/g, '****');
    }

    if (this.config.maskEmails && this.isEmail(value)) {
      const [local, domain] = value.split('@');
      return `${local.substring(0, 2)}***@${domain}`;
    }

    return value;
  }

  private isCreditCard(value: string): boolean {
    return /^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/.test(value);
  }

  private isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private captureViewport(): ViewportInfo {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };
  }

  private recordEvent(type: EventType, data: EventData): void {
    if (!this.activeSession) return;

    const event: RecordingEvent = {
      id: this.generateId(),
      timestamp: Date.now(),
      type,
      data,
      context: {
        url: window.location.href,
        viewport: this.captureViewport(),
        // timestamp: Date.now(),
        sessionTime: Date.now() - this.activeSession.startTime,
      },
    };

    this.activeSession.events.push(event);
    
    // Trigger event for UI updates
    window.dispatchEvent(new CustomEvent('recording:event', { detail: event }));
  }

  private saveSession(session: RecordingSession): void {
    const key = `recording_session_${session.id}`;
    localStorage.setItem(key, JSON.stringify(session));

    // Also save as JSON file
    this.exportSessionToJSON(session);
  }

  private exportSessionToJSON(session: RecordingSession): void {
    try {
      // Create comprehensive export data
      const exportData = {
        session: session,
        // mlContext: this.createMLContext(session),
        exportMetadata: {
          exportTime: new Date().toISOString(),
          version: '1.0.0',
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }
      };

      // Create downloadable JSON file
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Create download link
      const link = document.createElement('a');
      link.href = url;
      link.download = `recording-${session.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      URL.revokeObjectURL(url);
      
      console.log('📁 Session exported to JSON file:', link.download);
    } catch (error) {
      console.error('Failed to export session to JSON:', error);
    }
  }

  private createMLContext(session: RecordingSession): MLContext {
    // Convert events to ML steps
    const steps = session.events
      .filter(event => [
        EventType.CLICK, EventType.INPUT, EventType.FORM_SUBMIT, 
        EventType.SCROLL, EventType.KEY_DOWN, EventType.NAVIGATION
      ].includes(event.type))
      .map((event, index) => ({
        stepNumber: index + 1,
        action: event.type,
        target: event.data.element?.selector || 'unknown',
        value: event.data.value ? String(event.data.value) : undefined,
        context: event.context.url,
        timestamp: event.timestamp,
        coordinates: (event.data as any).coordinates,
        viewport: event.context.viewport,
      }));

    return {
      sessionId: session.id,
      task: session.name,
      steps,
      environment: {
        userAgent: session.userAgent,
        viewport: session.viewport,
        url: session.url,
        cookies: this.getCurrentCookies(),
        localStorage: this.getCurrentStorage('localStorage'),
        sessionStorage: this.getCurrentStorage('sessionStorage'),
      },
      metadata: {
        totalSteps: steps.length,
        duration: session.metadata.totalDuration,
        complexity: steps.length > 10 ? 'complex' : steps.length > 5 ? 'medium' : 'simple',
        tags: session.metadata.tags,
        success: true, // TODO: Determine success criteria
      },
    };
  }

  private getCurrentCookies(): Array<{ name: string; value: string; domain: string }> {
    return document.cookie.split(';')
      .map(cookie => cookie.trim())
      .filter(Boolean)
      .map(cookie => {
        const [name, value] = cookie.split('=').map(s => decodeURIComponent(s.trim()));
        return {
          name: name || '',
          value: value || '',
          domain: window.location.hostname,
        };
      });
  }

  private getCurrentStorage(storageType: 'localStorage' | 'sessionStorage'): Record<string, string> {
    const storage = storageType === 'localStorage' ? localStorage : sessionStorage;
    const data: Record<string, string> = {};
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && !key.startsWith('recording_session_')) { // Exclude recording data
        data[key] = storage.getItem(key) || '';
      }
    }
    return data;
  }


  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public API
  getActiveSession(): RecordingSession | null {
    return this.activeSession;
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  updateConfig(newConfig: Partial<RecordingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): RecordingConfig {
    return { ...this.config };
  }

  // Export to ML format
  exportToMLFormat(sessionId: string): MLContext | null {
    const session = this.loadSession(sessionId);
    if (!session) return null;

    // Convert events to ML steps
    const steps = session.events
      .filter(event => [EventType.CLICK, EventType.INPUT, EventType.FORM_SUBMIT].includes(event.type))
      .map((event, index) => ({
        stepNumber: index + 1,
        action: event.type,
        target: event.data.element?.selector || '',
        value: event.data.value ? String(event.data.value) : undefined,
        context: event.context.url,
        timestamp: event.timestamp,
      }));

    return {
      sessionId: session.id,
      task: session.name,
      steps,
      environment: {
        userAgent: session.userAgent,
        viewport: session.viewport,
        url: session.url,
        cookies: [], // TODO: Capture cookies
        localStorage: {},
        sessionStorage: {},
      },
      metadata: {
        totalSteps: steps.length,
        duration: session.metadata.totalDuration,
        complexity: steps.length > 10 ? 'complex' : steps.length > 5 ? 'medium' : 'simple',
        tags: session.metadata.tags,
        success: true, // TODO: Determine success criteria
      },
    };
  }

  private loadSession(sessionId: string): RecordingSession | null {
    const key = `recording_session_${sessionId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  }

  getAllSessions(): RecordingSession[] {
    const sessions: RecordingSession[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('recording_session_')) {
        const session = localStorage.getItem(key);
        if (session) {
          sessions.push(JSON.parse(session));
        }
      }
    }
    return sessions.sort((a, b) => b.startTime - a.startTime);
  }
}
