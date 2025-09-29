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
      const elementInfo = this.parseElementIdentifier(step.target);
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
    if (!target) {
      return identifier;
    }
    if (target.startsWith('http://') || target.startsWith('https://')) {
      return { href: target };
    }
     if (target.startsWith('/')) {
      return { href: target };
    }
    if (target.includes(',')) {
      return { 
        selector: target.trim(),
        isMultiSelector: true
      };
    }
    const idMatch = target.match(/#([^.\[\s@]+)/);
    if (idMatch) identifier.id = idMatch[1];
    const nameMatch = target.match(/\[name=['"]?([^'"\]]+)['"]?\]/);
    if (nameMatch) identifier.name = nameMatch[1];
    const classMatch = target.match(/\.([^#\[\s@]+)/);
    if (classMatch) identifier.className = classMatch[1];
    const tagMatch = target.match(/^([a-z]+)/i);
    if (tagMatch) identifier.tagName = tagMatch[1].toLowerCase();
    const ariaMatch = target.match(/\[aria-label=['"?]([^'"\]]+)['"?]\]/);
    if (ariaMatch) identifier.ariaLabel = ariaMatch[1];
    const textMatch = target.match(/@(.+)$/);
    if (textMatch) identifier.text = textMatch[1];
    const typeMatch = target.match(/\[type=['"?]([^'"\]]+)['"?]\]/);
    if (typeMatch) identifier.type = typeMatch[1];
    const roleMatch = target.match(/\[role=['"?]([^'"\]]+)['"?]\]/);
    if (roleMatch) identifier.role = roleMatch[1];
    const hrefMatch = target.match(/\[href=['"?]([^'"\]]+)['"?]\]/);
    if (hrefMatch) identifier.href = hrefMatch[1];

    identifier.selector = target;
    
    console.log(`[ExecuteStepRunner] Parsed identifier:`, identifier);
    return identifier;
  }

  private generateSelectors(identifier: ElementIdentifier): string[] {
    const selectors: string[] = [];
    if (identifier.id) {
      selectors.push(`#${identifier.id}`);
      if (identifier.tagName) {
        selectors.push(`${identifier.tagName}#${identifier.id}`);
      }
    }
    if (identifier.name) {
      selectors.push(`[name="${identifier.name}"]`);
      if (identifier.tagName) {
        selectors.push(`${identifier.tagName}[name="${identifier.name}"]`);
      }
    }
    if (identifier.ariaLabel) {
      selectors.push(`[aria-label="${identifier.ariaLabel}"]`);
      if (identifier.tagName) {
        selectors.push(`${identifier.tagName}[aria-label="${identifier.ariaLabel}"]`);
      }
    }
    if (identifier.className) {
      const classes = identifier.className.split(' ').filter(c => c.trim());
      if (classes.length > 0) {
        selectors.push(`.${classes[0]}`);
        if (identifier.tagName) {
          selectors.push(`${identifier.tagName}.${classes[0]}`);
        }
      }
    }
    if (identifier.type && identifier.tagName) {
      selectors.push(`${identifier.tagName}[type="${identifier.type}"]`);
    }
    if (identifier.role) {
      selectors.push(`[role="${identifier.role}"]`);
    }
    if (identifier.href) {
      selectors.push(`[href="${identifier.href}"]`);
      selectors.push(`[href*="${identifier.href}"]`);
    }
    if (identifier.tagName && selectors.length === 0) {
      selectors.push(identifier.tagName);
    }
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
    const actionType = step.action.toLowerCase();
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
    if (url.startsWith('/')) {
      return this.handleSpaNavigation(url);
    } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.includes('.') && !url.startsWith('/')) {
        url = `https://${url}`;
      } else {
        return this.handleSpaNavigation(`/${url}`);
      }
    }

    console.log(`[ExecuteStepRunner] Navigating to: ${url}`);

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
    const currentUrl = this.webview.getURL();
    const baseUrl = new URL(currentUrl).origin;
    const fullUrl = `${baseUrl}${path}`;
    console.log(`[ExecuteStepRunner] Full SPA URL: ${fullUrl}`);
    const script = `
      (async function() {
        try {
          console.log('[SPA Navigation] Attempting to navigate to:', ${JSON.stringify(path)});
          if (window.history && window.history.pushState) {
            console.log('[SPA Navigation] Using History API');
            window.history.pushState({}, '', ${JSON.stringify(path)});
            const popStateEvent = new PopStateEvent('popstate', { state: {} });
            window.dispatchEvent(popStateEvent);
            window.dispatchEvent(new Event('locationchange'));
          }
          if (window.ReactRouter || (window.__REACT_ROUTER_GLOBAL_CONTEXT__ && window.__REACT_ROUTER_GLOBAL_CONTEXT__.router)) {
            console.log('[SPA Navigation] Using React Router');
            const router = window.ReactRouter || window.__REACT_ROUTER_GLOBAL_CONTEXT__.router;
            if (router && router.history && router.history.push) {
              router.history.push(${JSON.stringify(path)});
            }
          }
          if (window.next && window.next.router) {
            console.log('[SPA Navigation] Using Next.js Router');
            window.next.router.push(${JSON.stringify(path)});
          }
          if (window.$nuxt && window.$nuxt.$router) {
            console.log('[SPA Navigation] Using Vue/Nuxt Router');
            window.$nuxt.$router.push(${JSON.stringify(path)});
          }
          const links = Array.from(document.querySelectorAll('a[href]'));
          const matchingLink = links.find(link => {
            const href = link.getAttribute('href');
            return href === ${JSON.stringify(path)};
          });
          
          if (matchingLink) {
            console.log('[SPA Navigation] Found matching link, clicking it');
            matchingLink.click();
          }
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
      await this.wait(2000);
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
      console.log(`[ExecuteStepRunner] Falling back to direct navigation`);
      this.webview.src = fullUrl;
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
        for (const selector of selectors) {
          try {
            const elements = document.querySelectorAll(selector);
            
            if (elements.length === 0) continue;
            if (textContent) {
              for (const el of elements) {
                if (el.textContent && el.textContent.includes(textContent)) {
                  console.log('[FindElement] Found element with text match');
                  return { found: true, selector: selector, hasText: true };
                }
              }
            } else {
              console.log('[FindElement] Found element with selector:', selector);
              return { found: true, selector: selector, hasText: false };
            }
          } catch (e) {
            console.warn('[FindElement] Selector failed:', selector, e.message);
          }
        }
        if (textContent) {
          const allElements = document.querySelectorAll('*');
          for (const el of allElements) {
            if (el.textContent && el.textContent.trim() === textContent.trim()) {
              console.log('[FindElement] Found element by text only');
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
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
              if (el.textContent && el.textContent.trim() === textContent.trim()) {
                element = el;
                break;
              }
            }
          } else {
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
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 500));
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          
          if (rect.width === 0 || rect.height === 0 || 
              style.display === 'none' || style.visibility === 'hidden') {
            return { success: false, error: 'Element is not visible' };
          }
          const originalOutline = element.style.outline;
          element.style.outline = '2px solid blue';
          let clicked = false;
          try {
            element.click();
            clicked = true;
          } catch (e) {
            console.warn('[Click] Native click failed:', e);
          }
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
    const findResult = await this.findElement(selectors, elementInfo);
    
    if (!findResult.found) {
      throw new Error(`Element not found for type. Tried selectors: ${selectors.join(', ')}`);
    }
    
    const script = `
      (async function() {
        try {
          const selector = '${findResult.selector.replace(/'/g, "\\'")}';
          const textValue = '${text.replace(/'/g, "\\'")}';
          let element = document.querySelector(selector);
          
          if (!element) {
            return { success: false, error: 'Element not found in type execution' };
          }
          const elementInfo = {
            tagName: element.tagName,
            id: element.id,
            name: element.name,
            type: element.type,
            initialValue: element.value
          };
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 500));
          element.focus();
          await new Promise(resolve => setTimeout(resolve, 200));
          const originalOutline = element.style.outline;
          element.style.outline = '2px solid green';
          if (element.value !== undefined) {
            const originalValue = element.value;
            element.value = '';
            element.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          for (let i = 0; i < textValue.length; i++) {
            const char = textValue[i];
            
            if (element.value !== undefined) {
              element.value += char;
              element.dispatchEvent(new Event('input', { bubbles: true }));
              if (i < textValue.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 50));
              }
            }
          }
          if (element.value !== undefined) {
            element.value = textValue;
          }
          element.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(resolve => setTimeout(resolve, 100));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise(resolve => setTimeout(resolve, 100));
          try {
            if (element.setAttribute) {
              element.setAttribute('value', textValue);
            }
            element.dataset.testValue = textValue;
            Object.defineProperty(element, 'value', {
              value: textValue,
              writable: true
            });
          } catch (e) {
            console.warn('[Type] Failed to set value using alternative methods:', e);
          }
          element.dispatchEvent(new Event('blur', { bubbles: true }));
          setTimeout(() => {
            element.style.outline = originalOutline;
          }, 1000);
          const finalValue = element.value || element.textContent || '';
          const isValueSet = finalValue === textValue;
          if (!isValueSet && element.value !== undefined) {
            console.warn('[Type] Value not set correctly, trying alternative method');
            element.focus();
            element.value = textValue;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
          }
          await new Promise(resolve => setTimeout(resolve, 300));
          
          return {
            success: true,
            message: 'Text typed successfully',
            valueSet: isValueSet,
            finalValue: finalValue,
            elementInfo: elementInfo
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

  private async submit(step: ExecuteStep, elementInfo: ElementIdentifier): Promise<any> {
    
    console.log(`[ExecuteStepRunner] Submit - converting to click action on submit button`);
    if (elementInfo.id || elementInfo.className || elementInfo.text) {
      return await this.click(step, elementInfo);
    }
    const script = `
      (async function() {
        try {
          const submitSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:contains("Submit")',
            'button:contains("Create")',
            'button:contains("Save")',
            'button:contains("Send")',
            'button.btn-primary',
            'button.submit',
            '[role="button"][type="submit"]'
          ];
          
          let submitButton = null;
          
          for (const selector of submitSelectors) {
            try {
              if (selector.includes(':contains')) {
                const [base, text] = selector.split(':contains');
                const textContent = text.replace(/[()'"]/g, '');
                const elements = document.querySelectorAll(base || 'button');
                
                for (const el of elements) {
                  if (el.textContent && el.textContent.includes(textContent)) {
                    submitButton = el;
                    break;
                  }
                }
              } else {
                submitButton = document.querySelector(selector);
              }
              
              if (submitButton) break;
            } catch (e) {
              console.warn('[Submit] Selector failed:', selector);
            }
          }
          
          if (!submitButton) {
            const form = document.querySelector('form');
            if (form) {
              submitButton = form.querySelector('button, input[type="submit"]');
            }
          }
          
          if (!submitButton) {
            return { success: false, error: 'No submit button found' };
          }
          const rect = submitButton.getBoundingClientRect();
          const style = window.getComputedStyle(submitButton);
          
          if (rect.width === 0 || rect.height === 0 || 
              style.display === 'none' || style.visibility === 'hidden' ||
              submitButton.disabled) {
            return { success: false, error: 'Submit button is not clickable' };
          }
          submitButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 500));
          const originalOutline = submitButton.style.outline;
          submitButton.style.outline = '3px solid green';
          submitButton.click();
          setTimeout(() => {
            submitButton.style.outline = originalOutline;
          }, 1000);
          
          return {
            success: true,
            message: 'Form submitted via button click',
            button: {
              tagName: submitButton.tagName,
              text: submitButton.textContent?.trim(),
              type: submitButton.type
            }
          };
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
      selectors.push(':focus');
    }
    
    console.log(`[ExecuteStepRunner] Keypress "${key}" - trying selectors:`, selectors);
    
    const script = `
      (async function() {
        try {
          const selectors = ${JSON.stringify(selectors)};
          const key = '${key}';
          
          let element = null;
          for (const selector of selectors) {
            try {
              element = document.querySelector(selector);
              if (element) break;
            } catch (e) {
              console.warn('[Keypress] Selector failed:', selector);
            }
          }
          if (!element) {
            element = document.activeElement;
          }
          
          if (!element) {
            return { success: false, error: 'No element found for keypress' };
          }
          element.focus();
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