import { BrowserWindow, WebContents, ipcMain, webContents } from 'electron';

/**
 * NativeEventMonitor captures events at the Electron/Chromium level
 * This bypasses Content Security Policy restrictions and works on all sites
 */
export class NativeEventMonitor {
  private static instance: NativeEventMonitor;
  private monitoredWebContents = new Map<number, WebContents>();
  private isRecording = false;
  private currentSessionId: string | null = null;

  private constructor() {
    this.setupIpcHandlers();
  }

  public static getInstance(): NativeEventMonitor {
    if (!NativeEventMonitor.instance) {
      NativeEventMonitor.instance = new NativeEventMonitor();
    }
    return NativeEventMonitor.instance;
  }

  private setupIpcHandlers(): void {
    ipcMain.on('start-native-recording', (event, sessionId: string) => {
      this.startRecording(sessionId);
    });

    ipcMain.on('stop-native-recording', () => {
      this.stopRecording();
    });
    ipcMain.on('register-webview-for-monitoring', (event, webContentsId: number) => {
      this.registerWebContents(webContentsId);
    });
    ipcMain.on('unregister-webview-for-monitoring', (event, webContentsId: number) => {
      this.unregisterWebContents(webContentsId);
    });
  }

  private startRecording(sessionId: string): void {
    console.log(`[NativeEventMonitor] Starting recording with session ID: ${sessionId}`);
    this.isRecording = true;
    this.currentSessionId = sessionId;
    this.monitoredWebContents.forEach((webContents, id) => {
      this.attachEventListeners(webContents);
    });
  }

  private stopRecording(): void {
    console.log('[NativeEventMonitor] Stopping recording');
    this.isRecording = false;
    this.currentSessionId = null;
    this.monitoredWebContents.forEach((webContents, id) => {
      this.detachEventListeners(webContents);
    });
  }

  private registerWebContents(webContentsId: number): void {
    const webContents = this.getWebContentsById(webContentsId);
    if (webContents) {
      console.log(`[NativeEventMonitor] Registering webContents ID: ${webContentsId}`);
      this.monitoredWebContents.set(webContentsId, webContents);
      
      if (this.isRecording) {
        this.attachEventListeners(webContents);
      }
    }
  }

  private unregisterWebContents(webContentsId: number): void {
    const webContents = this.monitoredWebContents.get(webContentsId);
    if (webContents) {
      console.log(`[NativeEventMonitor] Unregistering webContents ID: ${webContentsId}`);
      this.detachEventListeners(webContents);
      this.monitoredWebContents.delete(webContentsId);
    }
  }

  private getWebContentsById(webContentsId: number): WebContents | null {
    try {
      const allWebContents = webContents.getAllWebContents();
      return allWebContents.find((wc: WebContents) => wc.id === webContentsId) || null;
    } catch (error: any) {
      console.error(`[NativeEventMonitor] Error getting WebContents for ID ${webContentsId}:`, error);
      return null;
    }
  }

  private attachEventListeners(webContents: WebContents): void {
    if (!webContents || webContents.isDestroyed()) return;

    try {
      this.injectEventMonitoringScript(webContents);
      webContents.addListener('did-navigate', this.handleNavigation);
      webContents.addListener('did-navigate-in-page', this.handleInPageNavigation);
      webContents.addListener('console-message', this.handleConsoleMessage);
    } catch (error) {
      console.error('[NativeEventMonitor] Error attaching event listeners:', error);
    }
  }

  private detachEventListeners(webContents: WebContents): void {
    if (!webContents || webContents.isDestroyed()) return;

    try {
      webContents.removeListener('did-navigate', this.handleNavigation);
      webContents.removeListener('did-navigate-in-page', this.handleInPageNavigation);
      webContents.removeListener('console-message', this.handleConsoleMessage);
      this.injectCleanupScript(webContents);
    } catch (error) {
      console.error('[NativeEventMonitor] Error detaching event listeners:', error);
    }
  }

  private handleNavigation = (event: any, url: string): void => {
    if (!this.isRecording) return;
  
    if (!event || !event.sender) return;
    
    const webContents = event.sender as WebContents;
    const webContentsId = webContents.id;
    if (!this.monitoredWebContents.has(webContentsId)) return;
    
    this.sendEventToRenderer({
      type: 'navigation',
      url,
      timestamp: Date.now(),
      sessionId: this.currentSessionId,
      webContentsId,
      title: webContents.getTitle() || ''
    });
    setTimeout(() => {
      this.injectEventMonitoringScript(webContents);
    }, 500);
  };

  private handleInPageNavigation = (event: any, url: string, isMainFrame: boolean): void => {
    if (!this.isRecording || !isMainFrame) return;
    
    if (!event || !event.sender) return;
    
    const webContents = event.sender as WebContents;
    const webContentsId = webContents.id;
    
    if (!this.monitoredWebContents.has(webContentsId)) return;
    
    this.sendEventToRenderer({
      type: 'in_page_navigation',
      url,
      timestamp: Date.now(),
      sessionId: this.currentSessionId,
      webContentsId,
      title: webContents.getTitle() || ''
    });
  };

  private handleConsoleMessage = (event: any, level: number, message: string, line: number, sourceId: string): void => {
    if (!event) return;

    if (message.startsWith('__NATIVE_EVENT__:')) {
      try {
        const eventData = JSON.parse(message.substring('__NATIVE_EVENT__:'.length));
        this.sendEventToRenderer(eventData);
      } catch (error) {
        console.error('[NativeEventMonitor] Error parsing event data:', error);
      }
    }
  };

  private async injectEventMonitoringScript(webContents: WebContents): Promise<void> {
    if (!webContents || webContents.isDestroyed()) return;

    try {
      if (webContents.isLoading()) {
        try {
          await new Promise<void>((resolve) => {
            const loadHandler = () => {
              webContents.off('did-finish-load', loadHandler);
              resolve();
            };
            webContents.on('did-finish-load', loadHandler);
            setTimeout(resolve, 3000);
          });
        } catch (error) {
        }
      }
      await webContents.executeJavaScript(`
        (function() {
          if (window.__nativeEventMonitorInjected) return;
          window.__nativeEventMonitorInjected = true;
          
          console.log('[NativeEventMonitor] Injecting event monitoring script');
          const originalAddEventListener = EventTarget.prototype.addEventListener;
          const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
          const originalPushState = history.pushState;
          const originalReplaceState = history.replaceState;
          
          const eventsToMonitor = [
            'click', 'input', 'change', 'submit',
            'keydown', 'keyup', 'keypress', 'focus', 'contextmenu',
            
            'select', 'reset', 'invalid',
            
            'copy', 'cut', 'paste',
            
            'dragstart', 'dragend', 'dragenter', 'dragleave', 'dragover', 'drop',
            
            'scroll',
            
            'cancel', 'close',
            'play', 'pause', 'ended', 'volumechange',
            
            'touchstart', 'touchend', 'touchmove', 'touchcancel'
          ];
          window.__nativeEventListeners = new Map();
          
          function captureElement(element) {
            if (!element || !element.tagName) return null;
            
            try {
              const rect = element.getBoundingClientRect();
              
              const computedStyle = window.getComputedStyle(element);
              
              const isVisible = !(computedStyle.display === 'none' || 
                               computedStyle.visibility === 'hidden' || 
                               computedStyle.opacity === '0' ||
                               rect.width === 0 || 
                               rect.height === 0);
              
              const isSvg = element.tagName.toLowerCase() === 'svg' || element.ownerSVGElement != null;
              
              let parentInteractiveElement = null;
              if (isSvg) {
                let currentEl = element;
                let depth = 0;
                while (currentEl && depth < 3) {
                  const parent = currentEl.parentElement;
                  if (parent && (parent.tagName.toLowerCase() === 'button' || 
                                parent.tagName.toLowerCase() === 'a' || 
                                parent.getAttribute('role') === 'button' || 
                                parent.getAttribute('role') === 'link' ||
                                parent.onclick)) {
                    parentInteractiveElement = parent;
                    break;
                  }
                  currentEl = parent;
                  depth++;
                }
              }
              
              let classNameStr = null;
              if (element.className) {
                if (typeof element.className === 'string') {
                  classNameStr = element.className;
                } else if (isSvg && element.className.baseVal !== undefined) {
                  classNameStr = element.className.baseVal;
                }
              }
              
              let svgData = null;
              if (isSvg) {
                svgData = {
                  id: element.id || null,
                  viewBox: element.getAttribute('viewBox') || null,
                  path: element.querySelector('path')?.getAttribute('d') || null,
                  use: element.querySelector('use')?.getAttribute('href') || null
                };
              }
              
              let role = element.getAttribute('role');
              if (!role) {
                const tagName = element.tagName.toLowerCase();
                if (tagName === 'a') role = 'link';
                else if (tagName === 'button') role = 'button';
                else if (tagName === 'input') {
                  if (element.type === 'checkbox') role = 'checkbox';
                  else if (element.type === 'radio') role = 'radio';
                  else if (element.type === 'submit' || element.type === 'button') role = 'button';
                  else role = 'textbox';
                }
                else if (tagName === 'select') role = 'combobox';
                else if (tagName === 'textarea') role = 'textbox';
                else if (tagName === 'img') role = 'img';
                else if (tagName === 'svg') role = 'image';
                else if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3' || 
                         tagName === 'h4' || tagName === 'h5' || tagName === 'h6') role = 'heading';
              }
              
              const dataAttributes = {};
              Array.from(element.attributes || []).forEach(attr => {
                if (attr.name.startsWith('data-')) {
                  dataAttributes[attr.name] = attr.value;
                }
              });
              
              let parentContext = null;
              try {
                const parentElement = element.parentElement;
                if (parentElement && parentElement.tagName) {
                  let parentClassNameStr = null;
                  if (parentElement.className) {
                    if (typeof parentElement.className === 'string') {
                      parentClassNameStr = parentElement.className;
                    } else if (parentElement.className.baseVal !== undefined) {
                      parentClassNameStr = parentElement.className.baseVal;
                    }
                  }
                  
                  parentContext = {
                    tagName: parentElement.tagName.toLowerCase(),
                    id: parentElement.id || null,
                    className: parentClassNameStr,
                    role: parentElement.getAttribute('role') || null,
                    href: parentElement.getAttribute('href') || null,
                    onclick: !!parentElement.onclick,
                    ariaLabel: parentElement.getAttribute('aria-label') || null,
                    title: parentElement.title || null
                  };
                }
              } catch (e) { /* Ignore parent context errors */ }
              
              let formContext = null;
              try {
                const form = element.form || element.closest('form');
                if (form) {
                  formContext = {
                    id: form.id || null,
                    name: form.name || null,
                    action: form.action || null,
                    method: form.method || null
                  };
                }
              } catch (e) { /* Ignore form context errors */ }
              
              // Find nearest element with text for SVG icons
              let nearestTextContent = null;
              if (isSvg && !element.textContent?.trim()) {
                // Look for sibling elements with text
                if (parentInteractiveElement) {
                  const siblings = Array.from(parentInteractiveElement.childNodes);
                  for (const sibling of siblings) {
                    if (sibling !== element && sibling.textContent?.trim()) {
                      nearestTextContent = sibling.textContent.trim().substring(0, 100);
                      break;
                    }
                  }
                  
                  // If no sibling has text, use parent's text
                  if (!nearestTextContent && parentInteractiveElement.textContent?.trim()) {
                    nearestTextContent = parentInteractiveElement.textContent.trim().substring(0, 100);
                  }
                }
              }
              
              return {
                tagName: element.tagName.toLowerCase(),
                id: element.id || null,
                className: classNameStr,
                type: element.type || null,
                name: element.name || null,
                value: element.value || null,
                href: element.href || null,
                src: element.src || null,
                alt: element.alt || null,
                placeholder: element.placeholder || null,
                checked: element.checked !== undefined ? element.checked : null,
                selected: element.selected !== undefined ? element.selected : null,
                disabled: element.disabled !== undefined ? element.disabled : null,
                readOnly: element.readOnly !== undefined ? element.readOnly : null,
                required: element.required !== undefined ? element.required : null,
                text: element.textContent?.trim().substring(0, 100) || null,
                innerText: element.innerText?.trim().substring(0, 100) || null,
                title: element.title || null,
                ariaLabel: element.getAttribute('aria-label') || null,
                role: role || null,
                isVisible: isVisible,
                isInteractive: ['a', 'button', 'input', 'select', 'textarea', 'details', 'summary'].includes(element.tagName.toLowerCase()) || 
                              !!element.getAttribute('role') || 
                              !!element.onclick || 
                              computedStyle.cursor === 'pointer',
                attributes: Array.from(element.attributes || []).reduce((obj, attr) => {
                  obj[attr.name] = attr.value;
                  return obj;
                }, {}),
                dataAttributes: Object.keys(dataAttributes).length > 0 ? dataAttributes : null,
                svgData: svgData,
                isSvg: isSvg,
                nearestTextContent: nearestTextContent,
                parentInteractiveElement: parentInteractiveElement ? {
                  tagName: parentInteractiveElement.tagName.toLowerCase(),
                  id: parentInteractiveElement.id || null,
                  className: typeof parentInteractiveElement.className === 'string' ? 
                             parentInteractiveElement.className : 
                             (parentInteractiveElement.className?.baseVal || null),
                  role: parentInteractiveElement.getAttribute('role') || null,
                  text: parentInteractiveElement.textContent?.trim().substring(0, 100) || null,
                  ariaLabel: parentInteractiveElement.getAttribute('aria-label') || null,
                  title: parentInteractiveElement.title || null
                } : null,
                boundingRect: {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height,
                  top: rect.top,
                  bottom: rect.bottom,
                  left: rect.left,
                  right: rect.right
                },
                styles: {
                  display: computedStyle.display,
                  visibility: computedStyle.visibility,
                  position: computedStyle.position,
                  zIndex: computedStyle.zIndex,
                  opacity: computedStyle.opacity,
                  cursor: computedStyle.cursor
                },
                parentContext: parentContext,
                formContext: formContext
              };
            } catch (e) {
              console.error('Error in captureElement:', e);
              return { tagName: element.tagName.toLowerCase() };
            }
          }
          function handleNativeEvent(event) {
            const asyncEvents = ['play', 'pause', 'ended'];
            if (!event.isTrusted && !asyncEvents.includes(event.type)) return;
            
            const target = event.target;
            if (!target) return;
            if (event.type === 'scroll') {
              if (!window.__lastScrollPosition) {
                window.__lastScrollPosition = { x: window.scrollX, y: window.scrollY };
                return;
              }
              
              const scrollDiffY = Math.abs(window.scrollY - window.__lastScrollPosition.y);
              const scrollDiffX = Math.abs(window.scrollX - window.__lastScrollPosition.x);
              
              if (scrollDiffY < 100 && scrollDiffX < 100) return;
              
              window.__lastScrollPosition = { x: window.scrollX, y: window.scrollY };
            }
              
            const eventData = {
              type: event.type,
              timestamp: Date.now(),
              target: captureElement(target),
              coordinates: event.clientX !== undefined ? { x: event.clientX, y: event.clientY } : null,
              key: event.key,
              keyCode: event.keyCode,
              value: target.value,
              checked: target.checked,
              url: window.location.href,
              title: document.title
            };
            if (event.type === 'scroll') {
              eventData.scrollPosition = { x: window.scrollX, y: window.scrollY };
              eventData.viewportHeight = window.innerHeight;
              eventData.documentHeight = document.documentElement.scrollHeight;
              eventData.scrollPercentage = Math.round((window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100);
            } else if (['dragstart', 'dragend', 'drop'].includes(event.type)) {
              eventData.dataTransfer = event.dataTransfer ? {
                types: Array.from(event.dataTransfer.types || []),
                effectAllowed: event.dataTransfer.effectAllowed
              } : null;
            } else if (['play', 'pause', 'ended'].includes(event.type)) {
              const mediaElement = target;
              eventData.mediaInfo = {
                currentTime: mediaElement.currentTime,
                duration: mediaElement.duration,
                paused: mediaElement.paused,
                muted: mediaElement.muted,
                volume: mediaElement.volume
              };
            }

            console.log('__NATIVE_EVENT__:' + JSON.stringify(eventData));
          }
          
          eventsToMonitor.forEach(eventType => {
            const listener = (event) => handleNativeEvent(event);
            window.__nativeEventListeners.set(eventType, listener);
            originalAddEventListener.call(document, eventType, listener, { capture: true, passive: true });
          });
          history.pushState = function() {
            const result = originalPushState.apply(this, arguments);
            console.log('__NATIVE_EVENT__:' + JSON.stringify({
              type: 'history_push_state',
              timestamp: Date.now(),
              url: window.location.href,
              title: document.title
            }));
            return result;
          };
          
          history.replaceState = function() {
            const result = originalReplaceState.apply(this, arguments);
            console.log('__NATIVE_EVENT__:' + JSON.stringify({
              type: 'history_replace_state',
              timestamp: Date.now(),
              url: window.location.href,
              title: document.title
            }));
            return result;
          };
          window.__cleanupNativeEventMonitor = function() {
            if (!window.__nativeEventListeners) return;
            
            eventsToMonitor.forEach(eventType => {
              const listener = window.__nativeEventListeners.get(eventType);
              if (listener) {
                originalRemoveEventListener.call(document, eventType, listener, { capture: true });
              }
            });
            
            window.__nativeEventListeners.clear();
            window.__nativeEventMonitorInjected = false;
            history.pushState = originalPushState;
            history.replaceState = originalReplaceState;
            if (originalXHROpen && originalXHRSend) {
              XMLHttpRequest.prototype.open = originalXHROpen;
              XMLHttpRequest.prototype.send = originalXHRSend;
            }
            
            if (originalFetch) {
              window.fetch = originalFetch;
            }
            if (window.__dynamicContentObserver) {
              window.__dynamicContentObserver.disconnect();
              window.__dynamicContentObserver = null;
            }
            
            if (window.__reactRouterObserver) {
              window.__reactRouterObserver.disconnect();
              window.__reactRouterObserver = null;
            }
            
            if (window.__vueRouterObserver) {
              window.__vueRouterObserver.disconnect();
              window.__vueRouterObserver = null;
            }
            if (window.__monitorIntervals) {
              window.__monitorIntervals.forEach(clearInterval);
              window.__monitorIntervals = [];
            }
          };
          const setupDynamicContentObserver = () => {
            let domChangeTimeout = null;
            let pendingMutations = [];
            
            const reportSignificantDOMChange = (mutations, isDebounced = false) => {
              if (!isDebounced && domChangeTimeout) {
                pendingMutations = pendingMutations.concat(mutations);
                return;
              }
              const allMutations = isDebounced ? pendingMutations : mutations;
              pendingMutations = [];
              let addedElements = 0;
              let removedElements = 0;
              let changedAttributes = 0;
              let textChanges = 0;
              const affectedElements = new Set();
              const addedNodes = [];
              
              allMutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                  mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // ELEMENT_NODE
                      addedElements++;
                      affectedElements.add(node);
                      if (node.tagName && [
                        'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE',
                        'UL', 'OL', 'TABLE', 'FORM'
                      ].includes(node.tagName.toUpperCase()) && node.childElementCount > 0) {
                        addedNodes.push(captureElement(node));
                      }
                    }
                  });
                  mutation.removedNodes.forEach(node => {
                    if (node.nodeType === 1) { // ELEMENT_NODE
                      removedElements++;
                    }
                  });
                } else if (mutation.type === 'attributes') {
                  changedAttributes++;
                  affectedElements.add(mutation.target);
                } else if (mutation.type === 'characterData') {
                  textChanges++;
                  affectedElements.add(mutation.target.parentElement);
                }
              });
              const isSignificant = (
                addedElements > 3 || 
                removedElements > 3 ||
                (addedElements > 0 && addedNodes.length > 0) ||
                affectedElements.size > 5 ||
                (changedAttributes > 5 && affectedElements.size > 2)
              );
              
              if (isSignificant) {
                console.log('__NATIVE_EVENT__:' + JSON.stringify({
                  type: 'dynamic_content_change',
                  timestamp: Date.now(),
                  url: window.location.href,
                  title: document.title,
                  details: {
                    addedElements,
                    removedElements,
                    changedAttributes,
                    textChanges,
                    affectedElementsCount: affectedElements.size,
                    significantAddedNodes: addedNodes.slice(0, 3) // Limit to 3 nodes for size
                  }
                }));
              }
            };
            const observer = new MutationObserver((mutations) => {
              if (mutations.length > 10) {
                reportSignificantDOMChange(mutations);
                return;
              }
              pendingMutations = pendingMutations.concat(mutations);
              
              if (domChangeTimeout) {
                clearTimeout(domChangeTimeout);
              }
              
              domChangeTimeout = setTimeout(() => {
                domChangeTimeout = null;
                reportSignificantDOMChange([], true); // Process accumulated mutations
              }, 500); // 500ms debounce
            });
            if (document.body) {
              observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'disabled'],
                characterData: false // Skip text changes to reduce noise
              });
              window.__dynamicContentObserver = observer;
            } else {
              const bodyCheckInterval = setInterval(() => {
                if (document.body) {
                  clearInterval(bodyCheckInterval);
                  setupDynamicContentObserver();
                }
              }, 100);
            }
          };
          setupDynamicContentObserver();
          const originalXHROpen = XMLHttpRequest.prototype.open;
          const originalXHRSend = XMLHttpRequest.prototype.send;
          const originalFetch = window.fetch;
          window.__activeRequests = new Map();
          window.__requestCounter = 0;
          XMLHttpRequest.prototype.open = function(method, url) {
            this.__requestId = ++window.__requestCounter;
            this.__requestMethod = method;
            this.__requestUrl = url;
            this.__requestStartTime = Date.now();
            return originalXHROpen.apply(this, arguments);
          };
          
          XMLHttpRequest.prototype.send = function() {
            const requestId = this.__requestId;
            const method = this.__requestMethod;
            const url = this.__requestUrl;
            const startTime = this.__requestStartTime;
            window.__activeRequests.set(requestId, {
              type: 'xhr',
              method,
              url,
              startTime
            });
            console.log('__NATIVE_EVENT__:' + JSON.stringify({
              type: 'async_request_start',
              timestamp: startTime,
              url: window.location.href,
              title: document.title,
              request: {
                id: requestId,
                type: 'xhr',
                method,
                url
              }
            }));
            this.addEventListener('load', function() {
              const endTime = Date.now();
              const duration = endTime - startTime;
              console.log('__NATIVE_EVENT__:' + JSON.stringify({
                type: 'async_request_complete',
                timestamp: endTime,
                url: window.location.href,
                title: document.title,
                request: {
                  id: requestId,
                  type: 'xhr',
                  method,
                  url,
                  status: this.status,
                  duration
                }
              }));
              window.__activeRequests.delete(requestId);
            });
            
            this.addEventListener('error', function() {
              const endTime = Date.now();
              const duration = endTime - startTime;
              console.log('__NATIVE_EVENT__:' + JSON.stringify({
                type: 'async_request_error',
                timestamp: endTime,
                url: window.location.href,
                title: document.title,
                request: {
                  id: requestId,
                  type: 'xhr',
                  method,
                  url,
                  duration
                }
              }));
              window.__activeRequests.delete(requestId);
            });
            
            return originalXHRSend.apply(this, arguments);
          };
          window.fetch = async function(input, init) {
            const requestId = ++window.__requestCounter;
            const startTime = Date.now();
            let url = typeof input === 'string' ? input : input.url;
            let method = init?.method || (input instanceof Request ? input.method : 'GET');
            window.__activeRequests.set(requestId, {
              type: 'fetch',
              method,
              url,
              startTime
            });
            console.log('__NATIVE_EVENT__:' + JSON.stringify({
              type: 'async_request_start',
              timestamp: startTime,
              url: window.location.href,
              title: document.title,
              request: {
                id: requestId,
                type: 'fetch',
                method,
                url
              }
            }));
            
            try {
              const response = await originalFetch.apply(this, arguments);
              const endTime = Date.now();
              const duration = endTime - startTime;
              console.log('__NATIVE_EVENT__:' + JSON.stringify({
                type: 'async_request_complete',
                timestamp: endTime,
                url: window.location.href,
                title: document.title,
                request: {
                  id: requestId,
                  type: 'fetch',
                  method,
                  url,
                  status: response.status,
                  duration
                }
              }));
              window.__activeRequests.delete(requestId);
              
              return response;
            } catch (error) {
              const endTime = Date.now();
              const duration = endTime - startTime;
              console.log('__NATIVE_EVENT__:' + JSON.stringify({
                type: 'async_request_error',
                timestamp: endTime,
                url: window.location.href,
                title: document.title,
                request: {
                  id: requestId,
                  type: 'fetch',
                  method,
                  url,
                  duration
                }
              }));
              window.__activeRequests.delete(requestId);
              
              throw error;
            }
          };
          const monitorModalsAndDialogs = () => {
            document.querySelectorAll('dialog').forEach(dialog => {
              if (dialog.__monitored) return;
              dialog.__monitored = true;
              
              const showEvent = () => {
                console.log('__NATIVE_EVENT__:' + JSON.stringify({
                  type: 'modal_open',
                  timestamp: Date.now(),
                  url: window.location.href,
                  title: document.title,
                  target: captureElement(dialog)
                }));
              };
              
              const hideEvent = () => {
                console.log('__NATIVE_EVENT__:' + JSON.stringify({
                  type: 'modal_close',
                  timestamp: Date.now(),
                  url: window.location.href,
                  title: document.title,
                  target: captureElement(dialog)
                }));
              };
              
              dialog.addEventListener('close', hideEvent);
              dialog.addEventListener('cancel', hideEvent);
              if (dialog.open || dialog.hasAttribute('open') || 
                  window.getComputedStyle(dialog).display !== 'none') {
                showEvent();
              }
            });
            const modalSelectors = [
              '[role="dialog"]',
              '[aria-modal="true"]',
              '.modal:not(.modal-hidden):not(.hidden)',
              '.dialog:not(.dialog-hidden):not(.hidden)',
              '.overlay:not(.overlay-hidden):not(.hidden)'
            ];
            
            modalSelectors.forEach(selector => {
              document.querySelectorAll(selector).forEach(modal => {
                if (modal.__monitored) return;
                modal.__monitored = true;
                if (window.getComputedStyle(modal).display !== 'none') {
                  console.log('__NATIVE_EVENT__:' + JSON.stringify({
                    type: 'modal_open',
                    timestamp: Date.now(),
                    url: window.location.href,
                    title: document.title,
                    target: captureElement(modal)
                  }));
                }
              });
            });
          };
          monitorModalsAndDialogs();
          setInterval(monitorModalsAndDialogs, 2000);
          if (typeof React !== 'undefined' || window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
            const originalDispatchEvent = EventTarget.prototype.dispatchEvent;
            EventTarget.prototype.dispatchEvent = function(event) {
              const result = originalDispatchEvent.call(this, event);
              if (event && event._reactName && this.tagName) {
                console.log('__NATIVE_EVENT__:' + JSON.stringify({
                  type: 'react_synthetic_event',
                  reactType: event._reactName,
                  timestamp: Date.now(),
                  target: captureElement(this),
                  url: window.location.href,
                  title: document.title
                }));
              }
              
              return result;
            };
          }
          const setupSPARouteMonitoring = () => {
            window.addEventListener('popstate', () => {
              console.log('__NATIVE_EVENT__:' + JSON.stringify({
                type: 'spa_navigation',
                navigationType: 'popstate',
                timestamp: Date.now(),
                url: window.location.href,
                title: document.title
              }));
            });
            if (window.angular || document.querySelector('[ng-app]')) {
              document.addEventListener('$routeChangeStart', () => {
                console.log('__NATIVE_EVENT__:' + JSON.stringify({
                  type: 'spa_navigation',
                  navigationType: 'angular_route_change',
                  timestamp: Date.now(),
                  url: window.location.href,
                  title: document.title
                }));
              });
            }
            if (document.querySelector('#root') || document.querySelector('[data-reactroot]')) {
              const reactRouterObserver = new MutationObserver((mutations) => {
                if (window.__lastReactUrl !== window.location.href) {
                  window.__lastReactUrl = window.location.href;
                  console.log('__NATIVE_EVENT__:' + JSON.stringify({
                    type: 'spa_navigation',
                    navigationType: 'react_router',
                    timestamp: Date.now(),
                    url: window.location.href,
                    title: document.title
                  }));
                }
              });
              const reactRoot = document.querySelector('#root') || document.querySelector('[data-reactroot]');
              if (reactRoot) {
                reactRouterObserver.observe(reactRoot, { childList: true, subtree: true });
                window.__reactRouterObserver = reactRouterObserver;
              }
            }
            if (window.Vue || document.querySelector('[data-v-app]')) {
              const vueRouterObserver = new MutationObserver((mutations) => {
                if (window.__lastVueUrl !== window.location.href) {
                  window.__lastVueUrl = window.location.href;
                  console.log('__NATIVE_EVENT__:' + JSON.stringify({
                    type: 'spa_navigation',
                    navigationType: 'vue_router',
                    timestamp: Date.now(),
                    url: window.location.href,
                    title: document.title
                  }));
                }
              });
              const vueRoot = document.querySelector('[data-v-app]') || document.body;
              vueRouterObserver.observe(vueRoot, { childList: true, subtree: true });
              window.__vueRouterObserver = vueRouterObserver;
            }
          };
          setupSPARouteMonitoring();
        
          console.log('[NativeEventMonitor] Event monitoring script injected successfully');
        })();
      `, true);
    } catch (error) {
      console.error('[NativeEventMonitor] Error injecting event monitoring script:', error);
    }
  }

  private async injectCleanupScript(webContents: WebContents): Promise<void> {
    if (!webContents || webContents.isDestroyed()) return;

    try {
      await webContents.executeJavaScript(`
        (function() {
          if (window.__cleanupNativeEventMonitor) {
            window.__cleanupNativeEventMonitor();
            console.log('[NativeEventMonitor] Cleanup function executed');
          }
          if (window.__dynamicContentObserver) {
            window.__dynamicContentObserver.disconnect();
            window.__dynamicContentObserver = null;
          }
          
          if (window.__reactRouterObserver) {
            window.__reactRouterObserver.disconnect();
            window.__reactRouterObserver = null;
          }
          
          if (window.__vueRouterObserver) {
            window.__vueRouterObserver.disconnect();
            window.__vueRouterObserver = null;
          }
          
          return true;
        })();
      `, true);
    } catch (error) {
      console.error('[NativeEventMonitor] Error injecting cleanup script:', error);
    }
  }

  private sendEventToRenderer(eventData: any): void {
    if (!eventData) {
      console.warn('[NativeEventMonitor] Attempted to send undefined/null event data');
      return;
    }
    const windows = BrowserWindow.getAllWindows();
    if (windows.length === 0) {
      console.warn('[NativeEventMonitor] No browser windows found to send event to');
      return;
    }
    
    windows.forEach(window => {
      if (!window.isDestroyed() && window.webContents && !window.webContents.isDestroyed()) {
        window.webContents.send('native-event', eventData);
      }
    });
  }
}
export function initializeNativeEventMonitor(): NativeEventMonitor {
  return NativeEventMonitor.getInstance();
}
