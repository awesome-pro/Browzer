import { ActionType, ElementContext, SmartRecordingSession } from './types';

export class PromptGenerator {
  
  /**
   * Generates the user prompt - just the task instruction
   */
  static generateUserPrompt(taskInstruction: string): string {
    return taskInstruction;
  }
  
  /**
   * Generates the system prompt with recording context
   */
  static generateSystemPrompt(session: SmartRecordingSession): string {
    
    return `You are a browser automation expert that generates precise action sequences based on recorded workflows.

## YOUR TASK
Generate a JSON array of actions to automate the user's requested task. Use the recorded workflow pattern as a template, but INTELLIGENTLY OPTIMIZE the workflow by skipping unnecessary intermediate steps when there's a direct path to the goal.

## RECORDED WORKFLOW REFERENCE
${this.formatRecordedActions(session)}

## ACTION FORMAT SPECIFICATION
Each action must be a JSON object with these exact fields:
{
  "action": string,  // The action type (see supported actions below)
  "target": string,  // Element identifier or URL
  "value": string | number,  // Value for the action (text, key name, milliseconds)
  "reasoning": string  // Brief explanation
}

## SUPPORTED ACTIONS
- **navigate**: Go to a URL
  - target: Full URL (https://example.com)
  - value: empty string
  
- **click**: Click an element
  - target: Element identifier
  - value: empty string
  
- **type**: Type text into an input
  - target: Element identifier
  - value: The text to type
  
- **select**: Select an option from dropdown/combobox/autocomplete
  - target: Select element identifier (select tag or input with role="combobox")
  - value: Option value or text to select
  
- **select_radio**: Select a radio button
  - target: Radio button identifier
  - value: Radio button value
  
- **select_checkbox**: Check/uncheck a checkbox
  - target: Checkbox identifier
  - value: true (to check) or false (to uncheck)
  
- **adjust_slider**: Adjust a range slider
  - target: Range input identifier
  - value: Numeric value within slider's min-max range
  
- **keypress**: Press a keyboard key
  - target: Element identifier (or empty for active element)
  - value: Key name (Enter, Backspace, Tab, etc.)
  
- **submit**: Submit a form by clicking submit button/input
  - target: Submit button/input identifier (or "form" to auto-find button)
  - value: empty string
  
- **wait**: Wait for milliseconds
  - target: empty string
  - value: Number of milliseconds
  
- **wait_for_element**: Wait for element to appear
  - target: Element identifier
  - value: Timeout in milliseconds (optional, default 15000)

## ELEMENT IDENTIFIER FORMAT
Elements must be identified using this format:
tagname#id.classname[attribute='value']@textcontent

Examples:
- textarea#APjFqb (textarea with ID)
- input[name='q'] (input with name attribute)
- button.primary@Submit (button with class and text)
- span@Settings (span containing text "Settings")
- a[href='/new'] (link with href)
- form (just the tag name)

You can combine multiple identifiers:
- input#repository-name-input[name='repository_name']
- button[type='submit']@Create Repository

## WORKFLOW OPTIMIZATION PRINCIPLES

### 🎯 SKIP UNNECESSARY STEPS - BE SMART!
**The recorded workflow shows HOW the user did it, but you should generate the MOST EFFICIENT way to achieve the same goal.**

#### When to Skip Steps (ALWAYS consider these optimizations):

1. **Direct Navigation vs Search Engine Route**
   - ❌ DON'T: Google search → Click result → Navigate to site
   - ✅ DO: Direct navigate to the known URL
   - Example: If goal is "go to github.com/new", skip Google search and directly navigate to "https://github.com/new"

2. **Skip Intermediate Navigations**
   - ❌ DON'T: Navigate to homepage → Click button → Navigate to target page
   - ✅ DO: Directly navigate to the target page URL if you know it
   - Example: Skip "github.com" → "click New" and directly go to "github.com/new"

3. **Consolidate Typing Actions**
   - ❌ DON'T: Multiple incremental type actions for the same input
   - ✅ DO: Single type action with the final value
   - Example: Skip "type 'git'" → "type 'github'" and just do "type 'github.com'"

4. **Skip Redundant Clicks**
   - ❌ DON'T: Click input → Type → Click somewhere else → Click input again
   - ✅ DO: Click input once → Type → Continue

5. **Skip Autocomplete Navigation Steps**
   - ❌ DON'T: Type partial text → ArrowDown → Enter to select autocomplete
   - ✅ DO: Type complete text → Press Enter (or just navigate directly if URL is known)

#### When NOT to Skip Steps (CRITICAL - Follow these strictly):

1. **Authentication & Security**: Never skip login, 2FA, captcha, or verification steps
2. **Form Validation**: Don't skip steps that trigger validation or enable submit buttons
3. **Dynamic Content Loading**: Keep waits for elements that load asynchronously
4. **State-Dependent Actions**: Don't skip actions that change application state required for next steps
5. **Multi-Step Processes**: Keep all steps in checkout, payment, or multi-page forms
6. **User Input Required**: Never skip steps where user must make choices (unless you have the exact value)

### 💡 OPTIMIZATION EXAMPLES:

**Example 1: GitHub Repo Creation**
- Recorded: Google search "github.com" -> Click result -> Click "New" button -> Fill form
- Optimized: navigate "https://github.com/new" -> Fill form
- Saved: 3 steps, reduced errors, faster execution

**Example 2: E-commerce Product Search**
- Recorded: Google "amazon.in" -> Click result -> Search product -> Click product
- Optimized: navigate "https://www.amazon.in" -> Search product -> Click product
- Saved: 2 steps (Google search eliminated)

**Example 3: Form Filling**
- Recorded: type "new" -> type "new" -> type "new descripto" -> type "new descripton"
- Optimized: type "new descripton"
- Saved: 3 redundant typing steps

## CRITICAL RULES
1. **NEVER use comma-separated selectors** - Use a single, most specific identifier
2. **Prefer IDs when available** - They are most reliable
3. **Use text content for buttons and links** - button@Submit, a@New
4. **For forms, click the submit button** - Don't use form.submit(), use click on button
5. **Add waits between actions** - Especially after navigation or clicks
6. **Keep selectors simple** - Don't overcomplicate with multiple attributes
7. **OPTIMIZE RUTHLESSLY** - If you can skip 5 steps safely, do it. Speed and reliability matter.
8. **THINK BEFORE EACH STEP** - Ask: "Is this step absolutely necessary, or can I achieve the goal more directly?"

## RESPONSE FORMAT
Your response must be a valid JSON array of action objects. Do not include any explanations or markdown formatting outside the JSON array.

## EXAMPLE OUTPUT
[
  {
    "action": "navigate",
    "target": "https://github.com/new",
    "value": "",
    "reasoning": "Navigate to GitHub new repository page"
  },
  {
    "action": "wait_for_element",
    "target": "input#repository-name-input",
    "value": 5000,
    "reasoning": "Wait for repository name input"
  },
  {
    "action": "type",
    "target": "input#repository-name-input",
    "value": "my-new-repo",
    "reasoning": "Enter repository name"
  },
  {
    "action": "type",
    "target": "input[name='Description']",
    "value": "This is my repository",
    "reasoning": "Enter repository description"
  },
  {
    "action": "click",
    "target": "button[type='submit']@Create repository",
    "value": "",
    "reasoning": "Click submit button to create repository"
  }
]
\`\`\`

## IMPORTANT GUIDELINES
1. **OPTIMIZE FIRST** - Always look for opportunities to skip unnecessary steps
2. **Direct Navigation** - If you know the target URL, navigate directly instead of clicking through
3. **Consolidate Actions** - Combine multiple similar actions into one when possible
4. **Match action types** - Use exactly as specified in SUPPORTED ACTIONS
5. **Precise identifiers** - Follow the element identifier format guidelines
6. **Include all required fields** - action, target, value, reasoning
7. **Concise reasoning** - Brief but descriptive explanations
8. **Ensure goal achievement** - The optimized sequence must accomplish the user's task
9. **Appropriate waits** - Include waits for page loads and async elements
10. **Safety first** - Never skip steps that could cause errors or change critical state
11. **Navigation over click** - If a click leads to navigation and you are confirmed of target URL, navigate directly instead of clicking.
${this.generateAdditionalGuidelines(session)}`;
  }



  /**
   * Formats recorded actions into a readable reference format
   */
  private static formatRecordedActions(session: SmartRecordingSession): string {
    if (!session || !session.actions || session.actions.length === 0) {
      return 'No recorded actions available.';
    }

    return session.actions.map((action, index) => {

      const targetSelector = this.formatElementIdentifier(action.target);
      

      let step = `${index + 1}. [${action.type}] ${this.formatActionDescription(action)}`;
      
      if (targetSelector) {
        step += `\n   └─ TARGET: ${targetSelector}`;
      }
      
      if (action.intent) {
        step += `\n   └─ INTENT: ${action.intent}`;
      }
      
      if (action.value !== undefined && action.value !== null) {
        const valueStr = typeof action.value === 'object' 
          ? JSON.stringify(action.value) 
          : `"${action.value}"`;
        step += `\n   └─ VALUE: ${valueStr}`;
      }
      
      step += `\n   └─ TIMESTAMP: ${action.timestamp}`;
      
      return step;
    }).join('\n\n');
  }

  /**
   * Formats an element context into the element identifier format
   * that the ExecuteStepRunner expects
   */
  private static formatElementIdentifier(element: ElementContext): string {
    if (!element) return '';

    const parts: string[] = [];
    

    if (element.description) {
      parts.push(element.description);
    }
    

    let identifier = '';
    

    if (element.parentElement?.tagName) {
      identifier += element.parentElement.tagName.toLowerCase();
    } else if (element.parentContext?.tagName) {
      identifier += element.parentContext.tagName.toLowerCase();
    }
    

    if (element.uniqueIdentifiers?.some(id => id.includes('#'))) {
      const idSelector = element.uniqueIdentifiers.find(id => id.includes('#'));
      if (idSelector) {
        identifier += idSelector;
      }
    } else if (element.parentElement?.id) {
      identifier += `#${element.parentElement.id}`;
    } else if (element.parentContext?.id) {
      identifier += `#${element.parentContext.id}`;
    }
    

    if (element.parentElement?.className) {
      identifier += `.${element.parentElement.className.split(' ')[0]}`;
    } else if (element.parentContext?.className) {
      identifier += `.${element.parentContext.className.split(' ')[0]}`;
    }
    

    if (element.role) {
      identifier += `[role="${element.role}"]`;
    }
    
    if (element.href) {
      identifier += `[href="${element.href}"]`;
    }
    

    if (element.text) {
      identifier += `@${element.text}`;
    }
    

    if (!identifier && element.selector) {
      identifier = element.selector;
    }
    

    if (!identifier && element.xpath) {
      identifier = `xpath:${element.xpath}`;
    }
    
    return identifier || parts.join(' ');
  }

  /**
   * Creates a human-readable description of an action
   */
  private static formatActionDescription(action: any): string {
    switch (action.type) {
      case ActionType.CLICK:
        return `Click "${this.getElementDescription(action.target)}"`;
        
      case ActionType.TYPE:
        return `Enter "${action.value}" in "${this.getElementDescription(action.target)}"`;
        
      case ActionType.NAVIGATION:
        if (action.target && action.target.targetUrl) {
          return `Navigate to "${action.target.targetUrl}"`;
        } else if (action.value && typeof action.value === 'object' && action.value.url) {
          return `Navigate to "${action.value.url}"`;
        } else if (action.target && action.target.url) {
          return `Navigate to "${action.target.url}"`;
        }
        return `Navigate to new page`;
        
      case ActionType.KEYPRESS:
        return `Press ${action.value} key`;
        
      case ActionType.SUBMIT:
        return `Submit form`;
        
      case ActionType.WAIT:
        return `Wait for ${action.value}ms`;
        
      case ActionType.WAIT_FOR_ELEMENT:
        return `Wait for element "${this.getElementDescription(action.target)}" to appear`;
      
      case ActionType.SELECT:
        if (action.value && typeof action.value === 'string') {
          try {
            const valueObj = JSON.parse(action.value);
            if (valueObj.selectedText || valueObj.selectedValue) {
              return `Select "${valueObj.selectedText || valueObj.selectedValue}" from "${this.getElementDescription(action.target)}"`;
            }
          } catch (e) {
            // Not JSON, use as-is
          }
        }
        return `Select option from "${this.getElementDescription(action.target)}"`;
      
      case ActionType.SELECT_RADIO:
        return `Select radio option "${action.value}" in "${this.getElementDescription(action.target)}"`;
      
      case ActionType.TOGGLE_CHECKBOX:
        const checkState = action.value === true || action.value === 'true' ? 'Check' : 'Uncheck';
        return `${checkState} "${this.getElementDescription(action.target)}"`;
      
      case ActionType.SELECT_FILE:
        return `Select file(s) "${action.value}" for "${this.getElementDescription(action.target)}"`;
      
      case ActionType.ADJUST_SLIDER:
        return `Adjust slider to ${action.value} in "${this.getElementDescription(action.target)}"`;
      
      case ActionType.AUTOCOMPLETE_SEARCH:
        if (action.value && typeof action.value === 'string') {
          try {
            const valueObj = JSON.parse(action.value);
            if (valueObj.searchQuery) {
              return `Search "${valueObj.searchQuery}" in autocomplete (${valueObj.resultsCount || 0} results)`;
            }
          } catch (e) {
            // Not JSON
          }
        }
        return `Search in autocomplete`;
        
      default:
        return action.description || `Perform ${action.type} action`;
    }
  }

  /**
   * Gets a human-readable description of an element
   */
  private static getElementDescription(element: ElementContext): string {
    if (!element) return 'unknown element';
    
    if (element.description) {
      return element.description;
    }
    
    const parts: string[] = [];
    
    if (element.elementType) {
      parts.push(element.elementType);
    } else if (element.role) {
      parts.push(element.role);
    }
    
    if (element.text) {
      parts.push(`"${element.text}"`);
    }
    
    if (parts.length === 0) {
      if (element.selector) {
        parts.push(`element with selector: ${element.selector}`);
      } else {
        parts.push('element');
      }
    }
    
    return parts.join(' ');
  }

  /**
   * Generates additional guidelines based on the recording session
   */
  private static generateAdditionalGuidelines(session: SmartRecordingSession): string {
    const guidelines: string[] = [];
    

    const hasFormSubmissions = session.actions.some(a => a.type === ActionType.SUBMIT);
    if (hasFormSubmissions) {
      guidelines.push('8. For form submissions, ensure all required fields are filled before submitting');
    }
    

    const hasNavigations = session.actions.some(a => a.type === ActionType.NAVIGATION);
    if (hasNavigations) {
      guidelines.push('9. Add wait_for_element actions after navigation to ensure the page has loaded');
    }
    

    const hasKeypresses = session.actions.some(a => a.type === ActionType.KEYPRESS);
    if (hasKeypresses) {
      guidelines.push('10. Ensure elements are focused before sending keypress actions');
    }
    
    return guidelines.length > 0 ? '\n' + guidelines.join('\n') : '';
  }

  /**
   * Parses and validates the LLM response to ensure it's compatible with ExecuteStepRunner
   */
  static parseAndValidateResponse(llmResponse: string): any[] | null {
    try {
      let jsonString = this.extractJsonArray(llmResponse);


      if (!jsonString) {
        console.error('No valid JSON array found in the response');
        return null;
      }

      const parsedSteps = JSON.parse(jsonString);

      if (!Array.isArray(parsedSteps)) {
        console.error('Parsed result is not an array');
        return null;
      }
      

      const validatedSteps = parsedSteps.map(step => {

        if (!step.action || typeof step.action !== 'string') {
          throw new Error(`Invalid action: ${JSON.stringify(step)}`);
        }
        
        if (step.target === undefined || step.target === null) {
          step.target = '';
        }
        
        if (step.reasoning === undefined || step.reasoning === null) {
          step.reasoning = 'Automated step';
        }
        
        return {
          action: step.action.toLowerCase(),
          target: String(step.target),
          value: step.value !== undefined ? step.value : '',
          reasoning: String(step.reasoning)
        };
      });
      
      return validatedSteps;
    } catch (error) {
      console.error('Error parsing LLM response:', error);
      return null;
    }
  }

  /**
   * Extracts JSON array from LLM response using balanced bracket parsing
   */
  private static extractJsonArray(response: string): string | null {

    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      return codeBlockMatch[1].trim();
    }


    const arrayStart = response.indexOf('[');
    if (arrayStart === -1) {
      return null;
    }


    let bracketCount = 0;
    let inString = false;
    let escaped = false;
    let arrayEnd = -1;

    for (let i = arrayStart; i < response.length; i++) {
      const char = response[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\' && inString) {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '[') {
          bracketCount++;
        } else if (char === ']') {
          bracketCount--;
          if (bracketCount === 0) {
            arrayEnd = i;
            break;
          }
        }
      }
    }

    if (arrayEnd === -1) {
      console.warn('[PromptGenerator] Could not find matching closing bracket');
      return null;
    }

    const jsonString = response.substring(arrayStart, arrayEnd + 1);
    console.log('[PromptGenerator] Extracted JSON using balanced parsing, length:', jsonString.length);
    return jsonString;
  }
}