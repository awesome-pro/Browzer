// src/preload/webview-preload.ts
import { ipcRenderer } from 'electron';

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
  private readonly TEXT_INPUT_DEBOUNCE = 1600; // Reduced to 800ms for faster text capture
  
  // Loading and dynamic content detection
  private pageLoadingState = {
    isLoading: false,
    loadStartTime: 0,
    searchResultsDetected: false,
    lastDOMChangeTime: 0
  };
  

  constructor() {
    this.init();
  }

  private init(): void {
    // Listen for recording commands from main process
    ipcRenderer.on('start-recording', (event, sessionId: string) => {
      this.startRecording(sessionId);
    });

    ipcRenderer.on('stop-recording', () => {
      this.stopRecording();
    });

    // Send initial page context
    this.sendPageContext('load');
    
    // Test IPC communication
    try {
      ipcRenderer.send('webview-preload-loaded', {
        url: window.location.href,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[Webview Preload] IPC communication failed:', error);
    }
  }

  private startRecording(sessionId: string): void {
    if (this.isRecording) {
      return;
    }

    this.isRecording = true;
    this.sessionId = sessionId;
    
    this.setupEventListeners();
    this.setupLoadingDetection();
    this.setupSearchResultsDetection();
    this.sendPageContext('recording-start');
  }

  private stopRecording(): void {
    if (!this.isRecording) {
      return;
    }

    
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
    
    // Comprehensive event listening for all user interactions
    const events = ['click', 'input', 'change', 'submit', 'keydown', 'keyup', 'paste', 'cut', 'copy', 'contextmenu'];
    
    events.forEach(eventType => {
      const handler = (event: Event) => this.handleEvent(event, eventType);
      document.addEventListener(eventType, handler, true);
      this.eventHandlers.set(eventType, handler);
    });

    // Setup enhanced clipboard monitoring
    this.setupClipboardMonitoring();

    // Setup form interaction monitoring
    this.setupFormInteractionMonitoring();

    // Setup navigation detection
    this.setupNavigationDetection();

    // Setup network monitoring
    this.setupNetworkMonitoring();

  }

  private removeEventListeners(): void {
    
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
    
    // Handle clipboard events (copy, cut, paste) - these should always be recorded
    if (['copy', 'cut', 'paste'].includes(eventType)) {
      this.handleClipboardEvent(event, eventType);
      return;
    }

    // Handle clicks on external links (especially Google search results) as navigation
    if (eventType === 'click') {
      const linkNavigation = this.handleLinkClick(event, target);
      if (linkNavigation) {
        return; // Link click was converted to navigation, skip regular click handling
      }
    }

    // Handle form submission events
    if (eventType === 'submit') {
      this.handleFormSubmitEvent(event);
      return;
    }

    // Handle submit button clicks (capture before general click handling)
    if (eventType === 'click' && this.isSubmitButton(target)) {
      this.handleSubmitButtonClick(event, target);
      return;
    }

    // Handle context menu (right-click)
    if (eventType === 'contextmenu') {
      this.handleContextMenuEvent(event);
      return;
    }

    // Handle text input aggregation
    if (eventType === 'input' || eventType === 'keydown' || eventType === 'keyup') {
      this.handleTextInputEvent(event, target, eventType);
      return;
    }

    // Handle dropdown/select changes
    if (eventType === 'change') {
      this.handleChangeEvent(event, target);
      return;
    }

    if (!this.isSignificantEvent(event, target)) return;

    // Handle other semantic events
    if (this.shouldRecordEvent(eventType, target, event)) {

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

    const actionData = {
      type: 'type',
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

    // Skip recording system control elements
    const elementId = target.id;
    if (elementId && (elementId === 'stopRecordingBtn' || elementId === 'startRecordingBtn' || elementId.includes('recordingBtn'))) {
      return false;
    }

    // Only record events that are actually user-initiated
    if (!this.isUserInitiatedEvent(event)) {
      return false;
    }

    switch (eventType) {
      case 'click':
        // Only record meaningful clicks by user
        return this.isClickableElement(target);
      
      case 'change':
        // Record select, checkbox, radio changes
        return ['select', 'input'].includes(tagName) && 
               !['text', 'email', 'password', 'search', 'url'].includes((target as HTMLInputElement).type);
      
      case 'submit':
        // Always record form submissions
        return tagName === 'form';

      case 'copy':
      case 'cut':
      case 'paste':
        // Always record clipboard operations
        return true;

      case 'contextmenu':
        // Record right-click context menu if on interactive elements
        return this.isClickableElement(target);
      
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
          default: return 'type';
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

  private isUserInitiatedEvent(event: Event): boolean {
    // Check if event was triggered by actual user interaction
    return (
      event.isTrusted && // Browser-generated events from user actions are trusted
      event.type !== 'DOMContentLoaded' && // Not a DOM load event
      event.type !== 'load' && // Not a window load event
      event.timeStamp > 0 && // Has valid timestamp
      event.timeStamp > this.pageLoadingState.loadStartTime // Happened after page started loading
    );
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
    window.addEventListener('popstate', () => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        this.recordNavigationEvent(lastUrl, currentUrl, document.title);
        lastUrl = currentUrl;
      }
    });

    // Listen for hashchange events (in-page navigation)
    window.addEventListener('hashchange', (event) => {
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
      ipcRenderer.send('recording-context', contextData);
    } catch (error) {
      console.error('[Webview Preload] Failed to send page context:', error);
    }
  }

  private sendNetworkEvent(eventData: any): void {
    try {
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
      value: this.cleanPageLoadValue(loadTime, window.location.href),
      coordinates: null,
      pageContext: this.getPageContext()
    };

    this.sendRecordingAction(actionData);
    this.pageLoadingState.isLoading = false;
  }


  private recordSearchResultsLoaded(searchQuery: string): void {
    if (!this.isRecording || !searchQuery || searchQuery.length === 0 || searchQuery === 'https://www.google.com') return;

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
    if (!this.isRecording || mutations.length === 0) return;

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

  // Enhanced event handlers for new interaction types
  private handleClipboardEvent(event: Event, eventType: string): void {
    if (!this.isRecording) return;

    const target = event.target as Element;
    const clipboardEvent = event as ClipboardEvent;
    
    let clipboardValue = '';
    let description = '';
    
    switch (eventType) {
      case 'copy':
        // Multiple strategies to get the copied text
        let copiedText = '';
        
        // Strategy 1: Get selected text
        const selection = window.getSelection();
        if (selection && selection.toString()) {
          copiedText = selection.toString();
        }
        
        // Strategy 2: If target is an input/textarea, get selected portion
        if (!copiedText && (target as HTMLInputElement).value !== undefined) {
          const inputElement = target as HTMLInputElement;
          const start = inputElement.selectionStart || 0;
          const end = inputElement.selectionEnd || inputElement.value.length;
          copiedText = inputElement.value.substring(start, end);
        }
        
        // Strategy 3: Try to get from clipboard data if available
        if (!copiedText && clipboardEvent.clipboardData) {
          copiedText = clipboardEvent.clipboardData.getData('text/plain') || '';
        }
        
        clipboardValue = copiedText;
        description = `Copy text: "${clipboardValue.substring(0, 50)}${clipboardValue.length > 50 ? '...' : ''}"`;
        console.log(`🔵[Webview Preload] Copy event detected, text: "${copiedText.substring(0, 100)}"`);
        break;
      
      case 'cut':
        const cutSelection = window.getSelection();
        clipboardValue = cutSelection?.toString() || '';
        description = `Cut text: "${clipboardValue.substring(0, 50)}${clipboardValue.length > 50 ? '...' : ''}"`;
        break;
      
      case 'paste':
        // For paste, we'll capture what was pasted after the event
        setTimeout(() => {
          if (target && 'value' in target) {
            const inputElement = target as HTMLInputElement | HTMLTextAreaElement;
            clipboardValue = inputElement.value || '';
          }
          
          const actionData = {
            type: 'paste',
            timestamp: Date.now(),
            sessionId: this.sessionId,
            target: this.captureElement(target),
            value: clipboardValue,
            coordinates: this.getEventCoordinates(event),
            pageContext: this.getPageContext()
          };

          this.sendRecordingAction(actionData);
        }, 50); // Small delay to let paste complete
        return; // Exit early for paste
    }

    const actionData = {
      type: eventType,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      target: this.captureElement(target),
      value: clipboardValue,
      coordinates: this.getEventCoordinates(event),
      pageContext: this.getPageContext()
    };

    this.sendRecordingAction(actionData);
  }

  private handleFormSubmitEvent(event: Event): void {
    if (!this.isRecording) return;

    const form = event.target as HTMLFormElement;
    if (!form) return;

    // Capture form data (but mask sensitive fields)
    const formData = new FormData(form);
    const formFields: Record<string, string> = {};
    
    formData.forEach((value, key) => {
      // Mask sensitive fields
      if (this.isSensitiveField(key)) {
        formFields[key] = '[MASKED]';
      } else {
        formFields[key] = value.toString().substring(0, 100); // Limit length
      }
    });

    // Get form action and method
    const formAction = form.action || window.location.href;
    const formMethod = form.method || 'POST';

    const actionData = {
      type: 'form_submit',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      target: this.captureElement(form),
      value: {
        fields: formFields,
        action: formAction,
        method: formMethod,
        fieldCount: Object.keys(formFields).length
      },
      coordinates: null,
      pageContext: this.getPageContext()
    };

    this.sendRecordingAction(actionData);
  }

  private handleChangeEvent(event: Event, target: Element): void {
    if (!this.isRecording) return;

    const tagName = target.tagName?.toLowerCase();
    const inputElement = target as HTMLInputElement | HTMLSelectElement;
    
    let actionType = 'change';
    let value: any = inputElement.value;
    let description = '';

    if (tagName === 'select') {
      const selectElement = target as HTMLSelectElement;
      const selectedOption = selectElement.selectedOptions[0];
      
      actionType = 'select_option';
      value = {
        value: selectElement.value,
        text: selectedOption?.textContent || selectElement.value,
        index: selectElement.selectedIndex
      };
      description = `Select "${selectedOption?.textContent || selectElement.value}" from dropdown`;
      
    } else if (inputElement.type === 'checkbox') {
      actionType = 'toggle_checkbox';
      value = inputElement.checked;
      description = `${inputElement.checked ? 'Check' : 'Uncheck'} checkbox`;
      
    } else if (inputElement.type === 'radio') {
      actionType = 'select_radio';
      value = {
        value: inputElement.value,
        name: inputElement.name,
        checked: inputElement.checked
      };
      description = `Select radio button "${inputElement.value}"`;
      
    } else if (inputElement.type === 'range') {
      actionType = 'adjust_slider';
      value = inputElement.value;
      description = `Adjust slider to ${inputElement.value}`;
      
    } else if (inputElement.type === 'file') {
      actionType = 'select_file';
      const fileInput = target as HTMLInputElement;
      const files = Array.from(fileInput.files || []);
      value = {
        fileCount: files.length,
        fileNames: files.map(f => f.name).slice(0, 5), // Limit to first 5 files
        totalSize: files.reduce((sum, f) => sum + f.size, 0)
      };
      description = `Select ${files.length} file(s)`;
      
    } else {
      // Other input types
      description = `Change ${inputElement.type || 'input'} value to "${value}"`;
    }

    const actionData = {
      type: actionType,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      target: this.captureElement(target),
      value: value,
      coordinates: this.getEventCoordinates(event),
      pageContext: this.getPageContext()
    };

    this.sendRecordingAction(actionData);
  }

  private handleContextMenuEvent(event: Event): void {
    if (!this.isRecording) return;

    const target = event.target as Element;
    const mouseEvent = event as MouseEvent;

    const actionData = {
      type: 'context_menu',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      target: this.captureElement(target),
      value: 'right_click',
      coordinates: {
        x: mouseEvent.clientX,
        y: mouseEvent.clientY
      },
      pageContext: this.getPageContext()
    };

    this.sendRecordingAction(actionData);
  }

  // Setup methods for enhanced monitoring
  private setupClipboardMonitoring(): void {
    // Additional clipboard monitoring if needed
    // Modern browsers have good clipboard event support
    console.log('🔵[Webview Preload] Clipboard monitoring enabled');
  }

  private setupFormInteractionMonitoring(): void {
    // Monitor for form field focus/blur patterns
    const formFocusHandler = (event: Event) => {
      const target = event.target as Element;
      const tagName = target.tagName?.toLowerCase();
      
      if (['input', 'textarea', 'select'].includes(tagName)) {
        // Track form field interactions for better context
        const formElement = target.closest('form');
        if (formElement) {
          // Add form context to element if not already present
          (target as any).__formContext = {
            formId: formElement.id,
            formAction: formElement.action,
            formMethod: formElement.method
          };
        }
      }
    };

    document.addEventListener('focus', formFocusHandler, true);
    this.eventHandlers.set('focus_monitor', formFocusHandler);
    
    console.log('🔵[Webview Preload] Form interaction monitoring enabled');
  }

  // Enhanced link click handler for external navigation
  private handleLinkClick(event: Event, target: Element): boolean {
    // Find the actual link element (might be nested)
    const linkElement = target.closest('a') || (target.tagName?.toLowerCase() === 'a' ? target : null) as HTMLAnchorElement;
    
    if (!linkElement || !linkElement.href) {
      return false; // Not a link click
    }

    const href = linkElement.href;
    const currentDomain = window.location.hostname;
    
    try {
      const linkUrl = new URL(href);
      const linkDomain = linkUrl.hostname;
      
      // Check if this is an external link (different domain)
      const isExternalLink = linkDomain !== currentDomain;
      
      // Special handling for Google search results
      const isGoogleSearchResult = (
        window.location.hostname.includes('google.com') && 
        (
          linkElement.closest('.g:not(.g-blk)') || // Standard Google results
          linkElement.closest('.tF2Cxc') || // New Google result format
          linkElement.closest('.rc') || // Classic format
          linkElement.closest('[data-ved]') // Google tracking elements
        )
      );
      
      // Extract the actual destination URL from Google redirect URLs
      let actualDestinationUrl = href;
      let actualDestinationDomain = linkDomain;
      
      if (linkDomain.includes('google.com') && linkUrl.pathname === '/url') {
        // This is a Google redirect URL, extract the actual destination
        const urlParam = linkUrl.searchParams.get('url') || linkUrl.searchParams.get('q');
        if (urlParam) {
          try {
            const destUrl = new URL(urlParam);
            actualDestinationUrl = urlParam;
            actualDestinationDomain = destUrl.hostname;
            console.log(`🔍[Webview Preload] Extracted actual destination: ${actualDestinationUrl}`);
          } catch (e) {
            console.warn('[Webview Preload] Failed to parse destination URL:', urlParam);
          }
        }
      }
      
      // Convert external links or Google search result links to navigation actions
      if (isExternalLink || isGoogleSearchResult) {
        console.log('🔵[Webview Preload] Converting link click to navigation:', href);
        
        // Prevent the default click behavior
        event.preventDefault();
        
        // Record as navigation action instead of click
        const actionData = {
          type: 'navigation',
          timestamp: Date.now(),
          sessionId: this.sessionId,
          target: {
            tagName: 'navigation',
            id: '',
            className: 'external-link',
            text: linkElement.textContent?.trim() || '',
            selector: '',
            xpath: '',
            attributes: {},
            boundingRect: { x: 0, y: 0, width: 0, height: 0 },
            isVisible: true,
            elementType: 'navigation',
            purpose: isGoogleSearchResult ? 'google_search_result' : 'external_navigation',
            context: isGoogleSearchResult ? 'google_search_result_click' : 'external_link_click',
            href: actualDestinationUrl, // Use actual destination URL
            target: linkElement.getAttribute('target'),
            targetUrl: actualDestinationUrl, // Use actual destination URL
            uniqueIdentifiers: [],
            semanticRole: 'navigation',
            interactionContext: isGoogleSearchResult ? 'google-search-result' : 'external-link',
            parentContext: null
          },
          value: {
            url: actualDestinationUrl, // Use actual destination URL
            linkText: linkElement.textContent?.trim() || '',
            navigationType: isGoogleSearchResult ? 'google_search_result' : 'external_link',
            fromDomain: currentDomain,
            toDomain: actualDestinationDomain, // Use actual destination domain
            originalUrl: href, // Store the original URL for reference
            isRedirect: actualDestinationUrl !== href // Flag if this was a redirect
          },
          coordinates: this.getEventCoordinates(event),
          pageContext: this.getPageContext()
        };

        this.sendRecordingAction(actionData);
        
        // Actually navigate to the URL after a short delay to ensure recording is sent
        setTimeout(() => {
          window.location.href = href;
        }, 100);
        
        return true; // Indicates that we handled this as navigation
      }
      
    } catch (e) {
      console.warn('[WebviewRecording] Failed to parse link URL:', href, e);
    }
    
    return false; // Not handled as navigation, proceed with regular click handling
  }

  private isSubmitButton(element: Element): boolean {
    const tagName = element.tagName?.toLowerCase();
    const type = element.getAttribute('type');
    const role = element.getAttribute('role');
    
    // Direct submit buttons
    if (tagName === 'button' && (type === 'submit' || !type)) return true;
    if (tagName === 'input' && type === 'submit') return true;
    
    // Buttons with submit-like text in forms
    if ((tagName === 'button' || role === 'button') && element.closest('form')) {
      const text = element.textContent?.toLowerCase() || '';
      const submitKeywords = ['submit', 'send', 'save', 'create', 'post', 'publish', 'continue', 'next', 'confirm'];
      return submitKeywords.some(keyword => text.includes(keyword));
    }
    
    return false;
  }

  private handleSubmitButtonClick(event: Event, target: Element): void {
    if (!this.isRecording) return;
    
    const form = target.closest('form');
    const buttonText = target.textContent?.trim() || '';
    const buttonType = target.getAttribute('type') || 'button';

    const actionData = {
      type: 'form_submit',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      target: this.captureElement(target),
      value: {
        buttonText: buttonText,
        buttonType: buttonType,
        formAction: form?.getAttribute('action') || window.location.href,
        formMethod: form?.getAttribute('method') || 'POST',
        submitType: 'button_click'
      },
      coordinates: this.getEventCoordinates(event),
      pageContext: this.getPageContext()
    };

    this.sendRecordingAction(actionData);
  }

  private cleanPageLoadValue(loadTime: number, url: string): string {
    // Clean Google URLs to only show essential information
    if (url.includes('google.com/search')) {
      try {
        const urlObj = new URL(url);
        const query = urlObj.searchParams.get('q');
        if (query) {
          return `Page loaded in ${loadTime}ms - Google search for "${query}"`;
        }
      } catch (e) {
        console.warn('[Webview Preload] Failed to parse Google URL:', url);
      }
    }
    
    return `Page loaded in ${loadTime}ms - ${url}`;
  }

  // Helper methods
  private isSensitiveField(fieldName: string): boolean {
    const sensitivePatterns = [
      'password', 'passwd', 'pwd',
      'credit', 'card', 'cvv', 'cvc',
      'ssn', 'social',
      'secret', 'token', 'key'
    ];
    
    const fieldLower = fieldName.toLowerCase();
    return sensitivePatterns.some(pattern => fieldLower.includes(pattern));
  }
}

// Initialize the recording engine when the page loads
if (typeof window !== 'undefined') {
  const recorder = new WebviewRecordingEngine();
  
  (window as any).__webviewRecorder = recorder;
}