// Enhanced Prompt Generator specifically optimized for Anthropic Claude
import { SmartRecordingSession, AIReadyContext, ActionType } from '../types';

export class AnthropicPromptGenerator {
  
  static generateClaudeSystemPrompt2(session: SmartRecordingSession): string {
    
    const context = this.convertToClaudeContext(session);
    
    
    return `You are a precision browser automation expert that generates executable step sequences based on recorded user workflows.

## CORE MISSION
You have access to a PROVEN, SUCCESSFUL workflow recording. Your job is to replicate this exact pattern for new tasks by adapting the specific selectors, values, and targets while maintaining the identical workflow structure.

## RECORDED WORKFLOW ANALYSIS
**Duration:** ${Math.round(context.duration / 1000)} seconds
**Total Steps:** ${context.steps.length}

### PROVEN WORKFLOW PATTERN:
${context.steps.map((step, index) => {
  const stepNum = index + 1;
  const action = step.action.toLowerCase();
  const description = step.description;
  const target = step.target;
  const value = step.value;
  const intent = step.intent;
  
  return `${stepNum}. [${action}] ${description}
   └─ TARGET: ${target}
   └─ INTENT: ${intent}${value ? `
   └─ VALUE: "${value}"` : ''}`;
}).join('\n\n')}

### CRITICAL SUCCESS ELEMENTS:
${this.extractCriticalElements(session)}

### PROVEN SELECTORS & PATTERNS:
${this.extractProvenSelectors(session)}

## EXECUTION RULES (CRITICAL - FOLLOW EXACTLY)

🎯 **PRIMARY RULE**: Follow the EXACT same workflow pattern from the recording. Change only the specific values/targets needed for the new task.

### MANDATORY WORKFLOW REPLICATION:
1. **IDENTICAL STRUCTURE**: Use the same sequence of action types as recorded
2. **PROVEN SELECTORS**: Adapt the exact selectors from the recording to match new context  
3. **TIMING PRESERVATION**: Keep all wait times and delays that worked in the original
4. **VALUE ADAPTATION**: Only change search terms, URLs, form inputs to match new task

### SELECTOR ADAPTATION STRATEGY:
- **Google Search**: Use \`#APjFqb\` or \`textarea[name='q']\` (from recording)
- **Form Inputs**: Look for patterns like \`#original_url\`, \`input[name="url"]\`
- **Buttons**: Use text-based selectors like \`button:contains("Create")\`
- **Links**: Use \`a:contains("specific text")\` patterns from recording

### AVAILABLE ACTIONS:
• **navigate** - Go to URL (target: URL)
• **type** - Enter text (target: CSS selector, value: text)
• **click** - Click element (target: CSS selector)
• **wait_for_element** - Wait for element (target: CSS selector, value: timeout_ms)
• **wait_for_dynamic_content** - Wait for page load (value: timeout_ms)
• **wait** - Simple wait (value: milliseconds)
• **keypress** - Press key (target: selector, value: key like "Enter")

**ENHANCED FORM ACTIONS:**
• **select_option** - Select dropdown option (target: select selector, value: option text/value)
• **toggle_checkbox** - Toggle checkbox (target: checkbox selector, value: true/false)
• **select_radio** - Select radio button (target: radio selector, value: option value)
• **select_file** - Select file(s) (target: file input selector, value: file path(s))
• **adjust_slider** - Adjust range slider (target: range selector, value: numeric value)

**CLIPBOARD ACTIONS:**
• **copy** - Copy text from element (target: SIMPLE CSS selector like "h1", ".result-title", "#answer-text")
• **cut** - Cut text from input field (target: input/textarea selector)  
• **paste** - Paste from clipboard (target: input/textarea selector)

**⚠️ CRITICAL COPY ACTION RULES:**
• NEVER use ":contains()" selectors - they don't work in querySelector
• Use SIMPLE selectors: "h1", ".answer-box", "#featured-snippet", "p", "span.result"
• Target visible text elements like headings, paragraphs, or result snippets
• Examples of GOOD copy selectors:
  - "h1" (first heading)
  - ".answer-box" (answer container)
  - "#featured-snippet" (Google featured snippet)
  - "p" (first paragraph)
  - ".result .title" (search result title)

**CONTEXT ACTIONS:**
• **context_menu** - Right-click context menu (target: element selector)

## CRITICAL OUTPUT REQUIREMENTS

⚠️ **RESPOND WITH PURE JSON ONLY** - No explanations, no markdown, no code blocks

**Required JSON Format:**
\`\`\`json
[
  {
    "action": "type",
    "target": "#APjFqb",
    "value": "search query",
    "reasoning": "Enter search query in Google search box"
  },
  {
    "action": "keypress",
    "target": "#APjFqb", 
    "value": "Enter",
    "reasoning": "Submit search form"
  },
  {
    "action": "copy",
    "target": ".hgKElc",
    "value": "",
    "reasoning": "Copy text from Google featured snippet"
  },
  {
    "action": "navigate",
    "target": "https://www.flipkart.com/",
    "value": "",
    "reasoning": "Navigate directly to Flipkart from search results"
  }
]
\`\`\`

**COPY ACTION EXAMPLES (Use these patterns):**
• Copy from Google search result: \`"target": ".yuRUbf h3"\` (result title)
• Copy from featured snippet: \`"target": ".hgKElc"\` (answer text)
• Copy from Wikipedia: \`"target": "p"\` (first paragraph)
• Copy from heading: \`"target": "h1"\` (main title)
• Copy from answer box: \`"target": ".Z0LcW"\` (Google answer)

**🔗 NAVIGATION ACTION EXAMPLES (For external links):**
• Navigate to search result: \`"action": "navigate", "target": "https://flipkart.com"\`
• Navigate to Wikipedia: \`"action": "navigate", "target": "https://en.wikipedia.org/wiki/Topic"\`
• Navigate to any external site: \`"action": "navigate", "target": "https://example.com"\`

**⚠️ CRITICAL LINK CLICKING RULES:**
• For external links in search results, use "navigate" action with the target URL
• NEVER use complex selectors like \`"target": "a[href*='domain.com']"\`
• Extract the actual URL from the recorded workflow and use direct navigation
• Example: Instead of clicking \`"a[href*='flipkart.com']"\`, use \`"navigate"\` to \`"https://www.flipkart.com/"\`

**NEVER DO THESE (Will cause errors):**
• ❌ \`"target": "span:contains('text')"\` - Contains selector doesn't work
• ❌ \`"target": "//div[text()='text']"\` - XPath not supported
• ❌ \`"target": "*:contains('text')"\` - Any contains usage
• ❌ \`"target": "a[href*='domain.com']"\` - Complex link selectors are unreliable

## SUCCESS CRITERIA
✅ **Your response will be successful if:**
1. JSON is valid and parseable
2. Actions follow the recorded sequence pattern
3. Selectors are specific and likely to work
4. Timing matches the original workflow
5. Values are adapted to the new task context

❌ **AVOID THESE FAILURES:**
- Generic selectors that don't match real elements
- Skipping steps from the original workflow
- Wrong action sequence
- Missing wait times for dynamic content`;
  }

  static generateClaudeUserPrompt(newTaskInstruction: string, session: SmartRecordingSession): string {
    return `${newTaskInstruction}`;
  }




  // Helper method to extract critical elements from the session
  private static extractCriticalElements(session: SmartRecordingSession): string {
    const elements = [];
    
    // Extract key navigation points
    const navigationSteps = session.actions.filter(action => 
      action.type === 'navigation' || action.description.includes('Navigate to')
    );
    
    if (navigationSteps.length > 0) {
      elements.push(`🔗 **Navigation Pattern**: ${navigationSteps.length} navigation steps recorded`);
    }
    
    // Extract form interactions
    const formSteps = session.actions.filter(action => 
      action.type === 'type' || action.description.includes('Type')
    );
    
    if (formSteps.length > 0) {
      elements.push(`📝 **Form Interaction**: ${formSteps.length} text input steps recorded`);
    }
    
    // Extract click patterns
    const clickSteps = session.actions.filter(action => 
      action.type === 'click'
    );
    
    if (clickSteps.length > 0) {
      elements.push(`👆 **Click Actions**: ${clickSteps.length} click interactions recorded`);
    }
    
    // Extract timing patterns
    const hasWaits = session.actions.some(action => 
      action.description.includes('loaded') || action.description.includes('wait')
    );
    
    if (hasWaits) {
      elements.push(`⏱️ **Timing Critical**: Dynamic content loading detected`);
    }
    
    return elements.join('\n');
  }

  // Helper method to extract proven selectors
  private static extractProvenSelectors(session: SmartRecordingSession): string {
    const selectors = new Set<string>();
    
    session.actions.forEach(action => {
      if (action.target && action.target.selector) {
        selectors.add(action.target.selector);
      }
      
      // Extract selectors from descriptions
      const selectorMatch = action.description.match(/\[([^\]]+)\]/);
      if (selectorMatch) {
        selectors.add(selectorMatch[1]);
      }
      
      // Extract selectors from element context
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







  /**
   * Convert recording session to Claude-optimized context
   */
  private static convertToClaudeContext(session: SmartRecordingSession): AIReadyContext {
    return {
      task: session.taskGoal,
      description: session.description,
      duration: session.metadata.duration,
      
      steps: session.actions.map((action, index) => ({
        step: index + 1,
        action: this.mapToUnifiedAction(action.type),
        description: action.description,
        target: action.target.description,
        value: action.value,
        intent: action.intent,
        timestamp: action.timestamp
      })),
      
      environment: {
        initialUrl: session.initialContext.url,
        pagesVisited: session.metadata.pagesVisited,
        userAgent: session.initialContext.userAgent,
        viewport: {
          width: session.initialContext.viewport.width,
          height: session.initialContext.viewport.height
        }
      },
      
      pageStructure: this.extractRelevantPageStructures(session)
    };
  }

  private static mapToUnifiedAction(legacyActionType: string): ActionType {
    const actionMap: Record<string, ActionType> = {
      'type': ActionType.TYPE,
      'click': ActionType.CLICK,
      'select': ActionType.SELECT,
      'toggle': ActionType.TOGGLE,
      'submit': ActionType.SUBMIT,
      'navigation': ActionType.NAVIGATION,
      'scroll': ActionType.SCROLL,
      'focus': ActionType.FOCUS,
      'blur': ActionType.BLUR,
      'wait': ActionType.WAIT,
      'keypress': ActionType.KEYPRESS
    };
    
    return actionMap[legacyActionType] || ActionType.CLICK;
  }

  /**
   * Extract only the most relevant page structures for the prompt
   */
  private static extractRelevantPageStructures(session: SmartRecordingSession): Array<any> {
    const structures = new Map();
    
    // Start with initial context
    structures.set(session.initialContext.url, {
      url: session.initialContext.url,
      title: session.initialContext.title,
      keyElements: session.initialContext.keyElements || []
    });
    
    // Add contexts from significant actions only
    session.actions
      .filter(action => ['click', 'type', 'select', 'submit', 'navigate', 'keypress'].includes(this.mapToUnifiedAction(action.type)))
      .forEach(action => {
        if (action.context && !structures.has(action.context.url)) {
          structures.set(action.context.url, {
            url: action.context.url,
            title: action.context.title,
            keyElements: (action.context.keyElements || []).slice(0, 5) // Limit to top 5 elements
          });
        }
      });
    
    return Array.from(structures.values());
  }



  public static generateClaudeSystemPrompt(session: SmartRecordingSession): string {
    // Calculate duration in seconds
    const duration = session.endTime && session.startTime 
      ? Math.round((session.endTime - session.startTime) / 1000) 
      : 0;
    
    // Format steps from recording
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
    
    // Extract critical elements
    const criticalElements = this.extractCriticalElements(session);
    
    // Extract proven selectors
    const provenSelectors = this.extractProvenSelectors(session);
    
    // Build the system prompt
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
2. **PROVEN SELECTORS**: Adapt the exact selectors from the recording to match new context  
3. **TIMING PRESERVATION**: Use the timestamps from the recording to calculate appropriate wait times between actions
4. **VALUE ADAPTATION**: Only change search terms, URLs, form inputs to match new similar tasks
5. **WAIT BEFORE ACTIONS**: Add explicit wait_for_element actions before clicking or typing to ensure elements are loaded

## SUCCESS CRITERIA
✅ **Your response will be successful if:**
1. Actions follow the recorded sequence pattern
2. Selectors are specific and likely to work
3. Timing matches the original workflow
4. Values are adapted to the new task context

❌ **AVOID THESE FAILURES:**
- Generic selectors that don't match real elements
- Skipping steps from the original workflow
- Wrong action sequence
- Missing wait times for dynamic content

## OUTPUT FORMAT REQUIREMENTS
Respond with a JSON array of steps to execute. Each step should have:
- action: The action to perform (MUST be one of these exact values: 'navigate', 'click', 'type', 'keypress', 'select', 'wait', 'wait_for_element', 'wait_for_navigation', 'screenshot', 'submit')
- target: The selector or URL to target
- value: The value to use (for type, select, etc.)
- reasoning: A brief explanation of why this step is needed

## SUPPORTED ACTIONS
- navigate: Navigate to a URL (target should be a full URL)
- click: Click on an element (target should be a CSS selector)
- type: Type text into an element (target should be a CSS selector, value is the text to type)
- keypress: Press a key on an element (target should be a CSS selector, value is the key to press)
- select: Select an option from a dropdown (target should be a CSS selector, value is the option to select)
- wait: Wait for a specified time in milliseconds (value should be the time in milliseconds)
- wait_for_element: Wait for an element to appear (target should be a CSS selector)
- wait_for_navigation: Wait for navigation to complete
- screenshot: Take a screenshot of the current page
- submit: Submit a form (target should be a CSS selector for the form or form element)

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