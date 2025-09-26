// src/main/native-event-monitor.ts
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
    // Handle recording start/stop commands
    ipcMain.on('start-native-recording', (event, sessionId: string) => {
      this.startRecording(sessionId);
    });

    ipcMain.on('stop-native-recording', () => {
      this.stopRecording();
    });

    // Handle webview registration
    ipcMain.on('register-webview-for-monitoring', (event, webContentsId: number) => {
      this.registerWebContents(webContentsId);
    });

    // Handle webview unregistration
    ipcMain.on('unregister-webview-for-monitoring', (event, webContentsId: number) => {
      this.unregisterWebContents(webContentsId);
    });
  }

  private startRecording(sessionId: string): void {
    console.log(`[NativeEventMonitor] Starting recording with session ID: ${sessionId}`);
    this.isRecording = true;
    this.currentSessionId = sessionId;
    
    // Attach event listeners to all registered webviews
    this.monitoredWebContents.forEach((webContents, id) => {
      this.attachEventListeners(webContents);
    });
  }

  private stopRecording(): void {
    console.log('[NativeEventMonitor] Stopping recording');
    this.isRecording = false;
    this.currentSessionId = null;
    
    // Detach event listeners from all registered webviews
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
      // Use the correct way to get WebContents by ID
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
      // Inject our event monitoring script
      this.injectEventMonitoringScript(webContents);

      // Listen for navigation events using the correct event names
      webContents.addListener('did-navigate', this.handleNavigation);
      webContents.addListener('did-navigate-in-page', this.handleInPageNavigation);
      
      // Listen for console messages (for debugging)
      webContents.addListener('console-message', this.handleConsoleMessage);
    } catch (error) {
      console.error('[NativeEventMonitor] Error attaching event listeners:', error);
    }
  }

  private detachEventListeners(webContents: WebContents): void {
    if (!webContents || webContents.isDestroyed()) return;

    try {
      // Remove navigation event listeners using the correct methods
      webContents.removeListener('did-navigate', this.handleNavigation);
      webContents.removeListener('did-navigate-in-page', this.handleInPageNavigation);
      
      // Remove console message listener
      webContents.removeListener('console-message', this.handleConsoleMessage);
      
      // Inject script to clean up our event listeners
      this.injectCleanupScript(webContents);
    } catch (error) {
      console.error('[NativeEventMonitor] Error detaching event listeners:', error);
    }
  }

  private handleNavigation = (event: any, url: string): void => {
    if (!this.isRecording) return;
  
    if (!event || !event.sender) {
      console.error('[NativeEventMonitor] Navigation event has no sender');
      return;
    }
    
    const webContents = event.sender as WebContents;
    const webContentsId = webContents.id;
    
    // Only process navigation events for registered webContents to avoid duplicates
    if (!this.monitoredWebContents.has(webContentsId)) {
      return;
    }
    
    // Send navigation event to renderer process
    this.sendEventToRenderer({
      type: 'navigation',
      url,
      timestamp: Date.now(),
      sessionId: this.currentSessionId,
      webContentsId,
      title: webContents.getTitle() || ''
    });
    
    // Re-inject our event monitoring script after navigation
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
            // Set a reasonable timeout
            setTimeout(resolve, 3000);
          });
        } catch (error) {
          // Continue anyway
        }
      }

      // Inject a simpler, more robust event monitoring script
      await webContents.executeJavaScript(`
        (function() {
          // Skip if already injected
          if (window.__nativeEventMonitorInjected) return;
          window.__nativeEventMonitorInjected = true;
          
          console.log('[NativeEventMonitor] Injecting event monitoring script');
          
          // Store original methods to avoid infinite loops
          const originalAddEventListener = EventTarget.prototype.addEventListener;
          const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
          const originalPushState = history.pushState;
          const originalReplaceState = history.replaceState;
          
          // List of events to monitor
          const eventsToMonitor = [
            'click', 'mousedown', 'mouseup', 'input', 'change', 'submit',
            'keydown', 'keyup', 'keypress', 'focus', 'blur', 'contextmenu'
          ];
          
          // Create a map to store our event listeners
          window.__nativeEventListeners = new Map();
          
          // Function to capture element details safely
          function captureElement(element) {
            if (!element || !element.tagName) return null;
            
            try {
              const rect = element.getBoundingClientRect();
              return {
                tagName: element.tagName.toLowerCase(),
                id: element.id || null,
                className: element.className?.toString() || null,
                type: element.type || null,
                value: element.value || null,
                href: element.href || null,
                text: element.textContent?.trim().substring(0, 100) || null,
                attributes: Array.from(element.attributes || []).reduce((obj, attr) => {
                  obj[attr.name] = attr.value;
                  return obj;
                }, {}),
                boundingRect: {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height
                }
              };
            } catch (e) {
              return { tagName: element.tagName.toLowerCase() };
            }
          }
          
          // Function to handle events
          function handleNativeEvent(event) {
            // Skip events that are not user-initiated
            if (!event.isTrusted) return;
            
            const target = event.target;
            if (!target || !target.tagName) return;
            
            // Prepare event data
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
            
            // Log the event data with a special prefix that our native monitor will look for
            console.log('__NATIVE_EVENT__:' + JSON.stringify(eventData));
          }
          
          // Add event listeners for all events we want to monitor
          eventsToMonitor.forEach(eventType => {
            const listener = (event) => handleNativeEvent(event);
            window.__nativeEventListeners.set(eventType, listener);
            
            // Use the original addEventListener to avoid infinite loops
            originalAddEventListener.call(document, eventType, listener, { capture: true, passive: true });
          });
          
          // Monitor navigation events
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
          
          // Add cleanup method
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
            
            // Restore original history methods
            history.pushState = originalPushState;
            history.replaceState = originalReplaceState;
          };
          
          // Special handling for Linear.app
          if (window.location.hostname.includes('linear.app')) {
            const originalDispatchEvent = EventTarget.prototype.dispatchEvent;
            EventTarget.prototype.dispatchEvent = function(event) {
              const result = originalDispatchEvent.call(this, event);
              
              // Only capture React synthetic events
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
          
          // Special handling for Google apps
          if (window.location.hostname.includes('google.com')) {
            const observer = new MutationObserver((mutations) => {
              for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                  const significantChange = Array.from(mutation.addedNodes).some(node => {
                    return node.nodeType === 1 && // ELEMENT_NODE
                           (node.nodeName === 'DIV' && node.childElementCount > 3);
                  });
                  
                  if (significantChange) {
                    console.log('__NATIVE_EVENT__:' + JSON.stringify({
                      type: 'dom_significant_change',
                      timestamp: Date.now(),
                      url: window.location.href,
                      title: document.title
                    }));
                  }
                }
              }
            });
            
            if (document.body) {
              observer.observe(document.body, {
                childList: true,
                subtree: true
              });
              
              // Store the observer for cleanup
              window.__googleMutationObserver = observer;
            }
          }
          
          // Special handling for GitHub
          if (window.location.hostname.includes('github.com')) {
            document.addEventListener('turbo:load', () => {
              console.log('__NATIVE_EVENT__:' + JSON.stringify({
                type: 'turbo_navigation',
                timestamp: Date.now(),
                url: window.location.href,
                title: document.title
              }));
            });
            
            // Also monitor navigation events for GitHub
            document.addEventListener('navigation:loaded', () => {
              console.log('__NATIVE_EVENT__:' + JSON.stringify({
                type: 'github_navigation',
                timestamp: Date.now(),
                url: window.location.href,
                title: document.title
              }));
            });
          }
          
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
          
          if (window.__googleMutationObserver) {
            window.__googleMutationObserver.disconnect();
            window.__googleMutationObserver = null;
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
    
    // Send the event to all renderer processes
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

// Initialize the native event monitor
export function initializeNativeEventMonitor(): NativeEventMonitor {
  return NativeEventMonitor.getInstance();
}
