import { IWebviewService, IpcRenderer} from '../types';
import { SmartRecordingEngine } from '../components/RecordingEngine';
import CONSTANTS from '../constants';
import { AdBlockService } from './AdBlockService';
import { HistoryService } from './HistoryService';

/**
 * WebviewManager handles webview creation, configuration, and event management
 */
export class WebviewService implements IWebviewService {
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
      console.error('[WebviewService] Failed to initialize elements:', error);
    }
  }

  public createWebview(tabId: string, url: string): any {
    if (!this.webviewsContainer) {
      console.error('[WebviewService] Cannot create webview: container not found');
      return null;
    }

    try {
      const webviewId = 'webview-' + tabId;
      const webview = document.createElement('webview') as any;
      webview.id = webviewId;
      webview.className = 'webview';
      this.configureWebview(webview, url).catch(error => {
        console.error('🔴 [WebviewService] Failed to configure webview:', error);
      });

      this.webviewsContainer.appendChild(webview);
      this.setupWebviewEvents(webview);

      console.log('[WebviewService] Webview created:', webviewId);
      return webview;
    } catch (error) {
      console.error('🔴 [WebviewService] Error creating webview:', error);
      return null;
    }
  }

  public async configureWebview(webview: any, url: string): Promise<void> {
    try {
      const webPreferencesArray = [
        'contextIsolation=false',
        'nodeIntegration=true',
        'webSecurity=true',
        'sandbox=false',
        'javascript=true',
        'plugins=true',
        'images=true',
        'devTools=true'
      ];
      webview.setAttribute('webpreferences', webPreferencesArray.join(', '));
      webview.setAttribute('allowpopups', 'true');
      webview.setAttribute('nodeintegration', 'true');
      webview.setAttribute('disablewebsecurity', 'false');
      
      let finalUrl = url;
      if (url === CONSTANTS.NEW_TAB_URL) {
        finalUrl = this.homepageUrl;
      }
      
      webview.setAttribute('src', finalUrl);
    } catch (error) {
      console.error('🔴 [WebviewService] Error configuring webview:', error);
    }
  }

  public setupWebviewEvents(webview: any): void {
    webview.addEventListener('did-start-loading', () => {
      this.handleLoadingStart(webview);
    });

    webview.addEventListener('did-finish-load', () => {
      this.handleLoadingFinish(webview);
      setTimeout(async () => {
        try {
          const title = await webview.executeJavaScript('document.title');
          if (title && title.trim()) {
            this.handleTitleUpdate(webview, title);
          }
        } catch (error) {
          console.error('🔴 [WebviewService] Could not get title via JS execution:', error);
        }
      }, 1000);

      setTimeout(async () => {
        try {
          const favicon = await webview.executeJavaScript(`
            (function() {
              const favicon = document.querySelector('link[rel*="icon"]');
              return favicon ? favicon.href : null;
            })()
          `);
          if (favicon) {
            this.handleFaviconUpdate(webview, favicon);
          }
        } catch (error) {
          console.log('[WebviewService] Could not get favicon via JS execution:', error);
        }
      }, 1500);
    });


    webview.addEventListener('did-fail-load', () => {
      this.handleLoadingFail(webview);
    });
    webview.addEventListener('will-navigate', (e: any) => {
      this.updateUrlBar(webview, e.url);
      this.notifyTabUrlChange(webview, e.url);
    });

    webview.addEventListener('did-navigate', (e: any) => {
      this.updateUrlBar(webview, e.url);
      this.notifyTabUrlChange(webview, e.url);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('webview-navigation-changed', { 
          detail: { webviewId: webview.id } 
        }));
      }, 200);
    });

    webview.addEventListener('did-navigate-in-page', (e: any) => {
      this.updateUrlBar(webview, e.url);
      this.notifyTabUrlChange(webview, e.url);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('webview-navigation-changed', { 
          detail: { webviewId: webview.id } 
        }));
      }, 200);
    });

    webview.addEventListener('page-title-updated', (e: any) => {
      this.handleTitleUpdate(webview, e.title);
    });

    webview.addEventListener('page-favicon-updated', (e: any) => {
      if (e.favicons && e.favicons.length > 0) {
        this.handleFaviconUpdate(webview, e.favicons[0]);
      }
    });
    webview.addEventListener('new-window', (e: any) => {
      this.handleNewWindow(webview, e);
    });
    webview.addEventListener('permission-request', (e: any) => {
      this.handlePermissionRequest(webview, e);
    });
    webview.addEventListener('certificate-error', (e: any) => {
      console.log('[WebviewService] Certificate error for:', e.url);
    });
    webview.addEventListener('ipc-message', (event: any) => {
      console.log('[WebviewService] Received ipc-message from webview:', webview.id, 'channel:', event.channel);
    });
    webview.addEventListener('dom-ready', () => {
      this.handleDomReady(webview);
    });
  }

  private handleLoadingStart(webview: any): void {
    const tabElement = this.getTabElementByWebviewId(webview.id);
    if (tabElement) {
      tabElement.classList.add('loading');
    }
  }

  private handleTitleUpdate(webview: any, title: string): void {
    const titleEvent = new CustomEvent('webview-title-updated', {
      detail: { webviewId: webview.id, title: title }
    });
    window.dispatchEvent(titleEvent);
  }
  private handleFaviconUpdate(webview: any, faviconUrl: string): void {
    const faviconEvent = new CustomEvent('webview-favicon-updated', {
      detail: { webviewId: webview.id, faviconUrl: faviconUrl }
    });
    window.dispatchEvent(faviconEvent);
  }

  private notifyTabUrlChange(webview: any, url: string): void {
    const urlEvent = new CustomEvent('webview-url-changed', {
      detail: { webviewId: webview.id, url: url }
    });
    window.dispatchEvent(urlEvent);
  }


  private handleLoadingFinish(webview: any): void {
    const tabElement = this.getTabElementByWebviewId(webview.id);
    if (tabElement) {
      tabElement.classList.remove('loading');
    }
  
    this.updateUrlBar(webview, webview.src);
    this.notifyTabUrlChange(webview, webview.src);
    
    this.setupRecordingForWebview(webview);

    const url = webview.src;
    const webviewTitle = webview.getTitle();

    if (url && url !== 'about:blank' && !url.startsWith('file://')) {
      this.historyService.addVisit(url, webviewTitle);
    } 
    setTimeout(() => {
      if (webview && !webview.isDestroyed && webview.executeJavaScript) {
        this.adBlockService.injectAdBlockCSS(webview);
      }
    }, 500);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('webview-navigation-changed', { 
        detail: { webviewId: webview.id } 
      }));
    }, 1000);
  }

  private handleLoadingFail(webview: any): void {
    const tabElement = this.getTabElementByWebviewId(webview.id);
    if (tabElement) {
      tabElement.classList.remove('loading');
    }
    this.updateUrlBar(webview, webview.src);
  }

  private handleNewWindow(webview: any, e: any): void {
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
      webview.src = e.url;
    } else {
      window.dispatchEvent(new CustomEvent('webview-new-tab', { detail: { url: e.url } }));
    }
  }

  private handlePermissionRequest(webview: any, e: any): void {
    
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
    try {
      const webContentsId = webview.getWebContentsId();
      if (webContentsId) {
        this.ipcRenderer.send('register-webview-for-monitoring', webContentsId);
        console.log('[WebviewManager] Registered webview with native event monitor, ID:', webContentsId);
      }
    } catch (error) {
      console.error('[WebviewManager] Failed to register webview with native event monitor:', error);
    }
    
    this.setupRecordingForWebview(webview);
  }

  private setupRecordingForWebview(webview: any): void {
    try {
      const app = (window as any).browzerApp;
      if (app && app.recordingService) {
        app.recordingService.setupWebviewRecording(webview);
      } else {
        const recordingEngine = SmartRecordingEngine.getInstance();
        recordingEngine.setupRecording(webview);
      }
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
    document.querySelectorAll('webview').forEach((webview: any) => {
      try {
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

    localStorage.removeItem('assistantCollapsed');
    if (browserContainer) {
      browserContainer.classList.remove('assistant-collapsed');
    }
  }


  public destroy(): void {
    try {
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
      this.webviewsContainer = null;
    } catch (error) {
      console.error('[WebviewManager] Error during destruction:', error);
    }
  }
}
