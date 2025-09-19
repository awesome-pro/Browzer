import { IWebviewManager, IpcRenderer} from '../types';
import { SmartRecordingEngine } from '../components/RecordingEngine';
import CONSTANTS from '../../constants';
import { AdBlockService } from './AdBlockService';
import { HistoryService } from './HistoryService';

/**
 * WebviewManager handles webview creation, configuration, and event management
 */
export class WebviewManager implements IWebviewManager {
  private ipcRenderer: IpcRenderer;
  private webviewsContainer: HTMLElement | null = null;
  private homepageUrl: string;
  private adBlockService: AdBlockService;
  private historyService: HistoryService;

  constructor(ipcRenderer: IpcRenderer, adBlockService: AdBlockService, historyService: HistoryService) {
    this.ipcRenderer = ipcRenderer;
    this.homepageUrl = localStorage.getItem(CONSTANTS.HOMEPAGE_KEY) || CONSTANTS.DEFAULT_HOMEPAGE;
    this.adBlockService = adBlockService;
    this.historyService = historyService;
  }

  public initializeElements(): void {
    try {
      this.webviewsContainer = document.querySelector('.webviews-container') as HTMLElement;
    } catch (error) {
      console.error('[WebviewManager] Failed to initialize elements:', error);
    }
  }

  public createWebview(tabId: string, url: string): any {
    if (!this.webviewsContainer) {
      console.error('[WebviewManager] Cannot create webview: container not found');
      return null;
    }

    try {
      const webviewId = 'webview-' + tabId;
      const webview = document.createElement('webview') as any;
      webview.id = webviewId;
      webview.className = 'webview';

      // Configure webview asynchronously
      this.configureWebview(webview, url).catch(error => {
        console.error('🔴 [WebviewManager] Failed to configure webview:', error);
      });

      this.webviewsContainer.appendChild(webview);
      this.setupWebviewEvents(webview);

      console.log('[WebviewManager] Webview created:', webviewId);
      return webview;
    } catch (error) {
      console.error('🔴 [WebviewManager] Error creating webview:', error);
      return null;
    }
  }

  public async configureWebview(webview: any, url: string): Promise<void> {
    try {
      // CRITICAL FIX: Use contextIsolation=false and nodeIntegration=true for webview preload
      const webPreferencesArray = [
        'contextIsolation=false',  // MUST be false for webview preload to work
        'nodeIntegration=true',    // MUST be true for ipcRenderer access
        'webSecurity=true',
        'sandbox=false',
        'javascript=true',
        'plugins=true',
        'images=true',
        'devTools=true'
      ];

      // Set attributes
      webview.setAttribute('webpreferences', webPreferencesArray.join(', '));
      webview.setAttribute('allowpopups', 'true');
      webview.setAttribute('nodeintegration', 'true');
      webview.setAttribute('disablewebsecurity', 'false');

      // CRITICAL: Set preload FIRST, BEFORE setting src
      console.log('[WebviewManager] Getting preload path for webview...');
      
      const preloadPath = await this.ipcRenderer.invoke('get-webview-preload-path');
      console.log('[WebviewManager] Got preload path:', preloadPath);
      
      // STEP 1: Set preload attribute
      webview.setAttribute('preload', preloadPath);
      console.log('[WebviewManager] Preload attribute set');
      
      // STEP 2: Set the src URL
      let finalUrl = url;
      
      if (url === CONSTANTS.NEW_TAB_URL) {
        finalUrl = this.homepageUrl;
        console.log('[WebviewManager] Setting homepage URL:', finalUrl);
      } else if (url.startsWith('file://browzer-settings')) {
        // Handle settings pages
        try {
          const settingsFilePath = await (window as any).electronAPI.getResourcePath('src/renderer/settings.html');
          const settingsPath = `file://${settingsFilePath}`;
          const anchorIndex = url.indexOf('#');
          finalUrl = anchorIndex !== -1 ? settingsPath + url.substring(anchorIndex) : settingsPath;
          console.log('[WebviewManager] Setting settings URL:', finalUrl);
        } catch (error) {
          console.error('[WebviewManager] Settings path error:', error);
          const cwd = (window as any).electronAPI.cwd();
          finalUrl = `file://${(window as any).electronAPI.path.join(cwd, 'src/renderer/settings.html')}`;
        }
      } else {
        console.log('[WebviewManager] Setting regular URL:', finalUrl);
      }
      
      webview.setAttribute('src', finalUrl);
      console.log('[WebviewManager] Configuration complete for URL:', finalUrl);
      
    } catch (error) {
      console.error('[WebviewManager] Failed to get preload path:', error);
      // Set URL anyway as fallback
      if (url !== CONSTANTS.NEW_TAB_URL && !url.startsWith('file://browzer-settings')) {
        webview.setAttribute('src', url);
      } else {
        webview.setAttribute('src', this.homepageUrl);
      }
    }
  }

  public setupWebviewEvents(webview: any): void {
    console.log('[WebviewManager] Setting up webview events for:', webview.id);

    // Loading events
    webview.addEventListener('did-start-loading', () => {
      this.handleLoadingStart(webview);
    });

    webview.addEventListener('did-finish-load', () => {
      this.handleLoadingFinish(webview);
    });

    webview.addEventListener('did-fail-load', () => {
      this.handleLoadingFail(webview);
    });

    // Navigation events
    webview.addEventListener('will-navigate', (e: any) => {
      console.log('[WebviewManager] Navigation will start to:', e.url);
      this.updateUrlBar(webview, e.url);
    });

    webview.addEventListener('did-navigate', (e: any) => {
      console.log('[WebviewManager] Navigation completed to:', e.url);
      this.updateUrlBar(webview, e.url);
    });

    webview.addEventListener('did-navigate-in-page', (e: any) => {
      console.log('[WebviewManager] In-page navigation to:', e.url);
      this.updateUrlBar(webview, e.url);
    });

    // New window handling
    webview.addEventListener('new-window', (e: any) => {
      this.handleNewWindow(webview, e);
    });

    // Permission requests
    webview.addEventListener('permission-request', (e: any) => {
      this.handlePermissionRequest(webview, e);
    });

    // Certificate errors
    webview.addEventListener('certificate-error', (e: any) => {
      console.log('[WebviewManager] Certificate error for:', e.url);
    });

    // IPC messages
    webview.addEventListener('ipc-message', (event: any) => {
      console.log('[WebviewManager] Received ipc-message from webview:', webview.id, 'channel:', event.channel);
    });

    // DOM ready event
    webview.addEventListener('dom-ready', () => {
      this.handleDomReady(webview);
    });

    console.log('[WebviewManager] All event listeners set up for:', webview.id);
  }

  private handleLoadingStart(webview: any): void {
    const tabElement = this.getTabElementByWebviewId(webview.id);
    if (tabElement) {
      tabElement.classList.add('loading');
    }
  }

  private handleLoadingFinish(webview: any): void {
    const tabElement = this.getTabElementByWebviewId(webview.id);
    if (tabElement) {
      tabElement.classList.remove('loading');
    }

    // Update URL bar and title
    this.updateUrlBar(webview, webview.src);
    
    // Setup recording for this webview
    this.setupRecordingForWebview(webview);


    // Track page visit in history - THIS IS THE KEY FIX!
    const url = webview.src;
    const webviewTitle = webview.getTitle();

    console.log('🔍 [HISTORY TRACK] did-finish-load event:', {
      webviewId: webview.id,
      url: url,
      webviewTitle: webviewTitle,
      isAboutBlank: url === 'about:blank'
    });

    if (url && url !== 'about:blank' && !url.startsWith('file://')) {
      console.log('✅ [HISTORY TRACK] Tracking page visit with webview title:', { url, title: webviewTitle });
      this.historyService.addVisit(url, webviewTitle);
    } else {
      console.log('❌ [HISTORY TRACK] Skipping page visit - invalid URL or about:blank');
    }

    // Inject ad block CSS
    setTimeout(() => {
      if (webview && !webview.isDestroyed && webview.executeJavaScript) {
        this.adBlockService.injectAdBlockCSS(webview);
      }
    }, 500);
  }

  private handleLoadingFail(webview: any): void {
    const tabElement = this.getTabElementByWebviewId(webview.id);
    if (tabElement) {
      tabElement.classList.remove('loading');
    }
    this.updateUrlBar(webview, webview.src);
  }

  private handleNewWindow(webview: any, e: any): void {
    console.log('[WebviewManager] New window requested:', e.url);
    
    // For OAuth flows, open in the same tab to maintain session
    const isAuthFlow = e.url && (
      e.url.includes('accounts.google.com') ||
      e.url.includes('login.microsoftonline.com') ||
      e.url.includes('oauth') ||
      e.url.includes('auth') ||
      e.url.includes('signin') ||
      e.url.includes('login') ||
      e.url.includes('authorize')
    );
    
    if (isAuthFlow) {
      console.log('[WebviewManager] OAuth flow detected, navigating in current tab');
      webview.src = e.url;
    } else {
      console.log('[WebviewManager] Opening in new tab');
      // Emit event for new tab creation
      window.dispatchEvent(new CustomEvent('webview-new-tab', { detail: { url: e.url } }));
    }
  }

  private handlePermissionRequest(webview: any, e: any): void {
    console.log('[WebviewManager] Permission requested:', e.permission, 'for:', webview.src);
    
    const allowedPermissions = ['geolocation', 'notifications', 'camera', 'microphone'];
    const isAuthSite = webview.src && (
      webview.src.includes('accounts.google.com') ||
      webview.src.includes('login.microsoftonline.com') ||
      webview.src.includes('github.com') ||
      webview.src.includes('oauth')
    );
    
    if (isAuthSite && allowedPermissions.includes(e.permission)) {
      e.request.allow();
    } else if (e.permission === 'notifications') {
      e.request.allow();
    } else {
      e.request.deny();
    }
  }

  private handleDomReady(webview: any): void {
    console.log('[WebviewManager] DOM ready for webview:', webview.id);
    
    // Test preload script loading
    setTimeout(async () => {
      try {
        const testResult = await webview.executeJavaScript(`
          (function() {
            if (typeof window.__webviewRecorder !== 'undefined') {
              console.log('[WebviewManager] Preload script loaded successfully!');
              return { success: true, message: 'Preload script loaded' };
            } else {
              console.error('[WebviewManager] Preload script NOT loaded!');
              return { success: false, message: 'Preload script missing' };
            }
          })();
        `);
        
        console.log('[WebviewManager] Preload test result:', testResult);
        
        if (!testResult.success) {
          console.error('[WebviewManager] ⚠️ Preload script failed to load');
          // Optional: Show visual indicator in webview
          webview.executeJavaScript(`
            (function() {
              const div = document.createElement('div');
              div.style.cssText = 'position:fixed;top:0;left:0;background:rgba(255,0,0,0.8);color:white;padding:5px;font-size:12px;z-index:9999;';
              div.textContent = 'Recording preload failed!';
              document.body.appendChild(div);
              setTimeout(() => div.remove(), 3000);
            })();
          `).catch(() => {}); // Ignore errors
        }
      } catch (error) {
        console.error('[WebviewManager] Failed to test preload script:', error);
      }
    }, 1000);
    
    // Register with RecordingEngine - use the same method as handleLoadingFinish
    this.setupRecordingForWebview(webview);
    console.log(`[WebviewManager] Webview ${webview.id} registered with RecordingEngine`);
  }

  private setupRecordingForWebview(webview: any): void {
    try {
      // Get recording service from the global app
      const app = (window as any).browzerApp;
      if (app && app.recordingService) {
        app.recordingService.setupWebviewRecording(webview);
      } else {
        // Fallback to direct engine access
        const recordingEngine = SmartRecordingEngine.getInstance();
        recordingEngine.setupWebviewRecording(webview);
      }
      console.log('[WebviewManager] Recording setup complete for webview:', webview.id);
    } catch (error) {
      console.error('[WebviewManager] Failed to setup recording:', error);
    }
  }

  public extractPageContent(webview: any): any {
    try {
      const extractScript = `
        (function() {
          try {
            const title = document.title || '';
            
            let description = "";
            try {
              const metaDesc = document.querySelector('meta[name="description"]');
              if (metaDesc) description = metaDesc.getAttribute('content') || '';
            } catch(e) {
              console.error('Error getting meta description:', e);
            }
            
            // Get both text content and full HTML
            const mainContent = document.querySelector('article') || 
                              document.querySelector('main') || 
                              document.querySelector('.content') ||
                              document.querySelector('#content') ||
                              document.body;
            
            const bodyText = mainContent ? mainContent.innerText.replace(/\\s+/g, ' ').trim() : '';
            const bodyHTML = mainContent ? mainContent.innerHTML : document.body.innerHTML;
            
            return {
              title: title,
              description: description,
              content: bodyText,
              html: bodyHTML,
              url: window.location.href
            };
          } catch(finalError) {
            console.error('Fatal error in content extraction:', finalError);
            return {
              title: document.title || '',
              description: '',
              content: 'Error extracting content: ' + finalError.message,
              html: '',
              url: window.location.href
            };
          }
        })();
      `;
      
      const result = webview.executeJavaScript(extractScript);
      return result || { title: '', description: '', content: '', html: '', url: '' };
    } catch (error) {
      console.error('Error in extractPageContent:', error);
      return { title: '', description: '', content: '', html: '', url: '' };
    }
  }

  private updateUrlBar(webview: any, url: string): void {
    // Check if this is the active webview
    if (this.isActiveWebview(webview)) {
      const urlBar = document.getElementById('urlBar') as HTMLInputElement;
      if (urlBar) {
        urlBar.value = url;
      }
    }
  }

  private isActiveWebview(webview: any): boolean {
    return webview && webview.classList.contains('active');
  }

  private getTabElementByWebviewId(webviewId: string): HTMLElement | null {
    const webviewElement = document.getElementById(webviewId);
    if (!webviewElement) return null;
    
    const tabId = webviewId.replace('webview-', '');
    return document.getElementById(tabId);
  }

  public isWebviewReady(webview: any): boolean {
    try {
      return webview && 
             webview.nodeType === Node.ELEMENT_NODE &&
             webview.parentNode &&
             typeof webview.canGoBack === 'function' &&
             webview.getWebContentsId !== undefined;
    } catch (error) {
      return false;
    }
  }

  public notifyAllWebviews(message: string, data?: any): void {
    console.log('[WebviewManager] Notifying all webviews:', message);
    document.querySelectorAll('webview').forEach((webview: any) => {
      try {
        console.log(`[WebviewManager] Sending ${message} to webview ${webview.id}`);
        webview.send(message, data);
      } catch (error) {
        console.error(`[WebviewManager] Failed to send ${message} to webview:`, error);
      }
    });
  }

  public initializeSidebar(): void {
    const rawValue = localStorage.getItem('sidebarEnabled');
    const savedSidebarEnabled = rawValue === 'true';
    this.applySidebarLayout(savedSidebarEnabled);
    this.setupCollapseExpandButtons();
  }

  private applySidebarLayout(enabled: boolean): void {
    const browserContainer = document.querySelector('.browser-container');
    if (browserContainer) {
      if (enabled) {
        browserContainer.classList.add('sidebar-enabled');
      } else {
        browserContainer.classList.remove('sidebar-enabled');
      }
    }
  }

  private setupCollapseExpandButtons(): void {
    const browserContainer = document.querySelector('.browser-container');
    const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');
    
    if (sidebarCollapseBtn && browserContainer) {
      const sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
      if (sidebarCollapsed) {
        browserContainer.classList.add('sidebar-collapsed');
      }

      sidebarCollapseBtn.addEventListener('click', () => {
        const isCurrentlyCollapsed = browserContainer.classList.contains('sidebar-collapsed');
        if (isCurrentlyCollapsed) {
          browserContainer.classList.remove('sidebar-collapsed');
          localStorage.setItem('sidebarCollapsed', 'false');
        } else {
          browserContainer.classList.add('sidebar-collapsed');
          localStorage.setItem('sidebarCollapsed', 'true');
        }
      });
    }

    // Cleanup old assistant collapsed state
    localStorage.removeItem('assistantCollapsed');
    if (browserContainer) {
      browserContainer.classList.remove('assistant-collapsed');
    }
  }


  public destroy(): void {
    try {
      // Remove all webviews
      if (this.webviewsContainer) {
        const webviews = this.webviewsContainer.querySelectorAll('webview');
        webviews.forEach(webview => {
          try {
            webview.remove();
          } catch (error) {
            console.error('[WebviewManager] Error removing webview:', error);
          }
        });
      }

      // Clear references
      this.webviewsContainer = null;

      console.log('[WebviewManager] Destroyed successfully');
    } catch (error) {
      console.error('[WebviewManager] Error during destruction:', error);
    }
  }
}
