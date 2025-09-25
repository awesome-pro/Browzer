import { IBrowserService, IpcRenderer, NavigationState } from '../types';
import { ExtensionStore } from './ExtensionService';
import { TabService } from './TabService';

/**
 * BrowserService handles browser navigation controls and URL management
 */
export class BrowserService implements IBrowserService {
  private ipcRenderer: IpcRenderer;
  private urlBar: HTMLInputElement | null = null;
  private backBtn: HTMLButtonElement | null = null;
  private forwardBtn: HTMLButtonElement | null = null;
  private reloadBtn: HTMLButtonElement | null = null;
  private goBtn: HTMLButtonElement | null = null;
  private runAgentBtn: HTMLButtonElement | null = null;
  private historyBtn: HTMLButtonElement | null = null;
  private settingsBtn: HTMLButtonElement | null = null;
  private extensionsBtn: HTMLButtonElement | null = null;

  private tabService: TabService;
  private extensionStore: ExtensionStore;

  private backClickCallback?: () => void;
  private forwardClickCallback?: () => void;
  private reloadClickCallback?: () => void;
  private goClickCallback?: () => void;
  private urlEnterCallback?: () => void;
  private runAgentClickCallback?: () => void;
  private historyClickCallback?: () => void;
  private settingsClickCallback?: () => void;
  private extensionsClickCallback?: () => void;

  constructor(ipcRenderer: IpcRenderer, tabService: TabService, extensionStore: ExtensionStore) {
    this.ipcRenderer = ipcRenderer;
    this.tabService = tabService;
    this.extensionStore = extensionStore;
  }

  public initializeElements(): void {
    try {
      this.urlBar = document.getElementById('urlBar') as HTMLInputElement;
      this.backBtn = document.getElementById('backBtn') as HTMLButtonElement;
      this.forwardBtn = document.getElementById('forwardBtn') as HTMLButtonElement;
      this.reloadBtn = document.getElementById('reloadBtn') as HTMLButtonElement;
      this.goBtn = document.getElementById('goBtn') as HTMLButtonElement;
      this.runAgentBtn = document.getElementById('runAgentBtn') as HTMLButtonElement;
      this.historyBtn = document.getElementById('historyBtn') as HTMLButtonElement;
      this.settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
      this.extensionsBtn = document.getElementById('extensionsBtn') as HTMLButtonElement;

      this.setupEventListeners();
      this.setupNavigationUpdateListener();

      console.log('[BrowserService] Elements initialized successfully');
    } catch (error) {
      console.error('[BrowserService] Failed to initialize elements:', error);
    }
  }

  private setupNavigationUpdateListener(): void {
    window.addEventListener('tab-selected', () => {
      setTimeout(() => {
        this.updateNavigationButtons();
      }, 200);
    });
  }

  private setupEventListeners(): void {
    // Back button
    if (this.backBtn) {
      this.backBtn.addEventListener('click', () => {
        if (this.backClickCallback) {
          this.backClickCallback();
        }
      });
    }

    // Forward button
    if (this.forwardBtn) {
      this.forwardBtn.addEventListener('click', () => {
        if (this.forwardClickCallback) {
          this.forwardClickCallback();
        }
      });
    }

    // Reload button
    if (this.reloadBtn) {
      this.reloadBtn.addEventListener('click', () => {
        if (this.reloadClickCallback) {
          this.reloadClickCallback();
        }
      });
    }

    // Go button
    if (this.goBtn) {
      this.goBtn.addEventListener('click', () => {
        if (this.goClickCallback) {
          this.goClickCallback();
        }
      });
    }

    // URL bar enter key
    if (this.urlBar) {
      this.urlBar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && this.urlEnterCallback) {
          this.urlEnterCallback();
        }
      });
    }

    // Run agent button
    if (this.runAgentBtn) {
      this.runAgentBtn.addEventListener('click', () => {
        if (this.runAgentClickCallback) {
          this.runAgentClickCallback();
        }
      });
    }

    // History button
    if (this.historyBtn) {
      this.historyBtn.addEventListener('click', () => {
        if (this.historyClickCallback) {
          this.historyClickCallback();
        }
      });
    }
    
    // Settings button
    if (this.settingsBtn) {
      this.settingsBtn.addEventListener('click', () => {
        if (this.settingsClickCallback) {
          this.settingsClickCallback();
        }
      });
    }
    
    // Extensions button
    if (this.extensionsBtn) {
      this.extensionsBtn.addEventListener('click', () => {
        if (this.extensionsClickCallback) {
          this.extensionsClickCallback();
        }
      });
    }
  }

  public onBackClick(callback: () => void): void {
    this.backClickCallback = callback;
  }

  public onForwardClick(callback: () => void): void {
    this.forwardClickCallback = callback;
  }

  public onReloadClick(callback: () => void): void {
    this.reloadClickCallback = callback;
  }

  public onGoClick(callback: () => void): void {
    this.goClickCallback = callback;
  }

  public onUrlEnter(callback: () => void): void {
    this.urlEnterCallback = callback;
  }

  public onRunAgentClick(callback: () => void): void {
    this.runAgentClickCallback = callback;
  }

  public onHistoryClick(callback: () => void): void {
    this.historyClickCallback = callback;
  }

  public onSettingsClick(callback: () => void): void {
    this.settingsClickCallback = callback;
  }

  public onExtensionsClick(callback: () => void): void {
    this.extensionsClickCallback = callback;
  }

  public updateNavigationButtons(): void {
    const webview = this.tabService.getActiveWebview();
    
    if (!webview) {
      this.disableNavigationButtons();
      return;
    }

    // Wait for webview to be ready before checking navigation state
    setTimeout(() => {
      if (this.tabService.isWebviewReady(webview)) {
        try {
          const canGoBack = webview.canGoBack();
          const canGoForward = webview.canGoForward();
          
          if (this.backBtn) {
            this.backBtn.disabled = !canGoBack;
          }
          if (this.forwardBtn) {
            this.forwardBtn.disabled = !canGoForward;
          }
        } catch (error) {
          // Retry after a short delay if webview isn't fully ready
          setTimeout(() => this.updateNavigationButtons(), 500);
        }
      } else {
        this.disableNavigationButtons();
        
        // Retry checking webview readiness
        setTimeout(() => this.updateNavigationButtons(), 1000);
      }
    }, 100);
  }

  public setNavigationState(state: NavigationState): void {
    if (this.backBtn) {
      this.backBtn.disabled = !state.canGoBack;
    }
    if (this.forwardBtn) {
      this.forwardBtn.disabled = !state.canGoForward;
    }
    if (this.urlBar && state.url) {
      this.urlBar.value = state.url;
    }
  }

  public getUrlBarValue(): string {
    return this.urlBar?.value?.trim() || '';
  }

  public setUrlBarValue(value: string): void {
    if (this.urlBar) {
      this.urlBar.value = value;
    }
  }

  public focusUrlBar(): void {
    if (this.urlBar) {
      this.urlBar.focus();
      this.urlBar.select();
    }
  }

  public processUrl(url: string): string {
    if (!url) return '';

    // Handle special URLs
    if (url === 'file://browzer-store' || url === 'browzer-store') {
      return url;
    }

    // Trim whitespace
    url = url.trim();

    // Search query detection (enhanced)
    const hasSpaces = url.includes(' ');
    const hasDot = url.includes('.');
    const hasProtocol = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://');
    
    // If it contains spaces or doesn't look like a URL, treat as search
    if (hasSpaces || (!hasProtocol && !hasDot)) {
      return 'https://www.google.com/search?q=' + encodeURIComponent(url);
    }

    // Add protocol if missing for URLs
    if (!hasProtocol && hasDot) {
      return 'https://' + url;
    }

    return url;
  }


  public enableNavigationButtons(canGoBack: boolean, canGoForward: boolean): void {
    if (this.backBtn) {
      this.backBtn.disabled = !canGoBack;
    }
    if (this.forwardBtn) {
      this.forwardBtn.disabled = !canGoForward;
    }
  }

  public disableNavigationButtons(): void {
    if (this.backBtn) {
      this.backBtn.disabled = true;
    }
    if (this.forwardBtn) {
      this.forwardBtn.disabled = true;
    }
  }

  public navigateToUrl(): void {
    if (!this.urlBar) return;
  
    let url = this.urlBar.value.trim();
    if (!url) return;
  
    // Handle special internal URLs
    if (url === 'file://browzer-store' || url === 'browzer-store') {
      this.extensionStore.show();
      return; 
    }
  
    // Process URL (includes search detection and protocol addition)
    const processedUrl = this.processUrl(url);
    
    const webview = this.tabService.getActiveWebview();
    if (webview) {
      webview.loadURL(processedUrl);
      
      // Update navigation buttons after navigation starts
      setTimeout(() => {
        this.updateNavigationButtons();
      }, 500);
    }
  }

  public destroy(): void {
    try {
      // Remove event listeners by replacing elements
      if (this.backBtn) {
        const newBackBtn = this.backBtn.cloneNode(true) as HTMLButtonElement;
        this.backBtn.parentNode?.replaceChild(newBackBtn, this.backBtn);
      }
      
      if (this.forwardBtn) {
        const newForwardBtn = this.forwardBtn.cloneNode(true) as HTMLButtonElement;
        this.forwardBtn.parentNode?.replaceChild(newForwardBtn, this.forwardBtn);
      }
      
      if (this.reloadBtn) {
        const newReloadBtn = this.reloadBtn.cloneNode(true) as HTMLButtonElement;
        this.reloadBtn.parentNode?.replaceChild(newReloadBtn, this.reloadBtn);
      }
      
      if (this.goBtn) {
        const newGoBtn = this.goBtn.cloneNode(true) as HTMLButtonElement;
        this.goBtn.parentNode?.replaceChild(newGoBtn, this.goBtn);
      }
      
      if (this.runAgentBtn) {
        const newRunAgentBtn = this.runAgentBtn.cloneNode(true) as HTMLButtonElement;
        this.runAgentBtn.parentNode?.replaceChild(newRunAgentBtn, this.runAgentBtn);
      }
      
      if (this.historyBtn) {
        const newHistoryBtn = this.historyBtn.cloneNode(true) as HTMLButtonElement;
        this.historyBtn.parentNode?.replaceChild(newHistoryBtn, this.historyBtn);
      }
      
      if (this.urlBar) {
        const newUrlBar = this.urlBar.cloneNode(true) as HTMLInputElement;
        this.urlBar.parentNode?.replaceChild(newUrlBar, this.urlBar);
      }

      // Clear references
      this.urlBar = null;
      this.backBtn = null;
      this.forwardBtn = null;
      this.reloadBtn = null;
      this.goBtn = null;
      this.runAgentBtn = null;
      this.historyBtn = null;
      this.settingsBtn = null;
      this.extensionsBtn = null;

      // Clear callbacks
      this.backClickCallback = undefined;
      this.forwardClickCallback = undefined;
      this.reloadClickCallback = undefined;
      this.goClickCallback = undefined;
      this.urlEnterCallback = undefined;
      this.runAgentClickCallback = undefined;
      this.historyClickCallback = undefined;
      this.settingsClickCallback = undefined;
      this.extensionsClickCallback = undefined;

    } catch (error) {
      console.error('[BrowserService] Error during destruction:', error);
    }
  }
}
