import { ExecuteStep, ActionType } from '../../../types';

export class RecoveryStrategies {
  constructor(private webview: any) {}

  async attemptRecovery(step: ExecuteStep, error: Error): Promise<boolean> {
    console.log(`[RecoveryStrategies] Attempting recovery for failed step: ${step.action} on ${step.target}`);
    
    switch (step.action) {
      case ActionType.KEYPRESS:
        return await this.recoverKeypressAction(step, error);
      case ActionType.CLICK:
        return await this.recoverClickAction(step, error);
      default:
        return false;
    }
  }

  private async recoverKeypressAction(step: ExecuteStep, error: Error): Promise<boolean> {
    if (step.value === 'Enter') {
      try {
        // Try alternative navigation approach
        if (step.target?.includes('urlBar') || step.target?.includes('addressBar')) {
          const inputValue = await this.getElementValue(step.target);
          if (inputValue && inputValue.includes('http')) {
            console.log(`[RecoveryStrategies] Recovery: Navigating directly to ${inputValue}`);
            await this.directNavigate(inputValue);
            return true;
          }
        }
      } catch (e) {
        console.warn('[RecoveryStrategies] Keypress recovery attempt failed:', e);
      }
    }
    
    return false;
  }

  private async recoverClickAction(step: ExecuteStep, error: Error): Promise<boolean> {
    if (step.target?.includes('button') && 
        (step.target?.includes('Create Short URL') || step.target?.includes('submit'))) {
      try {
        console.log('[RecoveryStrategies] Recovery: Trying direct form submission');
        
        const result = await this.webview.executeJavaScript(`
          (function() {
            try {
              const forms = document.querySelectorAll('form');
              if (forms.length > 0) {
                forms[0].submit();
                return { success: true, message: 'Form submitted directly via recovery' };
              }
              return { success: false, message: 'No forms found for recovery' };
            } catch (e) {
              return { success: false, error: e.message };
            }
          })();
        `);
        
        if (result.success) {
          console.log('[RecoveryStrategies] Recovery: Form submission successful');
          await this.wait(3000);
          return true;
        }
      } catch (e) {
        console.warn('[RecoveryStrategies] Form submission recovery failed:', e);
      }
    }
    
    return false;
  }

  private async getElementValue(selector: string): Promise<string> {
    try {
      // Try main app element first
      if (this.isMainAppSelector(selector)) {
        const element = document.querySelector(selector) as HTMLInputElement;
        return element?.value || '';
      }
      
      // Try webview element
      const result = await this.webview.executeJavaScript(`
        (function() {
          try {
            const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
            return element ? (element.value || element.textContent || '') : '';
          } catch (e) {
            return '';
          }
        })();
      `);
      
      return result || '';
    } catch (e) {
      console.warn('[RecoveryStrategies] Failed to get element value:', e);
      return '';
    }
  }

  private async directNavigate(url: string): Promise<void> {
    const finalUrl = url.startsWith('http') ? url : `https://${url}`;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Navigation timeout'));
      }, 30000);

      const cleanup = () => {
        clearTimeout(timeout);
        this.webview.removeEventListener('did-finish-load', onLoad);
        this.webview.removeEventListener('did-fail-load', onError);
      };

      const onLoad = () => {
        cleanup();
        resolve();
      };

      const onError = (event: any) => {
        cleanup();
        reject(new Error(`Navigation failed: ${event.errorDescription}`));
      };

      this.webview.addEventListener('did-finish-load', onLoad);
      this.webview.addEventListener('did-fail-load', onError);

      this.webview.src = finalUrl;
    });
  }

  private isMainAppSelector(selector: string): boolean {
    const mainAppSelectors = [
      '#urlBar', '#backBtn', '#forwardBtn', '#reloadBtn', '#goBtn',
      '#newTabBtn', '#startRecordingBtn', '#stopRecordingBtn',
      '.tab-bar', '.toolbar', '.nav-controls'
    ];
    
    return mainAppSelectors.some(mainSelector => 
      selector === mainSelector || selector.includes(mainSelector)
    );
  }

  private async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}