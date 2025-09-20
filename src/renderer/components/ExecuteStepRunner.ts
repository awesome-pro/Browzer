import { ExecuteStep } from '../types';

/**
 * ExecuteStepRunner - Handles the execution of individual steps in an execution plan
 * Uses the webview to perform actions based on the step definition
 */
export class ExecuteStepRunner {
  private webview: any;
  
  constructor(webview: any) {
    this.webview = webview;
  }
  
  public async executeStep(step: ExecuteStep): Promise<any> {
    console.log('[ExecuteStepRunner] Executing step:', step);
    if (!this.webview) {
      throw new Error('No webview available for step execution');
    }
    
    const action = step.action || this.inferActionFromDescription(step.description);
    
    switch (action) {
      case 'navigate':
        return await this.navigate(step);
      case 'click':
        return await this.click(step);
      case 'type':
      case 'input':
        return await this.type(step);
      case 'wait':
        return await this.wait(step);
      case 'select':
      case 'select_dropdown':
        return await this.select(step);
      case 'check':
        return await this.check(step, true);
      case 'uncheck':
        return await this.check(step, false);
      case 'extract':
        return await this.extract(step);
      case 'wait_for_element':
        return await this.waitForElement(step.target || '', parseInt(step.value || '5000'));
      case 'wait_for_dynamic_content':
        return await this.waitForDynamicContent(step);
      case 'focus':
        return await this.focus(step);
      case 'hover':
        return await this.hover(step);
      case 'keypress':
        return await this.keypress(step);
      case 'clear':
        return await this.clear(step);
      default:
        return await this.executeInferredAction(step);
    }
  }
  
  private async navigate(step: ExecuteStep): Promise<any> {
    console.log('[ExecuteStepRunner] Navigating to:', step);
    let url: string | undefined = step.target;
    
    if (!url && step.value) {
      if (step.value.match(/^https?:\/\//)) {
        url = step.value;
      }
    }
    
    if (!url) {
      const extractedUrl = this.extractUrlFromDescription(step.description);
      if (extractedUrl) {
        url = extractedUrl;
      }
    }
    
    if (!url && step.description && step.description.toLowerCase().includes('google')) {
      url = 'https://www.google.com';
      console.log('[ExecuteStepRunner] No URL provided, defaulting to Google');
    }
    
    if (!url) {
      throw new Error('No URL provided for navigation');
    }
    
    console.log(`[ExecuteStepRunner] Navigating to: ${url}`);
    
    return new Promise((resolve, reject) => {
      const loadTimeout = setTimeout(() => {
        reject(new Error('Navigation timed out'));
      }, 30000);
      
      const onLoad = () => {
        clearTimeout(loadTimeout);
        this.webview.removeEventListener('did-finish-load', onLoad);
        this.webview.removeEventListener('did-fail-load', onError);
        resolve({ success: true, url });
      };
      
      const onError = (event: any) => {
        clearTimeout(loadTimeout);
        this.webview.removeEventListener('did-finish-load', onLoad);
        this.webview.removeEventListener('did-fail-load', onError);
        reject(new Error(`Navigation failed: ${event.errorDescription || 'Unknown error'}`));
      };
      
      this.webview.addEventListener('did-finish-load', onLoad);
      this.webview.addEventListener('did-fail-load', onError);
      
      try {
        this.webview.src = url;
      } catch (error) {
        clearTimeout(loadTimeout);
        reject(new Error(`Failed to load URL: ${(error as Error).message}`));
      }
    });
  }
  
  private async click(step: ExecuteStep): Promise<any> {
    const selector = step.target || this.extractSelectorFromDescription(step.description);
    if (!selector) {
      throw new Error('No selector provided for click action');
    }
    
    console.log(`[ExecuteStepRunner] Attempting to click on selector: ${selector}`);
    

    // Try each selector in order
    for (const currentSelector of [selector]) {
      try {
        console.log(`[ExecuteStepRunner] Trying selector: ${currentSelector}`);
        
        const script = `
          (function() {
            try {
              const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
              if (!element) {
                return { success: false, error: 'Element not found', selector: '${selector}' };
              }
              
              // Scroll into view first
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              
              // Wait a bit for the scroll to complete
              return new Promise(resolve => {
                setTimeout(() => {
                  try {
                    // Focus if it's an interactive element
                    if (element.focus) {
                      element.focus();
                    }
                    
                    // Click the element
                    element.click();
                    
                    resolve({ 
                      success: true, 
                      message: 'Click executed successfully',
                      selector: '${currentSelector}',
                      elementInfo: {
                        tagName: element.tagName,
                        id: element.id,
                        className: element.className,
                        text: element.textContent?.substring(0, 100)
                      }
                    });
                  } catch (clickError) {
                    resolve({ success: false, error: clickError.message, selector: '${currentSelector}' });
                  }
                }, 500);
              });
            } catch (error) {
              return { success: false, error: error.message, selector: '${currentSelector}' };
            }
          })();
        `;
        
        const result = await this.webview.executeJavaScript(script);
        
        if (result.success) {
          console.log(`[ExecuteStepRunner] Click successful with selector: ${currentSelector}`);
          
          // Wait a bit for any page changes triggered by the click
          await this.waitForTimeout(1000);
          
          return result;
        } else {
          console.log(`[ExecuteStepRunner] Click failed with selector: ${currentSelector} - ${result.error}`);
        }
      } catch (error) {
        console.log(`[ExecuteStepRunner] Error trying selector ${currentSelector}: ${error}`);
      }
    }
    
    // If we get here, all selectors failed
    throw new Error(`Click failed: Could not find any matching element for ${selector} or alternatives`);
  }
  
  /**
   * Type text into an input field
   */
  private async type(step: ExecuteStep): Promise<any> {
    const selector = step.target || this.extractSelectorFromDescription(step.description);
    const value = step.value || this.extractValueFromDescription(step.description);
    
    if (!selector) {
      throw new Error('No selector provided for type action');
    }
    
    if (!value) {
      throw new Error('No value provided for type action');
    }
    
    const script = `
      (function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!element) {
            return { success: false, error: 'Element not found' };
          }
          
          // Focus the element
          element.focus();
          
          // Clear the input
          element.value = '';
          
          // Set the new value
          element.value = '${value.replace(/'/g, "\\'")}';
          
          // Trigger input and change events
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          
          return { 
            success: true, 
            message: 'Text input successful',
            elementInfo: {
              tagName: element.tagName,
              id: element.id,
              className: element.className,
              value: element.value
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;
    
    const result = await this.webview.executeJavaScript(script);
    
    if (!result.success) {
      throw new Error(`Type failed: ${result.error}`);
    }
    
    return result;
  }
  
  /**
   * Wait for a specified time or for an element to appear
   */
  private async wait(step: ExecuteStep): Promise<any> {
    // If there's a selector, wait for that element
    if (step.target) {
      return await this.waitForElement(step.target);
    }
    
    // Otherwise, wait for a specified time
    const timeMs = this.extractTimeFromDescription(step.description) || 1000;
    await this.waitForTimeout(timeMs);
    
    return { success: true, message: `Waited for ${timeMs}ms` };
  }
  
  /**
   * Select an option from a dropdown
   */
  private async select(step: ExecuteStep): Promise<any> {
    const selector = step.target || this.extractSelectorFromDescription(step.description);
    const value = step.value || this.extractValueFromDescription(step.description);
    
    if (!selector) {
      throw new Error('No selector provided for select action');
    }
    
    if (!value) {
      throw new Error('No value provided for select action');
    }
    
    const script = `
      (function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!element) {
            return { success: false, error: 'Element not found' };
          }
          
          if (element.tagName === 'SELECT') {
            // For standard select elements
            let found = false;
            
            // Try to find by value first
            for (let i = 0; i < element.options.length; i++) {
              if (element.options[i].value === '${value.replace(/'/g, "\\'")}') {
                element.selectedIndex = i;
                found = true;
                break;
              }
            }
            
            // If not found by value, try by text
            if (!found) {
              for (let i = 0; i < element.options.length; i++) {
                if (element.options[i].text === '${value.replace(/'/g, "\\'")}' || 
                    element.options[i].text.includes('${value.replace(/'/g, "\\'")}')) {
                  element.selectedIndex = i;
                  found = true;
                  break;
                }
              }
            }
            
            if (!found) {
              return { success: false, error: 'Option not found in select element' };
            }
            
            // Trigger change event
            element.dispatchEvent(new Event('change', { bubbles: true }));
            
            return { 
              success: true, 
              message: 'Select option successful',
              elementInfo: {
                tagName: element.tagName,
                id: element.id,
                className: element.className,
                value: element.value,
                selectedText: element.options[element.selectedIndex].text
              }
            };
          } else {
            // For custom select elements (divs, spans, etc.)
            element.click();
            
            // Wait for dropdown to appear
            return new Promise(resolve => {
              setTimeout(() => {
                try {
                  // Look for option elements
                  const options = document.querySelectorAll('li, div[role="option"], .dropdown-item, .select-option');
                  let found = false;
                  
                  for (const option of options) {
                    if (option.textContent.includes('${value.replace(/'/g, "\\'")}')) {
                      option.click();
                      found = true;
                      break;
                    }
                  }
                  
                  if (!found) {
                    resolve({ success: false, error: 'Option not found in custom select element' });
                  } else {
                    resolve({ 
                      success: true, 
                      message: 'Custom select option successful',
                      elementInfo: {
                        tagName: element.tagName,
                        id: element.id,
                        className: element.className
                      }
                    });
                  }
                } catch (selectError) {
                  resolve({ success: false, error: selectError.message });
                }
              }, 500);
            });
          }
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;
    
    const result = await this.webview.executeJavaScript(script);
    
    if (!result.success) {
      throw new Error(`Select failed: ${result.error}`);
    }
    
    // Wait a bit for any page changes triggered by the selection
    await this.waitForTimeout(1000);
    
    return result;
  }
  
  /**
   * Check or uncheck a checkbox
   */
  private async check(step: ExecuteStep, checked: boolean): Promise<any> {
    const selector = step.target || this.extractSelectorFromDescription(step.description);
    
    if (!selector) {
      throw new Error('No selector provided for check/uncheck action');
    }
    
    const script = `
      (function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!element) {
            return { success: false, error: 'Element not found' };
          }
          
          if (element.type === 'checkbox' || element.type === 'radio') {
            if (element.checked !== ${checked}) {
              element.click();
            }
            
            return { 
              success: true, 
              message: '${checked ? 'Check' : 'Uncheck'} successful',
              elementInfo: {
                tagName: element.tagName,
                id: element.id,
                className: element.className,
                checked: element.checked
              }
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
      throw new Error(`${checked ? 'Check' : 'Uncheck'} failed: ${result.error}`);
    }
    
    return result;
  }
  
  /**
   * Extract data from the page
   */
  private async extract(step: ExecuteStep): Promise<any> {
    const script = `
      (function() {
        try {
          const title = document.title;
          const url = window.location.href;
          
          // Get main content
          const mainContent = document.querySelector('main') || 
                            document.querySelector('article') || 
                            document.querySelector('[role="main"]') || 
                            document.body;
          
          const textContent = mainContent.innerText;
          
          // Get form fields
          const formFields = Array.from(document.querySelectorAll('input, select, textarea'))
            .map(field => ({
              type: field.tagName.toLowerCase(),
              name: field.name || field.id || '',
              value: field.value || '',
              placeholder: field.placeholder || ''
            }));
          
          // Get links
          const links = Array.from(document.querySelectorAll('a[href]'))
            .map(link => ({
              text: link.textContent.trim(),
              href: link.href
            }))
            .filter(link => link.text && link.href);
          
          return {
            success: true,
            data: {
              title,
              url,
              textContent: textContent.substring(0, 5000),
              formFields: formFields.slice(0, 20),
              links: links.slice(0, 20)
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;
    
    const result = await this.webview.executeJavaScript(script);
    console.log('[ExecuteStepRunner] Extract result:', result);
    
    if (!result.success) {
      throw new Error(`Extract failed: ${result.error}`);
    }
    
    return result;
  }
  
  /**
   * Wait for an element to appear on the page
   */
  private async waitForElement(selector: string, timeoutMs: number = 10000): Promise<any> {
    console.log(`[ExecuteStepRunner] Waiting for element: ${selector} with timeout ${timeoutMs}ms`);
    
    // Try alternative selectors for common elements
    const selectors = [
      selector,
      // Google search result alternatives
      'div.g a',
      'div[data-hveid] a',
      'div[data-hveid] a:not([data-jsarwt])',
      'div.yuRUbf a',
      'h3.LC20lb',
      // Generic search box alternatives
      'input[name="q"]',
      'textarea[name="q"]',
      'input[type="search"]',
      'input[aria-label="Search"]',
      '[role="search"] input'
    ];
    
    const script = `
      (function() {
        return new Promise((resolve, reject) => {
          const startTime = Date.now();
          const selectors = ${JSON.stringify(selectors)};
          
          const checkElement = () => {
            // Try each selector
            for (const currentSelector of selectors) {
              try {
                const element = document.querySelector(currentSelector);
                
                if (element) {
                  const rect = element.getBoundingClientRect();
                  const isVisible = rect.width > 0 && rect.height > 0 && 
                                   window.getComputedStyle(element).display !== 'none' &&
                                   window.getComputedStyle(element).visibility !== 'hidden';
                  
                  if (isVisible) {
                    console.log('Found element with selector:', currentSelector);
                    resolve({
                      success: true,
                      message: 'Element found',
                      selector: currentSelector,
                      elementInfo: {
                        tagName: element.tagName,
                        id: element.id,
                        className: element.className,
                        text: element.textContent?.substring(0, 100) || '',
                        isVisible: isVisible
                      }
                    });
                    return;
                  }
                }
              } catch (err) {
                console.log('Error checking selector:', currentSelector, err);
              }
            }
            
            if (Date.now() - startTime > ${timeoutMs}) {
              console.log('Timeout waiting for elements with selectors:', selectors);
              resolve({ 
                success: false, 
                error: 'Timeout waiting for element',
                triedSelectors: selectors
              });
              return;
            }
            
            setTimeout(checkElement, 500);
          };
          
          checkElement();
        });
      })();
    `;
    
    const result = await this.webview.executeJavaScript(script);
    
    if (!result.success) {
      console.error(`[ExecuteStepRunner] Wait for element failed: ${result.error}`, result.triedSelectors);
      throw new Error(`Wait for element failed: ${result.error}`);
    }
    
    console.log(`[ExecuteStepRunner] Element found with selector: ${result.selector}`);
    return result;
  }
  
  /**
   * Wait for a specified time
   */
  private async waitForTimeout(timeMs: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, timeMs));
  }
  
  /**
   * Execute an action based on the step description
   */
  /**
   * Wait for dynamic content to load
   */
  private async waitForDynamicContent(step: ExecuteStep): Promise<any> {
    const timeoutMs = parseInt(step.value || '10000');
    
    const script = `
      (function() {
        return new Promise((resolve) => {
          const startTime = Date.now();
          let previousContentLength = 0;
          let stabilityCounter = 0;
          
          const checkContent = () => {
            // Check for various indicators of dynamic content loading
            const loadingElements = document.querySelectorAll('[aria-busy="true"], [class*="loading"], [class*="spinner"], [role="progressbar"]');
            const currentContentLength = document.body.innerHTML.length;
            const contentChanged = Math.abs(currentContentLength - previousContentLength) > 50; // Content changed significantly
            
            // If content has stabilized (hasn't changed much in 3 checks)
            if (!contentChanged) {
              stabilityCounter++;
            } else {
              stabilityCounter = 0;
              previousContentLength = currentContentLength;
            }
            
            // If content has stabilized or we've reached the timeout
            if (stabilityCounter >= 3 || Date.now() - startTime > ${timeoutMs}) {
              resolve({
                success: true,
                message: 'Dynamic content loaded or timeout reached',
                stats: {
                  timeElapsed: Date.now() - startTime,
                  contentLength: currentContentLength,
                  loadingElementsRemaining: loadingElements.length
                }
              });
              return;
            }
            
            setTimeout(checkContent, 500);
          };
          
          checkContent();
        });
      })();
    `;
    
    const result = await this.webview.executeJavaScript(script);
    return result;
  }
  
  /**
   * Focus on an element
   */
  private async focus(step: ExecuteStep): Promise<any> {
    const selector = step.target || this.extractSelectorFromDescription(step.description);
    
    if (!selector) {
      throw new Error('No selector provided for focus action');
    }
    
    const script = `
      (function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}')
          if (!element) {
            return { success: false, error: 'Element not found' };
          }
          
          // Scroll into view first
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Wait a bit for the scroll to complete
          return new Promise(resolve => {
            setTimeout(() => {
              try {
                element.focus();
                
                resolve({ 
                  success: true, 
                  message: 'Focus successful',
                  elementInfo: {
                    tagName: element.tagName,
                    id: element.id,
                    className: element.className
                  }
                });
              } catch (focusError) {
                resolve({ success: false, error: focusError.message });
              }
            }, 500);
          });
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;
    
    const result = await this.webview.executeJavaScript(script);
    
    if (!result.success) {
      throw new Error(`Focus failed: ${result.error}`);
    }
    
    return result;
  }
  
  /**
   * Hover over an element
   */
  private async hover(step: ExecuteStep): Promise<any> {
    const selector = step.target || this.extractSelectorFromDescription(step.description);
    
    if (!selector) {
      throw new Error('No selector provided for hover action');
    }
    
    const script = `
      (function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}')
          if (!element) {
            return { success: false, error: 'Element not found' };
          }
          
          // Scroll into view first
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Wait a bit for the scroll to complete
          return new Promise(resolve => {
            setTimeout(() => {
              try {
                // Create and dispatch mouseenter and mouseover events
                const rect = element.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                
                const mouseEnterEvent = new MouseEvent('mouseenter', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  clientX: centerX,
                  clientY: centerY
                });
                
                const mouseOverEvent = new MouseEvent('mouseover', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  clientX: centerX,
                  clientY: centerY
                });
                
                element.dispatchEvent(mouseEnterEvent);
                element.dispatchEvent(mouseOverEvent);
                
                resolve({ 
                  success: true, 
                  message: 'Hover successful',
                  elementInfo: {
                    tagName: element.tagName,
                    id: element.id,
                    className: element.className
                  }
                });
              } catch (hoverError) {
                resolve({ success: false, error: hoverError.message });
              }
            }, 500);
          });
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;
    
    const result = await this.webview.executeJavaScript(script);
    
    if (!result.success) {
      throw new Error(`Hover failed: ${result.error}`);
    }
    
    return result;
  }
  
  /**
   * Press a key
   */
  private async keypress(step: ExecuteStep): Promise<any> {
    const selector = step.target || 'body'; // Default to body if no selector provided
    const key = step.value || 'Enter'; // Default to Enter if no key provided
    
    const script = `
      (function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}')
          if (!element) {
            return { success: false, error: 'Element not found' };
          }
          
          // Focus the element first if it's not the body
          if (element !== document.body) {
            element.focus();
          }
          
          // Create and dispatch keydown, keypress, and keyup events
          const keyCode = {
            'Enter': 13,
            'Tab': 9,
            'Escape': 27,
            'ArrowUp': 38,
            'ArrowDown': 40,
            'ArrowLeft': 37,
            'ArrowRight': 39,
            'Backspace': 8,
            'Delete': 46,
            'Space': 32
          }['${key}'] || '${key}'.charCodeAt(0);
          
          const keydownEvent = new KeyboardEvent('keydown', {
            key: '${key}',
            code: '${key}',
            keyCode: keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true
          });
          
          const keypressEvent = new KeyboardEvent('keypress', {
            key: '${key}',
            code: '${key}',
            keyCode: keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true
          });
          
          const keyupEvent = new KeyboardEvent('keyup', {
            key: '${key}',
            code: '${key}',
            keyCode: keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true
          });
          
          element.dispatchEvent(keydownEvent);
          element.dispatchEvent(keypressEvent);
          element.dispatchEvent(keyupEvent);
          
          // Special handling for Enter key on forms
          if ('${key}' === 'Enter') {
            const form = element.closest('form');
            if (form) {
              // Try to submit the form
              setTimeout(() => form.submit(), 10);
            }
          }
          
          return { 
            success: true, 
            message: 'Keypress successful',
            details: {
              key: '${key}',
              target: element.tagName,
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
      throw new Error(`Keypress failed: ${result.error}`);
    }
    
    // Wait a bit for any page changes triggered by the keypress
    await this.waitForTimeout(1000);
    
    return result;
  }
  
  /**
   * Clear an input field
   */
  private async clear(step: ExecuteStep): Promise<any> {
    const selector = step.target || this.extractSelectorFromDescription(step.description);
    
    if (!selector) {
      throw new Error('No selector provided for clear action');
    }
    
    const script = `
      (function() {
        try {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}')
          if (!element) {
            return { success: false, error: 'Element not found' };
          }
          
          // Focus the element
          element.focus();
          
          // Clear the value
          element.value = '';
          
          // Trigger input and change events
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          
          return { 
            success: true, 
            message: 'Clear successful',
            elementInfo: {
              tagName: element.tagName,
              id: element.id,
              className: element.className
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;
    
    const result = await this.webview.executeJavaScript(script);
    
    if (!result.success) {
      throw new Error(`Clear failed: ${result.error}`);
    }
    
    return result;
  }

  private async executeInferredAction(step: ExecuteStep): Promise<any> {
    const description = step.description.toLowerCase();
    
    if (description.includes('navigate') || description.includes('go to')) {
      return await this.navigate(step);
    } else if (description.includes('click') || description.includes('press') || description.includes('select')) {
      return await this.click(step);
    } else if (description.includes('type') || description.includes('enter') || description.includes('input')) {
      return await this.type(step);
    } else if (description.includes('wait for element')) {
      const selector = this.extractSelectorFromDescription(step.description);
      if (selector) {
        return await this.waitForElement(selector);
      }
      return await this.wait(step);
    } else if (description.includes('wait')) {
      return await this.wait(step);
    } else if (description.includes('check') && !description.includes('uncheck')) {
      return await this.check(step, true);
    } else if (description.includes('uncheck')) {
      return await this.check(step, false);
    } else if (description.includes('focus')) {
      return await this.focus(step);
    } else if (description.includes('hover')) {
      return await this.hover(step);
    } else if (description.includes('keypress') || description.includes('press key')) {
      return await this.keypress(step);
    } else if (description.includes('clear')) {
      return await this.clear(step);
    } else {
      // Default to extraction if we can't infer the action
      return await this.extract(step);
    }
  }
  
  private inferActionFromDescription(description: string): string {
    const lowerDesc = description.toLowerCase();
    
    if (lowerDesc.includes('navigate') || lowerDesc.includes('go to') || lowerDesc.includes('open')) {
      return 'navigate';
    } else if (lowerDesc.includes('click') || lowerDesc.includes('press') || lowerDesc.includes('tap')) {
      return 'click';
    } else if (lowerDesc.includes('type') || lowerDesc.includes('enter') || lowerDesc.includes('input')) {
      return 'type';
    } else if (lowerDesc.includes('wait')) {
      return 'wait';
    } else if (lowerDesc.includes('select') && (lowerDesc.includes('dropdown') || lowerDesc.includes('option'))) {
      return 'select';
    } else if (lowerDesc.includes('check') && !lowerDesc.includes('uncheck')) {
      return 'check';
    } else if (lowerDesc.includes('uncheck')) {
      return 'uncheck';
    } else if (lowerDesc.includes('extract') || lowerDesc.includes('get') || lowerDesc.includes('retrieve')) {
      return 'extract';
    }
    
    return 'unknown';
  }
  
  /**
   * Extract a URL from the step description
   */
  private extractUrlFromDescription(description: string): string | null {
    if (!description) return null;
    
    // Look for URLs in the description
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = description.match(urlRegex);
    
    if (matches && matches.length > 0) {
      return matches[0];
    }
    
    // Look for "navigate to X" or "go to X" patterns
    const navigateRegex = /(?:navigate to|go to|open)\s+(?:the\s+)?(?:website\s+)?(?:at\s+)?(?:url\s+)?['"]?([^'"]+?)['"]?(?:\s|$)/i;
    const navigateMatch = description.match(navigateRegex);
    
    if (navigateMatch && navigateMatch[1]) {
      const url = navigateMatch[1].trim();
      
      // Add https:// if it's a domain without protocol
      if (!url.startsWith('http') && !url.startsWith('file:')) {
        return `https://${url}`;
      }
      
      return url;
    }
    
    // Look for common domains
    const domainWords = ['google', 'facebook', 'twitter', 'github', 'linkedin', 'youtube', 'amazon'];
    for (const domain of domainWords) {
      if (description.toLowerCase().includes(domain)) {
        return `https://www.${domain}.com`;
      }
    }
    
    // Last resort: check if there's anything that looks like a domain
    const domainRegex = /\b([a-z0-9]+\.[a-z]{2,})\b/i;
    const domainMatch = description.match(domainRegex);
    if (domainMatch && domainMatch[1]) {
      return `https://${domainMatch[1]}`;
    }
    
    return null;
  }
  
  /**
   * Extract a selector from the step description
   */
  private extractSelectorFromDescription(description: string): string | null {
    // Look for explicit selectors
    const selectorRegex = /(?:selector|element|with selector)[:\s]+['"]([^'"]+)['"]/i;
    const selectorMatch = description.match(selectorRegex);
    
    if (selectorMatch && selectorMatch[1]) {
      return selectorMatch[1];
    }
    
    // Look for common element references
    const elementRegex = /(?:the|a|an)\s+(?:button|link|input|checkbox|radio|select|dropdown|field|element)(?:\s+(?:with|containing|labeled|named))?\s+(?:text|label|name|id|value|content)?\s+['"]([^'"]+)['"]/i;
    const elementMatch = description.match(elementRegex);
    
    if (elementMatch && elementMatch[1]) {
      const text = elementMatch[1];
      
      // Generate a selector that looks for elements containing this text
      return `*:is(button,a,input,select,label,div,span):contains("${text}")`;
    }
    
    return null;
  }
  
  /**
   * Extract a value from the step description
   */
  private extractValueFromDescription(description: string): string | null {
    // Look for explicit values
    const valueRegex = /(?:value|text|with)[:\s]+['"]([^'"]+)['"]/i;
    const valueMatch = description.match(valueRegex);
    
    if (valueMatch && valueMatch[1]) {
      return valueMatch[1];
    }
    
    // Look for "type X into Y" or "enter X into Y" patterns
    const typeRegex = /(?:type|enter|input)\s+['"]([^'"]+)['"]\s+(?:into|in)/i;
    const typeMatch = description.match(typeRegex);
    
    if (typeMatch && typeMatch[1]) {
      return typeMatch[1];
    }
    
    return null;
  }
  
  /**
   * Extract a time value from the step description
   */
  private extractTimeFromDescription(description: string): number | null {
    // Look for time values in milliseconds or seconds
    const msRegex = /(\d+)\s*(?:ms|milliseconds)/i;
    const msMatch = description.match(msRegex);
    
    if (msMatch && msMatch[1]) {
      return parseInt(msMatch[1]);
    }
    
    const secRegex = /(\d+)\s*(?:s|sec|seconds)/i;
    const secMatch = description.match(secRegex);
    
    if (secMatch && secMatch[1]) {
      return parseInt(secMatch[1]) * 1000;
    }
    
    return null;
  }
}
