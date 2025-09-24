import { ExecuteStep } from '../../../types';
import { BaseActionStrategy, ActionResult } from './ActionStrategies';

export class NavigationStrategy extends BaseActionStrategy {
  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
    const url = step.target || step.value as string;
    
    if (!url) {
      throw new Error('No URL provided for navigation');
    }

    // URL validation and correction
    const finalUrl = this.normalizeUrl(url);
    console.log(`[NavigationStrategy] Navigating to: ${finalUrl}`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Navigation timeout after ${this.DEFAULT_TIMEOUT}ms`));
      }, this.DEFAULT_TIMEOUT);

      const cleanup = () => {
        clearTimeout(timeout);
        webview.removeEventListener('did-finish-load', onLoad);
        webview.removeEventListener('did-fail-load', onError);
        webview.removeEventListener('did-fail-provisional-load', onError);
      };

      const onLoad = () => {
        cleanup();
        resolve({ 
          success: true, 
          url: finalUrl,
          actualUrl: webview.getURL() 
        });
      };

      const onError = (event: any) => {
        cleanup();
        reject(new Error(`Navigation failed: ${event.errorDescription || 'Unknown error'}`));
      };

      webview.addEventListener('did-finish-load', onLoad);
      webview.addEventListener('did-fail-load', onError);
      webview.addEventListener('did-fail-provisional-load', onError);

      try {
        webview.src = finalUrl;
      } catch (error) {
        cleanup();
        reject(new Error(`Failed to navigate: ${(error as Error).message}`));
      }
    });
  }

  private normalizeUrl(url: string): string {
    try {
      new URL(url);
      return url;
    } catch {
      const fixedUrl = url.startsWith('http') ? url : `https://${url}`;
      try {
        new URL(fixedUrl);
        return fixedUrl;
      } catch {
        throw new Error(`Invalid URL format: ${url}`);
      }
    }
  }
}