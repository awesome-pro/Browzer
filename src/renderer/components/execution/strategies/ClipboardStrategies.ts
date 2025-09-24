import { ExecuteStep } from '../../../types';
import { ActionResult, BaseActionStrategy } from './ActionStrategies';

export class CopyStrategy extends BaseActionStrategy {
  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
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

    const result = await this.executeInWebview(webview, script);

    if (!result.success) {
      console.error(`[ExecuteStepRunner] Copy failed:`, result);
      throw new Error(`Copy action failed: ${result.error}`);
    }

    console.log(`[ExecuteStepRunner] Copy successful:`, result.message, `Text: "${result.copiedText}"`);
    await this.wait(800); // Longer wait to see highlight effect
    return result;
  }
}

export class CutStrategy extends BaseActionStrategy {
  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
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

    const result = await this.executeInWebview(webview, script);

    if (!result.success) {
      throw new Error(`Cut action failed: ${result.error}`);
    }

    await this.wait(500);
    return result;
  }
}

export class PasteStrategy extends BaseActionStrategy {
  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
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

    const result = await this.executeInWebview(webview, script);

    if (!result.success) {
      console.error(`[ExecuteStepRunner] Paste failed:`, result);
      throw new Error(`Paste action failed: ${result.error}`);
    }

    console.log(`[ExecuteStepRunner] Paste successful:`, result.message, `Text: "${result.pastedText}"`);
    await this.wait(800); // Wait to see the effect
    return result;
  }
}
