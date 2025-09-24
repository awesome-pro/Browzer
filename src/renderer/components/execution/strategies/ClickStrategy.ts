import { ExecuteStep } from '../../../types';
import { BaseActionStrategy, ActionResult } from './ActionStrategies';
import { FormSubmissionHandler } from './FormSubmissionHandler';

export class ClickStrategy extends BaseActionStrategy {
  private formSubmissionHandler: FormSubmissionHandler;

  constructor() {
    super();
    this.formSubmissionHandler = new FormSubmissionHandler();
  }

  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
    const selector = step.target;
    
    if (!selector) {
      throw new Error('Selector is required for click action');
    }

    console.log(`[ClickStrategy] Attempting to click element: ${selector}`);

    // Handle main app elements
    if (this.isMainAppSelector(selector)) {
      return await this.clickMainAppElement(selector);
    }
    
    // Special handling for form submit buttons
    if (this.isFormSubmitButton(selector)) {
      return await this.formSubmissionHandler.handleFormButtonClick(selector, webview);
    }

    // Regular webview element click
    return await this.clickWebviewElement(selector, webview);
  }

  private isFormSubmitButton(selector: string): boolean {
    return selector.includes('button') && 
           (selector.includes('Create Short URL') || 
            selector.includes('submit') || 
            selector.includes('form'));
  }

  private async clickWebviewElement(selector: string, webview: any): Promise<ActionResult> {
    const script = this.generateClickScript(selector);
    const result = await this.executeInWebview(webview, script);

    if (!result.success) {
      throw new Error(`Click action failed: ${result.error}`);
    }

    // Wait for potential page changes
    await this.wait(1500);
    return result;
  }

  private generateClickScript(selector: string): string {
    return `
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
                if (alt.includes(':contains')) {
                  const tagName = alt.split(':')[0] || 'button';
                  const containsText = alt.match(/:contains\\(['"]([^'"]+)['"]\\)/)?.[1];
                  if (containsText) {
                    const elements = document.querySelectorAll(tagName);
                    element = Array.from(elements).find(el => 
                      el.textContent && el.textContent.trim().includes(containsText)
                    );
                  }
                } else {
                  element = document.querySelector(alt);
                }
                
                if (element) {
                  console.log('Found element with alternative selector:', alt);
                  break;
                }
              } catch (e) {
                console.log('Alternative selector failed:', alt, e.message);
              }
            }
          }

          if (!element) {
            return { success: false, error: 'Element not found with any selector', selector: '${selector}' };
          }

          // Visibility and interaction checks
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          
          if (rect.width === 0 || rect.height === 0) {
            return { success: false, error: 'Element has no visible area' };
          }
          
          if (style.display === 'none' || style.visibility === 'hidden') {
            return { success: false, error: 'Element is not visible' };
          }

          // Scroll into view and wait
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 500));

          // Multiple click strategies
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
  }

  private async clickMainAppElement(selector: string): Promise<ActionResult> {
    console.log(`[ClickStrategy] Clicking main app element: ${selector}`);
    
    try {
      const element = document.querySelector(selector);
      
      if (!element) {
        throw new Error(`Main app element not found: ${selector}`);
      }

      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.wait(500);

      // Multiple click strategies for main app
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
          console.warn('[ClickStrategy] Click strategy failed:', e);
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
      throw new Error(`Main app click failed: ${(error as Error).message}`);
    }
  }
}