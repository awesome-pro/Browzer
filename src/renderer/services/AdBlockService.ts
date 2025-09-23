import { IpcRenderer } from '../types';

/**
 * AdBlockService handles ad blocking functionality
 */
export class AdBlockService {
  private ipcRenderer: IpcRenderer;

  constructor(ipcRenderer: IpcRenderer) {
    this.ipcRenderer = ipcRenderer;
  }

  public initialize(): void {
    this.setupAdBlocker();
  }

  public setupAdBlocker(): void {
    // Get UI elements
    const adBlockEnabledCheckbox = document.getElementById('adBlockEnabled') as HTMLInputElement;
    const domainInput = document.getElementById('domainInput') as HTMLInputElement;
    const blockDomainBtn = document.getElementById('blockDomainBtn') as HTMLButtonElement;
    const allowDomainBtn = document.getElementById('allowDomainBtn') as HTMLButtonElement;
    const blockedDomainsCount = document.getElementById('blockedDomainsCount') as HTMLSpanElement;
    const cssRulesCount = document.getElementById('cssRulesCount') as HTMLSpanElement;
    const filterRulesCount = document.getElementById('filterRulesCount') as HTMLSpanElement;
    const blockedDomainsList = document.getElementById('blockedDomainsList') as HTMLDivElement;
    const allowedDomainsList = document.getElementById('allowedDomainsList') as HTMLDivElement;
    
    if (!adBlockEnabledCheckbox || !domainInput || !blockDomainBtn || !allowDomainBtn) {
      return;
    }
    
    // Load initial state
    this.loadAdBlockerStatus();
    
    // Set up event listeners
    adBlockEnabledCheckbox.addEventListener('change', async () => {
      try {
        const enabled = adBlockEnabledCheckbox.checked;
        const result = await this.ipcRenderer.invoke('toggle-adblock', enabled);
        
        if (result.success) {
          this.showToast(`Ad blocking ${enabled ? 'enabled' : 'disabled'}`, 'success');

          // Re-inject CSS into all webviews
          const webviews = document.querySelectorAll('webviews-container');
          webviews.forEach((webview: any) => {
            setTimeout(() => {
              // Validate webview before injection
              if (webview && !webview.isDestroyed && webview.executeJavaScript && webview.src && webview.src !== 'about:blank') {
                this.injectAdBlockCSS(webview);
              }
            }, 100);
          });
        } else {
          this.showToast('Failed to toggle ad blocker', 'error');
          // Revert checkbox state
          adBlockEnabledCheckbox.checked = !enabled;
        }
      } catch (error) {
        this.showToast('Error toggling ad blocker', 'error');
      }
    });
    
    blockDomainBtn.addEventListener('click', async () => {
      const domain = domainInput.value.trim();
      if (!domain) {
        this.showToast('Please enter a domain', 'error');
        return;
      }
      
      try {
        const result = await this.ipcRenderer.invoke('add-blocked-domain', domain);
        if (result.success) {
          this.showToast(`Blocked domain: ${domain}`, 'success');
          domainInput.value = '';
          this.loadAdBlockerStatus();
        } else {
          this.showToast('Failed to add blocked domain', 'error');
        }
      } catch (error) {
        this.showToast('Error adding blocked domain', 'error');
      }
    });
    
    allowDomainBtn.addEventListener('click', async () => {
      const domain = domainInput.value.trim();
      if (!domain) {
        this.showToast('Please enter a domain', 'error');
        return;
      }
      
      try {
        const result = await this.ipcRenderer.invoke('add-allowed-domain', domain);
        if (result.success) {
          this.showToast(`Allowed domain: ${domain}`, 'success');
          domainInput.value = '';
          this.loadAdBlockerStatus();
        } else {
          this.showToast('Failed to add allowed domain', 'error');
        }
      } catch (error) {
        this.showToast('Error adding allowed domain', 'error');
      }
    });
    
    // Allow adding domains by pressing Enter
    domainInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          allowDomainBtn.click();
        } else {
          blockDomainBtn.click();
        }
      }
    });
  }

  public async loadAdBlockerStatus(): Promise<void> {
    try {
      const status = await this.ipcRenderer.invoke('get-adblock-status');
      
      // Update checkbox
      const adBlockEnabledCheckbox = document.getElementById('adBlockEnabled') as HTMLInputElement;
      if (adBlockEnabledCheckbox) {
        adBlockEnabledCheckbox.checked = status.enabled;
      }
      
      // Update stats
      const blockedDomainsCount = document.getElementById('blockedDomainsCount') as HTMLSpanElement;
      const cssRulesCount = document.getElementById('cssRulesCount') as HTMLSpanElement;
      const filterRulesCount = document.getElementById('filterRulesCount') as HTMLSpanElement;
      
      if (blockedDomainsCount) blockedDomainsCount.textContent = status.stats.blockedDomains.toString();
      if (cssRulesCount) cssRulesCount.textContent = status.stats.cssRules.toString();
      if (filterRulesCount) filterRulesCount.textContent = status.stats.filterRules.toString();
      
    } catch (error) {
      
      // Set default values
      const blockedDomainsCount = document.getElementById('blockedDomainsCount') as HTMLSpanElement;
      const cssRulesCount = document.getElementById('cssRulesCount') as HTMLSpanElement;
      const filterRulesCount = document.getElementById('filterRulesCount') as HTMLSpanElement;
      
      if (blockedDomainsCount) blockedDomainsCount.textContent = 'Error';
      if (cssRulesCount) cssRulesCount.textContent = 'Error';
      if (filterRulesCount) filterRulesCount.textContent = 'Error';
    }
  }

  public injectAdBlockCSS(webview: any): void {
    if (!webview) return;
    
    if (!webview.id || !webview.src || webview.src === 'about:blank') {
      return;
    }
    
    try {
      this.ipcRenderer.invoke('get-adblock-css').then((cssRules: string) => {
        if (!cssRules || !cssRules.trim()) {
          return;
        }
        
        if (!webview || !webview.executeJavaScript) {
          return;
        }
        
        const script = `
          (function() {
            try {
              if (!document || !document.head) {
                return;
              }
              
              const existingStyle = document.getElementById('browzer-adblock-css');
              if (existingStyle) {
                existingStyle.remove();
              }
              
              // Inject new ad block styles
              const style = document.createElement('style');
              style.id = 'browzer-adblock-css';
              style.type = 'text/css';
              style.innerHTML = \`${cssRules.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;
              document.head.appendChild(style);
              
            } catch (injectionError) {
              console.warn('[AdBlock] CSS injection failed:', injectionError.message);
            }
          })();
        `;
        
        // Execute with error handling
        webview.executeJavaScript(script).catch((error: any) => {
          // Don't log errors for destroyed webviews or navigation
          if (!error.message.includes('Object has been destroyed') && 
              !error.message.includes('navigation') &&
              !error.message.includes('Script failed to execute')) {
          }
        });
        
      }).catch((error: any) => {
      });
    } catch (error) {
    }
  }

  public injectAdBlockCSSForAllWebviews(): void {
    const webviews = document.querySelectorAll('webviews-container');
    webviews.forEach((webview: any) => {
      setTimeout(() => {
        // Validate webview before injection
        if (webview && !webview.isDestroyed && webview.executeJavaScript && webview.src && webview.src !== 'about:blank') {
          this.injectAdBlockCSS(webview);
        }
      }, 100);
    });
  }

  private showToast(message: string, type: string = 'info'): void {
    const event = new CustomEvent('show-toast', {
      detail: { message, type }
    });
    window.dispatchEvent(event);
  }

  public destroy(): void {
    console.log('[AdBlockService] Destroyed successfully');
  }
}
