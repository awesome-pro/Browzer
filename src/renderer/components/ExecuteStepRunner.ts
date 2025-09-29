import { ElementIdentifier, ExecuteStep } from "../types";

export class ExecuteStepRunner {
  private webview: any;
  private readonly DEFAULT_TIMEOUT = 30000;
  private readonly ELEMENT_WAIT_TIMEOUT = 15000;
  private readonly ACTION_DELAY = 500;

  constructor(webview: any) {
    this.webview = webview;
  }

  public async executeStep(step: ExecuteStep): Promise<any> {
    console.log(`[ExecuteStepRunner] Executing: ${step.action} on ${step.target}`);
    
    if (!this.webview) {
      throw new Error('No webview available for step execution');
    }

    step.startTime = Date.now();
    step.status = 'running';

    try {
      // Parse the element identifier from the target
      const elementInfo = this.parseElementIdentifier(step.target);
      
      // Execute the action with parsed info
      const result = await this.executeActionWithRetry(step, elementInfo);
      
      step.status = 'completed';
      step.endTime = Date.now();
      step.result = result;
      
      console.log(`[ExecuteStepRunner] Step completed successfully`);
      return result;
    } catch (error) {
      step.status = 'failed';
      step.endTime = Date.now();
      step.error = (error as Error).message;
      
      console.error(`[ExecuteStepRunner] Step failed:`, error);
      throw error;
  }
  }

  private parseElementIdentifier(target: string): ElementIdentifier {
    const identifier: ElementIdentifier = {};
    
    // Handle empty targets
    if (!target) {
      return identifier;
    }
    
    // Handle URL targets for navigation
    if (target.startsWith('http://') || target.startsWith('https://')) {
      return { href: target };
    }
    
    // Handle relative path navigation targets
    if (target.startsWith('/')) {
      return { href: target };
    }
    
    // Handle multiple comma-separated selectors
    if (target.includes(',')) {
      // Just store the full selector string for now
      // The actual selector resolution will happen in findElement
      return { 
        selector: target.trim(),
        isMultiSelector: true
      };
    }
    
    // Parse the structured target format: "element_type#id.class[name='value']@text"
    // Examples: "textarea#APjFqb", "input[name='q']", "button.primary@Submit"
    
    // Extract ID
    const idMatch = target.match(/#([^.\[\s@]+)/);
    if (idMatch) identifier.id = idMatch[1];
    
    // Extract name attribute
    const nameMatch = target.match(/\[name=['"?]([^'"\]]+)['"?]\]/);
    if (nameMatch) identifier.name = nameMatch[1];
    
    // Extract class names
    const classMatch = target.match(/\.([^#\[\s@]+)/);
    if (classMatch) identifier.className = classMatch[1];
    
    // Extract tag name (at the beginning)
    const tagMatch = target.match(/^([a-z]+)/i);
    if (tagMatch) identifier.tagName = tagMatch[1].toLowerCase();
    
    // Extract aria-label
    const ariaMatch = target.match(/\[aria-label=['"?]([^'"\]]+)['"?]\]/);
    if (ariaMatch) identifier.ariaLabel = ariaMatch[1];
    
    // Extract text content (after @)
    const textMatch = target.match(/@(.+)$/);
    if (textMatch) identifier.text = textMatch[1];
    
    // Extract type attribute
    const typeMatch = target.match(/\[type=['"?]([^'"\]]+)['"?]\]/);
    if (typeMatch) identifier.type = typeMatch[1];
    
    // Extract role attribute
    const roleMatch = target.match(/\[role=['"?]([^'"\]]+)['"?]\]/);
    if (roleMatch) identifier.role = roleMatch[1];
    
    // Extract href attribute
    const hrefMatch = target.match(/\[href=['"?]([^'"\]]+)['"?]\]/);
    if (hrefMatch) identifier.href = hrefMatch[1];
    
    // Store the original selector for reference
    identifier.selector = target;
    
    console.log(`[ExecuteStepRunner] Parsed identifier:`, identifier);
    return identifier;
  }

  private generateSelectors(identifier: ElementIdentifier): string[] {
    const selectors: string[] = [];
    
    // Priority 1: ID selector (most specific)
    if (identifier.id) {
      selectors.push(`#${identifier.id}`);
      if (identifier.tagName) {
        selectors.push(`${identifier.tagName}#${identifier.id}`);
      }
    }
    
    // Priority 2: Name attribute selector
    if (identifier.name) {
      selectors.push(`[name="${identifier.name}"]`);
      if (identifier.tagName) {
        selectors.push(`${identifier.tagName}[name="${identifier.name}"]`);
      }
    }
    
    // Priority 3: Aria-label selector
    if (identifier.ariaLabel) {
      selectors.push(`[aria-label="${identifier.ariaLabel}"]`);
      if (identifier.tagName) {
        selectors.push(`${identifier.tagName}[aria-label="${identifier.ariaLabel}"]`);
      }
    }
    
    // Priority 4: Class selector
    if (identifier.className) {
      const classes = identifier.className.split(' ').filter(c => c.trim());
      if (classes.length > 0) {
        selectors.push(`.${classes[0]}`);
        if (identifier.tagName) {
          selectors.push(`${identifier.tagName}.${classes[0]}`);
        }
      }
    }
    
    // Priority 5: Type attribute selector
    if (identifier.type && identifier.tagName) {
      selectors.push(`${identifier.tagName}[type="${identifier.type}"]`);
    }
    
    // Priority 6: Role attribute selector
    if (identifier.role) {
      selectors.push(`[role="${identifier.role}"]`);
    }
    
    // Priority 7: Href attribute selector
    if (identifier.href) {
      selectors.push(`[href="${identifier.href}"]`);
      selectors.push(`[href*="${identifier.href}"]`);
    }
    
    // Priority 8: Tag name only (least specific)
    if (identifier.tagName && selectors.length === 0) {
      selectors.push(identifier.tagName);
    }
    
    // Remove duplicates and return
    return [...new Set(selectors)];
  }

  private async executeActionWithRetry(step: ExecuteStep, elementInfo: ElementIdentifier): Promise<any> {
    const maxRetries = step.maxRetries || 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[ExecuteStepRunner] Attempt ${attempt}/${maxRetries}`);
        
        const result = await this.executeAction(step, elementInfo);
        
        if (attempt > 1) {
          console.log(`[ExecuteStepRunner] Succeeded on attempt ${attempt}`);
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

    throw new Error(`Step failed after ${maxRetries} attempts: ${lastError?.message}`);
  }

  private async executeAction(step: ExecuteStep, elementInfo: ElementIdentifier): Promise<any> {
    await this.wait(this.ACTION_DELAY);

    // Normalize action type
    const actionType = step.action.toLowerCase();

    // Handle navigation actions with special care
    if (actionType === 'navigate' || actionType === 'navigation') {
      console.log(`[ExecuteStepRunner] Executing navigation action with target: ${step.target}`);
      return await this.navigate(step);
    }

    switch (actionType) {
      case 'click':
        return await this.click(step, elementInfo);
      
      case 'type':
      case 'text':
        return await this.type(step, elementInfo);
      
      case 'submit':
        return await this.submit(step, elementInfo);
      
      case 'keypress':
      case 'key':
        return await this.keypress(step, elementInfo);
      
      case 'wait':
        return await this.waitTime(step);
      
      case 'wait_for_element':
        return await this.waitForElement(step, elementInfo);
      
      case 'spa_navigation':
        // Explicitly handle SPA navigation
        if (step.target) {
          return await this.handleSpaNavigation(step.target);
        } else {
          throw new Error('SPA navigation requires a target path');
        }
      
      default:
        throw new Error(`Unsupported action: ${step.action}`);
    }
  }

  private async navigate(step: ExecuteStep): Promise<any> {
    let url = step.target || step.value as string;
    
    if (!url) {
      throw new Error('No URL provided for navigation');
    }

    console.log(`[ExecuteStepRunner] Processing navigation to: ${url}`);

    // Handle different types of URLs
    if (url.startsWith('/')) {
      // Relative path navigation (SPA route)
      return this.handleSpaNavigation(url);
    } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
      // Add protocol if missing for absolute URLs
      if (url.includes('.') && !url.startsWith('/')) {
        url = `https://${url}`;
      } else {
        // Could be a relative path without leading slash
        return this.handleSpaNavigation(`/${url}`);
      }
    }

    console.log(`[ExecuteStepRunner] Navigating to external URL: ${url}`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Navigation timeout after ${this.DEFAULT_TIMEOUT}ms`));
      }, this.DEFAULT_TIMEOUT);

      const cleanup = () => {
        clearTimeout(timeout);
        this.webview.removeEventListener('did-finish-load', onLoad);
        this.webview.removeEventListener('did-fail-load', onError);
      };

      const onLoad = () => {
        cleanup();
        resolve({ 
          success: true, 
          url: url,
          actualUrl: this.webview.getURL() 
        });
      };

      const onError = (event: any) => {
        cleanup();
        reject(new Error(`Navigation failed: ${event.errorDescription || 'Unknown error'}`));
      };

      this.webview.addEventListener('did-finish-load', onLoad);
      this.webview.addEventListener('did-fail-load', onError);

      try {
        this.webview.src = url;
      } catch (error) {
        cleanup();
        reject(new Error(`Failed to navigate: ${(error as Error).message}`));
      }
    });
  }

  /**
   * Handles SPA navigation by using client-side routing
   * This works for React Router, Next.js, Vue Router, etc.
   */
  private async handleSpaNavigation(path: string): Promise<any> {
    console.log(`[ExecuteStepRunner] Handling SPA navigation to: ${path}`);
    
    // Get the current base URL
    const currentUrl = this.webview.getURL();
    const baseUrl = new URL(currentUrl).origin;
    
    // Construct the full URL for logging purposes
    const fullUrl = `${baseUrl}${path}`;
    console.log(`[ExecuteStepRunner] Full SPA URL: ${fullUrl}`);
    
    // Try multiple SPA navigation strategies
    const script = `
      (async function() {
        try {
          console.log('[SPA Navigation] Attempting to navigate to:', ${JSON.stringify(path)});
          
          // Strategy 1: Use History API directly
          if (window.history && window.history.pushState) {
            console.log('[SPA Navigation] Using History API');
            window.history.pushState({}, '', ${JSON.stringify(path)});
            
            // Dispatch popstate event to trigger route change handlers
            const popStateEvent = new PopStateEvent('popstate', { state: {} });
            window.dispatchEvent(popStateEvent);
            
            // Also try dispatching custom events that some frameworks listen for
            window.dispatchEvent(new Event('locationchange'));
          }
          
          // Strategy 2: Look for common router objects
          // React Router
          if (window.ReactRouter || (window.__REACT_ROUTER_GLOBAL_CONTEXT__ && window.__REACT_ROUTER_GLOBAL_CONTEXT__.router)) {
            console.log('[SPA Navigation] Using React Router');
            const router = window.ReactRouter || window.__REACT_ROUTER_GLOBAL_CONTEXT__.router;
            if (router && router.history && router.history.push) {
              router.history.push(${JSON.stringify(path)});
            }
          }
          
          // Next.js Router
          if (window.next && window.next.router) {
            console.log('[SPA Navigation] Using Next.js Router');
            window.next.router.push(${JSON.stringify(path)});
          }
          
          // Vue Router
          if (window.$nuxt && window.$nuxt.$router) {
            console.log('[SPA Navigation] Using Vue/Nuxt Router');
            window.$nuxt.$router.push(${JSON.stringify(path)});
          }
          
          // Strategy 3: Find and click a matching link
          const links = Array.from(document.querySelectorAll('a[href]'));
          const matchingLink = links.find(link => {
            const href = link.getAttribute('href');
            return href === ${JSON.stringify(path)};
          });
          
          if (matchingLink) {
            console.log('[SPA Navigation] Found matching link, clicking it');
            matchingLink.click();
          }
          
          // Wait a bit for the navigation to take effect
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          return { 
            success: true, 
            message: 'SPA navigation attempted with multiple strategies',
            currentPath: window.location.pathname,
            fullUrl: window.location.href
          };
        } catch (error) {
          return { 
            success: false, 
            error: error.message || 'Unknown error during SPA navigation'
          };
        }
      })();
    `;
    
    try {
      const result = await this.webview.executeJavaScript(script);
      
      if (!result.success) {
        throw new Error(`SPA navigation failed: ${result.error}`);
      }
      
      console.log(`[ExecuteStepRunner] SPA navigation result:`, result);
      
      // Wait a bit longer for any async operations to complete
      await this.wait(2000);
      
      // Verify the navigation worked
      const currentPath = await this.webview.executeJavaScript('window.location.pathname');
      if (!currentPath.includes(path.replace(/^\//, ''))) {
        console.warn(`[ExecuteStepRunner] SPA navigation may not have worked. Expected path: ${path}, Current path: ${currentPath}`);
      }
      
      return {
        success: true,
        url: path,
        actualUrl: await this.webview.executeJavaScript('window.location.href'),
        message: 'SPA navigation completed'
      };
    } catch (error) {
      console.error(`[ExecuteStepRunner] SPA navigation error:`, error);
      
      // Fallback: Try direct navigation as last resort
      console.log(`[ExecuteStepRunner] Falling back to direct navigation`);
      this.webview.src = fullUrl;
      
      // Wait for navigation to complete
      await new Promise(resolve => {
        const onLoad = () => {
          this.webview.removeEventListener('did-finish-load', onLoad);
          resolve(null);
        };
        this.webview.addEventListener('did-finish-load', onLoad);
      });
      
      return {
        success: true,
        url: fullUrl,
        actualUrl: this.webview.getURL(),
        message: 'SPA navigation completed via fallback'
      };
    }
  }

  private async findElement(selectors: string[], elementInfo: ElementIdentifier): Promise<any> {
    const script = `
      (function() {
        const selectors = ${JSON.stringify(selectors)};
        const textContent = ${JSON.stringify(elementInfo.text || '')};
        
        console.log('[FindElement] Trying selectors:', selectors);
        
        // Try each selector
        for (const selector of selectors) {
          try {
            const elements = document.querySelectorAll(selector);
            
            if (elements.length === 0) continue;
            
            // If we have text content to match, filter by it
            if (textContent) {
              for (const el of elements) {
                if (el.textContent && el.textContent.includes(textContent)) {
                  console.log('[FindElement] Found element with text match');
                  return { found: true, selector: selector, hasText: true };
                }
              }
            } else {
              // No text filter, use first element
              console.log('[FindElement] Found element with selector:', selector);
              return { found: true, selector: selector, hasText: false };
            }
          } catch (e) {
            console.warn('[FindElement] Selector failed:', selector, e.message);
          }
        }
        
        // Fallback: Try to find by text content only
        if (textContent) {
          const allElements = document.querySelectorAll('*');
          for (const el of allElements) {
            if (el.textContent && el.textContent.trim() === textContent.trim()) {
              console.log('[FindElement] Found element by text only');
              // Create a unique selector for this element
              const tag = el.tagName.toLowerCase();
              const id = el.id ? '#' + el.id : '';
              const className = el.className ? '.' + el.className.split(' ')[0] : '';
              return { 
                found: true, 
                selector: tag + id + className,
                hasText: true,
                byTextOnly: true 
              };
            }
          }
        }
        
        return { found: false, triedSelectors: selectors };
      })();
    `;
    
    return await this.webview.executeJavaScript(script);
  }

  private async click(step: ExecuteStep, elementInfo: ElementIdentifier): Promise<any> {
    const selectors = this.generateSelectors(elementInfo);
    
    if (selectors.length === 0) {
      throw new Error('No selectors could be generated from target');
    }
    
    console.log(`[ExecuteStepRunner] Click - trying selectors:`, selectors);
    
    // First, find the element
    const findResult = await this.findElement(selectors, elementInfo);
    
    if (!findResult.found) {
      throw new Error(`Element not found for click. Tried selectors: ${selectors.join(', ')}`);
    }
    
    const script = `
      (async function() {
        try {
          const selector = '${findResult.selector.replace(/'/g, "\\'")}';
          const textContent = ${JSON.stringify(elementInfo.text || '')};
          const byTextOnly = ${findResult.byTextOnly || false};
          
          let element = null;
          
          if (byTextOnly && textContent) {
            // Find by text content
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
              if (el.textContent && el.textContent.trim() === textContent.trim()) {
                element = el;
                break;
              }
            }
          } else {
            // Find by selector, optionally filtered by text
            const elements = document.querySelectorAll(selector);
            if (textContent) {
              for (const el of elements) {
                if (el.textContent && el.textContent.includes(textContent)) {
                  element = el;
                  break;
                }
              }
            } else {
              element = elements[0];
            }
          }
          
          if (!element) {
            return { success: false, error: 'Element not found in click execution' };
          }
          
          // Scroll into view
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Check visibility
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          
          if (rect.width === 0 || rect.height === 0 || 
              style.display === 'none' || style.visibility === 'hidden') {
            return { success: false, error: 'Element is not visible' };
          }
          
          // Visual feedback
          const originalOutline = element.style.outline;
          element.style.outline = '2px solid blue';
          
          // Try multiple click strategies
          let clicked = false;
          
          // Strategy 1: Native click
          try {
            element.click();
            clicked = true;
          } catch (e) {
            console.warn('[Click] Native click failed:', e);
          }
          
          // Strategy 2: Dispatch mouse events
          if (!clicked) {
            try {
              element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
              element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
              element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
              clicked = true;
            } catch (e) {
              console.warn('[Click] Mouse events failed:', e);
            }
          }
          
          // Restore outline after delay
          setTimeout(() => {
            element.style.outline = originalOutline;
          }, 1000);
          
          return {
            success: clicked,
            message: clicked ? 'Element clicked successfully' : 'Click failed',
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
      throw new Error(`Click failed: ${result.error}`);
    }
    
    await this.wait(1000);
    return result;
  }

  private async type(step: ExecuteStep, elementInfo: ElementIdentifier): Promise<any> {
    const selectors = this.generateSelectors(elementInfo);
    const text = step.value as string;
    
    if (!text) {
      throw new Error('No text value provided for type action');
    }
    
    if (selectors.length === 0) {
      throw new Error('No selectors could be generated from target');
    }
    
    console.log(`[ExecuteStepRunner] Type - trying selectors:`, selectors);
    
    // First, find the element
    const findResult = await this.findElement(selectors, elementInfo);
    
    if (!findResult.found) {
      throw new Error(`Element not found for type. Tried selectors: ${selectors.join(', ')}`);
    }
    
    const script = `
      (async function() {
        try {
          const selector = '${findResult.selector.replace(/'/g, "\\'")}';
          const textValue = '${text.replace(/'/g, "\\'")}';
          
          const element = document.querySelector(selector);
          
          if (!element) {
            return { success: false, error: 'Element not found in type execution' };
          }
          
          // Scroll into view
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Focus the element
          element.focus();
          
          // Visual feedback
          const originalOutline = element.style.outline;
          element.style.outline = '2px solid green';
          
          // Clear existing value
          if (element.value !== undefined) {
            element.value = '';
          }
          
          // Type the text character by character
          for (let i = 0; i < textValue.length; i++) {
            const char = textValue[i];
            
            if (element.value !== undefined) {
              element.value += char;
            }
            
            // Dispatch input event for each character
            element.dispatchEvent(new Event('input', { bubbles: true }));
            
            // Small delay between characters
            if (i < textValue.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
          
          // Final events
          element.dispatchEvent(new Event('change', { bubbles: true }));
          element.dispatchEvent(new Event('blur', { bubbles: true }));
          
          // Restore outline after delay
          setTimeout(() => {
            element.style.outline = originalOutline;
          }, 1000);
          
          const finalValue = element.value || element.textContent || '';
          
          return {
            success: true,
            message: 'Text typed successfully',
            valueSet: finalValue === textValue,
            finalValue: finalValue
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
    
    await this.wait(500);
    return result;
  }

  private async submit(step: ExecuteStep, elementInfo: ElementIdentifier): Promise<any> {
    const selectors = this.generateSelectors(elementInfo);
    
    // Add form-specific selectors
    selectors.push('form');
    selectors.push('button[type="submit"]');
    selectors.push('input[type="submit"]');
    
    console.log(`[ExecuteStepRunner] Submit - trying selectors:`, selectors);
    
    const script = `
      (async function() {
        try {
          // Try to find a form first
          let form = document.querySelector('form');
          
          if (!form) {
            // Try to find a submit button
            const submitButton = document.querySelector('button[type="submit"], input[type="submit"]');
            if (submitButton) {
              submitButton.click();
              return { success: true, message: 'Submit button clicked' };
            }
            
            return { success: false, error: 'No form or submit button found' };
          }
          
          // Check form validity
          const inputs = form.querySelectorAll('input[required], textarea[required], select[required]');
          let allValid = true;
          
          for (const input of inputs) {
            if (input.required && !input.value) {
              allValid = false;
              console.warn('[Submit] Required field empty:', input.name || input.id);
            }
          }
          
          if (!allValid) {
            console.warn('[Submit] Form has invalid fields');
          }
          
          // Try to submit
          try {
            form.submit();
            return { success: true, message: 'Form submitted via submit()' };
          } catch (e) {
            // Try dispatching submit event
            const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
            form.dispatchEvent(submitEvent);
            return { success: true, message: 'Form submitted via event' };
          }
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    const result = await this.webview.executeJavaScript(script);
    
    if (!result.success) {
      throw new Error(`Submit failed: ${result.error}`);
    }
    
    await this.wait(2000);
    return result;
  }

  private async keypress(step: ExecuteStep, elementInfo: ElementIdentifier): Promise<any> {
    const selectors = this.generateSelectors(elementInfo);
    const key = (step.value as string) || 'Enter';
    
    if (selectors.length === 0) {
      // If no selectors, target the active element
      selectors.push(':focus');
    }
    
    console.log(`[ExecuteStepRunner] Keypress "${key}" - trying selectors:`, selectors);
    
    const script = `
      (async function() {
        try {
          const selectors = ${JSON.stringify(selectors)};
          const key = '${key}';
          
          let element = null;
          
          // Try each selector
          for (const selector of selectors) {
            try {
              element = document.querySelector(selector);
              if (element) break;
            } catch (e) {
              console.warn('[Keypress] Selector failed:', selector);
            }
          }
          
          // If no element found, use the currently focused element
          if (!element) {
            element = document.activeElement;
          }
          
          if (!element) {
            return { success: false, error: 'No element found for keypress' };
          }
          
          // Focus the element
          element.focus();
          
          // Determine key code
          const keyCodes = {
            'Enter': 13,
            'Tab': 9,
            'Escape': 27,
            'Backspace': 8,
            'Delete': 46,
            'Space': 32,
            'ArrowUp': 38,
            'ArrowDown': 40,
            'ArrowLeft': 37,
            'ArrowRight': 39
          };
          
          const keyCode = keyCodes[key] || key.charCodeAt(0);
          
          // Dispatch keyboard events
          const keydownEvent = new KeyboardEvent('keydown', {
            key: key,
            keyCode: keyCode,
            bubbles: true,
            cancelable: true
          });
          
          const keyupEvent = new KeyboardEvent('keyup', {
            key: key,
            keyCode: keyCode,
            bubbles: true,
            cancelable: true
          });
          
          element.dispatchEvent(keydownEvent);
          element.dispatchEvent(keyupEvent);
          
          // For Enter key on forms, try to submit
          if (key === 'Enter' && element.tagName === 'INPUT') {
            const form = element.closest('form');
            if (form) {
              form.dispatchEvent(new Event('submit', { bubbles: true }));
            }
          }
          
          return {
            success: true,
            message: 'Keypress executed successfully',
            key: key,
            element: {
              tagName: element.tagName,
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
    
    await this.wait(500);
    return result;
  }

  private async waitTime(step: ExecuteStep): Promise<any> {
    const milliseconds = (step.value as number) || 1000;
    console.log(`[ExecuteStepRunner] Waiting ${milliseconds}ms`);
    await this.wait(milliseconds);
    return { success: true, message: `Waited ${milliseconds}ms` };
  }

  private async waitForElement(step: ExecuteStep, elementInfo: ElementIdentifier): Promise<any> {
    const selectors = this.generateSelectors(elementInfo);
    const timeout = (step.value as number) || this.ELEMENT_WAIT_TIMEOUT;
    
    console.log(`[ExecuteStepRunner] Waiting for element with selectors:`, selectors);
    
    const script = `
      (function() {
        return new Promise((resolve) => {
          const startTime = Date.now();
          const timeout = ${timeout};
          const selectors = ${JSON.stringify(selectors)};
          
          const check = () => {
            for (const selector of selectors) {
              try {
                const element = document.querySelector(selector);
                if (element) {
                  const rect = element.getBoundingClientRect();
                  const style = window.getComputedStyle(element);
                  
                  if (rect.width > 0 && rect.height > 0 && 
                      style.display !== 'none' && style.visibility !== 'hidden') {
                    resolve({
                      success: true,
                      message: 'Element found',
                      selector: selector
                    });
                    return;
                  }
                }
              } catch (e) {
                // Invalid selector, skip
              }
            }
            
            if (Date.now() - startTime > timeout) {
              resolve({
                success: false,
                error: 'Timeout waiting for element'
              });
              return;
            }
            
            setTimeout(check, 250);
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

  private async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}