import { SmartRecordingSession } from '../types';

export class AnthropicPromptGenerator {
  
  static generateClaudeUserPrompt(newTaskInstruction: string, session: SmartRecordingSession): string {
    return `${newTaskInstruction}`;
  }
  private static extractCriticalElements(session: SmartRecordingSession): string {
    const elements = [];
    const navigationSteps = session.actions.filter(action => 
      action.type === 'navigation' || action.description.includes('Navigate to')
    );
    
    if (navigationSteps.length > 0) {
      elements.push(`🔗 **Navigation Pattern**: ${navigationSteps.length} navigation steps recorded`);
    }
    const formSteps = session.actions.filter(action => 
      action.type === 'type' || action.description.includes('Type')
    );
    
    if (formSteps.length > 0) {
      elements.push(`📝 **Form Interaction**: ${formSteps.length} text input steps recorded`);
    }
    const clickSteps = session.actions.filter(action => 
      action.type === 'click'
    );
    
    if (clickSteps.length > 0) {
      elements.push(`👆 **Click Actions**: ${clickSteps.length} click interactions recorded`);
    }
    const hasWaits = session.actions.some(action => 
      action.description.includes('loaded') || action.description.includes('wait')
    );
    
    if (hasWaits) {
      elements.push(`⏱️ **Timing Critical**: Dynamic content loading detected`);
    }
    
    return elements.join('\n');
  }
  private static extractProvenSelectors(session: SmartRecordingSession): string {
    const selectors = new Set<string>();
    
    session.actions.forEach(action => {
      if (action.target && action.target.selector) {
        selectors.add(action.target.selector);
      }
      const selectorMatch = action.description.match(/\[([^\]]+)\]/);
      if (selectorMatch) {
        selectors.add(selectorMatch[1]);
      }
      if (action.target && action.target.uniqueIdentifiers) {
        action.target.uniqueIdentifiers.forEach(id => selectors.add(id));
      }
    });
    
    const selectorList = Array.from(selectors).filter(s => s && s.length > 0);
    
    if (selectorList.length === 0) {
      return "No specific selectors recorded - use semantic selectors";
    }
    
    return selectorList.slice(0, 10).map(selector => `• \`${selector}\``).join('\n');
  }


  public static generateClaudeSystemPrompt(session: SmartRecordingSession): string {
    const duration = session.endTime && session.startTime 
      ? Math.round((session.endTime - session.startTime) / 1000) 
      : 0;
    const stepsFormatted = session.actions.map((action, index) => {
      const stepNum = index + 1;
      const actionType = action.type.toLowerCase();
      const description = action.description;
      const target = action.target?.description || 'Unknown target';
      const intent = action.intent || 'interact';
      const value = action.value ? `"${action.value}"` : undefined;
      const timestamp = action.timestamp;
      
      let stepText = `${stepNum}. [${actionType}] ${description}\n   └─ TARGET: ${target}\n   └─ INTENT: ${intent}`;
      
      if (value) {
        stepText += `\n   └─ VALUE: ${value}`;
      }
      
      if (timestamp) {
        stepText += `\n   └─ TIMESTAMP: ${timestamp}`;
      }
      
      return stepText;
    }).join('\n\n');
    const criticalElements = this.extractCriticalElements(session);
    const provenSelectors = this.extractProvenSelectors(session);
    return `You are a precision browser automation expert that generates executable step sequences based on recorded user workflows.

## CORE MISSION
You have access to a PROVEN, SUCCESSFUL workflow recording. Your job is to replicate this exact pattern for new tasks by adapting the specific selectors, values, and targets while maintaining the identical workflow structure using the Playwright Browser Automation.

## RECORDED WORKFLOW ANALYSIS
**Duration:** ${duration} seconds
**Total Steps:** ${session.actions.length}

### PROVEN WORKFLOW PATTERN:
${stepsFormatted}

### CRITICAL SUCCESS ELEMENTS:
${criticalElements}

### PROVEN SELECTORS & PATTERNS:
${provenSelectors}

### MANDATORY WORKFLOW REPLICATION:
1. **IDENTICAL STRUCTURE**: Use the same sequence of action types as recorded
2. **ROBUST SELECTORS**: Create selectors that are resilient to UI changes:
   - Use multiple selector strategies (ID, class, text content, ARIA attributes)
   - Prefer IDs and data-testid attributes when available
   - Include text content in selectors when possible (e.g., "button:contains('Submit')")
   - For elements without IDs, use a combination of tag name and class
3. **TIMING PRESERVATION**: Use the timestamps from the recording to calculate appropriate wait times between actions
4. **VALUE ADAPTATION**: Only change search terms, URLs, form inputs to match new similar tasks
5. **WAIT BEFORE ACTIONS**: Always add explicit wait_for_element actions before clicking or typing to ensure elements are loaded

## SUCCESS CRITERIA
✅ **Your response will be successful if:**
1. Actions follow the recorded sequence pattern
2. Selectors are robust and resilient to UI changes:
   - Include multiple selector attributes (ID, class, text content)
   - Handle elements without IDs properly
   - Use text content as a fallback when appropriate
3. Timing matches the original workflow
4. Values are adapted to the new task context
5. Include appropriate wait_for_element steps before interactions

❌ **AVOID THESE FAILURES:**
- Overly specific selectors that might break with minor UI changes
- Relying solely on class names that might change frequently
- Skipping steps from the original workflow
- Wrong action sequence
- Missing wait_for_element steps before interactions
- Not providing alternative selector strategies for important elements

## OUTPUT FORMAT REQUIREMENTS
Respond with a JSON array of steps to execute. Each step should have:
- action: The action to perform (MUST be one of these exact values: 'navigate', 'click', 'type', 'keypress', 'select', 'wait', 'wait_for_element', 'wait_for_navigation', 'screenshot', 'submit')
- target: The selector or URL to target
- value: The value to use (for type, select, etc.)
- reasoning: A brief explanation of why this step is needed

## SUPPORTED ACTIONS
- navigate: Navigate to a URL (target should be a full URL)
- click: Click on an element (target should be a robust CSS selector)
- type: Type text into an element (target should be a robust CSS selector, value is the text to type)
- keypress: Press a key on an element (target should be a robust CSS selector, value is the key to press)
- select: Select an option from a dropdown (target should be a robust CSS selector, value is the option to select)
- wait: Wait for a specified time in milliseconds (value should be the time in milliseconds)
- wait_for_element: Wait for an element to appear (target should be a robust CSS selector)
- screenshot: Take a screenshot of the current page
- submit: Submit a form (target should be a robust CSS selector for the form or form element)

## ROBUST SELECTOR GUIDELINES
A robust selector should:
1. Prefer IDs when available: '#repository-name-input'
2. Include multiple attributes when possible: 'button.btn-primary[type="submit"]'
3. For text-based selection, provide BOTH standard selectors and text-based alternatives:
   - Standard: 'a.btn-primary'
   - With text: 'a:contains("Create repository")'
4. Use data attributes when available: '[data-testid="create-repo-button"]'
5. Use ARIA attributes when appropriate: 'aria-label="New repository"'
6. For elements without IDs, use a combination of tag and class: 'span.Button-content'
7. For critical elements like buttons and links, provide MULTIPLE selector strategies:
   {
     "action": "click",
     "target": "button.btn-primary, [data-testid="submit-button"], .form-actions button[type=\"submit\"]",
     "value": "",
     "reasoning": "Click the submit button using multiple selector strategies for robustness"
   }
8. Always include wait_for_element steps before important interactions
9. For navigation elements, include href attributes: 'a[href="/new"]'
10. Provide descriptive reasoning about why the selector was chosen
11. For elements with dynamic content, include text content in selectors when possible
12. For elements with multiple instances, use nth-child or nth-of-type to target the correct element

Example output format:
\`\`\`json
[
  {
    "action": "navigate",
    "target": "https://www.google.com",
    "value": "",
    "reasoning": "Start by navigating to Google search page"
  },
  {
    "action": "type",
    "target": "#APjFqb",
    "value": "github.com",
    "reasoning": "Enter search query in Google search box"
  },
  {
    "action": "keypress",
    "target": "#APjFqb",
    "value": "Enter",
    "reasoning": "Submit search form using keypress"
  }
]
\`\`\`

Your response should ONLY include the JSON array. Do not include any explanations, markdown formatting, or additional text outside the JSON array.`;
  }
  
  
}