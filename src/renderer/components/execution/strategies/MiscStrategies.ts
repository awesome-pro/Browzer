import { ExecuteStep } from '../../../types';
import { ActionResult, BaseActionStrategy } from './ActionStrategies';

export class ScrollStrategy extends BaseActionStrategy {
  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
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

    const result = await this.executeInWebview(webview, script);
    await this.wait(1000);
    return result;
  }
}

export class ExtractStrategy extends BaseActionStrategy {
  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
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

    const result = await this.executeInWebview(webview, script);
    if (!result.success) {
      throw new Error(`Extract action failed: ${result.error}`);
    }

    return result;
  }
}

export class ContextMenuStrategy extends BaseActionStrategy {
  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
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

    const result = await this.executeInWebview(webview, script);

    if (!result.success) {
      throw new Error(`Context menu action failed: ${result.error}`);
    }

    // Wait for context menu to appear
    await this.wait(1000);
    return result;
  }
}
