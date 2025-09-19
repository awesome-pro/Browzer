// src/preload/webview-preload.ts
import { ipcRenderer } from 'electron';

console.log('🔵[Webview Preload] Script loaded in:', window.location.href);
console.log('🔵[Webview Preload] ipcRenderer available:', typeof ipcRenderer !== 'undefined');

// Test IPC immediately when script loads
try {
  console.log('🔵[Webview Preload] Testing IPC...');
  ipcRenderer.send('webview-preload-test', {
    message: 'Webview preload loaded successfully',
    url: window.location.href,
    timestamp: Date.now()
  });
  console.log('🔵[Webview Preload] ✅ IPC test message sent');
} catch (error) {
  console.error('🔵[Webview Preload] ❌ IPC test failed:', error);
}

class WebviewRecordingEngine {
  private isRecording = false;
  private sessionId: string | null = null;
  private eventHandlers = new Map<string, EventListener>();
  private navigationObserver: MutationObserver | null = null;

  constructor() {
    this.init();
    console.log('🔵[Webview Preload] WebviewRecordingEngine initialized');
  }

  private init(): void {
    // Listen for recording commands from main process
    ipcRenderer.on('start-recording', (event, sessionId: string) => {
      console.log('🔵[Webview Preload] Received start-recording command:', sessionId);
      this.startRecording(sessionId);
    });

    ipcRenderer.on('stop-recording', () => {
      console.log('🔵[Webview Preload] Received stop-recording command');
      this.stopRecording();
    });

    // Send initial page context
    this.sendPageContext('load');
    
    // Test IPC communication
    console.log('🔵[Webview Preload] Testing IPC communication...');
    try {
      ipcRenderer.send('webview-preload-loaded', {
        url: window.location.href,
        timestamp: Date.now()
      });
      console.log('🔵[Webview Preload] IPC test message sent');
    } catch (error) {
      console.error('[Webview Preload] IPC communication failed:', error);
    }
  }

  private startRecording(sessionId: string): void {
    if (this.isRecording) {
      console.log('🔵[Webview Preload] Already recording, ignoring start command');
      return;
    }

    console.log('🔵[Webview Preload] Starting recording with session:', sessionId);
    this.isRecording = true;
    this.sessionId = sessionId;
    
    this.setupEventListeners();
    this.sendPageContext('recording-start');
  }

  private stopRecording(): void {
    if (!this.isRecording) {
      console.log('🔵[Webview Preload] Not recording, ignoring stop command');
      return;
    }

    console.log('🔵[Webview Preload] Stopping recording');
    this.isRecording = false;
    this.sessionId = null;
    
    this.removeEventListeners();
    this.sendPageContext('recording-stop');
  }

  private setupEventListeners(): void {
    console.log('🔵[Webview Preload] Setting up event listeners');
    
    const events = ['click', 'input', 'change', 'submit', 'focus', 'blur', 'keydown'];
    
    events.forEach(eventType => {
      const handler = (event: Event) => this.handleEvent(event, eventType);
      document.addEventListener(eventType, handler, true);
      this.eventHandlers.set(eventType, handler);
    });

    // Setup navigation detection
    this.setupNavigationDetection();

    // Setup network monitoring
    this.setupNetworkMonitoring();

    console.log('🔵[Webview Preload] Event listeners set up for events:', events);
  }

  private removeEventListeners(): void {
    console.log('🔵 [Webview Preload] Removing event listeners');
    
    this.eventHandlers.forEach((handler, eventType) => {
      document.removeEventListener(eventType, handler, true);
    });
    this.eventHandlers.clear();

    if (this.navigationObserver) {
      this.navigationObserver.disconnect();
      this.navigationObserver = null;
    }
  }

  private handleEvent(event: Event, eventType: string): void {
    if (!this.isRecording) return;

    const target = event.target as Element;
    if (!this.isSignificantEvent(event, target)) return;

    console.log('🔵[Webview Preload] Recording event:', eventType, 'on', target.tagName);

    const actionData = {
      type: eventType,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      target: this.captureElement(target),
      value: this.getElementValue(target, event),
      coordinates: this.getEventCoordinates(event),
      pageContext: this.getPageContext()
    };

    this.sendRecordingAction(actionData);
  }

  private isSignificantEvent(event: Event, target: Element ): boolean {
    if (!target) return false;
    
    // Skip events on script/style tags
    const tagName = target.tagName?.toLowerCase();
    if (['script', 'style', 'meta', 'head'].includes(tagName)) return false;

    // Focus on interactive elements
    const interactiveTags = ['input', 'button', 'select', 'textarea', 'a', 'form'];
    if (interactiveTags.includes(tagName)) return true;

    // Elements with event handlers
    if ((target as HTMLElement).onclick || target.getAttribute('tabindex')) return true;

    // Elements with interactive roles
    const role = target.getAttribute('role');
    if (['button', 'link', 'textbox', 'checkbox', 'radio'].includes(role || '')) return true;

    return false;
  }

  private captureElement(element: Element): any {
    const rect = element.getBoundingClientRect();
    
    return {
      tagName: element.tagName?.toLowerCase(),
      id: element.id,
      className: element.className,
      text: this.getElementText(element),
      selector: this.generateSelector(element),
      xpath: this.generateXPath(element),
      attributes: this.captureRelevantAttributes(element),
      boundingRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      },
      isVisible: this.isElementVisible(element)
    };
  }

  private getElementText(element: Element): string {
    // Get meaningful text content
    const htmlElement = element as HTMLElement;
    
    if ('value' in htmlElement && htmlElement.value !== undefined) {
      return htmlElement.value?.toString().substring(0, 100) || '';
    }
    
    const textContent = element.textContent?.trim();
    if (textContent) return textContent.substring(0, 100);
    
    const alt = element.getAttribute('alt');
    if (alt) return alt;
    
    const title = element.getAttribute('title');
    if (title) return title;
    
    return '';
  }

  private getElementValue(element: Element, event: Event): any {
    const htmlElement = element as HTMLInputElement;
    
    if (htmlElement.type === 'checkbox' || htmlElement.type === 'radio') {
      return htmlElement.checked;
    }
    
    if (element.tagName?.toLowerCase() === 'select') {
      const selectElement = element as HTMLSelectElement;
      return {
        value: selectElement.value,
        selectedText: selectElement.options[selectElement.selectedIndex]?.text
      };
    }
    
    if (event.type === 'input' || event.type === 'change') {
      return htmlElement.value;
    }
    
    return null;
  }

  private getEventCoordinates(event: Event): { x: number; y: number } | null {
    const mouseEvent = event as MouseEvent;
    if (mouseEvent.clientX !== undefined && mouseEvent.clientY !== undefined) {
      return {
        x: mouseEvent.clientX,
        y: mouseEvent.clientY
      };
    }
    return null;
  }

  private generateSelector(element: Element): string {
    if (element.id) return `#${element.id}`;
    
    // Use data attributes if available
    const testId = element.getAttribute('data-testid') || 
                   element.getAttribute('data-test') ||
                   element.getAttribute('data-cy');
    if (testId) return `[data-testid="${testId}"]`;

    // Build selector from tag + attributes
    let selector = element.tagName.toLowerCase();
    
    const className = element.className;
    if (className && typeof className === 'string') {
      const mainClass = className.split(' ')[0];
      selector += `.${mainClass}`;
    }
    
    return selector;
  }

  private generateXPath(element: Element): string {
    if (element.id) return `//*[@id="${element.id}"]`;
    
    const parts = [];
    let current = element;
    
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let tagName = current.tagName.toLowerCase();
      let index = 1;
      
      // Count preceding siblings with same tag
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.tagName.toLowerCase() === tagName) index++;
        sibling = sibling.previousElementSibling;
      }
      
      parts.unshift(`${tagName}[${index}]`);
      current = current.parentElement || current;
      
      // Stop at reasonable depth
      if (parts.length > 8) break;
    }
    
    return '/' + parts.join('/');
  }

  private captureRelevantAttributes(element: Element): Record<string, string> {
    const relevantAttrs = ['type', 'name', 'placeholder', 'role', 'aria-label', 'title'];
    const attrs: Record<string, string> = {};
    
    relevantAttrs.forEach(attr => {
      const value = element.getAttribute(attr);
      if (value) attrs[attr] = value;
    });
    
    return attrs;
  }

  private isElementVisible(element: Element): boolean {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           rect.width > 0 && rect.height > 0;
  }

  private getPageContext(): any {
    return {
      url: window.location.href,
      title: document.title,
      timestamp: Date.now(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY
      }
    };
  }

  private setupNavigationDetection(): void {
    let lastUrl = window.location.href;
    
    this.navigationObserver = new MutationObserver(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        console.log('🔵[Webview Preload] Navigation detected to:', currentUrl);
        this.sendPageContext('navigation');
      }
    });
    
    this.navigationObserver.observe(document.body, { 
      childList: true, 
      subtree: true 
    });
  }

  private setupNetworkMonitoring(): void {
    // Monitor fetch requests
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const startTime = Date.now();
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
      
      try {
        const response = await originalFetch(...args);
        
        if (this.isRecording && this.isSignificantRequest(url)) {
          this.sendNetworkEvent({
            type: 'fetch',
            url,
            method: args[1]?.method || 'GET',
            status: response.status,
            duration: Date.now() - startTime,
            timestamp: startTime
          });
        }
        
        return response;
      } catch (error) {
        if (this.isRecording) {
          this.sendNetworkEvent({
            type: 'fetch',
            url,
            method: args[1]?.method || 'GET',
            error: (error as Error).message,
            duration: Date.now() - startTime,
            timestamp: startTime
          });
        }
        throw error;
      }
    };
  }

  private isSignificantRequest(url: string): boolean {
    const skipPatterns = [
      'data:', 'blob:', 'chrome-extension:',
      '.css', '.js', '.map', '.woff', '.woff2',
      'favicon.ico', 'analytics', 'tracking'
    ];
    
    return !skipPatterns.some(pattern => url.includes(pattern));
  }

  private sendRecordingAction(actionData: any): void {
    try {
      console.log('🔵[Webview Preload] Sending recording action:', actionData.type);
      ipcRenderer.send('recording-action', actionData);
    } catch (error) {
      console.error('[Webview Preload] Failed to send recording action:', error);
    }
  }

  private sendPageContext(subtype: string): void {
    const contextData = {
      subtype,
      ...this.getPageContext(),
      sessionId: this.sessionId
    };

    try {
      console.log('🔵[Webview Preload] Sending page context:', subtype);
      ipcRenderer.send('recording-context', contextData);
    } catch (error) {
      console.error('[Webview Preload] Failed to send page context:', error);
    }
  }

  private sendNetworkEvent(eventData: any): void {
    try {
      console.log('🔵[Webview Preload] Sending network event:', eventData.type, eventData.url);
      ipcRenderer.send('recording-network', {
        ...eventData,
        sessionId: this.sessionId,
        pageContext: this.getPageContext()
      });
    } catch (error) {
      console.error('[Webview Preload] Failed to send network event:', error);
    }
  }
}

// Initialize the recording engine when the page loads
if (typeof window !== 'undefined') {
  console.log('🔵[Webview Preload] Initializing recording engine...');
  const recorder = new WebviewRecordingEngine();
  
  // Make it globally accessible for debugging
  (window as any).__webviewRecorder = recorder;
  
  console.log('🔵[Webview Preload] Recording engine ready');
}