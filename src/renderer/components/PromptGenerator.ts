import { ActionType, ElementContext, SmartRecordingSession } from '../types';

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
    const actions = this.extractActionPatterns(session);
    const elementSelectors = this.extractElementSelectors(session);
    const timingInfo = this.extractTimingInfo(session);
    
    return `You are a browser automation expert that generates precise action sequences based on recorded workflows.

## YOUR TASK
Generate a JSON array of actions to automate the user's requested task. Use the recorded workflow pattern as a template, adapting only the specific values while maintaining the exact action structure.

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
  
- **keypress**: Press a keyboard key
  - target: Element identifier (or empty for active element)
  - value: Key name (Enter, Backspace, Tab, etc.)
  
- **submit**: Submit a form
  - target: "form" or element identifier
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

You can combine multiple identifiers with commas:
- button.btn-primary, [data-testid="submit-button"], .form-actions button[type="submit"]

## RESPONSE FORMAT
Your response must be a valid JSON array of action objects. Do not include any explanations or markdown formatting outside the JSON array.

Example response:
\`\`\`json
[
  {
    "action": "navigate",
    "target": "https://example.com",
    "value": "",
    "reasoning": "Navigate to the target website"
  },
  {
    "action": "click",
    "target": "button.login-btn@Sign in",
    "value": "",
    "reasoning": "Click the sign in button"
  }
]
\`\`\`

## IMPORTANT GUIDELINES
1. Match the action types exactly as specified above
2. Use precise element identifiers following the format guidelines
3. Include all required fields for each action
4. Keep reasoning concise but descriptive
5. Ensure the sequence will accomplish the user's task
6. Adapt to different websites while following the same pattern
7. Include appropriate waits for page loads and element appearances
${this.generateAdditionalGuidelines(session)}`;
  }

  /**
   * Extracts common action patterns from the recording session
   */
  private static extractActionPatterns(session: SmartRecordingSession): string[] {
    if (!session || !session.actions || session.actions.length === 0) {
      return [];
    }

    const patterns: string[] = [];
    const actionCounts = new Map<string, number>();

    // Count action types
    session.actions.forEach(action => {
      const type = action.type;
      actionCounts.set(type, (actionCounts.get(type) || 0) + 1);
    });

    // Extract common sequences (e.g., click followed by type)
    for (let i = 0; i < session.actions.length - 1; i++) {
      const current = session.actions[i];
      const next = session.actions[i + 1];
      const pattern = `${current.type}_${next.type}`;
      
      if (!patterns.includes(pattern)) {
        patterns.push(pattern);
      }
    }

    return Array.from(actionCounts.keys());
  }

  /**
   * Extracts element selectors used in the recording
   */
  private static extractElementSelectors(session: SmartRecordingSession): string[] {
    if (!session || !session.actions || session.actions.length === 0) {
      return [];
    }

    const selectors: string[] = [];
    
    session.actions.forEach(action => {
      if (action.target && action.target.selector) {
        selectors.push(action.target.selector);
      }
    });

    return [...new Set(selectors)]; // Remove duplicates
  }

  /**
   * Extracts timing information from the recording
   */
  private static extractTimingInfo(session: SmartRecordingSession): { 
    averageDelay: number, 
    totalDuration: number 
  } {
    if (!session || !session.actions || session.actions.length <= 1) {
      return { averageDelay: 1000, totalDuration: 0 };
    }

    let totalDelay = 0;
    let count = 0;

    for (let i = 1; i < session.actions.length; i++) {
      const delay = session.actions[i].timestamp - session.actions[i-1].timestamp;
      if (delay > 0 && delay < 30000) { // Ignore unreasonable delays
        totalDelay += delay;
        count++;
      }
    }

    const averageDelay = count > 0 ? Math.round(totalDelay / count) : 1000;
    const totalDuration = session.endTime && session.startTime 
      ? session.endTime - session.startTime 
      : session.actions[session.actions.length - 1].timestamp - session.actions[0].timestamp;

    return { averageDelay, totalDuration };
  }

  /**
   * Formats recorded actions into a readable reference format
   */
  private static formatRecordedActions(session: SmartRecordingSession): string {
    if (!session || !session.actions || session.actions.length === 0) {
      return 'No recorded actions available.';
    }

    return session.actions.map((action, index) => {
      // Format the target in the expected element identifier format
      const targetSelector = this.formatElementIdentifier(action.target);
      
      // Format the action into a readable step
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
    
    // Start with element type/tag name
    if (element.description) {
      parts.push(element.description);
    }
    
    // Format the identifier based on available properties
    let identifier = '';
    
    // Add tag name if available
    if (element.parentElement?.tagName) {
      identifier += element.parentElement.tagName.toLowerCase();
    } else if (element.parentContext?.tagName) {
      identifier += element.parentContext.tagName.toLowerCase();
    }
    
    // Add ID if available
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
    
    // Add class if available
    if (element.parentElement?.className) {
      identifier += `.${element.parentElement.className.split(' ')[0]}`;
    } else if (element.parentContext?.className) {
      identifier += `.${element.parentContext.className.split(' ')[0]}`;
    }
    
    // Add attributes if available
    if (element.role) {
      identifier += `[role="${element.role}"]`;
    }
    
    if (element.href) {
      identifier += `[href="${element.href}"]`;
    }
    
    // Add text content if available
    if (element.text) {
      identifier += `@${element.text}`;
    }
    
    // If we have a selector from the recording, use it as fallback
    if (!identifier && element.selector) {
      identifier = element.selector;
    }
    
    // If we still don't have an identifier, use the xpath as last resort
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
    
    // Check if there are form submissions in the recording
    const hasFormSubmissions = session.actions.some(a => a.type === ActionType.SUBMIT);
    if (hasFormSubmissions) {
      guidelines.push('8. For form submissions, ensure all required fields are filled before submitting');
    }
    
    // Check if there are navigations in the recording
    const hasNavigations = session.actions.some(a => a.type === ActionType.NAVIGATION);
    if (hasNavigations) {
      guidelines.push('9. Add wait_for_element actions after navigation to ensure the page has loaded');
    }
    
    // Check if there are keypresses in the recording
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
      // Extract JSON array from the response (in case it's wrapped in markdown code blocks)
      const jsonMatch = llmResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || 
                        llmResponse.match(/(\[[\s\S]*?\])/);
      
      if (!jsonMatch || !jsonMatch[1]) {
        console.error('No valid JSON array found in the response');
        return null;
      }
      
      const parsedSteps = JSON.parse(jsonMatch[1]);
      
      if (!Array.isArray(parsedSteps)) {
        console.error('Parsed result is not an array');
        return null;
      }
      
      // Validate each step
      const validatedSteps = parsedSteps.map(step => {
        // Ensure all required fields are present
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
}
