import { IExtensionStore } from '../types';
import CONSTANTS from '../../constants';

/**
 * ExtensionStore handles the extension marketplace functionality
 */
export class ExtensionStore implements IExtensionStore {
  private storeContainer: HTMLElement | null = null;
  private isInitialized: boolean = false;

  public initialize(): void {
    try {
      this.setupStoreContainer();
      this.isInitialized = true;
      console.log('[ExtensionStore] Initialized successfully');
    } catch (error) {
      console.error('[ExtensionStore] Failed to initialize:', error);
    }
  }

  private setupStoreContainer(): void {
    // The store container will be created when first shown
    // This matches the original implementation pattern
  }

  public show(): void {
    try {
      // Hide current webview
      const currentWebview = this.getActiveWebview();
      if (currentWebview) {
        currentWebview.style.display = 'none';
      }
      
      // Create or show store container
      this.ensureStoreContainer();
      
      if (this.storeContainer) {
        this.storeContainer.style.display = 'block';
        this.storeContainer.classList.add('active');
      }
      
      // Update URL bar
      const urlBar = document.getElementById('urlBar') as HTMLInputElement;
      if (urlBar) {
        urlBar.value = CONSTANTS.EXTENSION_STORE_URL;
      }

      // Update active tab info
      this.updateActiveTabForStore();
      
      // Disable navigation buttons for the store
      this.disableNavigationButtons();
      
      console.log('[ExtensionStore] Store shown');
    } catch (error) {
      console.error('[ExtensionStore] Error showing store:', error);
    }
  }

  public hide(): void {
    try {
      if (this.storeContainer) {
        this.storeContainer.style.display = 'none';
        this.storeContainer.classList.remove('active');
      }
      
      // Show the active webview
      const activeWebview = this.getActiveWebview();
      if (activeWebview) {
        activeWebview.style.display = 'flex';
        activeWebview.classList.add('active');
        
        // Update URL bar with webview URL
        const urlBar = document.getElementById('urlBar') as HTMLInputElement;
        if (urlBar && activeWebview.src) {
          urlBar.value = activeWebview.src;
        }
      }
      
      console.log('[ExtensionStore] Store hidden');
    } catch (error) {
      console.error('[ExtensionStore] Error hiding store:', error);
    }
  }

  private ensureStoreContainer(): void {
    if (!this.storeContainer) {
      this.storeContainer = document.getElementById('extension-store-container');
      
      if (!this.storeContainer) {
        const webviewsContainer = document.querySelector('.webviews-container');
        if (!webviewsContainer) {
          console.error('[ExtensionStore] Webviews container not found');
          return;
        }
        
        this.storeContainer = document.createElement('div');
        this.storeContainer.id = 'extension-store-container';
        this.storeContainer.className = 'webview';
        this.storeContainer.style.display = 'none';
        
        // Add store content
        this.storeContainer.innerHTML = this.getStoreHTML();
        
        webviewsContainer.appendChild(this.storeContainer);
        
        // Setup store event listeners
        this.setupStoreEventListeners();
      }
    }
  }

  private getStoreHTML(): string {
    return `
      <div class="extension-store">
        <div class="store-header">
          <h1>🧩 Browzer Extension Store</h1>
          <p>Discover and install extensions to enhance your browsing experience</p>
        </div>
        
        <div class="store-content">
          <div class="store-section">
            <h2>Featured Extensions</h2>
            <div class="extension-grid">
              <div class="extension-card">
                <div class="extension-icon">🤖</div>
                <h3>AI Assistant</h3>
                <p>Get AI-powered help with web content analysis and summarization</p>
                <button class="install-btn" data-extension="ai-assistant">Install</button>
              </div>
              
              <div class="extension-card">
                <div class="extension-icon">📊</div>
                <h3>Analytics Tracker</h3>
                <p>Track and analyze website performance and user behavior</p>
                <button class="install-btn" data-extension="analytics">Install</button>
              </div>
              
              <div class="extension-card">
                <div class="extension-icon">🔒</div>
                <h3>Privacy Guard</h3>
                <p>Enhanced privacy protection and tracker blocking</p>
                <button class="install-btn" data-extension="privacy-guard">Install</button>
              </div>
              
              <div class="extension-card">
                <div class="extension-icon">⚡</div>
                <h3>Speed Optimizer</h3>
                <p>Optimize page loading speed and performance</p>
                <button class="install-btn" data-extension="speed-optimizer">Install</button>
              </div>
            </div>
          </div>
          
          <div class="store-section">
            <h2>Developer Tools</h2>
            <div class="extension-grid">
              <div class="extension-card">
                <div class="extension-icon">🛠️</div>
                <h3>Extension Builder</h3>
                <p>Create and test your own Browzer extensions</p>
                <button class="install-btn" data-extension="extension-builder">Install</button>
              </div>
              
              <div class="extension-card">
                <div class="extension-icon">🐛</div>
                <h3>Debug Console</h3>
                <p>Advanced debugging tools for web development</p>
                <button class="install-btn" data-extension="debug-console">Install</button>
              </div>
            </div>
          </div>
          
          <div class="store-section">
            <h2>Installed Extensions</h2>
            <div id="installed-extensions" class="extension-grid">
              <p class="no-extensions">No extensions installed yet</p>
            </div>
          </div>
        </div>
      </div>
      
      <style>
        .extension-store {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .store-header {
          text-align: center;
          margin-bottom: 40px;
        }
        
        .store-header h1 {
          font-size: 2.5em;
          margin: 0 0 10px 0;
          color: #333;
        }
        
        .store-header p {
          font-size: 1.2em;
          color: #666;
          margin: 0;
        }
        
        .store-section {
          margin-bottom: 40px;
        }
        
        .store-section h2 {
          font-size: 1.8em;
          margin: 0 0 20px 0;
          color: #333;
          border-bottom: 2px solid #e0e0e0;
          padding-bottom: 10px;
        }
        
        .extension-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 20px;
        }
        
        .extension-card {
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 20px;
          background: #fff;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .extension-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }
        
        .extension-icon {
          font-size: 3em;
          text-align: center;
          margin-bottom: 15px;
        }
        
        .extension-card h3 {
          font-size: 1.3em;
          margin: 0 0 10px 0;
          color: #333;
        }
        
        .extension-card p {
          color: #666;
          margin: 0 0 15px 0;
          line-height: 1.4;
        }
        
        .install-btn {
          width: 100%;
          padding: 10px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 1em;
          cursor: pointer;
          transition: background 0.2s;
        }
        
        .install-btn:hover {
          background: #0056b3;
        }
        
        .install-btn:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }
        
        .no-extensions {
          color: #999;
          font-style: italic;
          text-align: center;
          grid-column: 1 / -1;
          padding: 20px;
        }
      </style>
    `;
  }

  private setupStoreEventListeners(): void {
    if (!this.storeContainer) return;
    
    // Handle install button clicks
    this.storeContainer.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('install-btn')) {
        const extensionId = target.dataset.extension;
        if (extensionId) {
          this.installExtension(extensionId, target as HTMLButtonElement);
        }
      }
    });
  }

  private async installExtension(extensionId: string, button: HTMLButtonElement): Promise<void> {
    try {
      button.disabled = true;
      button.textContent = 'Installing...';
      
      // Simulate installation process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update button
      button.textContent = 'Installed';
      button.style.background = '#28a745';
      
      // Update installed extensions list
      this.updateInstalledExtensions(extensionId);
      
      // Show success message
      this.showToast(`${extensionId} extension installed successfully!`, 'success');
      
      console.log('[ExtensionStore] Extension installed:', extensionId);
    } catch (error) {
      console.error('[ExtensionStore] Error installing extension:', error);
      button.disabled = false;
      button.textContent = 'Install';
      this.showToast('Failed to install extension', 'error');
    }
  }

  private updateInstalledExtensions(extensionId: string): void {
    const installedContainer = document.getElementById('installed-extensions');
    if (!installedContainer) return;
    
    // Remove "no extensions" message
    const noExtensionsMsg = installedContainer.querySelector('.no-extensions');
    if (noExtensionsMsg) {
      noExtensionsMsg.remove();
    }
    
    // Add installed extension card
    const extensionCard = document.createElement('div');
    extensionCard.className = 'extension-card';
    extensionCard.innerHTML = `
      <div class="extension-icon">✅</div>
      <h3>${this.getExtensionDisplayName(extensionId)}</h3>
      <p>Status: Active</p>
      <button class="install-btn" style="background: #dc3545;" onclick="this.parentElement.remove()">Uninstall</button>
    `;
    
    installedContainer.appendChild(extensionCard);
  }

  private getExtensionDisplayName(extensionId: string): string {
    const nameMap: Record<string, string> = {
      'ai-assistant': 'AI Assistant',
      'analytics': 'Analytics Tracker',
      'privacy-guard': 'Privacy Guard',
      'speed-optimizer': 'Speed Optimizer',
      'extension-builder': 'Extension Builder',
      'debug-console': 'Debug Console'
    };
    
    return nameMap[extensionId] || extensionId;
  }

  private updateActiveTabForStore(): void {
    // Get the active tab and update its info for the store
    const activeTabId = this.getActiveTabId();
    if (activeTabId) {
      const titleElement = document.querySelector(`#${activeTabId} .tab-title`);
      if (titleElement) {
        titleElement.textContent = 'Extension Store';
      }
      
      // Update tab data if accessible through global app
      if ((window as any).browzerApp?.tabs) {
        const tabs = (window as any).browzerApp.tabs;
        const tab = tabs.find((t: any) => t.id === activeTabId);
        if (tab) {
          tab.title = 'Browzer Extension Store';
          tab.url = CONSTANTS.EXTENSION_STORE_URL;
        }
      }
    }
  }

  private disableNavigationButtons(): void {
    const backBtn = document.getElementById('backBtn') as HTMLButtonElement;
    const forwardBtn = document.getElementById('forwardBtn') as HTMLButtonElement;
    
    if (backBtn) backBtn.disabled = true;
    if (forwardBtn) forwardBtn.disabled = true;
  }

  private getActiveWebview(): any {
    // Get active webview from global app
    return (window as any).browzerApp?.getActiveWebview?.();
  }

  private getActiveTabId(): string {
    // Get active tab ID from global app
    return (window as any).browzerApp?.activeTabId || '';
  }

  private showToast(message: string, type: string = 'info'): void {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
      toast!.className = 'toast';
    }, 3000);
  }

  public isStoreVisible(): boolean {
    return this.storeContainer?.style.display === 'block' || false;
  }

  public destroy(): void {
    try {
      if (this.storeContainer) {
        this.storeContainer.remove();
        this.storeContainer = null;
      }
      
      this.isInitialized = false;
      console.log('[ExtensionStore] Destroyed successfully');
    } catch (error) {
      console.error('[ExtensionStore] Error during destruction:', error);
    }
  }
}
