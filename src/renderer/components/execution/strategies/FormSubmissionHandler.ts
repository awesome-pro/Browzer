import { ActionResult } from './ActionStrategies';

export class FormSubmissionHandler {
  async handleFormButtonClick(selector: string, webview: any): Promise<ActionResult> {
    console.log(`[FormSubmissionHandler] Enhanced React form button click handling for: ${selector}`);
    
    const script = `
      (async function() {
        try {
          console.log('[Form Button Click] Starting enhanced React form submission process');
          
          // STEP 1: Pre-flight form validation
          const validationResult = await validateAllForms();
          
          // STEP 2: Find the submit button
          const button = await findSubmitButton('${selector.replace(/'/g, "\\'")}');
          if (!button.element) {
            return { success: false, error: button.error || 'Submit button not found' };
          }

          // STEP 3: Enhanced button state analysis
          const buttonAnalysis = analyzeButton(button.element);
          if (!buttonAnalysis.canClick) {
            return { success: false, error: buttonAnalysis.reason };
          }

          // STEP 4: Prepare form for submission
          await prepareFormSubmission(button.element, validationResult.targetForm);

          // STEP 5: Execute submission strategies
          const submissionResult = await executeSubmissionStrategies(button.element, validationResult.targetForm);

          // Remove visual feedback
          setTimeout(() => {
            button.element.style.cssText = button.element.getAttribute('data-original-style') || '';
          }, 1000);

          return {
            success: submissionResult.success,
            message: submissionResult.message || 'Form submission completed',
            submissionMethod: submissionResult.method,
            formValid: validationResult.allInputsValid,
            buttonInfo: buttonAnalysis.info
          };

        } catch (error) {
          console.error('[Form Button Click] Enhanced submission error:', error);
          return { success: false, error: error.message, stack: error.stack };
        }
      })();

      // Helper function implementations
      async function validateAllForms() {
        const forms = document.querySelectorAll('form');
        let targetForm = null;
        let allInputsValid = true;
        const invalidInputs = [];
        
        forms.forEach(form => {
          const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');
          inputs.forEach(input => {
            if (input.required && (!input.value || input.value.trim() === '')) {
              allInputsValid = false;
              invalidInputs.push({ name: input.name || input.id || 'unnamed', element: input });
            } else if (input.checkValidity && !input.checkValidity()) {
              allInputsValid = false;
              invalidInputs.push({ name: input.name || input.id || 'unnamed', element: input, validity: input.validity });
            }
          });
          
          if (!targetForm) targetForm = form;
        });
        
        return { allInputsValid, invalidInputs, targetForm };
      }

      async function findSubmitButton(selector) {
        const buttonSelectors = [
          selector,
          'button[type="submit"]',
          'input[type="submit"]',
          'button:contains("Create Short URL")',
          'button:contains("Submit")',
          'button:contains("Create")',
          'form button:last-child'
        ];
        
        for (const sel of buttonSelectors) {
          try {
            let element;
            if (sel.includes(':contains')) {
              const tagName = sel.split(':')[0] || 'button';
              const containsText = sel.match(/:contains\\(['"]([^'"]+)['"]\\)/)?.[1];
              if (containsText) {
                const elements = document.querySelectorAll(tagName);
                element = Array.from(elements).find(el => 
                  el.textContent && el.textContent.trim().includes(containsText)
                );
              }
            } else {
              element = document.querySelector(sel);
            }
            
            if (element) {
              return { element, selector: sel };
            }
          } catch (e) {
            console.warn('Selector failed:', sel, e);
          }
        }
        
        return { element: null, error: 'Submit button not found with any selector' };
      }

      function analyzeButton(button) {
        const rect = button.getBoundingClientRect();
        const style = window.getComputedStyle(button);
        const isVisible = rect.width > 0 && rect.height > 0 && 
                         style.display !== 'none' && style.visibility !== 'hidden';
        const isEnabled = !button.disabled && !button.hasAttribute('disabled') &&
                         button.getAttribute('aria-disabled') !== 'true';

        return {
          canClick: isVisible && isEnabled,
          reason: !isVisible ? 'Button is not visible' : !isEnabled ? 'Button is disabled' : null,
          info: {
            visible: isVisible,
            enabled: isEnabled,
            text: button.textContent?.trim(),
            type: button.type,
            tagName: button.tagName
          }
        };
      }

      async function prepareFormSubmission(button, targetForm) {
        // Store original style for cleanup
        button.setAttribute('data-original-style', button.style.cssText);
        
        // Scroll into view and add visual feedback
        button.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(resolve => setTimeout(resolve, 500));

        button.style.outline = '3px solid green';
        button.style.boxShadow = '0 0 15px rgba(0,255,0,0.7)';

        // Force form re-validation
        if (targetForm) {
          const formInputs = targetForm.querySelectorAll('input, select, textarea');
          formInputs.forEach(input => {
            if (input.value && input.value.trim()) {
              ['input', 'change', 'blur'].forEach(eventType => {
                input.dispatchEvent(new Event(eventType, { bubbles: true }));
              });
            }
          });
          await new Promise(resolve => setTimeout(resolve, 400));
        }
      }

      async function executeSubmissionStrategies(button, targetForm) {
        const strategies = [
          // Strategy 1: React button click
          async () => {
            const reactKey = Object.keys(button).find(key => 
              key.startsWith('__reactInternalInstance') ||
              key.startsWith('__reactFiber') ||
              key.startsWith('_reactInternalFiber')
            );
            
            if (reactKey) {
              const reactData = button[reactKey];
              let currentFiber = reactData;
              let attempts = 0;
              
              while (currentFiber && attempts < 10) {
                if (currentFiber.memoizedProps && typeof currentFiber.memoizedProps.onClick === 'function') {
                  const syntheticEvent = {
                    target: button,
                    currentTarget: button,
                    type: 'click',
                    bubbles: true,
                    preventDefault: () => {},
                    stopPropagation: () => {},
                    persist: () => {}
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

          // Strategy 2: React form submission
          async () => {
            if (!targetForm) return { success: false, method: 'no-form-found' };
            
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
                  const syntheticEvent = {
                    target: targetForm,
                    type: 'submit',
                    bubbles: true,
                    preventDefault: () => {},
                    stopPropagation: () => {},
                    persist: () => {}
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
          },

          // Strategy 3: Direct form submission
          async () => {
            if (targetForm) {
              try {
                targetForm.submit();
                return { success: true, method: 'form-submit' };
              } catch (e) {
                return { success: false, method: 'form-submit-failed' };
              }
            }
            return { success: false, method: 'no-form-for-direct-submit' };
          },

          // Strategy 4: Mouse events
          async () => {
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

        for (let i = 0; i < strategies.length; i++) {
          try {
            const result = await strategies[i]();
            if (result.success) {
              return result;
            }
          } catch (e) {
            console.warn(\`Strategy \${i + 1} failed:\`, e);
          }
        }

        return { success: false, message: 'All form submission strategies failed' };
      }
    `;

    const result = await webview.executeJavaScript(script);

    return result;
  }


}