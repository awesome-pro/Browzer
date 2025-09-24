import { ExecuteStep } from '../../../types';
import { BaseActionStrategy, ActionResult } from './ActionStrategies';

export class ClearStrategy extends BaseActionStrategy {
  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
    const selector = step.target;
    
    if (!selector) {
      throw new Error('Selector is required for clear action');
    }

    const script = `
      (function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!element) {
            return { success: false, error: 'Element not found' };
          }

          element.focus();
          
          if (element.value !== undefined) {
            element.value = '';
          } else {
            element.textContent = '';
          }

          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));

          return { success: true, message: 'Element cleared successfully' };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.executeInWebview(webview, script);
    if (!result.success) {
      throw new Error(`Clear action failed: ${result.error}`);
    }

    return result;
  }
}

export class SubmitStrategy extends BaseActionStrategy {
  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
    const selector = step.target || 'form';

    const script = `
      (function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!element) {
            return { success: false, error: 'Form element not found' };
          }

          if (element.tagName.toLowerCase() === 'form') {
            element.submit();
          } else {
            // Try to find parent form or submit button
            const form = element.closest('form');
            if (form) {
              form.submit();
            } else {
              // Look for submit button
              const submitBtn = element.querySelector('[type="submit"], button[type="submit"]');
              if (submitBtn) {
                submitBtn.click();
              } else {
                element.click(); // Fallback to clicking the element
              }
            }
          }

          return { success: true, message: 'Form submitted successfully' };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.executeInWebview(webview, script);
    if (!result.success) {
      throw new Error(`Submit action failed: ${result.error}`);
    }

    // Wait longer for form submissions as they often trigger navigation
    await this.wait(3000);
    return result;
  }
}