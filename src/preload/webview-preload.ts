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
  private loadingObserver: MutationObserver | null = null;
  
  // Text input aggregation
  private textInputBuffer = new Map<Element, {
    value: string;
    startTime: number;
    timeout: NodeJS.Timeout | null;
  }>();
  private readonly TEXT_INPUT_DEBOUNCE = 800; // Reduced to 800ms for faster text capture
  
  // Loading and dynamic content detection
  private pageLoadingState = {
    isLoading: false,
    loadStartTime: 0,
    searchResultsDetected: false,
    lastDOMChangeTime: 0
  };
  
  // Enhanced element tracking
  private clickedElements = new Set<string>();
  private lastInteractionTime = 0;

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
    this.setupLoadingDetection();
    this.setupSearchResultsDetection();
    this.sendPageContext('recording-start');
  }

  private stopRecording(): void {
    if (!this.isRecording) {
      console.log('🔵[Webview Preload] Not recording, ignoring stop command');
      return;
    }

    console.log('🔵[Webview Preload] Stopping recording');
    
    // Flush any pending text inputs
    this.textInputBuffer.forEach((buffer, target) => {
      if (buffer.timeout) {
        clearTimeout(buffer.timeout);
      }
      if (buffer.value.trim()) {
        this.flushTextInput(target);
      }
    });
    this.textInputBuffer.clear();
    
    this.isRecording = false;
    this.sessionId = null;
    
    this.removeEventListeners();
    this.sendPageContext('recording-stop');
  }

  private setupEventListeners(): void {
    console.log('🔵[Webview Preload] Setting up event listeners');
    
    // Focus on semantic, high-level events only
    const events = ['click', 'input', 'change', 'submit', 'keydown'];
    
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
    
    if (this.loadingObserver) {
      this.loadingObserver.disconnect();
      this.loadingObserver = null;
    }
  }

  private handleEvent(event: Event, eventType: string): void {
    if (!this.isRecording) return;

    const target = event.target as Element;
    if (!this.isSignificantEvent(event, target)) return;

    // Handle text input aggregation
    if (eventType === 'input' || eventType === 'keydown') {
      this.handleTextInputEvent(event, target, eventType);
      return;
    }

    // Handle other semantic events
    if (this.shouldRecordEvent(eventType, target, event)) {
      console.log('🔵[Webview Preload] Recording semantic event:', eventType, 'on', target.tagName);

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
  }

  private handleTextInputEvent(event: Event, target: Element, eventType: string): void {
    const inputElement = target as HTMLInputElement | HTMLTextAreaElement;
    
    // Handle special keys
    if (eventType === 'keydown') {
      const keyEvent = event as KeyboardEvent;
      if (keyEvent.key === 'Enter') {
        // Flush current text input before recording Enter
        if (this.textInputBuffer.has(target)) {
          this.flushTextInput(target);
        }
        // Record Enter as navigation action
        this.recordKeyAction(target, 'Enter');
        return;
      }
      // Skip other keydown events - we'll handle via input events
      return;
    }

    // Get current value - ensure we get the most recent value
    const currentValue = inputElement.value || '';
    
    // Initialize or update buffer
    if (!this.textInputBuffer.has(target)) {
      this.textInputBuffer.set(target, {
        value: currentValue,
        startTime: Date.now(),
        timeout: null
      });
    }

    const buffer = this.textInputBuffer.get(target)!;
    // Always update with the latest value
    buffer.value = currentValue;

    // Clear existing timeout
    if (buffer.timeout) {
      clearTimeout(buffer.timeout);
    }

    // Set new debounce timeout - increased to ensure we capture full text
    buffer.timeout = setTimeout(() => {
      this.flushTextInput(target);
    }, this.TEXT_INPUT_DEBOUNCE);
  }

  private recordKeyAction(target: Element, key: string): void {
    console.log('🔵[Webview Preload] Recording key action:', key);

    const actionData = {
      type: 'keypress',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      target: this.captureElement(target),
      value: key,
      coordinates: null,
      pageContext: this.getPageContext()
    };

    this.sendRecordingAction(actionData);
  }

  private flushTextInput(target: Element): void {
    const buffer = this.textInputBuffer.get(target);
    if (!buffer) {
      return;
    }

    const currentValue = (target as HTMLInputElement | HTMLTextAreaElement).value || '';
    const finalValue = currentValue || buffer.value;
    
    // Only skip if completely empty
    if (!finalValue.trim()) {
      this.textInputBuffer.delete(target);
      return;
    }

    console.log('🔵[Webview Preload] Recording aggregated text input:', finalValue);

    const actionData = {
      type: 'text_input',
      timestamp: buffer.startTime,
      sessionId: this.sessionId,
      target: this.captureElement(target),
      value: finalValue,
      coordinates: null,
      pageContext: this.getPageContext()
    };

    this.sendRecordingAction(actionData);
    this.textInputBuffer.delete(target);
  }

  private shouldRecordEvent(eventType: string, target: Element, event: Event): boolean {
    const tagName = target.tagName?.toLowerCase();

    switch (eventType) {
      case 'click':
        // Record all meaningful clicks - be more inclusive for search results
        if (this.isClickableElement(target)) {
          return true;
        }
        
        // Special handling for Google search results
        if (window.location.hostname.includes('google.com')) {
          // Check if click is within a search result
          const searchResult = target.closest('.g, .tF2Cxc, .rc');
          if (searchResult) {
            return true;
          }
        }
        
        return false;
      
      case 'change':
        // Record select, checkbox, radio changes
        return ['select', 'input'].includes(tagName) && 
               !['text', 'email', 'password', 'search', 'url'].includes((target as HTMLInputElement).type);
      
      case 'submit':
        // Always record form submissions
        return tagName === 'form';
      
      default:
        return false;
    }
  }

  private isClickableElement(target: Element): boolean {
    const tagName = target.tagName?.toLowerCase();
    const role = target.getAttribute('role');
    const className = target.className?.toString().toLowerCase() || '';
    
    // Always record clicks on these elements
    const alwaysClickable = ['a', 'button', 'select', 'option'];
    if (alwaysClickable.includes(tagName)) return true;
    
    // Input elements that are clickable
    if (tagName === 'input') {
      const inputType = (target as HTMLInputElement).type;
      return ['button', 'submit', 'checkbox', 'radio', 'file'].includes(inputType);
    }
    
    // Elements with interactive roles
    const interactiveRoles = ['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem', 'option'];
    if (interactiveRoles.includes(role || '')) return true;
    
    // Elements with click handlers or tabindex
    if ((target as HTMLElement).onclick || target.hasAttribute('tabindex')) return true;
    
    // Common clickable class patterns
    const clickablePatterns = ['btn', 'button', 'link', 'clickable', 'toggle', 'menu', 'nav', 'tab'];
    if (clickablePatterns.some(pattern => className.includes(pattern))) return true;
    
    // Elements with cursor pointer style
    const computedStyle = window.getComputedStyle(target);
    if (computedStyle.cursor === 'pointer') return true;
    
    // Check if parent is clickable (for nested elements like icons in buttons)
    const parent = target.parentElement;
    if (parent && parent !== target) {
      const parentTag = parent.tagName?.toLowerCase();
      const parentRole = parent.getAttribute('role');
      if (['a', 'button'].includes(parentTag) || 
          ['button', 'link'].includes(parentRole || '')) {
        return true;
      }
    }
    
    return false;
  }

  private isInteractiveElement(target: Element): boolean {
    const tagName = target.tagName?.toLowerCase();
    const interactiveTags = ['button', 'a', 'select', 'option'];
    
    if (interactiveTags.includes(tagName)) return true;
    
    // Input elements that aren't text inputs
    if (tagName === 'input') {
      const inputType = (target as HTMLInputElement).type;
      return ['button', 'submit', 'checkbox', 'radio', 'file'].includes(inputType);
    }
    
    // Elements with interactive roles
    const role = target.getAttribute('role');
    if (['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem'].includes(role || '')) return true;
    
    // Elements with click handlers
    return !!(target as HTMLElement).onclick || target.hasAttribute('tabindex');
  }

  private isSignificantEvent(event: Event, target: Element ): boolean {
    if (!target) return false;
    
    // Skip events on script/style tags
    const tagName = target.tagName?.toLowerCase();
    if (['script', 'style', 'meta', 'head'].includes(tagName)) return false;

    // Focus on interactive elements and form inputs
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
    const tagName = element.tagName?.toLowerCase();
    
    return {
      tagName,
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
      isVisible: this.isElementVisible(element),
      // Enhanced information for better model understanding
      elementType: this.getElementType(element),
      purpose: this.inferElementPurpose(element),
      context: this.getElementContext(element),
      href: tagName === 'a' ? element.getAttribute('href') : null,
      target: tagName === 'a' ? element.getAttribute('target') : null,
      // Enhanced targeting information
      targetUrl: this.getTargetUrl(element),
      uniqueIdentifiers: this.generateUniqueIdentifiers(element),
      semanticRole: this.getSemanticRole(element),
      interactionContext: this.getInteractionContext(element),
      parentContext: this.getParentElementContext(element)
    };
  }

  private getElementType(element: Element): string {
    const tagName = element.tagName?.toLowerCase();
    const type = element.getAttribute('type');
    const role = element.getAttribute('role');
    
    if (role) return role;
    
    switch (tagName) {
      case 'a': return 'link';
      case 'button': return 'button';
      case 'input':
        switch (type) {
          case 'submit': return 'submit_button';
          case 'button': return 'button';
          case 'checkbox': return 'checkbox';
          case 'radio': return 'radio_button';
          case 'search': return 'search_input';
          case 'email': return 'email_input';
          case 'password': return 'password_input';
          case 'text':
          default: return 'text_input';
        }
      case 'textarea': return 'text_area';
      case 'select': return 'dropdown';
      case 'form': return 'form';
      default: return tagName;
    }
  }

  private inferElementPurpose(element: Element): string {
    const text = this.getElementText(element).toLowerCase();
    const tagName = element.tagName?.toLowerCase();
    const className = element.className?.toString().toLowerCase() || '';
    const id = element.id?.toLowerCase() || '';
    
    // Navigation purposes
    if (tagName === 'a') {
      const href = element.getAttribute('href');
      if (href) {
        if (href.startsWith('#')) return 'in_page_navigation';
        if (href.startsWith('http') || href.startsWith('//')) return 'external_navigation';
        return 'internal_navigation';
      }
    }
    
    // Button purposes
    if (tagName === 'button' || (tagName === 'input' && ['button', 'submit'].includes(element.getAttribute('type') || ''))) {
      if (text.includes('submit') || text.includes('send') || text.includes('save')) return 'form_submission';
      if (text.includes('search') || className.includes('search')) return 'search';
      if (text.includes('login') || text.includes('sign in')) return 'authentication';
      if (text.includes('toggle') || text.includes('switch') || className.includes('toggle')) return 'toggle_setting';
      if (text.includes('menu') || text.includes('nav') || className.includes('menu')) return 'navigation_menu';
      if (text.includes('close') || text.includes('cancel')) return 'dismiss_action';
      return 'user_action';
    }
    
    // Input purposes
    if (['input', 'textarea'].includes(tagName)) {
      const type = element.getAttribute('type');
      const name = element.getAttribute('name')?.toLowerCase() || '';
      const placeholder = element.getAttribute('placeholder')?.toLowerCase() || '';
      
      if (type === 'search' || name.includes('search') || placeholder.includes('search')) return 'search_input';
      if (type === 'email' || name.includes('email') || placeholder.includes('email')) return 'email_input';
      if (type === 'password' || name.includes('password')) return 'password_input';
      if (name.includes('name') || placeholder.includes('name')) return 'name_input';
      return 'data_input';
    }
    
    return 'interactive_element';
  }

  private getElementContext(element: Element): string {
    // Find meaningful parent context
    let parent = element.parentElement;
    
    while (parent) {
      const parentTag = parent.tagName?.toLowerCase();
      const parentId = parent.id;
      const parentClass = parent.className?.toString() || '';
      
      // Check for semantic HTML elements
      if (['nav', 'header', 'footer', 'main', 'article', 'section', 'aside'].includes(parentTag)) {
        return `in_${parentTag}`;
      }
      
      // Check for meaningful IDs
      if (parentId) {
        const id = parentId.toLowerCase();
        if (id.includes('nav') || id.includes('menu')) return 'in_navigation';
        if (id.includes('header')) return 'in_header';
        if (id.includes('footer')) return 'in_footer';
        if (id.includes('sidebar')) return 'in_sidebar';
        if (id.includes('content') || id.includes('main')) return 'in_main_content';
        if (id.includes('form')) return 'in_form';
      }
      
      // Check for meaningful classes
      if (parentClass) {
        const className = parentClass.toLowerCase();
        if (className.includes('nav') || className.includes('menu')) return 'in_navigation';
        if (className.includes('header')) return 'in_header';
        if (className.includes('footer')) return 'in_footer';
        if (className.includes('sidebar')) return 'in_sidebar';
        if (className.includes('content') || className.includes('main')) return 'in_main_content';
        if (className.includes('form')) return 'in_form';
        if (className.includes('search')) return 'in_search_area';
      }
      
      parent = parent.parentElement;
    }
    
    return 'on_page';
  }

  private getElementText(element: Element): string {
    const htmlElement = element as HTMLElement;
    const tagName = element.tagName.toLowerCase();
    
    // For form inputs, get the value
    if ('value' in htmlElement && htmlElement.value !== undefined && htmlElement.value !== '') {
      return htmlElement.value?.toString().substring(0, 100) || '';
    }
    
    // For links, prioritize meaningful text
    if (tagName === 'a') {
      const linkText = element.textContent?.trim();
      if (linkText && linkText.length > 0) {
        return linkText.substring(0, 100);
      }
      const href = element.getAttribute('href');
      if (href) {
        try {
          const url = new URL(href, window.location.href);
          return url.hostname;
        } catch (e) {
          return href.substring(0, 50);
        }
      }
    }
    
    // For buttons, get text content or aria-label
    if (['button', 'input'].includes(tagName)) {
      const buttonText = element.textContent?.trim();
      if (buttonText && buttonText.length > 0) {
        return buttonText.substring(0, 50);
      }
      
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel.substring(0, 50);
      
      const value = element.getAttribute('value');
      if (value) return value.substring(0, 50);
      
      const title = element.getAttribute('title');
      if (title) return title.substring(0, 50);
    }
    
    // For other elements, get text content
    const textContent = element.textContent?.trim();
    if (textContent && textContent.length > 0) {
      return textContent.substring(0, 100);
    }
    
    // Fallback to attributes
    const alt = element.getAttribute('alt');
    if (alt) return alt.substring(0, 50);
    
    const title = element.getAttribute('title');
    if (title) return title.substring(0, 50);
    
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) return `[${placeholder}]`;
    
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
    // Priority 1: ID (most reliable)
    if (element.id) return `#${element.id}`;
    
    // Priority 2: Data attributes (test-friendly)
    const testId = element.getAttribute('data-testid') || 
                   element.getAttribute('data-test') ||
                   element.getAttribute('data-cy');
    if (testId) return `[data-testid="${testId}"]`;

    // Priority 3: Semantic attributes for form elements
    const tagName = element.tagName.toLowerCase();
    if (['input', 'textarea', 'select'].includes(tagName)) {
      const name = element.getAttribute('name');
      const type = element.getAttribute('type');
      if (name) return `${tagName}[name="${name}"]`;
      if (type) return `${tagName}[type="${type}"]`;
    }

    // Priority 4: Links with href
    if (tagName === 'a') {
      const href = element.getAttribute('href');
      if (href) {
        // For external links, use href
        if (href.startsWith('http') || href.startsWith('//')) {
          try {
            const url = new URL(href, window.location.href);
            return `a[href*="${url.hostname}"]`;
          } catch (e) {
            return `a[href="${href}"]`;
          }
        }
        // For internal links, use full href
        return `a[href="${href}"]`;
      }
    }

    // Priority 5: Buttons with meaningful text
    if (['button', 'input'].includes(tagName)) {
      const buttonText = element.textContent?.trim();
      const value = element.getAttribute('value');
      const ariaLabel = element.getAttribute('aria-label');
      
      if (buttonText && buttonText.length > 0 && buttonText.length < 50) {
        return `${tagName}:contains("${buttonText}")`;
      }
      if (value && value.length < 50) {
        return `${tagName}[value="${value}"]`;
      }
      if (ariaLabel) {
        return `${tagName}[aria-label="${ariaLabel}"]`;
      }
    }

    // Priority 6: Role-based selectors
    const role = element.getAttribute('role');
    if (role) {
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) {
        return `[role="${role}"][aria-label="${ariaLabel}"]`;
      }
      return `[role="${role}"]`;
    }

    // Priority 7: Meaningful class-based selectors
    const className = element.className;
    if (className && typeof className === 'string') {
      const classes = className.split(' ').filter(cls => 
        cls.length > 0 && 
        !cls.match(/^(css-|sc-|emotion-|chakra-|ant-|mui-)/) && // Skip generated CSS classes
        !cls.match(/^[a-z0-9]{6,}$/) // Skip hash-like classes
      );
      
      if (classes.length > 0) {
        // Use the most semantic class
        const semanticClasses = classes.filter(cls => 
          cls.includes('button') || cls.includes('link') || cls.includes('nav') || 
          cls.includes('menu') || cls.includes('toggle') || cls.includes('search') ||
          cls.includes('submit') || cls.includes('primary') || cls.includes('secondary')
        );
        
        if (semanticClasses.length > 0) {
          return `${tagName}.${semanticClasses[0]}`;
        }
        return `${tagName}.${classes[0]}`;
      }
    }

    // Priority 8: Position-based selector with context
    return this.generateContextualSelector(element);
  }

  private generateContextualSelector(element: Element): string {
    const tagName = element.tagName.toLowerCase();
    
    // Try to find meaningful parent context
    let parent = element.parentElement;
    let contextParts = [tagName];
    
    while (parent && contextParts.length < 3) {
      const parentTag = parent.tagName.toLowerCase();
      const parentId = parent.id;
      const parentClass = parent.className;
      
      if (parentId) {
        contextParts.unshift(`#${parentId}`);
        break;
      }
      
      if (parentClass && typeof parentClass === 'string') {
        const meaningfulClasses = parentClass.split(' ').filter(cls => 
          cls.length > 0 && cls.length < 20 && 
          !cls.match(/^[a-z0-9]{6,}$/) && 
          (cls.includes('nav') || cls.includes('menu') || cls.includes('header') || 
           cls.includes('footer') || cls.includes('content') || cls.includes('main'))
        );
        
        if (meaningfulClasses.length > 0) {
          contextParts.unshift(`${parentTag}.${meaningfulClasses[0]}`);
          break;
        }
      }
      
      if (['nav', 'header', 'footer', 'main', 'article', 'section'].includes(parentTag)) {
        contextParts.unshift(parentTag);
        break;
      }
      
      parent = parent.parentElement;
    }
    
    return contextParts.join(' ');
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
    let lastTitle = document.title;
    
    // Monitor URL changes (for SPAs and hash changes)
    this.navigationObserver = new MutationObserver(() => {
      const currentUrl = window.location.href;
      const currentTitle = document.title;
      
      if (currentUrl !== lastUrl || currentTitle !== lastTitle) {
        console.log('🔵[Webview Preload] Navigation detected:', {
          from: lastUrl,
          to: currentUrl,
          titleChanged: lastTitle !== currentTitle
        });
        
        this.recordNavigationEvent(lastUrl, currentUrl, currentTitle);
        lastUrl = currentUrl;
        lastTitle = currentTitle;
      }
    });
    
    this.navigationObserver.observe(document, { 
      childList: true, 
      subtree: true,
      attributes: true,
      attributeFilter: ['title']
    });

    // Also listen for popstate events (back/forward navigation)
    window.addEventListener('popstate', (event) => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        console.log('🔵[Webview Preload] Popstate navigation detected:', currentUrl);
        this.recordNavigationEvent(lastUrl, currentUrl, document.title);
        lastUrl = currentUrl;
      }
    });

    // Listen for hashchange events (in-page navigation)
    window.addEventListener('hashchange', (event) => {
      console.log('🔵[Webview Preload] Hash navigation detected:', {
        oldURL: event.oldURL,
        newURL: event.newURL
      });
      this.recordNavigationEvent(event.oldURL, event.newURL, document.title);
    });
  }

  private recordNavigationEvent(fromUrl: string, toUrl: string, title: string): void {
    if (!this.isRecording) return;

    const navigationType = this.determineNavigationType(fromUrl, toUrl);
    
    const actionData = {
      type: 'navigation',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      target: {
        tagName: 'page',
        id: '',
        className: '',
        text: title,
        selector: '',
        xpath: '',
        attributes: {},
        boundingRect: { x: 0, y: 0, width: 0, height: 0 },
        isVisible: true,
        elementType: 'page',
        purpose: navigationType,
        context: 'page_navigation',
        href: toUrl,
        target: null
      },
      value: {
        fromUrl,
        toUrl,
        title,
        navigationType
      },
      coordinates: null,
      pageContext: this.getPageContext()
    };

    this.sendRecordingAction(actionData);
  }

  private determineNavigationType(fromUrl: string, toUrl: string): string {
    try {
      const fromUrlObj = new URL(fromUrl);
      const toUrlObj = new URL(toUrl);
      
      // Same page, different hash
      if (fromUrlObj.pathname === toUrlObj.pathname && fromUrlObj.search === toUrlObj.search) {
        if (fromUrlObj.hash !== toUrlObj.hash) {
          return 'in_page_navigation';
        }
      }
      
      // Same domain
      if (fromUrlObj.hostname === toUrlObj.hostname) {
        return 'internal_navigation';
      }
      
      // Different domain
      return 'external_navigation';
    } catch (e) {
      return 'navigation';
    }
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

  // Enhanced detection methods
  private setupLoadingDetection(): void {
    // Track page loading states
    this.pageLoadingState.isLoading = document.readyState !== 'complete';
    this.pageLoadingState.loadStartTime = Date.now();

    // Listen for readyState changes
    document.addEventListener('readystatechange', () => {
      if (document.readyState === 'complete' && this.pageLoadingState.isLoading) {
        this.recordLoadingComplete();
      }
    });

    // Setup DOM change observer for dynamic content
    this.loadingObserver = new MutationObserver((mutations) => {
      this.pageLoadingState.lastDOMChangeTime = Date.now();
      this.handleDOMChanges(mutations);
    });

    this.loadingObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-loaded', 'aria-busy']
    });
  }

  private setupSearchResultsDetection(): void {
    // Detect Google search results specifically
    if (window.location.hostname.includes('google.com')) {
      // Wait for search results to load with better detection
      const checkForResults = () => {
        // Look for actual search result elements
        const resultsSelectors = [
          '.g:not(.g-blk)', // Standard Google results
          '.tF2Cxc', // New Google result format
          '.rc', // Classic format
          '[data-ved]' // Any element with Google tracking
        ];
        
        let hasResults = false;
        for (const selector of resultsSelectors) {
          const results = document.querySelectorAll(selector);
          if (results.length > 0) {
            hasResults = true;
            break;
          }
        }
        
        const searchBox = document.querySelector('input[name="q"], textarea[name="q"]') as HTMLInputElement | HTMLTextAreaElement;
        
        if (hasResults && !this.pageLoadingState.searchResultsDetected) {
          this.pageLoadingState.searchResultsDetected = true;
          this.recordSearchResultsLoaded(searchBox?.value || '');
        }
      };

      // Check multiple times to catch dynamic loading
      const checkTimes = [100, 500, 1000, 2000, 3000];
      checkTimes.forEach(delay => {
        setTimeout(checkForResults, delay);
      });
    }
  }

  private recordLoadingComplete(): void {
    if (!this.isRecording) return;

    const loadTime = Date.now() - this.pageLoadingState.loadStartTime;
    
    const actionData = {
      type: 'page_load_complete',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      target: {
        tagName: 'page',
        id: '',
        className: '',
        text: document.title,
        selector: '',
        xpath: '',
        attributes: {},
        boundingRect: { x: 0, y: 0, width: 0, height: 0 },
        isVisible: true,
        elementType: 'page',
        purpose: 'page_loading',
        context: 'page_load_complete',
        href: null,
        target: null,
        targetUrl: window.location.href,
        uniqueIdentifiers: [],
        semanticRole: 'page',
        interactionContext: 'page_navigation',
        parentContext: null
      },
      value: `Page loaded in ${loadTime}ms - ${window.location.href}`,
      coordinates: null,
      pageContext: this.getPageContext()
    };

    this.sendRecordingAction(actionData);
    this.pageLoadingState.isLoading = false;
  }

  private recordSearchResultsLoaded(searchQuery: string): void {
    if (!this.isRecording) return;

    // More accurate Google search results detection
    let resultsCount = 0;
    
    // Try different selectors for Google search results
    const googleResultSelectors = [
      '.g:not(.g-blk)', // Standard Google results (excluding knowledge panels)
      '.tF2Cxc', // New Google result format
      '.rc', // Classic Google result format
      '[data-ved]' // Elements with ved attribute (Google tracking)
    ];
    
    for (const selector of googleResultSelectors) {
      const results = document.querySelectorAll(selector);
      if (results.length > resultsCount) {
        resultsCount = results.length;
      }
    }
    
    // Fallback: check for result stats
    const resultStats = document.querySelector('#result-stats');
    let estimatedCount = resultsCount;
    if (resultStats) {
      const statsText = resultStats.textContent || '';
      const match = statsText.match(/About ([\d,]+) results/);
      if (match) {
        estimatedCount = parseInt(match[1].replace(/,/g, ''), 10);
      }
    }
    
    const actionData = {
      type: 'search_results_loaded',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      target: {
        tagName: 'search-results',
        id: 'search',
        className: 'search-results',
        text: `${resultsCount} results for "${searchQuery}"`,
        selector: '#search, #rso',
        xpath: '//*[@id="search"]',
        attributes: {},
        boundingRect: { x: 0, y: 0, width: 0, height: 0 },
        isVisible: true,
        elementType: 'search_results',
        purpose: 'search_results_display',
        context: 'search_results_loaded',
        href: null,
        target: null,
        targetUrl: window.location.href,
        uniqueIdentifiers: ['#search', '#rso'],
        semanticRole: 'search_results',
        interactionContext: 'search_results',
        parentContext: null
      },
      value: `Found ${resultsCount} search results (estimated: ${estimatedCount}) for "${searchQuery}"`,
      coordinates: null,
      pageContext: this.getPageContext()
    };

    this.sendRecordingAction(actionData);
  }

  private handleDOMChanges(mutations: MutationRecord[]): void {
    if (!this.isRecording) return;

    let significantChange = false;
    
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            if (this.isSignificantContent(element)) {
              significantChange = true;
            }
          }
        });
      }
    }

    if (significantChange) {
      this.recordDynamicContentChange();
    }
  }

  private isSignificantContent(element: Element): boolean {
    const tagName = element.tagName?.toLowerCase();
    const className = element.className?.toString().toLowerCase() || '';
    
    // Google search results
    if (className.includes('g') && tagName === 'div') return true;
    if (className.includes('result') || className.includes('search-result')) return true;
    
    return ['article', 'main', 'section'].includes(tagName) ||
           className.includes('content') || className.includes('results');
  }

  private recordDynamicContentChange(): void {
    if (!this.isRecording) return;

    const now = Date.now();
    // Increase debounce time to reduce noise
    if (now - this.lastInteractionTime < 2000) return;
    this.lastInteractionTime = now;

    // Determine what type of content loaded
    let contentType = 'unknown';
    let contentDescription = 'Dynamic content loaded';
    
    // Check for specific content types
    if (window.location.hostname.includes('google.com')) {
      const searchResults = document.querySelectorAll('.g:not(.g-blk), .tF2Cxc');
      if (searchResults.length > 0) {
        contentType = 'search_results';
        contentDescription = `Google search results (${searchResults.length} results)`;
      }
    } else if (window.location.hostname.includes('amazon.com')) {
      const productResults = document.querySelectorAll('[data-component-type="s-search-result"]');
      if (productResults.length > 0) {
        contentType = 'product_results';
        contentDescription = `Amazon product results (${productResults.length} products)`;
      }
    }
    
    // Only record if we can identify specific content or if it's taking significant time
    const loadTime = now - this.pageLoadingState.loadStartTime;
    if (contentType === 'unknown' && loadTime < 1000) {
      return; // Skip recording minor dynamic changes
    }

    const actionData = {
      type: 'dynamic_content_loaded',
      timestamp: now,
      sessionId: this.sessionId,
      target: {
        tagName: 'dynamic-content',
        id: '',
        className: 'dynamic-content',
        text: contentDescription,
        selector: '',
        xpath: '',
        attributes: {},
        boundingRect: { x: 0, y: 0, width: 0, height: 0 },
        isVisible: true,
        elementType: 'dynamic_content',
        purpose: 'content_loading',
        context: 'dynamic_content_change',
        href: null,
        target: null,
        targetUrl: window.location.href,
        uniqueIdentifiers: [],
        semanticRole: 'dynamic_content',
        interactionContext: contentType,
        parentContext: null
      },
      value: `${contentDescription} loaded in ${loadTime}ms on ${window.location.href}`,
      coordinates: null,
      pageContext: this.getPageContext()
    };

    this.sendRecordingAction(actionData);
  }

  private getTargetUrl(element: Element): string | null {
    const tagName = element.tagName?.toLowerCase();
    
    if (tagName === 'a') {
      const href = element.getAttribute('href');
      if (href) {
        try {
          return new URL(href, window.location.href).href;
        } catch (e) {
          return href;
        }
      }
    }
    
    const parentLink = element.closest('a');
    if (parentLink) {
      const href = parentLink.getAttribute('href');
      if (href) {
        try {
          return new URL(href, window.location.href).href;
        } catch (e) {
          return href;
        }
      }
    }
    
    return null;
  }

  private generateUniqueIdentifiers(element: Element): string[] {
    const identifiers: string[] = [];
    
    if (element.id) {
      identifiers.push(`#${element.id}`);
    }
    
    const testId = element.getAttribute('data-testid') || 
                   element.getAttribute('data-test') ||
                   element.getAttribute('data-cy');
    if (testId) {
      identifiers.push(`[data-testid="${testId}"]`);
    }
    
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.length < 50) {
      identifiers.push(`[aria-label="${ariaLabel}"]`);
    }
    
    const text = this.getElementText(element);
    if (text && text.length > 2 && text.length < 50) {
      const tagName = element.tagName.toLowerCase();
      if (['button', 'a', 'span'].includes(tagName)) {
        identifiers.push(`${tagName}:contains("${text.replace(/"/g, '\\"')}")`);
      }
    }
    
    return identifiers;
  }

  private getSemanticRole(element: Element): string {
    const explicitRole = element.getAttribute('role');
    if (explicitRole) return explicitRole;
    
    const tagName = element.tagName.toLowerCase();
    const type = element.getAttribute('type');
    
    switch (tagName) {
      case 'button': return 'button';
      case 'a': return element.getAttribute('href') ? 'link' : 'button';
      case 'input':
        switch (type) {
          case 'submit': return 'submit-button';
          case 'button': return 'button';
          case 'search': return 'search-input';
          default: return 'text-input';
        }
      case 'select': return 'dropdown';
      default: return 'interactive-element';
    }
  }

  private getInteractionContext(element: Element): string {
    const contexts: string[] = [];
    
    if (element.closest('nav, .nav, [role="navigation"]')) {
      contexts.push('navigation');
    }
    
    const form = element.closest('form');
    if (form) {
      const formClass = form.className?.toString().toLowerCase() || '';
      if (formClass.includes('search')) {
        contexts.push('search-form');
      } else {
        contexts.push('form');
      }
    }
    
    // Enhanced search result detection
    if (window.location.hostname.includes('google.com')) {
      if (element.closest('.g:not(.g-blk), .tF2Cxc, .rc')) {
        contexts.push('google-search-result');
      } else if (element.closest('#search, #rso')) {
        contexts.push('search-results-area');
      }
    } else if (element.closest('.g, .result, .search-result')) {
      contexts.push('search-result');
    }
    
    // Check for Amazon product results
    if (window.location.hostname.includes('amazon.com')) {
      if (element.closest('[data-component-type="s-search-result"]')) {
        contexts.push('amazon-product-result');
      }
    }
    
    return contexts.join(', ') || 'page';
  }

  private getParentElementContext(element: Element): any {
    const parent = element.parentElement;
    if (!parent) return null;
    
    return {
      tagName: parent.tagName.toLowerCase(),
      id: parent.id || null,
      className: parent.className?.toString() || null,
      role: this.getSemanticRole(parent)
    };
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