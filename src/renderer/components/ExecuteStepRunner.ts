import { ActionType, ActionValidator, ExecuteStep } from '../types';

export class ExecuteStepRunner {
  private webview: any;
  private readonly DEFAULT_TIMEOUT = 30000;
  private readonly ELEMENT_WAIT_TIMEOUT = 15000;
  private readonly ACTION_DELAY = 1000;

  constructor(webview: any) {
    this.webview = webview;
  }

  public async executeStep(step: ExecuteStep): Promise<any> {
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

  private async executeActionWithRetry(step: ExecuteStep): Promise<any> {
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
        if (await this.attemptRecovery(step, lastError)) {
          console.log(`[ExecuteStepRunner] Recovery successful for ${step.action} on ${step.target}`);
          return { 
            success: true, 
            message: `Completed via recovery mechanism`,
            recoveryUsed: true
          };
        }
        
        if (attempt < maxRetries) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          console.log(`[ExecuteStepRunner] Waiting ${waitTime}ms before retry`);
          await this.wait(waitTime);
        }
      }
    }

    throw new Error(`Step failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
  }
  
  private async attemptRecovery(step: ExecuteStep, error: Error): Promise<boolean> {
    console.log(`[ExecuteStepRunner] Attempting recovery for failed step: ${step.action} on ${step.target}`);
    if (step.action === ActionType.KEYPRESS && step.value === 'Enter') {
      try {
        if (step.target?.includes('urlBar') || step.target?.includes('addressBar')) {
          const inputValue = await this.getElementValue(step.target || '');
          if (inputValue && inputValue.includes('http')) {
            console.log(`[ExecuteStepRunner] Recovery: Navigating directly to ${inputValue}`);
            await this.navigate({ 
              ...step, 
              action: ActionType.NAVIGATION,
              target: inputValue,
              description: `Navigate to ${inputValue} (recovery from failed keypress)`
            });
            return true;
          }
        }
      } catch (e) {
        console.warn('[ExecuteStepRunner] Recovery attempt failed:', e);
      }
    }
    
    if (step.action === ActionType.CLICK && 
        step.target?.includes('button') && 
        (step.target?.includes('Create Short URL') || step.target?.includes('submit'))) {
      try {
        console.log('[ExecuteStepRunner] Recovery: Trying direct form submission');
        
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
          console.log('[ExecuteStepRunner] Recovery: Form submission successful');
          await this.wait(3000); // Wait for navigation
          return true;
        }
      } catch (e) {
        console.warn('[ExecuteStepRunner] Form submission recovery failed:', e);
      }
    }
    
    return false;
  }
  
  private async getElementValue(selector: string): Promise<string> {
    try {
      if (this.isMainAppSelector(selector)) {
        const element = document.querySelector(selector) as HTMLInputElement;
        return element?.value || '';
      }
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
      console.warn('[ExecuteStepRunner] Failed to get element value:', e);
      return '';
    }
  }

  private async executeAction(step: ExecuteStep): Promise<any> {
    await this.wait(this.ACTION_DELAY);

    switch (step.action) {
      case ActionType.NAVIGATION:
      case ActionType.NAVIGATE:
        return await this.navigate(step);
      
      case ActionType.TYPE:
        return await this.textInput(step);
      
      case ActionType.CLEAR:
        return await this.clear(step);
      
      case ActionType.CLICK:
        return await this.click(step);
      
      case ActionType.SELECT:
      case ActionType.SELECT_OPTION:
        return await this.select(step);
      
      case ActionType.TOGGLE:
        return await this.toggle(step);
      
      case ActionType.SUBMIT:
        return await this.submit(step);
      
      case ActionType.WAIT:
        return await this.waitTime(step);
      
      case ActionType.WAIT_FOR_ELEMENT:
        return await this.waitForElement(step);
      
      case ActionType.DYNAMIC_CONTENT:
        return await this.waitForDynamicContent(step);
      
      case ActionType.FOCUS:
        return await this.focus(step);
      
      case ActionType.BLUR:
        return await this.blur(step);
      
      case ActionType.KEYPRESS:
        return await this.keypress(step);
      
      default:
        throw new Error(`Unsupported action: ${step.action}`);
    }
  }

  private async navigate(step: ExecuteStep): Promise<any> {
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
private async textInput(step: ExecuteStep): Promise<any> {
  const selector = step.target;
  const text = step.value as string;

  if (!selector || !text) {
    throw new Error('Both selector and text are required for type action');
  }

  console.log(`[ExecuteStepRunner] Typing "${text}" into ${selector}`);
  if (this.isMainAppSelector(selector)) {
    return await this.typeInMainAppElement(selector, text);
  }
  const script = `
    (async function() {
      try {
        console.log('[ExecuteStepRunner] Finding element with selector:', '${selector}');
        const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (!element) {
          return { success: false, error: 'Element not found', selector: '${selector}' };
        }

        console.log('[ExecuteStepRunner] Found element:', element.tagName, element.id, element.className);
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(resolve => setTimeout(resolve, 800));
        const originalOutline = element.style.outline;
        const originalBoxShadow = element.style.boxShadow;
        element.style.outline = '2px solid blue';
        element.style.boxShadow = '0 0 10px rgba(0,0,255,0.5)';
        element.focus();
        const focusEvent = new FocusEvent('focus', { 
          bubbles: true, 
          cancelable: true,
          relatedTarget: null 
        });
        element.dispatchEvent(focusEvent);
        await new Promise(resolve => setTimeout(resolve, 300));
        if (element.value !== undefined) {
          const originalValue = element.value;
          element.select();
          element.value = '';
          const clearEvents = [
            new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }),
            new Event('input', { bubbles: true, cancelable: true }),
            new KeyboardEvent('keyup', { key: 'Backspace', bubbles: true, cancelable: true })
          ];
          
          clearEvents.forEach(event => element.dispatchEvent(event));
          
          console.log('[ExecuteStepRunner] Cleared input value from:', originalValue);
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        const textValue = '${text.replace(/'/g, "\\'")}';
        console.log('[ExecuteStepRunner] Setting value to:', textValue);
        
        if (element.value !== undefined) {
          element.value = '';
          for (let i = 0; i < textValue.length; i++) {
            const char = textValue[i];
            element.value += char;
            const charEvents = [
              new KeyboardEvent('keydown', { 
                key: char, 
                code: 'Key' + char.toUpperCase(),
                bubbles: true, 
                cancelable: true 
              }),
              new KeyboardEvent('keypress', { 
                key: char,
                charCode: char.charCodeAt(0),
                bubbles: true, 
                cancelable: true 
              }),
              new Event('beforeinput', { 
                bubbles: true, 
                cancelable: true 
              }),
              new Event('input', { 
                bubbles: true, 
                cancelable: true 
              }),
              new KeyboardEvent('keyup', { 
                key: char, 
                code: 'Key' + char.toUpperCase(),
                bubbles: true, 
                cancelable: true 
              })
            ];
            charEvents.forEach(event => {
              try {
                element.dispatchEvent(event);
              } catch (e) {
                console.warn('[ExecuteStepRunner] Event dispatch failed:', e);
              }
            });
            if (i < textValue.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        console.log('[ExecuteStepRunner] Synchronizing with React form state');
        const reactKey = Object.keys(element).find(key => 
          key.startsWith('__reactInternalInstance') ||
          key.startsWith('__reactFiber') ||
          key.startsWith('_reactInternalFiber') ||
          key.startsWith('__reactProps')
        );
        
        if (reactKey) {
          console.log('[ExecuteStepRunner] Found React key:', reactKey);
          
          try {
            const reactData = element[reactKey];
            let currentFiber = reactData;
            let attempts = 0;
            while (currentFiber && attempts < 10) {
              if (currentFiber.memoizedProps && typeof currentFiber.memoizedProps.onChange === 'function') {
                console.log('[ExecuteStepRunner] Found onChange handler in fiber');
                const syntheticEvent = {
                  target: element,
                  currentTarget: element,
                  type: 'change',
                  bubbles: true,
                  cancelable: true,
                  timeStamp: Date.now(),
                  preventDefault: () => {},
                  stopPropagation: () => {},
                  persist: () => {},
                  nativeEvent: new Event('change', { bubbles: true })
                };
                currentFiber.memoizedProps.onChange(syntheticEvent);
                console.log('[ExecuteStepRunner] Called React onChange handler');
                break;
              }
              currentFiber = currentFiber.return || currentFiber._owner || currentFiber.parent;
              attempts++;
            }
            const form = element.closest('form');
            if (form) {
              const formReactKey = Object.keys(form).find(key => 
                key.startsWith('__reactInternalInstance') ||
                key.startsWith('__reactFiber') ||
                key.startsWith('_reactInternalFiber')
              );
              
              if (formReactKey) {
                const formFiber = form[formReactKey];
                if (formFiber && formFiber.memoizedProps) {
                  if (typeof formFiber.memoizedProps.onInvalid === 'function') {
                    formFiber.memoizedProps.onInvalid();
                  }
                }
              }
            }
          } catch (reactError) {
            console.warn('[ExecuteStepRunner] React state sync error:', reactError);
          }
        }
        if (element.name) {
          const formWrapper = element.closest('[data-testid], [data-form], form');
          if (formWrapper) {
            const validationEvents = [
              new Event('change', { bubbles: true }),
              new Event('blur', { bubbles: true }),
              new CustomEvent('react-hook-form:setValue', {
                detail: { name: element.name, value: textValue }
              })
            ];
            
            validationEvents.forEach(event => {
              try {
                element.dispatchEvent(event);
                if (formWrapper !== element) {
                  formWrapper.dispatchEvent(event);
                }
              } catch (e) {
                console.warn('[ExecuteStepRunner] Form validation event failed:', e);
              }
            });
          }
        }
        await new Promise(resolve => setTimeout(resolve, 300));
        const blurEvent = new FocusEvent('blur', { 
          bubbles: true, 
          cancelable: true,
          relatedTarget: null
        });
        element.dispatchEvent(blurEvent);
        await new Promise(resolve => setTimeout(resolve, 200));
        setTimeout(() => {
          element.style.outline = originalOutline;
          element.style.boxShadow = originalBoxShadow;
        }, 1000);
        const finalValue = element.value || element.textContent || '';
        const valueSet = finalValue === textValue;
        
        console.log('[ExecuteStepRunner] Final element value:', finalValue);
        console.log('[ExecuteStepRunner] Expected value:', textValue);
        console.log('[ExecuteStepRunner] Value successfully set:', valueSet);
        const isFormValid = element.checkValidity ? element.checkValidity() : true;
        console.log('[ExecuteStepRunner] Element validity:', isFormValid);

        return {
          success: true,
          message: valueSet ? 'Text input completed with React state sync' : 'Text entered but verification failed',
          valueVerified: valueSet,
          formValid: isFormValid,
          elementInfo: {
            tagName: element.tagName,
            type: element.type,
            value: finalValue,
            selector: '${selector}',
            validity: element.validity ? {
              valid: element.validity.valid,
              valueMissing: element.validity.valueMissing
            } : null
          }
        };
      } catch (error) {
        console.error('[ExecuteStepRunner] Enhanced text input error:', error);
        return { success: false, error: error.message, stack: error.stack };
      }
    })();
  `;

  const result = await this.webview.executeJavaScript(script);

  if (!result.success) {  
    throw new Error(`Type action failed: ${result.error}`);
  }

  return result;
}
private async handleFormButtonClick(selector: string): Promise<any> {
  console.log(`[ExecuteStepRunner] Enhanced React form button click handling for: ${selector}`);
  
  const script = `
    (async function() {
      try {
        console.log('[Form Button Click] Starting enhanced React form submission process');
        console.log('[Form Button Click] Running pre-flight form validation');
        const forms = document.querySelectorAll('form');
        
        let targetForm = null;
        let allInputsValid = true;
        const invalidInputs = [];
        
        forms.forEach(form => {
          const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');
          inputs.forEach(input => {
            console.log(\`[Form Button Click] Validating input: \${input.name || input.id}, value="\${input.value}", required=\${input.required}\`);
            
            if (input.required && (!input.value || input.value.trim() === '')) {
              allInputsValid = false;
              invalidInputs.push({
                name: input.name || input.id || 'unnamed',
                element: input
              });
            } else if (input.checkValidity && !input.checkValidity()) {
              allInputsValid = false;
              invalidInputs.push({
                name: input.name || input.id || 'unnamed',
                element: input,
                validity: input.validity
              });
            }
          });
          if (!targetForm) {
            targetForm = form;
          }
        });
        
        console.log(\`[Form Button Click] Form validation result: \${allInputsValid ? 'VALID' : 'INVALID'}\`);
        if (!allInputsValid) {
          console.log('[Form Button Click] Invalid inputs found:', invalidInputs.map(i => i.name));
        }
        let button = null;
        const buttonSelectors = [
          '${selector.replace(/'/g, "\\'")}',
          'button[type="submit"]',
          'input[type="submit"]',
          'button:contains("Create Short URL")',
          'button:contains("Submit")',
          'button:contains("Create")',
          '[role="button"]:contains("Create Short URL")',
          '.btn:contains("Create Short URL")',
          'form button:last-child'
        ];
        
        for (const sel of buttonSelectors) {
          try {
            if (sel.includes(':contains')) {
              const tagName = sel.split(':')[0] || 'button';
              const containsText = sel.match(/:contains\\(['"]([^'"]+)['"]\\)/)?.[1];
              if (containsText) {
                const elements = document.querySelectorAll(tagName);
                button = Array.from(elements).find(el => 
                  el.textContent && el.textContent.trim().includes(containsText)
                );
              }
            } else {
              button = document.querySelector(sel);
            }
            
            if (button) {
              console.log(\`[Form Button Click] Found button with selector: \${sel}\`);
              break;
            }
          } catch (e) {
            console.warn(\`[Form Button Click] Selector failed: \${sel}\`, e);
          }
        }

        if (!button) {
          return { success: false, error: 'Submit button not found with any selector' };
        }
        const buttonRect = button.getBoundingClientRect();
        const buttonStyle = window.getComputedStyle(button);
        const isButtonVisible = buttonRect.width > 0 && buttonRect.height > 0 && 
                                buttonStyle.display !== 'none' && 
                                buttonStyle.visibility !== 'hidden';
        const isButtonEnabled = !button.disabled && 
                               !button.hasAttribute('disabled') &&
                               button.getAttribute('aria-disabled') !== 'true';

        console.log('[Form Button Click] Button analysis:', {
          visible: isButtonVisible,
          enabled: isButtonEnabled,
          text: button.textContent?.trim(),
          type: button.type,
          tagName: button.tagName
        });

        if (!isButtonVisible) {
          return { success: false, error: 'Button is not visible' };
        }
        button.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(resolve => setTimeout(resolve, 500));
        const originalStyle = button.style.cssText;
        button.style.outline = '3px solid green';
        button.style.boxShadow = '0 0 15px rgba(0,255,0,0.7)';
        if (targetForm) {
          const formInputs = targetForm.querySelectorAll('input, select, textarea');
          formInputs.forEach(input => {
            if (input.value && input.value.trim()) {
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
            }
          });
          await new Promise(resolve => setTimeout(resolve, 400));
        }
        const submissionStrategies = [
          async () => {
            console.log('[Form Button Click] Strategy 1: React button click');
            const reactKey = Object.keys(button).find(key => 
              key.startsWith('__reactInternalInstance') ||
              key.startsWith('__reactFiber') ||
              key.startsWith('_reactInternalFiber') ||
              key.startsWith('__reactProps')
            );
            
            if (reactKey) {
              const reactData = button[reactKey];
              let currentFiber = reactData;
              let attempts = 0;
              
              while (currentFiber && attempts < 10) {
                if (currentFiber.memoizedProps && typeof currentFiber.memoizedProps.onClick === 'function') {
                  console.log('[Form Button Click] Found React onClick handler');
                  
                  const syntheticEvent = {
                    target: button,
                    currentTarget: button,
                    type: 'click',
                    bubbles: true,
                    cancelable: true,
                    preventDefault: () => {},
                    stopPropagation: () => {},
                    persist: () => {},
                    nativeEvent: new MouseEvent('click', { bubbles: true })
                  };
                  
                  await currentFiber.memoizedProps.onClick(syntheticEvent);
                  return { success: true, method: 'react-onclick' };
                }
                
                currentFiber = currentFiber.return || currentFiber._owner || currentFiber.parent;
                attempts++;
              }
            }
            button.click();
            return { success: true, method: 'regular-click' };
          },
          async () => {
            console.log('[Form Button Click] Strategy 2: React form submission');
            
            if (targetForm) {
              const formReactKey = Object.keys(targetForm).find(key => 
                key.startsWith('__reactInternalInstance') ||
                key.startsWith('__reactFiber') ||
                key.startsWith('_reactInternalFiber')
              );
              
              if (formReactKey) {
                const formFiber = targetForm[formReactKey];
                let currentFiber = formFiber;
                let attempts = 0;
                
                while (currentFiber && attempts < 10) {
                  if (currentFiber.memoizedProps && typeof currentFiber.memoizedProps.onSubmit === 'function') {
                    console.log('[Form Button Click] Found React onSubmit handler');
                    
                    const syntheticEvent = {
                      target: targetForm,
                      currentTarget: targetForm,
                      type: 'submit',
                      bubbles: true,
                      cancelable: true,
                      preventDefault: () => {},
                      stopPropagation: () => {},
                      persist: () => {},
                      nativeEvent: new Event('submit', { bubbles: true })
                    };
                    
                    await currentFiber.memoizedProps.onSubmit(syntheticEvent);
                    return { success: true, method: 'react-onsubmit' };
                  }
                  
                  currentFiber = currentFiber.return || currentFiber._owner || currentFiber.parent;
                  attempts++;
                }
              }
              const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
              targetForm.dispatchEvent(submitEvent);
              return { success: true, method: 'form-submit-event' };
            }
            
            return { success: false, method: 'no-form-found' };
          },
          async () => {
            console.log('[Form Button Click] Strategy 3: Direct form submission');
            
            if (targetForm) {
              try {
                targetForm.submit();
                return { success: true, method: 'form-submit' };
              } catch (e) {
                console.warn('[Form Button Click] Direct form.submit() failed:', e);
                return { success: false, method: 'form-submit-failed' };
              }
            }
            
            return { success: false, method: 'no-form-for-direct-submit' };
          },
          async () => {
            console.log('[Form Button Click] Strategy 4: Programmatic button trigger');
            const mouseEvents = [
              new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
              new MouseEvent('mouseup', { bubbles: true, cancelable: true }),
              new MouseEvent('click', { bubbles: true, cancelable: true })
            ];
            
            for (const event of mouseEvents) {
              button.dispatchEvent(event);
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            return { success: true, method: 'mouse-events' };
          }
        ];
        let submissionResult = null;
        
        for (let i = 0; i < submissionStrategies.length; i++) {
          try {
            console.log(\`[Form Button Click] Executing strategy \${i + 1}\`);
            const result = await submissionStrategies[i]();
            
            if (result.success) {
              submissionResult = result;
              console.log(\`[Form Button Click] Strategy \${i + 1} succeeded: \${result.method}\`);
              break;
            }
          } catch (e) {
            console.warn(\`[Form Button Click] Strategy \${i + 1} failed:\`, e);
          }
        }
        setTimeout(() => {
          button.style.cssText = originalStyle;
        }, 1000);

        if (!submissionResult || !submissionResult.success) {
          return { 
            success: false, 
            error: 'All form submission strategies failed',
            formValid: allInputsValid,
            invalidInputs: invalidInputs.map(i => i.name)
          };
        }

        return {
          success: true,
          message: \`Form submitted successfully using \${submissionResult.method}\`,
          submissionMethod: submissionResult.method,
          formValid: allInputsValid,
          buttonInfo: {
            tagName: button.tagName,
            type: button.type,
            text: button.textContent?.trim()
          }
        };

      } catch (error) {
        console.error('[Form Button Click] Enhanced submission error:', error);
        return { success: false, error: error.message, stack: error.stack };
      }
    })();
  `;
  
  try {
    const result = await this.webview.executeJavaScript(script);
    
    if (!result.success) {
      console.error('[ExecuteStepRunner] Enhanced form submission failed:', result.error);
      throw new Error(`Enhanced form submission failed: ${result.error}`);
    }
    
    console.log('[ExecuteStepRunner] Enhanced form submission successful:', result.message);
    await this.wait(4000);
    
    return result;
  } catch (error) {
    console.error('[ExecuteStepRunner] Enhanced form submission error:', error);
    throw new Error(`Enhanced form submission error: ${(error as Error).message}`);
  }
}

  private async click(step: ExecuteStep): Promise<any> {
    const selector = step.target;
    
    if (!selector) {
      throw new Error('Selector is required for click action');
    }

    console.log(`[ExecuteStepRunner] Attempting to click element: ${selector}`);
    if (this.isMainAppSelector(selector)) {
      return await this.clickMainAppElement(selector);
    }
    if (selector.includes('button') && 
        (selector.includes('Create Short URL') || 
         selector.includes('submit') || 
         selector.includes('form'))) {
      return await this.handleFormButtonClick(selector);
    }
    const script = `
      (async function() {
        try {
          console.log('Attempting to find element with selector: ${selector}');
          let element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          
          if (!element) {
            console.log('Primary selector failed, trying alternatives...');
            const alternatives = [
              '${selector}',
              '${selector.replace(/"/g, "'")}',
              '${selector.split(' ')[0]}',
              '[data-testid*="${selector.replace(/[^a-zA-Z0-9]/g, '')}"]',
              '[aria-label*="${selector.replace(/[^a-zA-Z0-9]/g, '')}"]',
              'button:contains("${selector.replace(/[^a-zA-Z0-9\s]/g, '')}")',
              'a:contains("${selector.replace(/[^a-zA-Z0-9\s]/g, '')}")'
            ];
            
            for (const alt of alternatives) {
              try {
                console.log('Trying alternative selector:', alt);
                element = document.querySelector(alt);
                if (element) {
                  console.log('Found element with alternative selector:', alt);
                  break;
                }
              } catch (e) {
                console.log('Alternative selector failed:', alt, e.message);
              }
            }
          } else {
            console.log('Found element with primary selector');
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
    await this.wait(1500);

    return result;
  }

  private async waitForElement(step: ExecuteStep): Promise<any> {
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

  private async select(step: ExecuteStep): Promise<any> {
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

  private async toggle(step: ExecuteStep): Promise<any> {
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

  private async submit(step: ExecuteStep): Promise<any> {
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
            const form = element.closest('form');
            if (form) {
              form.submit();
            } else {
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
    await this.wait(3000);
    return result;
  }

  private async waitTime(step: ExecuteStep): Promise<any> {
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

  private async waitForDynamicContent(step: ExecuteStep): Promise<any> {
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

  private async clear(step: ExecuteStep): Promise<any> {
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

  private async focus(step: ExecuteStep): Promise<any> {
    return this.executeElementAction(step, 'focus', (element: any) => {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => element.focus(), 500);
    });
  }

  private async blur(step: ExecuteStep): Promise<any> {
    return this.executeElementAction(step, 'blur', (element: any) => {
      element.blur();
    });
  }


  private async keypress(step: ExecuteStep): Promise<any> {
    const selector = step.target || 'body';
    const key = step.value as string || 'Enter';

    console.log(`[ExecuteStepRunner] Pressing key "${key}" on ${selector}`);
    if (selector.includes('urlBar') || selector.includes('addressBar')) {
      return this.handleUrlBarKeypress(selector, key);
    }
    if (key === 'Enter' && (selector.includes('input') || selector.includes('#APjFqb'))) {
      return await this.handleEnterKeySpecial(selector, key);
    }
    const script = `
      (function() {
        try {
          let element = null;
          try {
            element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          } catch (selectorError) {
            if ('${selector}'.startsWith('#')) {
              element = document.getElementById('${selector}'.substring(1));
            }
          }
          
          if (!element) {
            return { success: false, error: 'Element not found', selector: '${selector}' };
          }
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.focus();

          const keyValue = '${key}';
          let keyCode = 0;
          let ctrlKey = false;
          if (keyValue.includes('Ctrl+')) {
            ctrlKey = true;
            const actualKey = keyValue.replace('Ctrl+', '');
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
            const keyCodes = {
              'Enter': 13, 'Tab': 9, 'Escape': 27,
              'ArrowUp': 38, 'ArrowDown': 40, 'ArrowLeft': 37, 'ArrowRight': 39,
              'Backspace': 8, 'Delete': 46, 'Space': 32
            };
            keyCode = keyCodes[keyValue] || keyValue.charCodeAt(0);
          }
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

    const result = await this.webview.executeJavaScript(script);
    if (!result.success) {
      console.error(`[ExecuteStepRunner] Keypress failed:`, result);
      throw new Error(`Keypress action failed: ${result.error}`);
    }

    console.log(`[ExecuteStepRunner] Keypress successful:`, result.message);
    await this.wait(500);
    return result;
  }

  private async handleEnterKeySpecial(selector: string, key: string): Promise<any> {
    console.log(`[ExecuteStepRunner] Special Enter key handling for ${selector}`);

    const script = `
      (function() {
        try {
          let element = null;
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
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.focus();
          const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
          });
          
          element.dispatchEvent(enterEvent);
          if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            const form = element.closest('form');
            if (form) {
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

    const result = await this.webview.executeJavaScript(script);
    if (!result.success) {
      console.error(`[ExecuteStepRunner] Special Enter failed:`, result);
      throw new Error(`Enter keypress failed: ${result.error}`);
    }

    console.log(`[ExecuteStepRunner] Special Enter successful:`, result.message);
    await this.wait(1500); // Longer wait for form submission
    return result;
  }






  private async executeElementAction(step: ExecuteStep, actionName: string, action: (element: any) => void): Promise<any> {
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

  private isMainAppSelector(selector: string): boolean {
    const mainAppSelectors = [
      '#urlBar',
      '#backBtn',
      '#forwardBtn', 
      '#reloadBtn',
      '#goBtn',
      '#newTabBtn',
      '#startRecordingBtn',
      '#stopRecordingBtn',
      '.tab-bar',
      '.toolbar',
      '.nav-controls'
    ];

    return mainAppSelectors.some(mainSelector => 
      selector === mainSelector || selector.includes(mainSelector)
    );
  }

  private async clickMainAppElement(selector: string): Promise<any> {
    console.log(`[ExecuteStepRunner] Clicking main app element: ${selector}`);
    
    try {
      const element = document.querySelector(selector);
      
      if (!element) {
        throw new Error(`Main app element not found: ${selector}`);
      }
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.wait(500);
      const clickStrategies = [
        () => (element as HTMLElement).click(),
        () => {
          const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          element.dispatchEvent(event);
        },
        () => {
          if ('focus' in element) (element as HTMLElement).focus();
          const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            keyCode: 13,
            bubbles: true
          });
          element.dispatchEvent(enterEvent);
        }
      ];

      let success = false;
      for (const strategy of clickStrategies) {
        try {
          strategy();
          success = true;
          break;
        } catch (e) {
          console.warn('[ExecuteStepRunner] Click strategy failed:', e);
        }
      }

      if (!success) {
        throw new Error('All click strategies failed for main app element');
      }

      return {
        success: true,
        message: 'Main app element clicked successfully',
        elementInfo: {
          tagName: element.tagName,
          id: element.id,
          className: element.className,
          selector: selector
        }
      };

    } catch (error) {
      console.error('[ExecuteStepRunner] Main app click failed:', error);
      throw new Error(`Main app click failed: ${(error as Error).message}`);
    }
  }

  private async typeInMainAppElement(selector: string, text: string): Promise<any> {
    console.log(`[ExecuteStepRunner] Typing in main app element: ${selector} = "${text}"`);
    
    try {
      const element = document.querySelector(selector) as HTMLInputElement;
      
      if (!element) {
        throw new Error(`Main app element not found: ${selector}`);
      }
      element.focus();
      await this.wait(200);
      element.value = '';
      element.value = text;
      const events = ['input', 'change', 'keyup'];
      events.forEach(eventType => {
        const event = new Event(eventType, { bubbles: true, cancelable: true });
        element.dispatchEvent(event);
      });
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
      console.error('[ExecuteStepRunner] Main app type failed:', error);
      throw new Error(`Main app type failed: ${(error as Error).message}`);
    }
  }

  private async handleUrlBarKeypress(selector: string, key: string): Promise<any> {
    console.log(`[ExecuteStepRunner] Special URL bar keypress handling for ${selector} with key ${key}`);
    
    try {
      const element = document.querySelector(selector) as HTMLInputElement;
      
      if (!element) {
        throw new Error(`URL bar element not found: ${selector}`);
      }
      element.focus();
      await this.wait(200);
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
      element.dispatchEvent(keydownEvent);
      element.dispatchEvent(keyupEvent);
      if (key === 'Enter') {
        console.log('[ExecuteStepRunner] Triggering URL bar navigation');
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        const form = element.closest('form');
        if (form) {
          form.dispatchEvent(submitEvent);
        }
        const url = element.value;
        if (url && url.length > 0) {
          console.log(`[ExecuteStepRunner] Navigating to: ${url}`);
          await this.wait(500);
          try {
            return await this.navigate({
              id: 'fallback-navigation',
              action: ActionType.NAVIGATION,
              target: url,
              description: `Navigate to ${url} (fallback from URL bar)`,
              status: 'pending',
              maxRetries: 2,
              retryCount: 0,
              reasoning: `Navigate to ${url} (fallback from URL bar)`
            });
          } catch (navError) {
            console.warn('[ExecuteStepRunner] Fallback navigation failed:', navError);
          }
        }
      }
      
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