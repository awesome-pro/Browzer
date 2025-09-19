import { IpcRenderer } from '../types';
import { TabManager } from './TabManager';
import { WebviewManager } from './WebviewManager';

// Core interfaces from DoAgent.ts
export interface DoTask {
  id: string;
  instruction: string;
  steps: DoStep[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

export interface DoStep {
  id: string;
  action: 'navigate' | 'click' | 'type' | 'wait' | 'extract' | 'scroll' | 'analyze' | 
          'select' | 'hover' | 'focus' | 'blur' | 'keypress' | 'clear' | 
          'wait_for_element' | 'wait_for_text' | 'screenshot' | 'evaluate' |
          'select_dropdown' | 'check' | 'uncheck' | 'double_click' | 'right_click' |
          'wait_for_dynamic_content' | 'complete';
  target?: string;
  value?: string;
  selector?: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  reasoning?: string;
  options?: {
    timeout?: number;
    waitAfter?: boolean;
    multiple?: boolean;
    index?: number;
    key?: string;
    button?: 'left' | 'right' | 'middle';
    clickCount?: number;
    delay?: number;
    position?: { x: number; y: number };
  };
}

export interface DoResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTime: number;
}

export interface PageState {
  url: string;
  title: string;
  dom: string;
  screenshot?: string;
  interactiveElements: ElementInfo[];
  rawHTML?: string;
  visibleText?: string;
  detectedPatterns?: {
    prices: string[];
    times: string[];
    hasContent: boolean;
    contentLength: number;
  };
}

export interface ElementInfo {
  tag: string;
  text: string;
  selector: string;
  type?: string;
  placeholder?: string;
  value?: string;
  href?: string;
  visible: boolean;
  clickable: boolean;
  id?: string;
  className?: string;
  name?: string;
  ariaLabel?: string;
  ariaRole?: string;
  dataTestId?: string;
  checked?: boolean;
  selected?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  options?: string[];
  parentText?: string;
  siblingText?: string;
  position?: { x: number; y: number; width: number; height: number };
  isInViewport?: boolean;
  tabIndex?: number;
  contentEditable?: boolean;
  hasDropdown?: boolean;
  isDateInput?: boolean;
  isSearchInput?: boolean;
}

// System prompt from DoAgent.ts - contains all automation rules and strategies
const SYSTEM_PROMPT = `You are an expert browser automation assistant. You execute tasks by taking single atomic actions.

SMART SEARCH STRATEGY - Choose the RIGHT approach for each task:

🛒 SHOPPING TASKS → Go DIRECTLY to retailer websites:
- "cheapest airpods on amazon" → Navigate to amazon.com, search "Apple AirPods", sort by price
- "buy nike shoes" → Navigate to nike.com or amazon.com directly
- "compare phone prices" → Navigate to amazon.com, bestbuy.com, or comparison sites
- DON'T search Google for "airpods on amazon" - go straight to amazon.com!

✈️ TRAVEL TASKS → Use Google search with FULL DETAILS first:
- "flights from LA to NYC august 15-19" → Search Google for "flights from Los Angeles to New York August 15 to 19" (auto-fills everything!)
- "hotels in Paris December 20-25" → Search Google for "hotels in Paris December 20 to 25"
- "car rental Miami airport" → Search Google for "car rental Miami airport"
- ⚠️ AVOID manually filling complex travel forms - let Google do the work!

📱 SOCIAL MEDIA/CONTENT → Go to specific platforms:
- "twitter bookmarks" → Navigate to x.com/i/bookmarks
- "youtube videos about X" → Navigate to youtube.com, search for X
- "linkedin profile" → Navigate to linkedin.com

🔍 RESEARCH/GENERAL INFO → Use Google for broad research:
- "what is machine learning" → Search on Google
- "news about AI" → Search on Google or go to news sites
- "how to cook pasta" → Search on Google
- "compare X vs Y" → Search on Google for comparisons
- "reviews of X" → Search on Google for reviews

TELEGRAM SEARCHES: EXAMPLE CASES:
- "find my chat with CB Ventures on Telegram" → Navigate to web.telegram.org, FIRST click on the search bar, once the cursor is blinking then type the search query "CB Ventures" and press enter.
- "find my chat with CB Ventures on Telegram and open it" → Navigate to web.telegram.org, FIRST click on the search bar, once the cursor is blinking then type the search query "CB Ventures", press enter and then click on the chat with the name "CB Ventures".

CRITICAL RULES:
1. ALWAYS verify elements are in viewport before interacting (check isInViewport flag)
2. For elements not in viewport, first use "scroll" to bring them into view
3. For dropdowns/selects: If it's a native <select>, use "select_dropdown" with the option text as value
4. For date inputs: Use "type" with format "YYYY-MM-DD" for native date inputs
5. For search/autocomplete inputs: Type the value, then "wait" 1000-2000ms for suggestions. NOTE: Search inputs automatically press Enter after typing ALWAYS, so you don't need a separate keypress action.
6. ALWAYS use "wait" after actions that trigger dynamic changes
7. Use "wait_for_element" when you expect an element to appear after an action
8. Use "wait_for_dynamic_content" for sites with heavy JavaScript (Google Flights, etc.) before extracting
9. CRITICAL FOR FLIGHT SEARCHES: After typing a flight search query, ALWAYS use "wait_for_dynamic_content" to wait for Google search results to load, then look for Google Flights links to click
10. For complex forms, fill fields one by one, don't rush
11. Use "extract" periodically to understand current page state
12. Use "complete" ONLY when the task is fully accomplished with a detailed summary
13. If you've done 3+ extractions in a row, consider completing the task
14. If you need to search for something, first "click" on the search bar, wait 1000ms then type in the search bar. The system will automatically press Enter for search inputs.

AVAILABLE ACTIONS:
- navigate: Go to a URL
- click: Click an element
- type: Type text into an input
- wait: Wait for milliseconds (value = milliseconds)
- extract: Get comprehensive page data
- complete: Task is done (include detailed result)
- select_dropdown: Select option from dropdown (value = option text)
- wait_for_element: Wait for element to appear (value = selector to wait for)
- wait_for_dynamic_content: Wait for dynamic content to load (for Google Flights, etc.)
- clear: Clear an input field
- focus: Focus an element
- hover: Hover over an element
- keypress: Press a key (options.key = key name)
- check/uncheck: Check or uncheck a checkbox
- double_click: Double click an element
- right_click: Right click an element

OUTPUT FORMAT:
Respond with ONLY a JSON object in this format:
{
  "action": "navigate|click|type|wait|extract|complete|select_dropdown|wait_for_element|clear|focus|hover|keypress|check|uncheck",
  "selector": "exact_css_selector_from_elements_list",
  "value": "text_to_type_or_option_to_select",
  "target": "url_for_navigate",
  "description": "clear_description_of_what_this_action_does",
  "reasoning": "detailed_explanation_of_why_this_specific_action_is_needed_now_and_how_it_advances_the_current_todo_step",
  "result": "final_result_summary_only_if_action_is_complete",
  "options": {
    "timeout": 5000,
    "waitAfter": true,
    "key": "Enter|Tab|Escape|etc_for_keypress",
    "delay": 100
  }
}

BE PATIENT AND THOROUGH. Better to take more steps and succeed than rush and fail.`;

/**
 * DoTaskService handles AI-powered browser automation tasks
 * Based on the working DoAgent.ts implementation
 */
export class DoTaskService {
  private ipcRenderer: IpcRenderer;
  private tabManager: TabManager;
  private webviewManager: WebviewManager;
  private currentTask: DoTask | null = null;
  private isExecuting = false;
  private maxSteps = 20;
  private stepCount = 0;
  private playwrightPage: any = null;

  constructor(
    ipcRenderer: IpcRenderer,
    tabManager: TabManager,
    webviewManager: WebviewManager,
    private onProgress?: (task: DoTask, step: DoStep) => void
  ) {
    this.ipcRenderer = ipcRenderer;
    this.tabManager = tabManager;
    this.webviewManager = webviewManager;
  }

  public initialize(): void {
    console.log('[DoTaskService] Initializing DoTask automation service...');
    // Service is ready to execute tasks
  }

  public async executeTask(instruction: string): Promise<DoResult> {
    if (this.isExecuting) {
      throw new Error('DoTaskService is already executing a task');
    }

    this.isExecuting = true;
    this.stepCount = 0;
    const startTime = Date.now();

    try {
      // Get the active webview for automation
      const webview = this.tabManager.getActiveWebview();
      if (!webview) {
        throw new Error('No active webview available for automation');
      }

      // Initialize Playwright wrapper for this webview
      await this.initializePlaywrightWrapper(webview);

      const task: DoTask = {
        id: `task-${Date.now()}`,
        instruction,
        steps: [],
        status: 'running'
      };

      this.currentTask = task;
      console.log('[DoTaskService] Starting LLM-powered task execution:', instruction);

      // Start the iterative execution loop (from DoAgent.ts)
      let isTaskComplete = false;
      let finalResult = null;

      while (!isTaskComplete && this.stepCount < this.maxSteps) {
        this.stepCount++;
        console.log(`[DoTaskService] Starting step ${this.stepCount} of ${this.maxSteps}`);
        
        // Analyze current page state
        const pageState = await this.analyzePageState();
        
        // Ask LLM for next action
        const nextAction = await this.getNextActionFromLLM(instruction, pageState, task.steps);
        console.log(`[DoTaskService] LLM suggested action: ${nextAction.action} - ${nextAction.description}`);
        
        if (nextAction.action === 'complete') {
          isTaskComplete = true;
          finalResult = nextAction.result;
          break;
        }

        // Execute the action
        const step: DoStep = {
          id: `step-${this.stepCount}`,
          action: nextAction.action,
          target: nextAction.target,
          value: nextAction.value,
          selector: nextAction.selector,
          description: nextAction.description,
          reasoning: nextAction.reasoning,
          status: 'running'
        };

        task.steps.push(step);

        // Call progress callback
        if (this.onProgress) {
          this.onProgress(task, step);
        }

        try {
          console.log(`[DoTaskService] Executing step ${this.stepCount}: ${step.action} - ${step.description}`);
          await this.executeStep(step);
          step.status = 'completed';
          console.log(`[DoTaskService] Step ${this.stepCount} completed successfully`);
        } catch (error) {
          step.status = 'failed';
          step.error = (error as Error).message;
          console.error(`[DoTaskService] Step ${this.stepCount} failed: ${step.description}`, error);
          
          // If this is a critical error, stop execution
          if (step.action === 'navigate' && this.stepCount <= 2) {
            task.status = 'failed';
            task.error = step.error;
            break;
          }
        }

        // Add a small delay between steps
        await this.wait(1000);
      }

      if (this.stepCount >= this.maxSteps) {
        task.status = 'failed';
        task.error = 'Maximum number of steps reached';
      } else if (!task.error) {
        task.status = 'completed';
        task.result = finalResult;
      }

      const executionTime = Date.now() - startTime;
      
      return {
        success: task.status === 'completed',
        data: task.result,
        error: task.error,
        executionTime
      };

    } catch (error) {
      console.error('[DoTaskService] Task execution failed:', error);
      const executionTime = Date.now() - startTime;
      
      return {
        success: false,
        error: (error as Error).message,
        executionTime
      };
    } finally {
      this.isExecuting = false;
      this.currentTask = null;
      this.stepCount = 0;
      this.playwrightPage = null;
    }
  }

  private async initializePlaywrightWrapper(webview: any): Promise<void> {
    // Create Playwright-like API wrapper (from DoAgent.ts)
    this.playwrightPage = {
      goto: async (url: string) => {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            webview.removeEventListener('did-finish-load', onLoad);
            webview.removeEventListener('did-fail-load', onError);
            reject(new Error(`Navigation timeout for ${url}`));
          }, 30000);
          
          const onLoad = () => {
            clearTimeout(timeout);
            webview.removeEventListener('did-finish-load', onLoad);
            webview.removeEventListener('did-fail-load', onError);
            resolve(webview);
          };
          const onError = (event: any) => {
            clearTimeout(timeout);
            webview.removeEventListener('did-finish-load', onLoad);
            webview.removeEventListener('did-fail-load', onError);
            reject(new Error(`Navigation failed: ${event.errorDescription || 'Unknown error'}`));
          };
          
          webview.addEventListener('did-finish-load', onLoad);
          webview.addEventListener('did-fail-load', onError);
          webview.loadURL(url);
        });
      },

      click: async (selector: string, options?: any) => {
        const script = `
          (() => {
            const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
            if (!element) return { success: false, error: 'Element not found' };
            
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.click();
            
            return { success: true };
          })()
        `;
        
        const result = await webview.executeJavaScript(script);
        if (!result.success) {
          throw new Error(result.error);
        }
        return result;
      },

      fill: async (selector: string, value: string) => {
        const script = `
          (() => {
            const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
            if (!element) throw new Error('Element not found');
            
            element.focus();
            element.value = '${value.replace(/'/g, "\\'")}';
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Auto-Enter for search inputs
            const isSearchInput = element.type === 'search' || element.name === 'q';
            if (isSearchInput) {
              setTimeout(() => {
                const enterEvent = new KeyboardEvent('keydown', {
                  key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
                });
                element.dispatchEvent(enterEvent);
              }, 500);
            }
            
            return { success: true, isSearchInput };
          })()
        `;
        return await webview.executeJavaScript(script);
      },

      waitForSelector: async (selector: string, options?: any) => {
        const timeout = options?.timeout || 5000;
        const script = `
          (async () => {
            const startTime = Date.now();
            while (Date.now() - startTime < ${timeout}) {
              const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
              if (element && getComputedStyle(element).display !== 'none') {
                return { success: true };
              }
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            throw new Error('Timeout waiting for selector: ${selector}');
          })()
        `;
        return await webview.executeJavaScript(script);
      },

      waitForTimeout: async (timeout: number) => {
        return new Promise(resolve => setTimeout(resolve, timeout));
      },

      evaluate: async (script: string | Function, ...args: any[]) => {
        if (typeof script === 'function') {
          const scriptStr = `(${script.toString()})(${args.map(arg => JSON.stringify(arg)).join(',')})`;
          return await webview.executeJavaScript(scriptStr);
        }
        return await webview.executeJavaScript(script);
      },

      content: async () => {
        return await webview.executeJavaScript('document.documentElement.outerHTML');
      }
    };
  }

  private async analyzePageState(): Promise<PageState> {
    // Page analysis script from DoAgent.ts
    const script = `
      (function() {
        try {
          const url = window.location.href;
          const title = document.title;
          
          // Get unique selector for element
          const getUniqueSelector = (el) => {
            if (el.id) return '#' + el.id;
            
            let path = [];
            while (el && el.nodeType === Node.ELEMENT_NODE) {
              let selector = el.nodeName.toLowerCase();
              
              if (el.className && typeof el.className === 'string' && el.className.trim()) {
                selector += '.' + el.className.trim().split(/\\s+/).join('.');
              }
              
              path.unshift(selector);
              if (el.id || path.length > 4) break;
              el = el.parentNode;
            }
            
            return path.join(' > ');
          };
          
          // Get all interactive elements
          const interactiveElements = [];
          const selectors = [
            'input', 'button', 'a', 'select', 'textarea', 
            '[role="button"]', '[role="link"]', '[contenteditable="true"]',
            '[onclick]', '[tabindex]', 'label'
          ];
          
          selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach((el, index) => {
              const rect = el.getBoundingClientRect();
              const styles = getComputedStyle(el);
              const isVisible = rect.width > 0 && rect.height > 0 && 
                               styles.visibility !== 'hidden' && styles.display !== 'none';
              
              if (isVisible) {
                const text = el.textContent?.trim() || '';
                interactiveElements.push({
                  tag: el.tagName.toLowerCase(),
                  text: text.substring(0, 100),
                  selector: getUniqueSelector(el),
                  type: el.type || '',
                  placeholder: el.placeholder || '',
                  value: el.value || '',
                  visible: isVisible,
                  clickable: el.tagName === 'BUTTON' || el.tagName === 'A' || el.onclick !== null,
                  id: el.id || '',
                  className: el.className || ''
                });
              }
            });
          });
          
          return {
            url,
            title,
            dom: document.body.innerHTML.substring(0, 5000),
            interactiveElements: interactiveElements.slice(0, 20),
            visibleText: document.body.innerText.substring(0, 5000)
          };
        } catch (error) {
          return {
            url: window.location.href,
            title: document.title,
            dom: 'Error analyzing DOM: ' + error.message,
            interactiveElements: [],
            visibleText: document.body?.innerText?.substring(0, 1000) || ''
          };
        }
      })();
    `;

    try {
      const webview = this.tabManager.getActiveWebview();
      const result = await webview.executeJavaScript(script);
      return result;
    } catch (error) {
      console.error('[DoTaskService] Failed to analyze page state:', error);
      return {
        url: '',
        title: '',
        dom: 'Failed to analyze page',
        interactiveElements: [],
        visibleText: ''
      };
    }
  }

  private async getNextActionFromLLM(instruction: string, pageState: PageState, previousSteps: DoStep[]): Promise<any> {
    try {
      // Get API configuration
      const provider = this.getSelectedProvider();
      const apiKey = localStorage.getItem(`${provider}_api_key`);
      
      if (!apiKey) {
        throw new Error(`No API key found for ${provider}`);
      }

      const prompt = this.buildPrompt(instruction, pageState, previousSteps);
      
      // Call LLM via IPC (from DoAgent.ts pattern)
      const response = await this.ipcRenderer.invoke('call-llm', {
        provider: provider as 'anthropic' | 'openai',
        apiKey: apiKey,
        systemPrompt: SYSTEM_PROMPT,
        prompt: prompt,
        maxTokens: 1000
      });

      if (!response.success) {
        throw new Error(response.error || 'LLM call failed');
      }

      return this.parseActionFromResponse(response.response);

    } catch (error) {
      console.error('[DoTaskService] Failed to get action from LLM:', error);
      
      // Fallback action
      return {
        action: 'complete',
        description: 'LLM analysis failed',
        result: { error: (error as Error).message }
      };
    }
  }

  private buildPrompt(instruction: string, pageState: PageState, previousSteps: DoStep[]): string {
    const recentSteps = previousSteps.slice(-3);
    const stepHistory = recentSteps.map(step => 
      `${step.action}: ${step.description} (${step.status})${step.error ? ' - ERROR: ' + step.error : ''}`
    ).join('\n');

    const elementsList = pageState.interactiveElements.map((el, index) => {
      let desc = `${index + 1}. ${el.tag}`;
      if (el.text) desc += ` "${el.text.substring(0, 50)}"`;
      desc += ` [${el.selector}]`;
      if (el.type) desc += ` type="${el.type}"`;
      if (el.placeholder) desc += ` placeholder="${el.placeholder}"`;
      return desc;
    }).join('\n');

    return `TASK: Complete this instruction: "${instruction}"

CURRENT STATE:
URL: ${pageState.url}
Title: ${pageState.title}

RECENT STEPS:
${stepHistory || 'Starting task'}

INTERACTIVE ELEMENTS:
${elementsList}

PAGE CONTENT:
${(pageState.visibleText || '').substring(0, 1000)}

What is the NEXT SINGLE ACTION? Respond with JSON only.`;
  }

  private parseActionFromResponse(response: string): any {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const action = JSON.parse(jsonMatch[0]);
      
      if (!action.action || !action.description) {
        throw new Error('Invalid action format');
      }

      return action;
    } catch (error) {
      console.error('[DoTaskService] Failed to parse LLM response:', error);
      return {
        action: 'wait',
        value: '2000',
        description: 'Failed to parse LLM response, waiting',
        reasoning: 'Error in response parsing'
      };
    }
  }

  private async executeStep(step: DoStep): Promise<void> {
    console.log('[DoTaskService] Executing step:', step.description);

    try {
      switch (step.action) {
        case 'navigate':
          await this.playwrightPage.goto(step.target!);
          break;
        case 'type':
          const typeResult = await this.playwrightPage.fill(step.selector!, step.value!);
          // Wait for auto-Enter if it's a search input
          if (typeResult && typeResult.isSearchInput) {
            await this.wait(3000);
          }
          break;
        case 'click':
          await this.playwrightPage.click(step.selector!);
          break;
        case 'wait':
          await this.wait(parseInt(step.value!));
          break;
        case 'extract':
          step.result = await this.extractPageContent(this.tabManager.getActiveWebview());
          break;
        case 'wait_for_element':
          await this.playwrightPage.waitForSelector(step.value!, { timeout: step.options?.timeout || 5000 });
          break;
        case 'wait_for_dynamic_content':
          await this.waitForDynamicContent(step.options?.timeout || 10000);
          break;
        default:
          throw new Error(`Unknown action: ${step.action}`);
      }

      if (step.options?.waitAfter) {
        await this.wait(1000);
      }

    } catch (error) {
      console.error('[DoTaskService] Step failed:', step.description, error);
      throw error;
    }
  }

  private async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async extractPageContent(webview: any): Promise<any> {
    try {
      const extractScript = `
        (function() {
          try {
            const title = document.title || '';
            
            let description = "";
            try {
              const metaDesc = document.querySelector('meta[name="description"]');
              if (metaDesc) description = metaDesc.getAttribute('content') || '';
            } catch(e) {
              console.error('Error getting meta description:', e);
            }
            
            // Get both text content and full HTML
            const mainContent = document.querySelector('article') || 
                              document.querySelector('main') || 
                              document.querySelector('.content') ||
                              document.querySelector('#content') ||
                              document.body;
            
            const bodyText = mainContent ? mainContent.innerText.replace(/\\s+/g, ' ').trim() : '';
            const bodyHTML = mainContent ? mainContent.innerHTML : document.body.innerHTML;
            
            return {
              title: title,
              description: description,
              content: bodyText,
              html: bodyHTML,
              url: window.location.href
            };
          } catch(finalError) {
            console.error('Fatal error in content extraction:', finalError);
            return {
              title: document.title || '',
              description: '',
              content: 'Error extracting content: ' + finalError.message,
              html: '',
              url: window.location.href
            };
          }
        })();
      `;
      
      const result = await webview.executeJavaScript(extractScript);
      return result || { title: '', description: '', content: '', html: '', url: '' };
    } catch (error) {
      console.error('Error in extractPageContent:', error);
      return { title: '', description: '', content: '', html: '', url: '' };
    }
  }

  private async waitForDynamicContent(timeout: number = 10000): Promise<void> {
    console.log('[DoTaskService] Waiting for dynamic content to load...');
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const webview = this.tabManager.getActiveWebview();
      const result = await webview.executeJavaScript(`
        (function() {
          const contentElements = document.querySelectorAll('[data-testid], [role="main"], main, article, .content, .results');
          const loadingElements = document.querySelectorAll('[aria-label*="loading"], [role="progressbar"], .loading');
          
          return {
            hasContent: contentElements.length > 0,
            isLoading: loadingElements.length > 0,
            contentCount: contentElements.length
          };
        })()
      `);
      
      if (result && result.hasContent && !result.isLoading) {
        console.log(`[DoTaskService] Dynamic content loaded: ${result.contentCount} elements`);
        return;
      }
      
      await this.wait(500);
    }
    
    console.log('[DoTaskService] Timeout waiting for dynamic content, proceeding anyway');
  }

  private getSelectedProvider(): string {
    const modelSelector = document.getElementById('modelSelector') as HTMLSelectElement;
    return modelSelector ? modelSelector.value : 'anthropic';
  }

  public getCurrentTask(): DoTask | null {
    return this.currentTask;
  }

  public isCurrentlyExecuting(): boolean {
    return this.isExecuting;
  }

  public destroy(): void {
    console.log('[DoTaskService] Destroying DoTask service...');
    if (this.isExecuting) {
      console.warn('[DoTaskService] Destroying service while task is executing');
    }
    this.currentTask = null;
    this.isExecuting = false;
    this.playwrightPage = null;
  }
}
