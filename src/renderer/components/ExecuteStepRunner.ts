import { UnifiedExecuteStep, UnifiedActionType, ActionValidator } from '../../shared/types';

export class ExecuteStepRunner {
  private webview: any;
  private readonly DEFAULT_TIMEOUT = 30000;
  private readonly ELEMENT_WAIT_TIMEOUT = 15000;
  private readonly ACTION_DELAY = 1000;

  constructor(webview: any) {
    this.webview = webview;
  }

  public async executeStep(step: UnifiedExecuteStep): Promise<any> {
    console.log(`[ExecuteStepRunner] Executing step: ${step.action} - ${step.description}`);
    
    if (!this.webview) {
      throw new Error('No webview available for step execution');
    }

    const validation = ActionValidator.validateStep(step);
    if (!validation.valid) {
      throw new Error(`Invalid step: ${validation.errors.join(', ')}`);
    }

    step.startTime = Date.now();
    step.status = 'running';

    try {
      const result = await this.executeActionWithRetry(step);
      
      step.status = 'completed';
      step.endTime = Date.now();
      step.result = result;
      
      console.log(`[ExecuteStepRunner] Step completed: ${step.description}`);
      return result;
    } catch (error) {
      step.status = 'failed';
      step.endTime = Date.now();
      step.error = (error as Error).message;
      
      console.error(`[ExecuteStepRunner] Step failed: ${step.description}`, error);
      throw error;
    }
  }

  private async executeActionWithRetry(step: UnifiedExecuteStep): Promise<any> {
    const maxRetries = step.maxRetries || 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[ExecuteStepRunner] Attempt ${attempt}/${maxRetries} for step: ${step.description}`);
        
        const result = await this.executeAction(step);
        
        if (attempt > 1) {
          console.log(`[ExecuteStepRunner] Step succeeded on attempt ${attempt}`);
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        step.retryCount = attempt;
        
        console.warn(`[ExecuteStepRunner] Attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          console.log(`[ExecuteStepRunner] Waiting ${waitTime}ms before retry`);
          await this.wait(waitTime);
        }
      }
    }

    throw new Error(`Step failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
  }

  private async executeAction(step: UnifiedExecuteStep): Promise<any> {
    await this.wait(this.ACTION_DELAY);

    switch (step.action) {
      case UnifiedActionType.NAVIGATE:
        return await this.navigate(step);
      
      case UnifiedActionType.TYPE:
        return await this.type(step);
      
      case UnifiedActionType.CLEAR:
        return await this.clear(step);
      
      case UnifiedActionType.CLICK:
        return await this.click(step);
      
      case UnifiedActionType.SELECT:
        return await this.select(step);
      
      case UnifiedActionType.TOGGLE:
        return await this.toggle(step);
      
      case UnifiedActionType.SUBMIT:
        return await this.submit(step);
      
      case UnifiedActionType.WAIT:
        return await this.waitTime(step);
      
      case UnifiedActionType.WAIT_FOR_ELEMENT:
        return await this.waitForElement(step);
      
      case UnifiedActionType.WAIT_FOR_DYNAMIC_CONTENT:
        return await this.waitForDynamicContent(step);
      
      case UnifiedActionType.FOCUS:
        return await this.focus(step);
      
      case UnifiedActionType.BLUR:
        return await this.blur(step);
      
      case UnifiedActionType.HOVER:
        return await this.hover(step);
      
      case UnifiedActionType.KEYPRESS:
        return await this.keypress(step);
      
      case UnifiedActionType.SCROLL:
        return await this.scroll(step);
      
      case UnifiedActionType.EXTRACT:
        return await this.extract(step);
      
      case UnifiedActionType.VERIFY_ELEMENT:
        return await this.verifyElement(step);
      
      case UnifiedActionType.VERIFY_TEXT:
        return await this.verifyText(step);
      
      case UnifiedActionType.VERIFY_URL:
        return await this.verifyUrl(step);
      
      default:
        throw new Error(`Unsupported action: ${step.action}`);
    }
  }

  private async navigate(step: UnifiedExecuteStep): Promise<any> {
    const url = step.target || step.value as string;
    
    if (!url) {
      throw new Error('No URL provided for navigation');
    }

    try {
      new URL(url);
    } catch {
      const fixedUrl = url.startsWith('http') ? url : `https://${url}`;
      try {
        new URL(fixedUrl);
        console.log(`[ExecuteStepRunner] Fixed URL: ${url} -> ${fixedUrl}`);
      } catch {
        throw new Error(`Invalid URL format: ${url}`);
      }
    }

    const finalUrl = url.startsWith('http') ? url : `https://${url}`;
    console.log(`[ExecuteStepRunner] Navigating to: ${finalUrl}`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Navigation timeout after ${this.DEFAULT_TIMEOUT}ms`));
      }, this.DEFAULT_TIMEOUT);

      const cleanup = () => {
        clearTimeout(timeout);
        this.webview.removeEventListener('did-finish-load', onLoad);
        this.webview.removeEventListener('did-fail-load', onError);
        this.webview.removeEventListener('did-fail-provisional-load', onError);
      };

      const onLoad = () => {
        cleanup();
        resolve({ 
          success: true, 
          url: finalUrl,
          actualUrl: this.webview.getURL() 
        });
      };

      const onError = (event: any) => {
        cleanup();
        reject(new Error(`Navigation failed: ${event.errorDescription || 'Unknown error'}`));
      };

      this.webview.addEventListener('did-finish-load', onLoad);
      this.webview.addEventListener('did-fail-load', onError);
      this.webview.addEventListener('did-fail-provisional-load', onError);

      try {
        this.webview.src = finalUrl;
      } catch (error) {
        cleanup();
        reject(new Error(`Failed to navigate: ${(error as Error).message}`));
      }
    });
  }

  private async type(step: UnifiedExecuteStep): Promise<any> {
    const selector = step.target;
    const text = step.value as string;

    if (!selector || !text) {
      throw new Error('Both selector and text are required for type action');
    }

    console.log(`[ExecuteStepRunner] Typing "${text}" into ${selector}`);

    const script = `
      (async function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!element) {
            return { success: false, error: 'Element not found', selector: '${selector}' };
          }

          // Ensure element is visible and focusable
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          await new Promise(resolve => setTimeout(resolve, 500));

          // Focus the element
          element.focus();
          
          // Clear existing content
          if (element.value !== undefined) {
            element.value = '';
          } else {
            element.textContent = '';
          }

          // Set the new value
          const textValue = '${text.replace(/'/g, "\\'")}';
          
          if (element.value !== undefined) {
            element.value = textValue;
          } else {
            element.textContent = textValue;
          }

          // Trigger comprehensive events
          const events = ['input', 'change', 'keyup', 'blur'];
          events.forEach(eventType => {
            const event = new Event(eventType, { bubbles: true, cancelable: true });
            element.dispatchEvent(event);
          });

          return {
            success: true,
            message: 'Text input completed successfully',
            elementInfo: {
              tagName: element.tagName,
              type: element.type,
              value: element.value || element.textContent,
              selector: '${selector}'
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);

    if (!result.success) {
      throw new Error(`Type action failed: ${result.error}`);
    }

    return result;
  }

  private async click(step: UnifiedExecuteStep): Promise<any> {
    const selector = step.target;
    
    if (!selector) {
      throw new Error('Selector is required for click action');
    }

    console.log(`[ExecuteStepRunner] Clicking element: ${selector}`);

    const script = `
      (async function() {
        try {
          let element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          
          if (!element) {
            const alternatives = [
              '${selector}',
              '${selector.replace(/"/g, "'")}',
              '${selector.split(' ')[0]}',
              '[data-testid*="${selector.replace(/[^a-zA-Z0-9]/g, '')}"]',
              '[aria-label*="${selector.replace(/[^a-zA-Z0-9]/g, '')}"]'
            ];
            
            for (const alt of alternatives) {
              try {
                element = document.querySelector(alt);
                if (element) break;
              } catch (e) {}
            }
          }

          if (!element) {
            return { success: false, error: 'Element not found with any selector', selector: '${selector}' };
          }

          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          await new Promise(resolve => setTimeout(resolve, 500));

          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          
          if (rect.width === 0 || rect.height === 0) {
            return { success: false, error: 'Element has no visible area' };
          }
          
          if (style.display === 'none' || style.visibility === 'hidden') {
            return { success: false, error: 'Element is not visible' };
          }

          const clickStrategies = [
            () => element.click(),
            () => {
              const event = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
              });
              element.dispatchEvent(event);
            },
            () => {
              if (element.focus) element.focus();
              const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                keyCode: 13,
                bubbles: true
              });
              element.dispatchEvent(enterEvent);
            }
          ];

          let clickSuccess = false;
          let lastError = null;

          for (const strategy of clickStrategies) {
            try {
              strategy();
              clickSuccess = true;
              break;
            } catch (e) {
              lastError = e;
            }
          }

          if (!clickSuccess) {
            return { success: false, error: 'All click strategies failed', lastError: lastError?.message };
          }

          return {
            success: true,
            message: 'Click executed successfully',
            elementInfo: {
              tagName: element.tagName,
              id: element.id,
              className: element.className,
              text: element.textContent?.substring(0, 100),
              selector: '${selector}'
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);

    if (!result.success) {
      throw new Error(`Click action failed: ${result.error}`);
    }

    // Wait for any potential page changes
    await this.wait(1500);

    return result;
  }

  private async waitForElement(step: UnifiedExecuteStep): Promise<any> {
    const selector = step.target;
    const timeout = (step.value as number) || this.ELEMENT_WAIT_TIMEOUT;

    if (!selector) {
      throw new Error('Selector is required for wait_for_element action');
    }

    console.log(`[ExecuteStepRunner] Waiting for element: ${selector} (timeout: ${timeout}ms)`);

    const script = `
      (function() {
        return new Promise((resolve) => {
          const startTime = Date.now();
          const timeout = ${timeout};
          const selector = '${selector.replace(/'/g, "\\'")}';
          
          const check = () => {
            try {
              const element = document.querySelector(selector);
              
              if (element) {
                const rect = element.getBoundingClientRect();
                const style = window.getComputedStyle(element);
                
                const isVisible = (
                  rect.width > 0 && 
                  rect.height > 0 && 
                  style.display !== 'none' && 
                  style.visibility !== 'hidden' &&
                  style.opacity !== '0'
                );
                
                if (isVisible) {
                  resolve({
                    success: true,
                    message: 'Element found and visible',
                    selector: selector,
                    elementInfo: {
                      tagName: element.tagName,
                      id: element.id,
                      className: element.className,
                      text: element.textContent?.substring(0, 50),
                      bounds: rect
                    }
                  });
                  return;
                }
              }
              
              if (Date.now() - startTime > timeout) {
                resolve({
                  success: false,
                  error: 'Timeout waiting for element',
                  selector: selector,
                  timeElapsed: Date.now() - startTime
                });
                return;
              }
              
              setTimeout(check, 250);
            } catch (error) {
              resolve({
                success: false,
                error: error.message,
                selector: selector
              });
            }
          };
          
          check();
        });
      })();
    `;

    const result = await this.webview.executeJavaScript(script);

    if (!result.success) {
      throw new Error(`Wait for element failed: ${result.error}`);
    }

    return result;
  }

  private async select(step: UnifiedExecuteStep): Promise<any> {
    const selector = step.target;
    const value = step.value as string;

    if (!selector || !value) {
      throw new Error('Both selector and value are required for select action');
    }

    const script = `
      (async function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!element) {
            return { success: false, error: 'Element not found' };
          }

          if (element.tagName.toLowerCase() === 'select') {
            const option = Array.from(element.options).find(opt => 
              opt.value === '${value.replace(/'/g, "\\'")}' || 
              opt.text === '${value.replace(/'/g, "\\'")}' ||
              opt.text.includes('${value.replace(/'/g, "\\'")}')
            );
            
            if (option) {
              element.value = option.value;
              element.dispatchEvent(new Event('change', { bubbles: true }));
              return { success: true, selectedValue: option.value, selectedText: option.text };
            } else {
              return { success: false, error: 'Option not found' };
            }
          } else {
            // Handle custom dropdowns
            element.click();
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const options = document.querySelectorAll('[role="option"], .dropdown-item, .select-option');
            const targetOption = Array.from(options).find(opt => 
              opt.textContent?.includes('${value.replace(/'/g, "\\'")}')
            );
            
            if (targetOption) {
              targetOption.click();
              return { success: true, message: 'Custom dropdown option selected' };
            } else {
              return { success: false, error: 'Custom dropdown option not found' };
            }
          }
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);
    if (!result.success) {
      throw new Error(`Select action failed: ${result.error}`);
    }

    await this.wait(1000);
    return result;
  }

  private async toggle(step: UnifiedExecuteStep): Promise<any> {
    const selector = step.target;
    
    if (!selector) {
      throw new Error('Selector is required for toggle action');
    }

    const script = `
      (function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!element) {
            return { success: false, error: 'Element not found' };
          }

          if (element.type === 'checkbox' || element.type === 'radio') {
            const wasChecked = element.checked;
            element.click();
            
            return {
              success: true,
              message: wasChecked ? 'Unchecked' : 'Checked',
              previousState: wasChecked,
              currentState: element.checked
            };
          } else {
            return { success: false, error: 'Element is not a checkbox or radio button' };
          }
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);
    if (!result.success) {
      throw new Error(`Toggle action failed: ${result.error}`);
    }

    return result;
  }

  private async submit(step: UnifiedExecuteStep): Promise<any> {
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

    const result = await this.webview.executeJavaScript(script);
    if (!result.success) {
      throw new Error(`Submit action failed: ${result.error}`);
    }

    // Wait longer for form submissions as they often trigger navigation
    await this.wait(3000);
    return result;
  }

  private async waitTime(step: UnifiedExecuteStep): Promise<any> {
    const milliseconds = step.value as number;
    
    if (!milliseconds || milliseconds < 0) {
      throw new Error('Valid milliseconds value required for wait action');
    }

    console.log(`[ExecuteStepRunner] Waiting ${milliseconds}ms`);
    await this.wait(milliseconds);
    
    return { 
      success: true, 
      message: `Waited ${milliseconds}ms`,
      actualWait: milliseconds 
    };
  }

  private async waitForDynamicContent(step: UnifiedExecuteStep): Promise<any> {
    const timeout = (step.value as number) || 10000;

    const script = `
      (function() {
        return new Promise((resolve) => {
          const startTime = Date.now();
          let previousContentLength = document.body.innerHTML.length;
          let stabilityCount = 0;
          const requiredStability = 3;
          
          const check = () => {
            const currentLength = document.body.innerHTML.length;
            const loadingElements = document.querySelectorAll('[class*="loading"], [class*="spinner"], [aria-busy="true"]');
            
            if (Math.abs(currentLength - previousContentLength) < 100) {
              stabilityCount++;
            } else {
              stabilityCount = 0;
              previousContentLength = currentLength;
            }
            
            const isStable = stabilityCount >= requiredStability;
            const noLoadingElements = loadingElements.length === 0;
            const timeElapsed = Date.now() - startTime;
            
            if ((isStable && noLoadingElements) || timeElapsed > ${timeout}) {
              resolve({
                success: true,
                message: 'Dynamic content loaded',
                timeElapsed: timeElapsed,
                contentLength: currentLength,
                loadingElementsRemaining: loadingElements.length
              });
            } else {
              setTimeout(check, 500);
            }
          };
          
          check();
        });
      })();
    `;

    const result = await this.webview.executeJavaScript(script);
    return result;
  }

  private async clear(step: UnifiedExecuteStep): Promise<any> {
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

    const result = await this.webview.executeJavaScript(script);
    if (!result.success) {
      throw new Error(`Clear action failed: ${result.error}`);
    }

    return result;
  }

  private async focus(step: UnifiedExecuteStep): Promise<any> {
    return this.executeElementAction(step, 'focus', (element: any) => {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => element.focus(), 500);
    });
  }

  private async blur(step: UnifiedExecuteStep): Promise<any> {
    return this.executeElementAction(step, 'blur', (element: any) => {
      element.blur();
    });
  }

  private async hover(step: UnifiedExecuteStep): Promise<any> {
    return this.executeElementAction(step, 'hover', (element: any) => {
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
    });
  }

  private async keypress(step: UnifiedExecuteStep): Promise<any> {
    const selector = step.target || 'body';
    const key = step.value as string || 'Enter';

    const script = `
      (function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!element) {
            return { success: false, error: 'Element not found' };
          }

          element.focus();

          const keyCode = {
            'Enter': 13, 'Tab': 9, 'Escape': 27,
            'ArrowUp': 38, 'ArrowDown': 40, 'ArrowLeft': 37, 'ArrowRight': 39,
            'Backspace': 8, 'Delete': 46, 'Space': 32
          }['${key}'] || '${key}'.charCodeAt(0);

          ['keydown', 'keypress', 'keyup'].forEach(eventType => {
            const event = new KeyboardEvent(eventType, {
              key: '${key}',
              keyCode: keyCode,
              bubbles: true,
              cancelable: true
            });
            element.dispatchEvent(event);
          });

          return { success: true, message: 'Key pressed successfully', key: '${key}' };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);
    if (!result.success) {
      throw new Error(`Keypress action failed: ${result.error}`);
    }

    await this.wait(1000);
    return result;
  }

  private async scroll(step: UnifiedExecuteStep): Promise<any> {
    const target = step.target || 'body';
    const pixels = step.value as number || 300;

    const script = `
      (function() {
        try {
          if ('${target}' === 'body' || '${target}' === 'window') {
            window.scrollBy(0, ${pixels});
          } else {
            const element = document.querySelector('${target.replace(/'/g, "\\'")}');
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
              window.scrollBy(0, ${pixels});
            }
          }

          return { success: true, message: 'Scroll completed', pixels: ${pixels} };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);
    await this.wait(1000);
    return result;
  }

  private async extract(step: UnifiedExecuteStep): Promise<any> {
    const script = `
      (function() {
        try {
          return {
            success: true,
            data: {
              title: document.title,
              url: window.location.href,
              text: document.body.innerText.substring(0, 5000),
              headings: Array.from(document.querySelectorAll('h1, h2, h3')).slice(0, 10).map(h => ({
                tag: h.tagName,
                text: h.textContent?.trim()
              })),
              links: Array.from(document.querySelectorAll('a[href]')).slice(0, 20).map(a => ({
                text: a.textContent?.trim(),
                href: a.href
              })),
              forms: Array.from(document.querySelectorAll('form')).slice(0, 5).map(f => ({
                action: f.action,
                method: f.method,
                fields: Array.from(f.querySelectorAll('input, select, textarea')).map(field => ({
                  name: field.name,
                  type: field.type,
                  required: field.required
                }))
              }))
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);
    if (!result.success) {
      throw new Error(`Extract action failed: ${result.error}`);
    }

    return result;
  }

  private async verifyElement(step: UnifiedExecuteStep): Promise<any> {
    const result = await this.waitForElement(step);
    return {
      ...result,
      verified: result.success,
      message: result.success ? 'Element verification passed' : 'Element verification failed'
    };
  }

  private async verifyText(step: UnifiedExecuteStep): Promise<any> {
    const text = step.value as string;
    
    const script = `
      (function() {
        try {
          const pageText = document.body.innerText.toLowerCase();
          const searchText = '${text.replace(/'/g, "\\'").toLowerCase()}';
          const found = pageText.includes(searchText);
          
          return {
            success: found,
            verified: found,
            message: found ? 'Text found on page' : 'Text not found on page',
            searchText: '${text.replace(/'/g, "\\'")}',
            pageTextLength: pageText.length
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);
    return result;
  }

  private async verifyUrl(step: UnifiedExecuteStep): Promise<any> {
    const expectedUrl = step.value as string;
    const currentUrl = this.webview.getURL();
    const matches = currentUrl.includes(expectedUrl) || expectedUrl.includes(currentUrl);
    
    return {
      success: matches,
      verified: matches,
      message: matches ? 'URL verification passed' : 'URL verification failed',
      expectedUrl,
      currentUrl
    };
  }

  private async executeElementAction(step: UnifiedExecuteStep, actionName: string, action: (element: any) => void): Promise<any> {
    const selector = step.target;
    
    if (!selector) {
      throw new Error(`Selector is required for ${actionName} action`);
    }

    const script = `
      (function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!element) {
            return { success: false, error: 'Element not found' };
          }

          (${action.toString()})(element);

          return { success: true, message: '${actionName} completed successfully' };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);
    if (!result.success) {
      throw new Error(`${actionName} action failed: ${result.error}`);
    }

    return result;
  }

  private async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}