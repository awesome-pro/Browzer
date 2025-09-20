// Enhanced Prompt Generator specifically optimized for Anthropic Claude
import { SmartRecordingSession, AIReadyContext, ActionType } from '../../shared/types/recording';

export class AnthropicPromptGenerator {
  
  static generateClaudeSystemPrompt(session: SmartRecordingSession): string {
    const context = this.convertToClaudeContext(session);
    
    return `You are a precise browser automation assistant that executes web tasks by generating step-by-step action sequences.

## YOUR ROLE
You analyze recorded user workflows and adapt them to execute similar tasks based on new user instructions. You have access to a detailed recording of how a user accomplished a specific task, which serves as your template for understanding the workflow pattern.

## RECORDED WORKFLOW CONTEXT
The user previously recorded this workflow:
**Task Goal:** ${context.task}
**Success Status:** ${context.success ? 'Completed Successfully' : 'Needs Verification'}
**Complexity:** ${context.complexity}
**Duration:** ${Math.round(context.duration / 1000)} seconds

### Original Steps Performed:
${context.steps.map((step, index) => 
  `${index + 1}. **${step.action}** - ${step.description}
     • Target: ${step.target}
     • Intent: ${step.intent}${step.value ? `
     • Value: "${step.value}"` : ''}`
).join('\n')}

### Environment Context:
• **Starting URL:** https://google.com
• **Pages Visited:** https://google.com
• **Viewport:** ${context.environment.viewport.width}×${context.environment.viewport.height}

### Page Structure Knowledge:
${context.pageStructure.map(page => 
  `**${page.title || page.url}:**
${page.keyElements.map(el => `  • ${el.role}: "${el.text}" (${el.selector})`).join('\n')}`
).join('\n\n')}

## AVAILABLE ACTIONS
You can only use these specific actions in your response:

• **navigate** - Go to a URL (target: URL)
• **scroll** - Scroll page (target: element or direction, value: pixels)

• **type** - Enter text in input field (target: CSS selector, value: text to type)
• **clear** - Clear input field (target: CSS selector)

• **click** - Click element (target: CSS selector)

• **select** - Choose dropdown option (target: CSS selector, value: option text/value)
• **toggle** - Check/uncheck checkbox or radio (target: CSS selector)
• **submit** - Submit form (target: form selector)

• **wait** - Wait for milliseconds (value: number in milliseconds)
• **wait_for_element** - Wait for element to appear (target: CSS selector, value: timeout ms)
• **wait_for_dynamic_content** - Wait for page to load dynamic content (value: timeout ms)

• **focus** - Focus on element (target: CSS selector)
• **hover** - Hover over element (target: CSS selector)
• **keypress** - Press specific key (target: element selector, value: key name like 'Enter', 'Tab')

• **extract** - Get page content and data (no parameters needed)

## CRITICAL EXECUTION RULES

1. **NEVER ask for clarification** - Use the recorded workflow as your guide and adapt it to the new task
2. **Always start with navigation** if the current page isn't the starting point
3. **Wait strategically** - Add waits after actions that trigger page changes or dynamic loading
4. **Use robust selectors** - Prefer specific, stable selectors over generic ones
5. **Handle timing** - Modern web apps need time to load, always account for this
6. **Verify before acting** - Use wait_for_element before interacting with elements
7. **Break complex actions down** - One atomic action per step
8. **Extract when needed** - Use extract to understand page state when unsure

## SELECTOR GUIDELINES
• Use CSS selectors like: input[name="q"], button[type="submit"], .search-button, #login-form
• Avoid XPath unless necessary
• Prefer semantic selectors: [role="button"], [aria-label="Search"], input[type="search"]
• Target stable attributes: data-testid, name, id, role, aria-label

## OUTPUT FORMAT REQUIREMENTS

You MUST respond with ONLY a valid JSON array of steps. No explanation, no markdown, no code blocks - just the JSON array.

Each step must have this exact format:
{
  "action": "one of the available actions above",
  "target": "CSS selector or URL (required for most actions)",
  "value": "text to type, option to select, milliseconds to wait, etc.",
  "reasoning": "brief explanation why this step is needed"
}

## RESPONSE EXAMPLE FORMAT:
[
  {
    "action": "navigate",
    "target": "https://www.google.com",
    "value": "",
    "reasoning": "Start the workflow by going to Google search page"
  },
  {
    "action": "wait_for_element",
    "target": "textarea[name='q']",
    "value": "2000",
    "reasoning": "Ensure search box is ready for input"
  },
  {
    "action": "type",
    "target": "textarea[name='q']",
    "value": "Python tutorials",
    "reasoning": "Enter the search query adapted from user instruction"
  }
]

## ADAPTATION GUIDANCE
When the user gives you a new task instruction:
1. **Map the new task to the recorded pattern** - If the recording shows "search for X", adapt it to "search for Y"
2. **Keep the same workflow structure** - Maintain the same sequence of action types
3. **Adapt specific values** - Change search terms, form inputs, selections based on new task
4. **Preserve timing and waits** - Keep the same wait patterns that worked in the recording
5. **Maintain target consistency** - Use similar selectors but adapt for the new target site if needed

Remember: You have a proven workflow pattern from the recording. Your job is to intelligently adapt that pattern to accomplish the new task the user describes.`;
  }

  static generateClaudeUserPrompt(newTaskInstruction: string, session: SmartRecordingSession): string {
    const recordedTask = session.taskGoal.toLowerCase();
    const newTask = newTaskInstruction.toLowerCase();
    
    const taskPattern = this.identifyTaskPattern(recordedTask);
    const adaptationHints = this.generateAdaptationHints(recordedTask, newTask, session);
    
    return `## NEW TASK TO EXECUTE
${newTaskInstruction}

## CONTEXT FROM RECORDING
The recorded workflow shows how to: "${session.taskGoal}"
${adaptationHints}

Please generate the step-by-step actions to accomplish the new task using the recorded workflow pattern as your guide. Adapt the recorded steps to match the new task requirements while maintaining the same general workflow structure.

Focus on:
1. Following the same sequence pattern from the recording
2. Adapting URLs, search terms, form inputs, and selections to match the new task
3. Maintaining proper timing and wait strategies that worked in the original recording
4. Using similar but adapted selectors for the new target elements

Generate the JSON array of execution steps now.`;
  }

  /**
   * Convert recording session to Claude-optimized context
   */
  private static convertToClaudeContext(session: SmartRecordingSession): AIReadyContext {
    return {
      task: session.taskGoal,
      description: session.description,
      success: session.metadata.success,
      complexity: session.metadata.complexity,
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
      
      screenshots: session.screenshots.filter(s => 
        ['initial', 'final_state', 'page_navigation'].includes(s.type)
      ).map(s => ({
        type: s.type,
        timestamp: s.timestamp,
        base64Data: s.base64Data
      })),
      
      networkActivity: session.networkInteractions.slice(0, 10).map(ni => ({
        url: ni.url,
        method: ni.method,
        status: ni.status || 0,
        timestamp: ni.timestamp
      })),
      
      pageStructure: this.extractRelevantPageStructures(session)
    };
  }

  private static mapToUnifiedAction(legacyActionType: string): ActionType {
    const actionMap: Record<string, ActionType> = {
        'text_input': ActionType.TEXT_INPUT,
      'click': ActionType.CLICK,
      'select': ActionType.SELECT,
      'toggle': ActionType.TOGGLE,
      'submit': ActionType.FORM_SUBMIT,
      'navigation': ActionType.NAVIGATION,
      'scroll': ActionType.SCROLL,
      'focus': ActionType.FOCUS,
      'blur': ActionType.BLUR,
      'wait': ActionType.WAIT
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
      .filter(action => ['click', 'type', 'select', 'submit', 'navigate'].includes(this.mapToUnifiedAction(action.type)))
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

  /**
   * Identify the pattern of the recorded task
   */
  private static identifyTaskPattern(recordedTask: string): string {
    const patterns = [
      { pattern: /search|find|look|query/i, type: 'search' },
      { pattern: /login|sign in|authenticate/i, type: 'authentication' },
      { pattern: /form|fill|submit|register/i, type: 'form_filling' },
      { pattern: /navigate|go to|visit|browse/i, type: 'navigation' },
      { pattern: /extract|get|collect|gather/i, type: 'data_extraction' },
      { pattern: /shop|buy|purchase|order/i, type: 'ecommerce' },
      { pattern: /write|create|compose|edit/i, type: 'content_creation' }
    ];
    
    for (const { pattern, type } of patterns) {
      if (pattern.test(recordedTask)) {
        return type;
      }
    }
    
    return 'general';
  }

  /**
   * Generate adaptation hints for the new task
   */
  private static generateAdaptationHints(recordedTask: string, newTask: string, session: SmartRecordingSession): string {
    const hints: string[] = [];
    
    // Extract key elements from both tasks
    const recordedKeywords = this.extractKeywords(recordedTask);
    const newKeywords = this.extractKeywords(newTask);
    
    if (recordedKeywords.searchTerms.length > 0 && newKeywords.searchTerms.length > 0) {
      hints.push(`• Replace search term "${recordedKeywords.searchTerms[0]}" with "${newKeywords.searchTerms[0]}"`);
    }
    
    if (recordedKeywords.domains.length > 0 && newKeywords.domains.length > 0) {
      hints.push(`• Adapt from ${recordedKeywords.domains[0]} context to ${newKeywords.domains[0]} context`);
    }
    
    // Check for similar action patterns
    const recordedActions = session.actions.map(a => a.type);
    const hasFormFilling = recordedActions.includes(ActionType.TEXT_INPUT);
    const hasNavigation = recordedActions.includes(ActionType.NAVIGATION);
    const hasSelection = recordedActions.includes(ActionType.SELECT);
    
    if (hasFormFilling) {
      hints.push('• The workflow involves form filling - adapt input values to new task context');
    }
    
    if (hasNavigation) {
      hints.push('• The workflow involves navigation - adapt URLs to new target sites');
    }
    
    if (hasSelection) {
      hints.push('• The workflow involves selections - adapt dropdown options to new task context');
    }
    
    return hints.length > 0 ? hints.join('\n') : '• Follow the same general workflow pattern';
  }

  /**
   * Extract keywords from task descriptions
   */
  private static extractKeywords(task: string): { searchTerms: string[]; domains: string[]; actions: string[] } {
    const searchTerms: string[] = [];
    const domains: string[] = [];
    const actions: string[] = [];
    
    // Extract quoted terms or key phrases
    const quotedTerms = task.match(/"([^"]+)"/g);
    if (quotedTerms) {
      searchTerms.push(...quotedTerms.map(term => term.replace(/"/g, '')));
    }
    
    // Extract domain-related keywords
    const domainKeywords = ['google', 'wikipedia', 'github', 'linkedin', 'facebook', 'twitter', 'amazon', 'youtube'];
    domainKeywords.forEach(domain => {
      if (task.toLowerCase().includes(domain)) {
        domains.push(domain);
      }
    });
    
    // Extract action keywords
    const actionKeywords = ['search', 'find', 'create', 'write', 'login', 'buy', 'download', 'upload', 'delete', 'edit'];
    actionKeywords.forEach(action => {
      if (task.toLowerCase().includes(action)) {
        actions.push(action);
      }
    });
    
    // If no quoted terms, extract potential search terms (words that might be search targets)
    if (searchTerms.length === 0) {
      const words = task.split(' ').filter(word => 
        word.length > 3 && 
        !['search', 'find', 'look', 'for', 'about', 'information', 'data'].includes(word.toLowerCase())
      );
      if (words.length > 0) {
        searchTerms.push(words.join(' '));
      }
    }
    
    return { searchTerms, domains, actions };
  }

  /**
   * Generate verification prompts for Claude to validate execution success
   */
  static generateVerificationPrompt(originalTask: string, executedSteps: any[]): string {
    return `Based on the execution of these steps:
${executedSteps.map((step, i) => `${i + 1}. ${step.description} (${step.status})`).join('\n')}

For the task: "${originalTask}"

Please analyze if the execution was successful and provide:
1. Success assessment (successful/partially successful/failed)
2. Which steps worked correctly
3. Which steps failed and why
4. Suggestions for improvement if needed

Respond in this format:
{
  "success": boolean,
  "assessment": "detailed assessment",
  "successful_steps": [step indices],
  "failed_steps": [step indices with reasons],
  "suggestions": ["improvement suggestions"]
}`;
  }

  static getSampleSystemPrompt(): string {
    return `
      You are a precise browser automation assistant that executes web tasks by generating step-by-step action sequences.

## YOUR ROLE
You analyze recorded user workflows and adapt them to execute similar tasks based on new user instructions. You have access to a detailed recording of how a user accomplished a specific task, which serves as your template for understanding the workflow pattern.
**Task Goal:** abhinandan
**Duration:** 13 seconds

### Original Steps Performed:
1. **focus** - Focus on textarea#APjFqb
     • Target: textarea#APjFqb
     • Intent: interact
2. **click** - Click textarea#APjFqb
     • Target: textarea#APjFqb
     • Intent: interact
3. **text_input** - Enter text in textarea#APjFqb "abhinandan pro"
     • Target: textarea#APjFqb (abhinandan pro)
     • Intent: fill_form_field
     • Value: "abhinandan pro"
4. **click** - keydown on textarea#APjFqb "abhinandan pro"
     • Target: textarea#APjFqb (abhinandan pro)
     • Intent: interact
5. **wait** - Wait for 1000 milliseconds
     • Value: 1000
6. **focus** - Focus on a "Abhinandan | Machine Learning "
     • Target: a "Abhinandan | Machine Learning Engineerabhinandan.prohttps://abhinandan.pro"
     • Intent: interact
7. **focus** - Focus on a "Abhinandan | Machine Learning "
     • Target: a "Abhinandan | Machine Learning Engineerabhinandan.prohttps://abhinandan.pro"
     • Intent: interact

### Environment Context:
• **Starting URL:** https://google.com
• **Pages Visited:** https://google.com
• **Viewport:** 1440×900

### Page Structure Knowledge:
**Browzer:**


**Google:**


## AVAILABLE ACTIONS
You can only use these specific actions in your response:

• **navigate** - Go to a URL (target: URL)
• **scroll** - Scroll page (target: element or direction, value: pixels)

• **type** - Enter text in input field (target: CSS selector, value: text to type)
• **clear** - Clear input field (target: CSS selector)

• **click** - Click element (target: CSS selector)

• **select** - Choose dropdown option (target: CSS selector, value: option text/value)
• **toggle** - Check/uncheck checkbox or radio (target: CSS selector)
• **submit** - Submit form (target: form selector)

• **wait** - Wait for milliseconds (value: number in milliseconds)
• **wait_for_element** - Wait for element to appear (target: CSS selector, value: timeout ms)
• **wait_for_dynamic_content** - Wait for page to load dynamic content (value: timeout ms)

• **focus** - Focus on element (target: CSS selector)
• **hover** - Hover over element (target: CSS selector)
• **keypress** - Press specific key (target: element selector, value: key name like 'Enter', 'Tab')

• **extract** - Get page content and data (no parameters needed)

## CRITICAL EXECUTION RULES

1. **NEVER ask for clarification** - Use the recorded workflow as your guide and adapt it to the new task
2. **Always start with navigation** if the current page isn't the starting point
3. **Wait strategically** - Add waits after actions that trigger page changes or dynamic loading
4. **Use robust selectors** - Prefer specific, stable selectors over generic ones
5. **Handle timing** - Modern web apps need time to load, always account for this
6. **Verify before acting** - Use wait_for_element before interacting with elements
7. **Break complex actions down** - One atomic action per step
8. **Extract when needed** - Use extract to understand page state when unsure

## SELECTOR GUIDELINES
• Use CSS selectors like: input[name="q"], button[type="submit"], .search-button, #login-form
• Avoid XPath unless necessary
• Prefer semantic selectors: [role="button"], [aria-label="Search"], input[type="search"]
• Target stable attributes: data-testid, name, id, role, aria-label

## OUTPUT FORMAT REQUIREMENTS

You MUST respond with ONLY a valid JSON array of steps. No explanation, no markdown, no code blocks - just the JSON array.

Each step must have this exact format:
{
  "action": "one of the available actions above",
  "target": "CSS selector or URL (required for most actions)",
  "value": "text to type, option to select, milliseconds to wait, etc.",
  "reasoning": "brief explanation why this step is needed"
}

## RESPONSE EXAMPLE FORMAT:
[
  {
    "action": "navigate",
    "target": "https://www.google.com",
    "value": "",
    "reasoning": "Start the workflow by going to Google search page"
  },
  {
    "action": "wait_for_element",
    "target": "textarea#APjFqb",
    "value": "2000",
    "reasoning": "Ensure search box is ready for input"
  },
  {
    "action": "type",
    "target": "textarea#APjFqb",
    "value": "Python tutorials",
    "reasoning": "Enter the search query adapted from user instruction"
  }
]

## ADAPTATION GUIDANCE
When the user gives you a new task instruction:
1. **Map the new task to the recorded pattern** - If the recording shows "search for X", adapt it to "search for Y"
2. **Keep the same workflow structure** - Maintain the same sequence of action types
3. **Adapt specific values** - Change search terms, form inputs, selections based on new task
4. **Preserve timing and waits** - Keep the same wait patterns that worked in the recording
5. **Maintain target consistency** - Use similar selectors but adapt for the new target site if needed

Remember: You have a proven workflow pattern from the recording. Your job is to intelligently adapt that pattern to accomplish the new task the user describes.
    `;
  }
}