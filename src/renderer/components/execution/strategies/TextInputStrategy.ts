import { ExecuteStep } from '../../../types';
import { BaseActionStrategy, ActionResult } from './ActionStrategies';

export class TextInputStrategy extends BaseActionStrategy {
  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
    const selector = step.target;
    const text = step.value as string;

    if (!selector || !text) {
      throw new Error('Both selector and text are required for type action');
    }

    console.log(`[TextInputStrategy] Typing "${text}" into ${selector}`);

    // Handle main app elements differently
    if (this.isMainAppSelector(selector)) {
      return await this.typeInMainAppElement(selector, text);
    }

    // Execute enhanced React form input
    const script = this.generateReactInputScript(selector, text);
    const result = await this.executeInWebview(webview, script);

    if (!result.success) {  
      throw new Error(`Type action failed: ${result.error}`);
    }

    return result;
  }

  private generateReactInputScript(selector: string, text: string): string {
    return `
      (async function() {
        try {
          console.log('[TextInputStrategy] Finding element with selector:', '${selector}');
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!element) {
            return { success: false, error: 'Element not found', selector: '${selector}' };
          }

          console.log('[TextInputStrategy] Found element:', element.tagName, element.id, element.className);

          // Visual feedback
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 800));

          const originalOutline = element.style.outline;
          const originalBoxShadow = element.style.boxShadow;
          element.style.outline = '2px solid blue';
          element.style.boxShadow = '0 0 10px rgba(0,0,255,0.5)';

          // Focus and clear
          await this.focusAndClear(element);
          
          // Type with character-by-character simulation
          await this.simulateRealisticTyping(element, '${text.replace(/'/g, "\\'")}');
          
          // React state synchronization
          await this.synchronizeReactState(element, '${text.replace(/'/g, "\\'")}');
          
          // Form validation
          await this.triggerFormValidation(element);

          // Remove visual feedback
          setTimeout(() => {
            element.style.outline = originalOutline;
            element.style.boxShadow = originalBoxShadow;
          }, 1000);

          // Verify result
          const finalValue = element.value || element.textContent || '';
          const valueSet = finalValue === '${text.replace(/'/g, "\\'")}';
          
          return {
            success: true,
            message: valueSet ? 'Text input completed with React state sync' : 'Text entered but verification failed',
            valueVerified: valueSet,
            formValid: element.checkValidity ? element.checkValidity() : true,
            elementInfo: {
              tagName: element.tagName,
              type: element.type,
              value: finalValue,
              selector: '${selector}'
            }
          };
        } catch (error) {
          console.error('[TextInputStrategy] Enhanced text input error:', error);
          return { success: false, error: error.message, stack: error.stack };
        }
      })();
      
      // Helper functions (would be injected)
      async function focusAndClear(element) {
        element.focus();
        
        const focusEvent = new FocusEvent('focus', { bubbles: true, cancelable: true });
        element.dispatchEvent(focusEvent);
        await new Promise(resolve => setTimeout(resolve, 300));

        if (element.value !== undefined) {
          element.select();
          element.value = '';
          
          const clearEvents = [
            new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }),
            new Event('input', { bubbles: true }),
            new KeyboardEvent('keyup', { key: 'Backspace', bubbles: true })
          ];
          
          clearEvents.forEach(event => element.dispatchEvent(event));
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      async function simulateRealisticTyping(element, textValue) {
        if (element.value !== undefined) {
          element.value = '';
          
          for (let i = 0; i < textValue.length; i++) {
            const char = textValue[i];
            element.value += char;
            
            const charEvents = [
              new KeyboardEvent('keydown', { key: char, bubbles: true }),
              new KeyboardEvent('keypress', { key: char, charCode: char.charCodeAt(0), bubbles: true }),
              new Event('beforeinput', { bubbles: true }),
              new Event('input', { bubbles: true }),
              new KeyboardEvent('keyup', { key: char, bubbles: true })
            ];
            
            charEvents.forEach(event => element.dispatchEvent(event));
            
            if (i < textValue.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      async function synchronizeReactState(element, textValue) {
        const reactKey = Object.keys(element).find(key => 
          key.startsWith('__reactInternalInstance') ||
          key.startsWith('__reactFiber') ||
          key.startsWith('_reactInternalFiber')
        );
        
        if (reactKey) {
          const reactData = element[reactKey];
          let currentFiber = reactData;
          let attempts = 0;
          
          while (currentFiber && attempts < 10) {
            if (currentFiber.memoizedProps && typeof currentFiber.memoizedProps.onChange === 'function') {
              const syntheticEvent = {
                target: element,
                currentTarget: element,
                type: 'change',
                bubbles: true,
                preventDefault: () => {},
                stopPropagation: () => {},
                persist: () => {}
              };
              
              currentFiber.memoizedProps.onChange(syntheticEvent);
              break;
            }
            
            currentFiber = currentFiber.return || currentFiber._owner || currentFiber.parent;
            attempts++;
          }
        }
      }

      async function triggerFormValidation(element) {
        if (element.name) {
          const formWrapper = element.closest('[data-testid], [data-form], form');
          if (formWrapper) {
            const validationEvents = [
              new Event('change', { bubbles: true }),
              new Event('blur', { bubbles: true }),
              new CustomEvent('react-hook-form:setValue', {
                detail: { name: element.name, value: element.value }
              })
            ];
            
            validationEvents.forEach(event => {
              element.dispatchEvent(event);
              if (formWrapper !== element) {
                formWrapper.dispatchEvent(event);
              }
            });
          }
        }

        await new Promise(resolve => setTimeout(resolve, 300));
        
        const blurEvent = new FocusEvent('blur', { bubbles: true });
        element.dispatchEvent(blurEvent);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    `;
  }

  private async typeInMainAppElement(selector: string, text: string): Promise<ActionResult> {
    console.log(`[TextInputStrategy] Typing in main app element: ${selector} = "${text}"`);
    
    try {
      const element = document.querySelector(selector) as HTMLInputElement;
      
      if (!element) {
        throw new Error(`Main app element not found: ${selector}`);
      }

      element.focus();
      await this.wait(200);

      element.value = '';
      element.value = text;

      // Trigger events
      ['input', 'change', 'keyup'].forEach(eventType => {
        const event = new Event(eventType, { bubbles: true, cancelable: true });
        element.dispatchEvent(event);
      });

      // Special URL bar handling
      if (selector === '#urlBar') {
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          keyCode: 13,
          bubbles: true,
          cancelable: true
        });
        element.dispatchEvent(enterEvent);
      }

      return {
        success: true,
        message: 'Text input completed successfully in main app',
        elementInfo: {
          tagName: element.tagName,
          type: element.type,
          value: element.value,
          selector: selector
        }
      };

    } catch (error) {
      throw new Error(`Main app type failed: ${(error as Error).message}`);
    }
  }
}