import { ExecuteStep } from '../../../types';
import { ActionResult, BaseActionStrategy } from './ActionStrategies';

export class SelectOptionStrategy extends BaseActionStrategy {
  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
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

    const result = await this.executeInWebview(webview, script);

    if (!result.success) {
      throw new Error(`Select option failed: ${result.error}`);
    }

    await this.wait(1000);
    return result;
  }
}

export class ToggleCheckboxStrategy extends BaseActionStrategy {
  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
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

    const result = await this.executeInWebview(webview, script);

    if (!result.success) {
      throw new Error(`Toggle checkbox failed: ${result.error}`);
    }

    await this.wait(500);
    return result;
  }
}

export class SelectRadioStrategy extends BaseActionStrategy {
  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
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

    const result = await this.executeInWebview(webview, script);

    if (!result.success) {
      throw new Error(`Select radio failed: ${result.error}`);
    }

    await this.wait(500);
    return result;
  }
}

export class SelectFileStrategy extends BaseActionStrategy {
  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
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

    const result = await this.executeInWebview(webview, script);

    if (!result.success) {
      throw new Error(`Select file failed: ${result.error}`);
    }

    await this.wait(1000);
    return result;
  }
}

export class AdjustSliderStrategy extends BaseActionStrategy {
  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
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

    const result = await this.executeInWebview(webview, script);

    if (!result.success) {
      throw new Error(`Adjust slider failed: ${result.error}`);
    }

    await this.wait(500);
    return result;
  }
}
