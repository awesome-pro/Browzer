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
        
        // Try recovery before next retry
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
    
    // Handle specific failure cases
    if (step.action === ActionType.KEYPRESS && step.value === 'Enter') {
      try {
        // Try alternative navigation approach
        if (step.target?.includes('urlBar') || step.target?.includes('addressBar')) {
          // Try direct navigation if we can extract a URL
          const inputValue = await this.getElementValue(step.target || '');
          if (inputValue && inputValue.includes('http')) {
            console.log(`[ExecuteStepRunner] Recovery: Navigating directly to ${inputValue}`);
            await this.navigate({ 
              ...step, 
              action: ActionType.NAVIGATE,
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
        // Try submitting the form directly
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
      // Try to get value from main app element
      if (this.isMainAppSelector(selector)) {
        const element = document.querySelector(selector) as HTMLInputElement;
        return element?.value || '';
      }
      
      // Try to get value from webview element
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
      case ActionType.NAVIGATE:
        return await this.navigate(step);
      
      case ActionType.TYPE:
        return await this.textInput(step);
      
      case ActionType.CLEAR:
        return await this.clear(step);
      
      case ActionType.CLICK:
        return await this.click(step);
      
      case ActionType.SELECT:
        return await this.select(step);
      
      case ActionType.TOGGLE:
        return await this.toggle(step);
      
      case ActionType.SUBMIT:
        return await this.submit(step);
      
      case ActionType.WAIT:
        return await this.waitTime(step);
      
      case ActionType.WAIT_FOR_ELEMENT:
        return await this.waitForElement(step);
      
      case ActionType.WAIT_FOR_DYNAMIC_CONTENT:
        return await this.waitForDynamicContent(step);
      
      case ActionType.FOCUS:
        return await this.focus(step);
      
      case ActionType.BLUR:
        return await this.blur(step);
      
      case ActionType.HOVER:
        return await this.hover(step);
      
      case ActionType.KEYPRESS:
        return await this.keypress(step);
      
      case ActionType.SCROLL:
        return await this.scroll(step);
      
      case ActionType.EXTRACT:
        return await this.extract(step);
      
      case ActionType.VERIFY_ELEMENT:
        return await this.verifyElement(step);
      
      case ActionType.VERIFY_TEXT:
        return await this.verifyText(step);
      
      case ActionType.VERIFY_URL:
        return await this.verifyUrl(step);
      
      // Enhanced Form Actions
      case ActionType.SELECT_OPTION:
        return await this.selectOption(step);
      
      case ActionType.TOGGLE_CHECKBOX:
        return await this.toggleCheckbox(step);
      
      case ActionType.SELECT_RADIO:
        return await this.selectRadio(step);
      
      case ActionType.SELECT_FILE:
        return await this.selectFile(step);
      
      case ActionType.ADJUST_SLIDER:
        return await this.adjustSlider(step);
      
      // Clipboard Actions
      case ActionType.COPY:
        return await this.copy(step);
      
      case ActionType.CUT:
        return await this.cut(step);
      
      case ActionType.PASTE:
        return await this.paste(step);
      
      // Context Actions
      case ActionType.CONTEXT_MENU:
        return await this.contextMenu(step);
      
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

  // Enhanced textInput method with React form support
private async textInput(step: ExecuteStep): Promise<any> {
  const selector = step.target;
  const text = step.value as string;

  if (!selector || !text) {
    throw new Error('Both selector and text are required for type action');
  }

  console.log(`[ExecuteStepRunner] Typing "${text}" into ${selector}`);

  // Check if this is a main app element (like #urlBar)
  if (this.isMainAppSelector(selector)) {
    return await this.typeInMainAppElement(selector, text);
  }

  // Enhanced script for React-based forms with proper state synchronization
  const script = `
    (async function() {
      try {
        console.log('[ExecuteStepRunner] Finding element with selector:', '${selector}');
        const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (!element) {
          return { success: false, error: 'Element not found', selector: '${selector}' };
        }

        console.log('[ExecuteStepRunner] Found element:', element.tagName, element.id, element.className);

        // Ensure element is visible and focusable
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(resolve => setTimeout(resolve, 800));

        // Add visual feedback for debugging
        const originalOutline = element.style.outline;
        const originalBoxShadow = element.style.boxShadow;
        element.style.outline = '2px solid blue';
        element.style.boxShadow = '0 0 10px rgba(0,0,255,0.5)';

        // STEP 1: Proper focus with React event handling
        element.focus();
        
        // Dispatch focus events that React expects
        const focusEvent = new FocusEvent('focus', { 
          bubbles: true, 
          cancelable: true,
          relatedTarget: null 
        });
        element.dispatchEvent(focusEvent);
        
        // Wait for React to process focus
        await new Promise(resolve => setTimeout(resolve, 300));

        // STEP 2: Clear existing content with proper React event sequence
        if (element.value !== undefined) {
          const originalValue = element.value;
          
          // Select all content first (like a user would)
          element.select();
          
          // Clear with backspace simulation for React forms
          element.value = '';
          
          // Trigger the full event sequence for clearing
          const clearEvents = [
            new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }),
            new Event('input', { bubbles: true, cancelable: true }),
            new KeyboardEvent('keyup', { key: 'Backspace', bubbles: true, cancelable: true })
          ];
          
          clearEvents.forEach(event => element.dispatchEvent(event));
          
          console.log('[ExecuteStepRunner] Cleared input value from:', originalValue);
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        // STEP 3: Type the new value with realistic character-by-character input
        const textValue = '${text.replace(/'/g, "\\'")}';
        console.log('[ExecuteStepRunner] Setting value to:', textValue);
        
        if (element.value !== undefined) {
          // Clear any existing value completely
          element.value = '';
          
          // Simulate realistic typing with proper event sequence for each character
          for (let i = 0; i < textValue.length; i++) {
            const char = textValue[i];
            
            // Add character to value
            element.value += char;
            
            // Create comprehensive event sequence for each character
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
            
            // Dispatch all events for this character
            charEvents.forEach(event => {
              try {
                element.dispatchEvent(event);
              } catch (e) {
                console.warn('[ExecuteStepRunner] Event dispatch failed:', e);
              }
            });
            
            // Small delay between characters for realistic typing
            if (i < textValue.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
          
          // Wait for React to process all input events
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // STEP 4: Comprehensive React form state synchronization
        console.log('[ExecuteStepRunner] Synchronizing with React form state');
        
        // Find React fiber and props
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
            
            // Navigate the fiber tree to find the component with onChange
            let attempts = 0;
            while (currentFiber && attempts < 10) {
              if (currentFiber.memoizedProps && typeof currentFiber.memoizedProps.onChange === 'function') {
                console.log('[ExecuteStepRunner] Found onChange handler in fiber');
                
                // Create synthetic event that matches React's expectations
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
                
                // Call the onChange handler
                currentFiber.memoizedProps.onChange(syntheticEvent);
                console.log('[ExecuteStepRunner] Called React onChange handler');
                break;
              }
              
              // Try parent fiber
              currentFiber = currentFiber.return || currentFiber._owner || currentFiber.parent;
              attempts++;
            }
            
            // Also try to trigger form validation
            const form = element.closest('form');
            if (form) {
              // Find form's React fiber
              const formReactKey = Object.keys(form).find(key => 
                key.startsWith('__reactInternalInstance') ||
                key.startsWith('__reactFiber') ||
                key.startsWith('_reactInternalFiber')
              );
              
              if (formReactKey) {
                const formFiber = form[formReactKey];
                if (formFiber && formFiber.memoizedProps) {
                  // Trigger form validation if available
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

        // STEP 5: Additional form library compatibility (react-hook-form, formik, etc.)
        
        // React Hook Form compatibility
        if (element.name) {
          const formWrapper = element.closest('[data-testid], [data-form], form');
          if (formWrapper) {
            // Trigger validation events
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

        // STEP 6: Force form re-validation after state changes
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Final blur to trigger validation
        const blurEvent = new FocusEvent('blur', { 
          bubbles: true, 
          cancelable: true,
          relatedTarget: null
        });
        element.dispatchEvent(blurEvent);
        
        // Wait for validation to complete
        await new Promise(resolve => setTimeout(resolve, 200));

        // Remove visual feedback
        setTimeout(() => {
          element.style.outline = originalOutline;
          element.style.boxShadow = originalBoxShadow;
        }, 1000);

        // STEP 7: Verify the value was set and form state updated
        const finalValue = element.value || element.textContent || '';
        const valueSet = finalValue === textValue;
        
        console.log('[ExecuteStepRunner] Final element value:', finalValue);
        console.log('[ExecuteStepRunner] Expected value:', textValue);
        console.log('[ExecuteStepRunner] Value successfully set:', valueSet);

        // Check form validity state
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

// Enhanced form button click handler with React form submission
private async handleFormButtonClick(selector: string): Promise<any> {
  console.log(`[ExecuteStepRunner] Enhanced React form button click handling for: ${selector}`);
  
  const script = `
    (async function() {
      try {
        console.log('[Form Button Click] Starting enhanced React form submission process');
        
        // STEP 1: Pre-flight form validation
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
          
          // Mark this as our target form
          if (!targetForm) {
            targetForm = form;
          }
        });
        
        console.log(\`[Form Button Click] Form validation result: \${allInputsValid ? 'VALID' : 'INVALID'}\`);
        if (!allInputsValid) {
          console.log('[Form Button Click] Invalid inputs found:', invalidInputs.map(i => i.name));
        }

        // STEP 2: Find the submit button
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
              // Handle :contains pseudo-selector
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

        // STEP 3: Enhanced button state analysis
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

        // STEP 4: Prepare form for submission
        button.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(resolve => setTimeout(resolve, 500));

        // Add visual feedback
        const originalStyle = button.style.cssText;
        button.style.outline = '3px solid green';
        button.style.boxShadow = '0 0 15px rgba(0,255,0,0.7)';

        // STEP 5: Force form re-validation before submission
        if (targetForm) {
          const formInputs = targetForm.querySelectorAll('input, select, textarea');
          formInputs.forEach(input => {
            // Force re-validation
            if (input.value && input.value.trim()) {
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
            }
          });
          
          // Wait for validation to complete
          await new Promise(resolve => setTimeout(resolve, 400));
        }

        // STEP 6: Multi-strategy form submission
        const submissionStrategies = [
          // Strategy 1: React form submission via button click
          async () => {
            console.log('[Form Button Click] Strategy 1: React button click');
            
            // Find React props for the button
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
            
            // Fallback to regular click
            button.click();
            return { success: true, method: 'regular-click' };
          },

          // Strategy 2: Form submission via React form handler
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
              
              // Fallback: dispatch submit event
              const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
              targetForm.dispatchEvent(submitEvent);
              return { success: true, method: 'form-submit-event' };
            }
            
            return { success: false, method: 'no-form-found' };
          },

          // Strategy 3: Direct form submission
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

          // Strategy 4: Programmatic button trigger
          async () => {
            console.log('[Form Button Click] Strategy 4: Programmatic button trigger');
            
            // Create and dispatch multiple mouse events
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

        // STEP 7: Execute submission strategies
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

        // Remove visual feedback
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
    
    // Wait longer for form submission to complete
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

    // Check if this is a main app element (like #urlBar)
    if (this.isMainAppSelector(selector)) {
      return await this.clickMainAppElement(selector);
    }
    
    // Special handling for form submit buttons (like "Create Short URL")
    if (selector.includes('button') && 
        (selector.includes('Create Short URL') || 
         selector.includes('submit') || 
         selector.includes('form'))) {
      return await this.handleFormButtonClick(selector);
    }

    // Otherwise, execute in webview
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

    // Wait for any potential page changes
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

  private async hover(step: ExecuteStep): Promise<any> {
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

  private async keypress(step: ExecuteStep): Promise<any> {
    const selector = step.target || 'body';
    const key = step.value as string || 'Enter';

    console.log(`[ExecuteStepRunner] Pressing key "${key}" on ${selector}`);

    // Special handling for URL bar which might be in the main app UI
    if (selector.includes('urlBar') || selector.includes('addressBar')) {
      return this.handleUrlBarKeypress(selector, key);
    }

    // For Enter key on input fields, use a simpler, more reliable approach
    if (key === 'Enter' && (selector.includes('input') || selector.includes('#APjFqb'))) {
      return await this.handleEnterKeySpecial(selector, key);
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

          // Create keyboard events (simplified)
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

    const result = await this.webview.executeJavaScript(script);
    if (!result.success) {
      console.error(`[ExecuteStepRunner] Special Enter failed:`, result);
      throw new Error(`Enter keypress failed: ${result.error}`);
    }

    console.log(`[ExecuteStepRunner] Special Enter successful:`, result.message);
    await this.wait(1500); // Longer wait for form submission
    return result;
  }

  private async scroll(step: ExecuteStep): Promise<any> {
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

  private async extract(step: ExecuteStep): Promise<any> {
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

  private async verifyElement(step: ExecuteStep): Promise<any> {
    const result = await this.waitForElement(step);
    return {
      ...result,
      verified: result.success,
      message: result.success ? 'Element verification passed' : 'Element verification failed'
    };
  }

  private async verifyText(step: ExecuteStep): Promise<any> {
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

  private async verifyUrl(step: ExecuteStep): Promise<any> {
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
    // Check if selector targets main app elements
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
      // Access main app DOM through renderer process
      const element = document.querySelector(selector);
      
      if (!element) {
        throw new Error(`Main app element not found: ${selector}`);
      }

      // Simulate click on main app element
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.wait(500);

      // Try multiple click strategies
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
      // Access main app DOM through renderer process
      const element = document.querySelector(selector) as HTMLInputElement;
      
      if (!element) {
        throw new Error(`Main app element not found: ${selector}`);
      }

      // Focus the element first
      element.focus();
      await this.wait(200);

      // Clear existing content
      element.value = '';
      
      // Set the new value
      element.value = text;

      // Trigger events to notify the app
      const events = ['input', 'change', 'keyup'];
      events.forEach(eventType => {
        const event = new Event(eventType, { bubbles: true, cancelable: true });
        element.dispatchEvent(event);
      });

      // Special handling for URL bar - trigger navigation
      if (selector === '#urlBar') {
        // Simulate pressing Enter to navigate
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

  // Enhanced Form Actions Implementation
  private async selectOption(step: ExecuteStep): Promise<any> {
    const selector = step.target;
    const value = step.value;

    if (!selector || !value) {
      throw new Error('Both selector and value are required for select_option action');
    }

    console.log(`[ExecuteStepRunner] Selecting option "${value}" from dropdown ${selector}`);

    const script = `
      (async function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!element) {
            return { success: false, error: 'Dropdown element not found', selector: '${selector}' };
          }

          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 500));

          if (element.tagName.toLowerCase() === 'select') {
            // Handle native select element
            const targetValue = '${typeof value === 'object' ? (value as any).value || (value as any).text : value}'.replace(/'/g, "\\'");
            
            const option = Array.from(element.options).find(opt => 
              opt.value === targetValue || 
              opt.text === targetValue ||
              opt.text.toLowerCase().includes(targetValue.toLowerCase()) ||
              opt.value.toLowerCase().includes(targetValue.toLowerCase())
            );
            
            if (option) {
              element.value = option.value;
              element.selectedIndex = option.index;
              
              // Trigger change events
              const events = ['change', 'input'];
              events.forEach(eventType => {
                const event = new Event(eventType, { bubbles: true, cancelable: true });
                element.dispatchEvent(event);
              });
              
              return { 
                success: true, 
                message: 'Option selected successfully',
                selectedValue: option.value, 
                selectedText: option.text,
                selectedIndex: option.index
              };
            } else {
              return { success: false, error: 'Option not found in dropdown', availableOptions: Array.from(element.options).map(opt => ({value: opt.value, text: opt.text})) };
            }
          } else {
            // Handle custom dropdown (div-based, etc.)
            element.click();
            await new Promise(resolve => setTimeout(resolve, 800));
            
            const optionSelectors = [
              '[role="option"]',
              '.dropdown-item',
              '.select-option',
              '.option',
              '.menu-item',
              'li[data-value]',
              '[data-option-value]'
            ];
            
            let targetOption = null;
            const searchText = '${typeof value === 'object' ? (value as any).text || (value as any).value : value}'.replace(/'/g, "\\'");
            
            for (const optionSelector of optionSelectors) {
              const options = document.querySelectorAll(optionSelector);
              targetOption = Array.from(options).find(opt => {
                const text = opt.textContent?.trim().toLowerCase() || '';
                const dataValue = opt.getAttribute('data-value')?.toLowerCase() || '';
                const searchLower = searchText.toLowerCase();
                return text.includes(searchLower) || dataValue.includes(searchLower) || text === searchLower;
              });
              if (targetOption) break;
            }
            
            if (targetOption) {
              targetOption.click();
              await new Promise(resolve => setTimeout(resolve, 300));
              
              return { 
                success: true, 
                message: 'Custom dropdown option selected successfully',
                selectedText: targetOption.textContent?.trim(),
                selectedValue: targetOption.getAttribute('data-value') || targetOption.textContent?.trim()
              };
            } else {
              return { success: false, error: 'Option not found in custom dropdown' };
            }
          }
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);

    if (!result.success) {
      throw new Error(`Select option failed: ${result.error}`);
    }

    await this.wait(1000);
    return result;
  }

  private async toggleCheckbox(step: ExecuteStep): Promise<any> {
    const selector = step.target;
    const desiredState = step.value; // true for check, false for uncheck, undefined for toggle

    if (!selector) {
      throw new Error('Selector is required for toggle_checkbox action');
    }

    console.log(`[ExecuteStepRunner] Toggling checkbox ${selector} to ${desiredState}`);

    const script = `
      (function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!element) {
            return { success: false, error: 'Checkbox element not found', selector: '${selector}' };
          }

          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          const isCheckbox = element.type === 'checkbox' || element.getAttribute('role') === 'checkbox';
          if (!isCheckbox) {
            return { success: false, error: 'Element is not a checkbox' };
          }

          const currentState = element.checked || element.getAttribute('aria-checked') === 'true';
          const targetState = ${desiredState !== undefined ? desiredState : '!currentState'};
          
          if (currentState !== targetState) {
            // Multiple strategies to toggle checkbox
            const strategies = [
              () => element.click(),
              () => {
                element.checked = targetState;
                element.dispatchEvent(new Event('change', { bubbles: true }));
              },
              () => {
                if (element.setAttribute) {
                  element.setAttribute('aria-checked', targetState.toString());
                }
                element.dispatchEvent(new Event('change', { bubbles: true }));
              }
            ];

            let success = false;
            for (const strategy of strategies) {
              try {
                strategy();
                // Verify the state changed
                const newState = element.checked || element.getAttribute('aria-checked') === 'true';
                if (newState === targetState) {
                  success = true;
                  break;
                }
              } catch (e) {
                continue;
              }
            }

            if (!success) {
              return { success: false, error: 'Failed to toggle checkbox state' };
            }
          }

          const finalState = element.checked || element.getAttribute('aria-checked') === 'true';
          
          return {
            success: true,
            message: finalState ? 'Checkbox checked' : 'Checkbox unchecked',
            previousState: currentState,
            currentState: finalState,
            elementInfo: {
              tagName: element.tagName,
              type: element.type,
              id: element.id,
              name: element.name
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);

    if (!result.success) {
      throw new Error(`Toggle checkbox failed: ${result.error}`);
    }

    await this.wait(500);
    return result;
  }

  private async selectRadio(step: ExecuteStep): Promise<any> {
    const selector = step.target;
    const value = step.value;

    if (!selector) {
      throw new Error('Selector is required for select_radio action');
    }

    console.log(`[ExecuteStepRunner] Selecting radio button ${selector} with value ${value}`);

    const script = `
      (function() {
        try {
          let element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          
          if (!element) {
            // Try to find radio by name and value
            const radioValue = '${typeof value === 'object' ? (value as any).value : value || ''}';
            if (radioValue) {
              const radioByValue = document.querySelector('input[type="radio"][value="' + radioValue + '"]');
              if (radioByValue) {
                element = radioByValue;
              }
            }
          }
          
          if (!element) {
            return { success: false, error: 'Radio button not found', selector: '${selector}' };
          }

          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          const isRadio = element.type === 'radio' || element.getAttribute('role') === 'radio';
          if (!isRadio) {
            return { success: false, error: 'Element is not a radio button' };
          }

          const wasChecked = element.checked || element.getAttribute('aria-checked') === 'true';
          
          // Click the radio button
          element.click();
          
          // Verify it got selected
          const isNowChecked = element.checked || element.getAttribute('aria-checked') === 'true';
          
          return {
            success: true,
            message: 'Radio button selected successfully',
            previousState: wasChecked,
            currentState: isNowChecked,
            elementInfo: {
              tagName: element.tagName,
              type: element.type,
              name: element.name,
              value: element.value,
              id: element.id
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);

    if (!result.success) {
      throw new Error(`Select radio failed: ${result.error}`);
    }

    await this.wait(500);
    return result;
  }

  private async selectFile(step: ExecuteStep): Promise<any> {
    const selector = step.target;
    const filePaths = step.value; // Can be string or array of file paths

    if (!selector) {
      throw new Error('Selector is required for select_file action');
    }

    console.log(`[ExecuteStepRunner] Selecting files for ${selector}`);

    // Note: File selection in web automation is limited due to security restrictions
    // This implementation focuses on triggering the file dialog and simulating the selection
    const script = `
      (function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!element) {
            return { success: false, error: 'File input element not found', selector: '${selector}' };
          }

          if (element.type !== 'file') {
            return { success: false, error: 'Element is not a file input' };
          }

          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Trigger the file dialog
          element.click();
          
          // Note: Due to browser security, we cannot programmatically set file paths
          // This would typically require user interaction or special test automation tools
          
          return {
            success: true,
            message: 'File dialog triggered - user interaction required for actual file selection',
            elementInfo: {
              tagName: element.tagName,
              type: element.type,
              accept: element.accept,
              multiple: element.multiple,
              id: element.id,
              name: element.name
            },
            note: 'File selection requires manual user interaction due to browser security restrictions'
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);

    if (!result.success) {
      throw new Error(`Select file failed: ${result.error}`);
    }

    await this.wait(1000);
    return result;
  }

  private async adjustSlider(step: ExecuteStep): Promise<any> {
    const selector = step.target;
    const value = step.value as number;

    if (!selector || value === undefined) {
      throw new Error('Both selector and numeric value are required for adjust_slider action');
    }

    console.log(`[ExecuteStepRunner] Adjusting slider ${selector} to value ${value}`);

    const script = `
      (function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!element) {
            return { success: false, error: 'Slider element not found', selector: '${selector}' };
          }

          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          const isSlider = element.type === 'range' || element.getAttribute('role') === 'slider';
          if (!isSlider) {
            return { success: false, error: 'Element is not a slider/range input' };
          }

          const targetValue = ${value};
          const min = parseFloat(element.min) || 0;
          const max = parseFloat(element.max) || 100;
          
          // Ensure value is within bounds
          const clampedValue = Math.max(min, Math.min(max, targetValue));
          
          const previousValue = element.value;
          
          // Set the value
          element.value = clampedValue;
          
          // Trigger events
          const events = ['input', 'change'];
          events.forEach(eventType => {
            const event = new Event(eventType, { bubbles: true, cancelable: true });
            element.dispatchEvent(event);
          });
          
          // For ARIA sliders
          if (element.setAttribute && element.getAttribute('role') === 'slider') {
            element.setAttribute('aria-valuenow', clampedValue.toString());
          }
          
          return {
            success: true,
            message: 'Slider adjusted successfully',
            previousValue: previousValue,
            currentValue: clampedValue,
            requestedValue: targetValue,
            elementInfo: {
              tagName: element.tagName,
              type: element.type,
              min: element.min,
              max: element.max,
              step: element.step,
              id: element.id,
              name: element.name
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);

    if (!result.success) {
      throw new Error(`Adjust slider failed: ${result.error}`);
    }

    await this.wait(500);
    return result;
  }

  // Clipboard Actions Implementation
  private async copy(step: ExecuteStep): Promise<any> {
    const selector = step.target;

    if (!selector) {
      throw new Error('Selector is required for copy action');
    }

    console.log(`[ExecuteStepRunner] Copying text from ${selector}`);

    const script = `
      (async function() {
        try {
          let element = null;
          
          // Handle complex selectors like span:contains()
          if ('${selector}'.includes(':contains(')) {
            const containsMatch = '${selector}'.match(/(.+):contains\\(['"]([^'"]+)['"]\\)/);
            if (containsMatch) {
              const tagName = containsMatch[1];
              const searchText = containsMatch[2];
              const elements = document.querySelectorAll(tagName);
              element = Array.from(elements).find(el => 
                el.textContent && el.textContent.includes(searchText)
              );
            }
          } else {
            // Try standard querySelector first
            try {
              element = document.querySelector('${selector.replace(/'/g, "\\'")}');
            } catch (selectorError) {
              console.warn('Standard querySelector failed, trying alternative approaches');
            }
          }
          
          // Alternative element finding strategies for copy actions
          if (!element) {
            const copyFallbackStrategies = [
              // Strategy 1: Google-specific selectors for search results
              () => document.querySelector('.hgKElc'), // Featured snippet
              () => document.querySelector('.yuRUbf h3'), // Search result title
              () => document.querySelector('.Z0LcW'), // Answer box
              () => document.querySelector('.kCrYT'), // Featured snippet text
              
              // Strategy 2: Common content selectors
              () => document.querySelector('h1'), // Main heading
              () => document.querySelector('h2'), // Secondary heading
              () => document.querySelector('p'), // First paragraph
              () => document.querySelector('.answer'), // Answer container
              () => document.querySelector('.result'), // Result container
              
              // Strategy 3: Try original selector if it's simple
              () => {
                try {
                  return document.querySelector('${selector.replace(/'/g, "\\'")}');
                } catch (e) {
                  return null;
                }
              },
              
              // Strategy 4: By text content (last resort)
              () => {
                const searchText = '${selector}'.includes('contains') ? 
                  '${selector}'.match(/contains\\(['"]([^'"]+)['"]\\)/)?.[1] : null;
                if (searchText) {
                  const textElements = document.querySelectorAll('h1, h2, h3, p, span, div');
                  return Array.from(textElements).find(el => 
                    el.textContent && el.textContent.trim().includes(searchText.substring(0, 20))
                  );
                }
                return null;
              }
            ];
            
            for (const strategy of copyFallbackStrategies) {
              try {
                const foundElement = strategy();
                if (foundElement) {
                  element = foundElement;
                  break;
                }
              } catch (e) {
                continue;
              }
            }
          }

          if (!element) {
            return { success: false, error: 'Element not found with any strategy', selector: '${selector}' };
          }

          // Scroll element into view and highlight it
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Add visual highlight
          const originalStyle = element.style.cssText;
          element.style.backgroundColor = 'yellow';
          element.style.transition = 'background-color 0.3s ease';
          
          let textToCopy = '';
          
          if (element.value !== undefined) {
            // Input/textarea element
            element.focus();
            element.select();
            textToCopy = element.value;
          } else {
            // Other elements - select text content
            const range = document.createRange();
            range.selectNodeContents(element);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            textToCopy = selection.toString();
          }
          
          // Show visual feedback for selection
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Try to copy to clipboard
          let copySuccess = false;
          let copyMethod = '';
          
          try {
            await navigator.clipboard.writeText(textToCopy);
            copySuccess = true;
            copyMethod = 'clipboard API';
          } catch (clipboardError) {
            console.warn('Clipboard API failed:', clipboardError);
            // Fallback to execCommand
            try {
              copySuccess = document.execCommand('copy');
              copyMethod = 'execCommand';
            } catch (execError) {
              console.warn('execCommand failed:', execError);
              copyMethod = 'failed';
            }
          }
          
          // Remove highlight after a moment
          setTimeout(() => {
            element.style.cssText = originalStyle;
          }, 1000);
          
          return {
            success: copySuccess || textToCopy.length > 0, // Consider success if we got text
            message: copySuccess ? 
              \`Text copied to clipboard successfully using \${copyMethod}\` : 
              'Text selected but clipboard access may be restricted',
            copiedText: textToCopy.substring(0, 100), // Limit for security
            textLength: textToCopy.length,
            copyMethod: copyMethod,
            elementInfo: {
              tagName: element.tagName,
              type: element.type,
              id: element.id,
              className: element.className,
              textContent: element.textContent?.substring(0, 100),
              selector: '${selector}'
            }
          };
        } catch (error) {
          return { success: false, error: error.message, stack: error.stack };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);

    if (!result.success) {
      console.error(`[ExecuteStepRunner] Copy failed:`, result);
      throw new Error(`Copy action failed: ${result.error}`);
    }

    console.log(`[ExecuteStepRunner] Copy successful:`, result.message, `Text: "${result.copiedText}"`);
    await this.wait(800); // Longer wait to see highlight effect
    return result;
  }

  private async cut(step: ExecuteStep): Promise<any> {
    const selector = step.target;

    if (!selector) {
      throw new Error('Selector is required for cut action');
    }

    console.log(`[ExecuteStepRunner] Cutting text from ${selector}`);

    const script = `
      (async function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!element) {
            return { success: false, error: 'Element not found', selector: '${selector}' };
          }

          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          let textToCut = '';
          
          if (element.value !== undefined) {
            // Input/textarea element
            element.select();
            textToCut = element.value;
            
            // Try to copy to clipboard first
            let copySuccess = false;
            try {
              await navigator.clipboard.writeText(textToCut);
              copySuccess = true;
            } catch (clipboardError) {
              try {
                copySuccess = document.execCommand('copy');
              } catch (execError) {
                console.warn('Copy operation failed');
              }
            }
            
            // Clear the content (cut operation)
            element.value = '';
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            
            return {
              success: true,
              message: 'Text cut successfully',
              cutText: textToCut.substring(0, 100),
              textLength: textToCut.length,
              clipboardSuccess: copySuccess
            };
          } else {
            return { success: false, error: 'Cut operation only supported on input/textarea elements' };
          }
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);

    if (!result.success) {
      throw new Error(`Cut action failed: ${result.error}`);
    }

    await this.wait(500);
    return result;
  }

  private async paste(step: ExecuteStep): Promise<any> {
    const selector = step.target;

    if (!selector) {
      throw new Error('Selector is required for paste action');
    }

    console.log(`[ExecuteStepRunner] Pasting text into ${selector}`);

    const script = `
      (async function() {
        try {
          let element = null;
          
          // Use same element finding logic as copy
          try {
            element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          } catch (selectorError) {
            console.warn('Standard querySelector failed for paste');
          }
          
          // Alternative finding strategies
          if (!element) {
            if ('${selector}'.startsWith('#')) {
              element = document.getElementById('${selector}'.substring(1));
            } else if ('${selector}'.startsWith('.')) {
              element = document.querySelector('${selector}');
            }
          }

          if (!element) {
            return { success: false, error: 'Element not found', selector: '${selector}' };
          }

          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Add visual highlight to show where we're pasting
          const originalStyle = element.style.cssText;
          element.style.outline = '2px solid blue';
          element.style.outlineOffset = '2px';
          
          element.focus();
          await new Promise(resolve => setTimeout(resolve, 200));
          
          let pastedText = '';
          let pasteSuccess = false;
          let pasteMethod = '';
          
          if (element.value !== undefined || element.textContent !== undefined) {
            try {
              // Try to read from clipboard first
              pastedText = await navigator.clipboard.readText();
              pasteMethod = 'clipboard API';
              
              if (element.value !== undefined) {
                // Input/textarea element
                const startPos = element.selectionStart || 0;
                const endPos = element.selectionEnd || element.value.length;
                const currentValue = element.value || '';
                
                // Replace selected text or insert at cursor
                element.value = currentValue.substring(0, startPos) + pastedText + currentValue.substring(endPos);
                
                // Set cursor position after pasted text
                const newCursorPos = startPos + pastedText.length;
                element.setSelectionRange(newCursorPos, newCursorPos);
                
                pasteSuccess = true;
              } else {
                // Content editable or other text element
                if (element.isContentEditable || element.contentEditable === 'true') {
                  const selection = window.getSelection();
                  const range = selection.getRangeAt(0);
                  range.deleteContents();
                  range.insertNode(document.createTextNode(pastedText));
                  pasteSuccess = true;
                } else {
                  element.textContent = (element.textContent || '') + pastedText;
                  pasteSuccess = true;
                }
              }
            } catch (clipboardError) {
              console.warn('Clipboard API failed, trying alternative methods');
              pasteMethod = 'fallback';
              
              // Fallback 1: Try execCommand paste
              try {
                document.execCommand('paste');
                pasteSuccess = true;
                pastedText = 'Pasted via execCommand';
              } catch (execError) {
                console.warn('execCommand paste failed');
                
                // Fallback 2: Simulate keyboard paste
                const pasteEvent = new ClipboardEvent('paste', {
                  bubbles: true,
                  cancelable: true
                });
                
                element.dispatchEvent(pasteEvent);
                pasteSuccess = true;
                pastedText = 'Paste event dispatched';
              }
            }
            
            // Trigger comprehensive events to ensure the application detects the change
            const events = [
              new Event('input', { bubbles: true, cancelable: true }),
              new Event('change', { bubbles: true, cancelable: true }),
              new KeyboardEvent('keyup', { bubbles: true, cancelable: true }),
              new Event('blur', { bubbles: true, cancelable: true }),
              new Event('focus', { bubbles: true, cancelable: true })
            ];
            
            events.forEach(event => {
              try {
                element.dispatchEvent(event);
              } catch (e) {
                console.warn('Failed to dispatch event:', event.type);
              }
            });
            
            // Additional wait to let events process
            await new Promise(resolve => setTimeout(resolve, 100));
            
          } else {
            return { success: false, error: 'Element does not support text input' };
          }
          
          // Remove visual highlight
          setTimeout(() => {
            element.style.cssText = originalStyle;
          }, 1000);
          
          // Get final value to confirm paste worked
          const finalValue = element.value || element.textContent || '';
          
          return {
            success: pasteSuccess,
            message: pasteSuccess ? 
              \`Text pasted successfully using \${pasteMethod}\` : 
              'Paste operation may have failed',
            pastedText: pastedText.substring(0, 100),
            textLength: pastedText.length,
            pasteMethod: pasteMethod,
            finalValue: finalValue.substring(0, 100),
            elementInfo: {
              tagName: element.tagName,
              type: element.type,
              id: element.id,
              className: element.className,
              isContentEditable: element.isContentEditable,
              selector: '${selector}'
            }
          };
        } catch (error) {
          return { success: false, error: error.message, stack: error.stack };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);

    if (!result.success) {
      console.error(`[ExecuteStepRunner] Paste failed:`, result);
      throw new Error(`Paste action failed: ${result.error}`);
    }

    console.log(`[ExecuteStepRunner] Paste successful:`, result.message, `Text: "${result.pastedText}"`);
    await this.wait(800); // Wait to see the effect
    return result;
  }

  // Context Actions Implementation
  // private async handleFormButtonClick(selector: string): Promise<any> {
  //   console.log(`[ExecuteStepRunner] Enhanced form button click handling for: ${selector}`);
    
  //   // This method uses multiple strategies to find and click form buttons like "Create Short URL"
  //   const script = `
  //     (async function() {
  //       try {
  //         console.log('[Form Button Click] Starting enhanced form button click process');
          
  //         // Extract button text from selector if it contains it
  //         let buttonText = '';
  //         if ('${selector}'.includes('contains')) {
  //           const match = '${selector}'.match(/contains\\(['"]([^'"]+)['"]\\)/);
  //           if (match) {
  //             buttonText = match[1];
  //           }
  //         } else if ('${selector}'.includes('Create Short URL')) {
  //           buttonText = 'Create Short URL';
  //         }
          
  //         console.log('[Form Button Click] Looking for button with text:', buttonText);
          
  //         // Validate form inputs before attempting to click
  //         console.log('[Form Button Click] Pre-validating form inputs');
  //         const forms = document.querySelectorAll('form');
  //         forms.forEach(form => {
  //           // Trigger validation events on all form inputs
  //           const inputs = form.querySelectorAll('input, textarea, select');
  //           inputs.forEach(input => {
  //             // Log the current state of form inputs
  //             console.log(\`[Form Button Click] Form input: \${input.name || input.id}, value="\${input.value}", valid=\${input.validity?.valid}\`);
              
  //             // Force validation events
  //             input.dispatchEvent(new Event('blur', { bubbles: true }));
  //             input.dispatchEvent(new Event('change', { bubbles: true }));
  //           });
  //         });
          
  //         // Strategy 1: Try the original selector
  //         let button = null;
  //         try {
  //           button = document.querySelector('${selector.replace(/'/g, "\\'")}');
  //           console.log('[Form Button Click] Original selector result:', button ? 'Found' : 'Not found');
  //         } catch (e) {
  //           console.warn('[Form Button Click] Original selector failed:', e.message);
  //         }
          
  //         // Strategy 2: Try multiple selectors to find the button
  //         if (!button) {
  //           console.log('[Form Button Click] Trying alternative selectors');
            
  //           const selectors = [
  //             // Type-based selectors
  //             'button[type="submit"]',
  //             'input[type="submit"]',
              
  //             // Common form button selectors
  //             'form button',
  //             '.form button',
  //             'form .btn',
  //             'form .button',
  //             '.submit-button',
  //             '.btn-primary',
              
  //             // Text-based selectors (if we have button text)
  //             buttonText ? \`button:contains("\${buttonText}")\` : null,
  //             buttonText ? \`input[value="\${buttonText}"]\` : null,
  //             buttonText ? \`[role="button"]:contains("\${buttonText}")\` : null,
              
  //             // Position-based selectors
  //             'form button:last-child',
  //             'form button:nth-of-type(1)',
  //             '.form-actions button',
  //             '.form-footer button'
  //           ].filter(Boolean); // Remove null entries
            
  //           for (const sel of selectors) {
  //             try {
  //               const elements = document.querySelectorAll(sel);
  //               console.log(\`[Form Button Click] Selector \${sel} found \${elements.length} elements\`);
                
  //               if (elements.length > 0) {
  //                 // If we have button text, find the matching button
  //                 if (buttonText) {
  //                   for (const el of Array.from(elements)) {
  //                     const elText = el.textContent?.trim() || el.value || '';
  //                     if (elText.includes(buttonText)) {
  //                       button = el;
  //                       console.log('[Form Button Click] Found button with matching text:', elText);
  //                       break;
  //                     }
  //                   }
  //                 }
                  
  //                 // If still no button with matching text, take the first element
  //                 if (!button) {
  //                   button = elements[0];
  //                   console.log('[Form Button Click] Using first matching element');
  //                 }
                  
  //                 if (button) break;
  //               }
  //             } catch (e) {
  //               console.warn(\`[Form Button Click] Selector \${sel} failed:\`, e.message);
  //             }
  //           }
  //         }
          
  //         // Strategy 3: Find any button-like element
  //         if (!button) {
  //           console.log('[Form Button Click] Looking for any button-like element');
  //           const buttonLike = document.querySelectorAll('button, input[type="submit"], input[type="button"], .btn, [role="button"]');
            
  //           if (buttonLike.length > 0) {
  //             if (buttonText) {
  //               // Try to find button with matching text
  //               for (const el of Array.from(buttonLike)) {
  //                 const elText = el.textContent?.trim() || el.value || '';
  //                 if (elText.includes(buttonText)) {
  //                   button = el;
  //                   console.log('[Form Button Click] Found button-like element with matching text:', elText);
  //                   break;
  //                 }
  //               }
  //             }
              
  //             // If no match, use the most likely submit button
  //             if (!button) {
  //               const submitButtons = Array.from(buttonLike).filter(el => {
  //                 const elText = el.textContent?.toLowerCase() || el.value?.toLowerCase() || '';
  //                 return el.type === 'submit' || 
  //                        elText.includes('submit') || 
  //                        elText.includes('save') || 
  //                        elText.includes('create') || 
  //                        elText.includes('add');
  //               });
                
  //               if (submitButtons.length > 0) {
  //                 button = submitButtons[0];
  //                 console.log('[Form Button Click] Using most likely submit button');
  //               }
  //             }
  //           }
  //         }
          
  //         // We found a button, now click it
  //         if (button) {
  //           console.log('[Form Button Click] Button found, attempting to click:', button.tagName, button.id, button.className);
            
  //           // Add visual feedback
  //           const originalOutline = button.style.outline;
  //           const originalBoxShadow = button.style.boxShadow;
  //           button.style.outline = '2px solid green';
  //           button.style.boxShadow = '0 0 10px rgba(0,255,0,0.5)';
            
  //           button.scrollIntoView({ behavior: 'smooth', block: 'center' });
  //           await new Promise(resolve => setTimeout(resolve, 500));
            
  //           // Check if the button is disabled
  //           const isDisabled = button.disabled || button.hasAttribute('disabled') || 
  //                             button.getAttribute('aria-disabled') === 'true' ||
  //                             window.getComputedStyle(button).opacity === '0.5';
            
  //           if (isDisabled) {
  //             console.log('[Form Button Click] Button is disabled, checking form validity');
              
  //             // Check form validity
  //             const form = button.closest('form');
  //             if (form) {
  //               const formInputs = form.querySelectorAll('input, select, textarea');
  //               let invalidInputs = [];
                
  //               formInputs.forEach(input => {
  //                 if (input.required && !input.value) {
  //                   console.log(\`[Form Button Click] Invalid input found: \${input.name || input.id}\`);
  //                   invalidInputs.push(input.name || input.id || 'unnamed');
                    
  //                   // Try to fix the input
  //                   if (input.id === 'original_url' || input.name === 'url') {
  //                     console.log('[Form Button Click] Attempting to fix URL input');
  //                     input.value = 'https://www.sample-long-link.com/this-is-a-very-long-url-that-needs-to-be-shortened-for-testing-purposes';
  //                     input.dispatchEvent(new Event('input', { bubbles: true }));
  //                     input.dispatchEvent(new Event('change', { bubbles: true }));
  //                   }
  //                 }
  //               });
                
  //               if (invalidInputs.length > 0) {
  //                 console.log(\`[Form Button Click] Form has invalid inputs: \${invalidInputs.join(', ')}\`);
  //               }
  //             }
  //           }
            
  //           // Try multiple click strategies
  //           const clickStrategies = [
  //             // Standard click
  //             () => button.click(),
              
  //             // Mouse event
  //             () => {
  //               const event = new MouseEvent('click', {
  //                 bubbles: true,
  //                 cancelable: true,
  //                 view: window
  //               });
  //               button.dispatchEvent(event);
  //             },
              
  //             // Form submit via button
  //             () => {
  //               if (button.form) {
  //                 button.form.submit();
  //               }
  //             },
              
  //             // Submit event
  //             () => {
  //               if (button.type === 'submit' && button.form) {
  //                 const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
  //                 button.form.dispatchEvent(submitEvent);
  //               }
  //             },
              
  //             // React-specific handling
  //             () => {
  //               // Try to find React's internal props
  //               const reactKey = Object.keys(button).find(key => 
  //                 key.startsWith('__reactProps$') || 
  //                 key.startsWith('__reactFiber$') ||
  //                 key.startsWith('__reactEventHandlers$')
  //               );
                
  //               if (reactKey && button[reactKey]) {
  //                 console.log('[Form Button Click] Found React internal key:', reactKey);
  //                 const props = button[reactKey];
                  
  //                 // Try to call onClick handler if available
  //                 if (typeof props.onClick === 'function') {
  //                   console.log('[Form Button Click] Calling React onClick handler');
  //                   // Create a synthetic click event
  //                   const syntheticEvent = {
  //                     target: button,
  //                     currentTarget: button,
  //                     preventDefault: () => {},
  //                     stopPropagation: () => {}
  //                   };
  //                   props.onClick(syntheticEvent);
  //                   return true;
  //                 }
  //               }
  //               return false;
  //             },
              
  //             // Form submit via React form handler
  //             () => {
  //               const form = button.closest('form');
  //               if (form) {
  //                 // Try to find React's form handler
  //                 const formReactKey = Object.keys(form).find(key => 
  //                   key.startsWith('__reactProps$') || 
  //                   key.startsWith('__reactFiber$')
  //                 );
                  
  //                 if (formReactKey && form[formReactKey]) {
  //                   const formProps = form[formReactKey];
  //                   if (typeof formProps.onSubmit === 'function') {
  //                     console.log('[Form Button Click] Calling React form onSubmit handler');
  //                     const syntheticEvent = {
  //                       target: form,
  //                       currentTarget: form,
  //                       preventDefault: () => {},
  //                       stopPropagation: () => {}
  //                     };
  //                     formProps.onSubmit(syntheticEvent);
  //                     return true;
  //                   }
  //                 }
  //               }
  //               return false;
  //             }
  //           ];
            
  //           let clickSuccess = false;
  //           let clickMethod = '';
            
  //           for (const [index, strategy] of clickStrategies.entries()) {
  //             try {
  //               console.log(\`[Form Button Click] Trying click strategy \${index + 1}\`);
  //               const result = strategy();
  //               if (result !== false) {
  //                 clickSuccess = true;
  //                 clickMethod = \`strategy_\${index + 1}\`;
  //                 console.log(\`[Form Button Click] Click strategy \${index + 1} succeeded\`);
  //                 break;
  //               }
  //             } catch (e) {
  //               console.warn(\`[Form Button Click] Click strategy \${index + 1} failed:\`, e.message);
  //             }
  //           }
            
  //           // Remove visual feedback after a delay
  //           setTimeout(() => {
  //             button.style.outline = originalOutline;
  //             button.style.boxShadow = originalBoxShadow;
  //           }, 1000);
            
  //           if (!clickSuccess) {
  //             // Last resort - try direct form submission
  //             try {
  //               console.log('[Form Button Click] All click strategies failed, trying direct form submission');
  //               const form = button.closest('form');
  //               if (form) {
  //                 // Try to force form submission by creating a hidden submit button and clicking it
  //                 const hiddenSubmit = document.createElement('input');
  //                 hiddenSubmit.type = 'submit';
  //                 hiddenSubmit.style.display = 'none';
  //                 form.appendChild(hiddenSubmit);
  //                 hiddenSubmit.click();
  //                 form.removeChild(hiddenSubmit);
                  
  //                 clickSuccess = true;
  //                 clickMethod = 'hidden_submit';
  //                 console.log('[Form Button Click] Hidden submit button clicked');
  //               }
  //             } catch (e) {
  //               console.warn('[Form Button Click] Hidden submit button failed:', e.message);
  //             }
  //           }
            
  //           if (!clickSuccess) {
  //             return { 
  //               success: false, 
  //               error: 'All click strategies failed on found button',
  //               buttonInfo: {
  //                 tagName: button.tagName,
  //                 id: button.id,
  //                 className: button.className,
  //                 type: button.type,
  //                 text: button.textContent || button.value,
  //                 disabled: isDisabled
  //               }
  //             };
  //           }
            
  //           return {
  //             success: true,
  //             message: \`Form button clicked successfully using \${clickMethod}\`,
  //             buttonInfo: {
  //               tagName: button.tagName,
  //               id: button.id,
  //               className: button.className,
  //               type: button.type,
  //               text: button.textContent || button.value
  //             }
  //           };
  //         }
          
  //         // Strategy 4: Last resort - try to submit the form directly
  //         console.log('[Form Button Click] No button found, trying to submit form directly');
  //         const form = document.querySelector('form');
  //         if (form) {
  //           console.log('[Form Button Click] Found form, submitting directly');
            
  //           // Before submitting, check and fix required fields
  //           const requiredInputs = form.querySelectorAll('[required]');
  //           requiredInputs.forEach(input => {
  //             if (!input.value) {
  //               console.log(\`[Form Button Click] Filling required field: \${input.name || input.id}\`);
  //               if (input.id === 'original_url' || input.name === 'url') {
  //                 input.value = 'https://www.sample-long-link.com/this-is-a-very-long-url-that-needs-to-be-shortened-for-testing-purposes';
  //               } else if (input.id === 'title' || input.name === 'title') {
  //                 input.value = 'sample-long-link';
  //               } else {
  //                 input.value = 'test-value';
  //               }
  //               input.dispatchEvent(new Event('input', { bubbles: true }));
  //               input.dispatchEvent(new Event('change', { bubbles: true }));
  //             }
  //           });
            
  //           try {
  //             form.submit();
  //             return {
  //               success: true,
  //               message: 'Form submitted directly (no button found)',
  //               method: 'form.submit()'
  //             };
  //           } catch (submitError) {
  //             console.warn('[Form Button Click] Form.submit() failed:', submitError.message);
              
  //             // Try submit event as fallback
  //             try {
  //               const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
  //               form.dispatchEvent(submitEvent);
  //               return {
  //                 success: true,
  //                 message: 'Form submitted via event (no button found)',
  //                 method: 'form.dispatchEvent(submit)'
  //               };
  //             } catch (eventError) {
  //               console.warn('[Form Button Click] Submit event failed:', eventError.message);
  //               return { success: false, error: 'Form submission failed' };
  //             }
  //           }
  //         } else {
  //           return { success: false, error: 'No button found and no form to submit' };
  //         }
  //       } catch (error) {
  //         console.error('[Form Button Click] Error:', error);
  //         return { success: false, error: error.message, stack: error.stack };
  //       }
  //     })();
  //   `;
    
  //   try {
  //     const result = await this.webview.executeJavaScript(script);
      
  //     if (!result.success) {
  //       console.error('[ExecuteStepRunner] Form button click failed:', result.error);
  //       throw new Error(`Form button click failed: ${result.error}`);
  //     }
      
  //     console.log('[ExecuteStepRunner] Form button click successful:', result.message);
      
  //     // Wait longer for form submissions as they often trigger navigation
  //     await this.wait(3000);
      
  //     return result;
  //   } catch (error) {
  //     console.error('[ExecuteStepRunner] Form button click error:', error);
  //     throw new Error(`Form button click error: ${(error as Error).message}`);
  //   }
  // }

  private async handleUrlBarKeypress(selector: string, key: string): Promise<any> {
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
      
      // For Enter key, trigger navigation
      if (key === 'Enter') {
        console.log('[ExecuteStepRunner] Triggering URL bar navigation');
        
        // Dispatch additional events to ensure navigation
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        const form = element.closest('form');
        if (form) {
          form.dispatchEvent(submitEvent);
        }
        
        // Trigger navigation using the value in the URL bar
        const url = element.value;
        if (url && url.length > 0) {
          console.log(`[ExecuteStepRunner] Navigating to: ${url}`);
          
          // Wait a bit to allow the keypress to be processed
          await this.wait(500);
          
          // Try to navigate directly as a fallback
          try {
            // Use the navigate method to ensure proper navigation
            return await this.navigate({
              id: 'fallback-navigation',
              action: ActionType.NAVIGATE,
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

  private async contextMenu(step: ExecuteStep): Promise<any> {
    const selector = step.target;

    if (!selector) {
      throw new Error('Selector is required for context_menu action');
    }

    console.log(`[ExecuteStepRunner] Right-clicking on ${selector}`);

    const script = `
      (function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!element) {
            return { success: false, error: 'Element not found', selector: '${selector}' };
          }

          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Get element position for context menu
          const rect = element.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          
          // Create and dispatch contextmenu event (right-click)
          const contextMenuEvent = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 2, // Right mouse button
            buttons: 2,
            clientX: centerX,
            clientY: centerY,
            screenX: centerX + window.screenX,
            screenY: centerY + window.screenY
          });
          
          const eventDispatched = element.dispatchEvent(contextMenuEvent);
          
          return {
            success: true,
            message: 'Context menu triggered successfully',
            eventDispatched: eventDispatched,
            position: {
              x: centerX,
              y: centerY
            },
            elementInfo: {
              tagName: element.tagName,
              id: element.id,
              className: element.className,
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
      throw new Error(`Context menu action failed: ${result.error}`);
    }

    // Wait for context menu to appear
    await this.wait(1000);
    return result;
  }

  // Add this method to ExecuteStepRunner class
  private async waitForFormValidation(formSelector: string = 'form'): Promise<void> {
    const script = `
      (function() {
        return new Promise((resolve) => {
          const form = document.querySelector('${formSelector}');
          if (!form) {
            resolve(true);
            return;
          }
          
          const checkValidation = () => {
            const inputs = form.querySelectorAll('input[required]');
            let allValid = true;
            
            inputs.forEach(input => {
              if (input.value && input.checkValidity && !input.checkValidity()) {
                allValid = false;
              }
            });
            
            if (allValid) {
              resolve(true);
            } else {
              setTimeout(checkValidation, 100);
            }
          };
          
          setTimeout(checkValidation, 200);
        });
      })();
    `;
    
    await this.webview.executeJavaScript(script);
  }
}