import { ExecuteStep } from '../../../types';
import { ActionResult, BaseActionStrategy } from './ActionStrategies';

export class FocusStrategy extends BaseActionStrategy {
  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
    const selector = step.target;
    
    if (!selector) {
      throw new Error('Selector is required for focus action');
    }

    const script = `
      (function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!element) {
            return { success: false, error: 'Element not found' };
          }

          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => element.focus(), 500);

          return { success: true, message: 'Focus completed successfully' };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.executeInWebview(webview, script);
    if (!result.success) {
      throw new Error(`Focus action failed: ${result.error}`);
    }

    return result;
  }
}

export class BlurStrategy extends BaseActionStrategy {
  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
    const selector = step.target;
    
    if (!selector) {
      throw new Error('Selector is required for blur action');
    }

    const script = `
      (function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!element) {
            return { success: false, error: 'Element not found' };
          }

          element.blur();

          return { success: true, message: 'Blur completed successfully' };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.executeInWebview(webview, script);
    if (!result.success) {
      throw new Error(`Blur action failed: ${result.error}`);
    }

    return result;
  }
}

export class HoverStrategy extends BaseActionStrategy {
  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
    const selector = step.target;
    
    if (!selector) {
      throw new Error('Selector is required for hover action');
    }

    const script = `
      (function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!element) {
            return { success: false, error: 'Element not found' };
          }

          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          const rect = element.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          
          const events = ['mouseenter', 'mouseover'];
          events.forEach(eventType => {
            const event = new MouseEvent(eventType, {
              bubbles: true,
              cancelable: true,
              clientX: centerX,
              clientY: centerY
            });
            element.dispatchEvent(event);
          });

          return { 
            success: true, 
            message: 'Hover completed successfully',
            position: { x: centerX, y: centerY }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.executeInWebview(webview, script);
    if (!result.success) {
      throw new Error(`Hover action failed: ${result.error}`);
    }

    return result;
  }
}

export class KeypressStrategy extends BaseActionStrategy {
  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
    const selector = step.target || 'body';
    const key = step.value as string || 'Enter';

    console.log(`[ExecuteStepRunner] Pressing key "${key}" on ${selector}`);

    // Special handling for URL bar which might be in the main app UI
    if (selector.includes('urlBar') || selector.includes('addressBar')) {
      return await this.handleUrlBarKeypress(selector, key, webview);
    }

    // For Enter key on input fields, use a simpler, more reliable approach
    if (key === 'Enter' && (selector.includes('input') || selector.includes('#APjFqb'))) {
      return await this.handleEnterKeySpecial(selector, key, webview);
    }

    // For other keys, use the standard approach
    const script = `
      (function() {
        try {
          let element = null;
          
          // Simple element finding
          try {
            element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          } catch (selectorError) {
            // Fallback strategies
            if ('${selector}'.startsWith('#')) {
              element = document.getElementById('${selector}'.substring(1));
            }
          }
          
          if (!element) {
            return { success: false, error: 'Element not found', selector: '${selector}' };
          }

          // Focus element
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.focus();

          const keyValue = '${key}';
          let keyCode = 0;
          let ctrlKey = false;
          
          // Handle special key combinations
          if (keyValue.includes('Ctrl+')) {
            ctrlKey = true;
            const actualKey = keyValue.replace('Ctrl+', '');
            
            // Special handling for Ctrl+A (Select All)
            if (actualKey.toLowerCase() === 'a') {
              if (element.select) {
                element.select();
              } else if (element.value !== undefined) {
                element.setSelectionRange(0, element.value.length);
              }
              
              return { 
                success: true, 
                message: 'Select all executed successfully',
                key: keyValue,
                action: 'select_all'
              };
            }
            
            keyCode = actualKey.charCodeAt(0);
          } else {
            // Standard key codes
            const keyCodes = {
              'Enter': 13, 'Tab': 9, 'Escape': 27,
              'ArrowUp': 38, 'ArrowDown': 40, 'ArrowLeft': 37, 'ArrowRight': 39,
              'Backspace': 8, 'Delete': 46, 'Space': 32
            };
            keyCode = keyCodes[keyValue] || keyValue.charCodeAt(0);
          }

          // Create keyboard events
          const keydownEvent = new KeyboardEvent('keydown', {
            key: keyValue.includes('+') ? keyValue.split('+').pop() : keyValue,
            keyCode: keyCode,
            ctrlKey: ctrlKey,
            bubbles: true,
            cancelable: true
          });
          
          const keyupEvent = new KeyboardEvent('keyup', {
            key: keyValue.includes('+') ? keyValue.split('+').pop() : keyValue,
            keyCode: keyCode,
            ctrlKey: ctrlKey,
            bubbles: true,
            cancelable: true
          });
          
          // Dispatch events
          element.dispatchEvent(keydownEvent);
          element.dispatchEvent(keyupEvent);

          return { 
            success: true, 
            message: 'Key pressed successfully', 
            key: keyValue,
            keyCode: keyCode
          };
        } catch (error) {
          return { success: false, error: error.message, stack: error.stack };
        }
      })();
    `;

    const result = await this.executeInWebview(webview, script);
    if (!result.success) {
      console.error(`[ExecuteStepRunner] Keypress failed:`, result);
      throw new Error(`Keypress action failed: ${result.error}`);
    }

    console.log(`[ExecuteStepRunner] Keypress successful:`, result.message);
    await this.wait(500);
    return result;
  }

  private async handleEnterKeySpecial(selector: string, key: string, webview: any): Promise<ActionResult> {
    console.log(`[ExecuteStepRunner] Special Enter key handling for ${selector}`);

    const script = `
      (function() {
        try {
          let element = null;
          
          // Find the element
          try {
            element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          } catch (e) {
            if ('${selector}'.startsWith('#')) {
              element = document.getElementById('${selector}'.substring(1));
            }
          }
          
          if (!element) {
            return { success: false, error: 'Element not found', selector: '${selector}' };
          }

          // Focus and prepare
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.focus();

          // Simple Enter key simulation
          const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
          });
          
          element.dispatchEvent(enterEvent);
          
          // Try form submission if it's an input
          if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            const form = element.closest('form');
            if (form) {
              // Dispatch submit event
              const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
              form.dispatchEvent(submitEvent);
            }
          }

          return { 
            success: true, 
            message: 'Enter key pressed and form submitted', 
            key: 'Enter',
            elementTag: element.tagName,
            hasForm: !!element.closest('form')
          };
        } catch (error) {
          return { success: false, error: error.message, stack: error.stack };
        }
      })();
    `;

    const result = await this.executeInWebview(webview, script);
    if (!result.success) {
      console.error(`[ExecuteStepRunner] Special Enter failed:`, result);
      throw new Error(`Enter keypress failed: ${result.error}`);
    }

    console.log(`[ExecuteStepRunner] Special Enter successful:`, result.message);
    await this.wait(1500); // Longer wait for form submission
    return result;
  }

  private async handleUrlBarKeypress(selector: string, key: string, webview: any): Promise<ActionResult> {
    console.log(`[ExecuteStepRunner] Special URL bar keypress handling for ${selector} with key ${key}`);
    
    try {
      // Access main app DOM through renderer process
      const element = document.querySelector(selector) as HTMLInputElement;
      
      if (!element) {
        throw new Error(`URL bar element not found: ${selector}`);
      }

      // Focus the element first
      element.focus();
      await this.wait(200);
      
      // Create and dispatch keyboard event
      const keydownEvent = new KeyboardEvent('keydown', {
        key: key,
        code: key === 'Enter' ? 'Enter' : `Key${key.toUpperCase()}`,
        keyCode: key === 'Enter' ? 13 : key.charCodeAt(0),
        which: key === 'Enter' ? 13 : key.charCodeAt(0),
        bubbles: true,
        cancelable: true
      });
      
      const keyupEvent = new KeyboardEvent('keyup', {
        key: key,
        code: key === 'Enter' ? 'Enter' : `Key${key.toUpperCase()}`,
        keyCode: key === 'Enter' ? 13 : key.charCodeAt(0),
        which: key === 'Enter' ? 13 : key.charCodeAt(0),
        bubbles: true,
        cancelable: true
      });
      
      // Dispatch events
      element.dispatchEvent(keydownEvent);
      element.dispatchEvent(keyupEvent);
      
      return {
        success: true,
        message: `Key ${key} pressed on URL bar`,
        key: key,
        elementInfo: {
          tagName: element.tagName,
          id: element.id,
          value: element.value
        }
      };
    } catch (error) {
      console.error('[ExecuteStepRunner] URL bar keypress failed:', error);
      throw new Error(`URL bar keypress failed: ${(error as Error).message}`);
    }
  }
}
