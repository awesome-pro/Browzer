// Enhanced Prompt Generator specifically optimized for Anthropic Claude
import { SmartRecordingSession, AIReadyContext, ActionType } from '../types';

export class AnthropicPromptGenerator {
  
  static generateClaudeSystemPrompt(session: SmartRecordingSession): string {
    const context = this.convertToClaudeContext(session);
    
    return `You are a precision browser automation expert that generates executable step sequences based on recorded user workflows.

## CORE MISSION
You have access to a PROVEN, SUCCESSFUL workflow recording. Your job is to replicate this exact pattern for new tasks by adapting the specific selectors, values, and targets while maintaining the identical workflow structure.

## RECORDED WORKFLOW ANALYSIS
**Original Task:** ${context.task}
**Success Status:** ${context.success ? '✅ COMPLETED SUCCESSFULLY' : '⚠️ NEEDS VERIFICATION'}
**Complexity:** ${context.complexity}
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
• **text_input** - Enter text (target: CSS selector, value: text)
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
    "action": "text_input",
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
    // Handle special case where user just wants to replicate the exact task
    const isReplicationRequest = this.isTaskReplicationRequest(newTaskInstruction);
    
    if (isReplicationRequest) {
      return this.generateReplicationPrompt(session);
    }
    
    const workflowMapping = this.generateWorkflowMapping(session, newTaskInstruction);
    
    return `## 🎯 NEW TASK EXECUTION REQUEST

**NEW TASK:** ${newTaskInstruction}

## 📋 WORKFLOW ADAPTATION MAPPING
${workflowMapping}

## ⚡ EXECUTION REQUIREMENTS

**CRITICAL:** Generate a JSON array that follows the EXACT workflow pattern from the recording, but adapted for this new task.

**Key Adaptations Needed:**
${this.generateSpecificAdaptations(session, newTaskInstruction)}

**Expected Workflow Pattern:**
${this.generateExpectedPattern(session)}

---
**GENERATE THE JSON ARRAY NOW** (Pure JSON only, no explanations)`;
  }

  private static isTaskReplicationRequest(instruction: string): boolean {
    const replicationKeywords = [
      'execute the task',
      'run the task',
      'repeat the task',
      'do the same',
      'replicate',
      'same task',
      'exact same',
      'reproduce'
    ];
    
    const lowerInstruction = instruction.toLowerCase().trim();
    return replicationKeywords.some(keyword => lowerInstruction.includes(keyword));
  }

  private static generateReplicationPrompt(session: SmartRecordingSession): string {
    return `## 🔄 EXACT TASK REPLICATION REQUEST

**INSTRUCTION:** Replicate the EXACT same task that was recorded.

## ⚡ REPLICATION REQUIREMENTS

**CRITICAL:** Generate a JSON array that EXACTLY replicates the recorded workflow with the SAME values, URLs, and targets.

**DO NOT CHANGE:**
- URLs or domain names
- Form input values  
- Button/link text
- Navigation paths
- Wait times

**EXACT WORKFLOW TO REPLICATE:**
${session.actions.map((action, index) => {
  return `${index + 1}. [${action.type.toUpperCase()}] ${action.description}
   └─ TARGET: ${action.target.description}${action.value ? `
   └─ VALUE: "${action.value}"` : ''}`;
}).join('\n\n')}

**EXACT SELECTORS TO USE:**
${this.extractExactSelectors(session)}

---
**GENERATE THE EXACT REPLICATION JSON ARRAY NOW** (Pure JSON only, no explanations)`;
  }

  private static extractExactSelectors(session: SmartRecordingSession): string {
    const selectors = new Set<string>();
    
    session.actions.forEach(action => {
      if (action.target && action.target.selector) {
        selectors.add(action.target.selector);
      }
      
      // Extract selectors from descriptions
      const selectorMatches = action.description.match(/\[([^\]]+)\]/g);
      if (selectorMatches) {
        selectorMatches.forEach(match => {
          const selector = match.replace(/[\[\]]/g, '');
          if (selector.includes('#') || selector.includes('.') || selector.includes('[')) {
            selectors.add(selector);
          }
        });
      }
    });
    
    const selectorList = Array.from(selectors).filter(s => s && s.length > 0);
    return selectorList.slice(0, 10).map(selector => `• \`${selector}\``).join('\n');
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
      action.type === 'text_input' || action.description.includes('Type')
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

  // Generate workflow mapping
  private static generateWorkflowMapping(session: SmartRecordingSession, newTask: string): string {
    const mapping = [];
    
    // Analyze the original task pattern
    const originalTask = session.taskGoal.toLowerCase();
    const newTaskLower = newTask.toLowerCase();
    
    // Map search terms
    const originalSearchTerms = this.extractSearchTerms(originalTask);
    const newSearchTerms = this.extractSearchTerms(newTaskLower);
    
    if (originalSearchTerms.length > 0 && newSearchTerms.length > 0) {
      mapping.push(`🔍 **Search Term Mapping**: "${originalSearchTerms[0]}" → "${newSearchTerms[0]}"`);
    }
    
    // Map domains/sites
    const originalDomains = this.extractDomains(originalTask);
    const newDomains = this.extractDomains(newTaskLower);
    
    if (originalDomains.length > 0 && newDomains.length > 0) {
      mapping.push(`🌐 **Domain Mapping**: ${originalDomains[0]} → ${newDomains[0]}`);
    }
    
    // Map action types
    const actionPattern = this.identifyActionPattern(session);
    mapping.push(`⚡ **Action Pattern**: ${actionPattern}`);
    
    return mapping.join('\n');
  }

  // Generate specific adaptations needed
  private static generateSpecificAdaptations(session: SmartRecordingSession, newTask: string): string {
    const adaptations = [];
    
    // URL adaptations
    const urlsInSession = session.metadata.pagesVisited;
    if (urlsInSession.length > 1) {
      adaptations.push(`• **URLs**: Adapt from recorded URLs to match new task context`);
    }
    
    // Form field adaptations
    const textInputs = session.actions.filter(action => action.type === 'text_input');
    if (textInputs.length > 0) {
      const exampleValue = textInputs[0].value;
      adaptations.push(`• **Form Values**: Change "${exampleValue}" to match new task requirements`);
    }
    
    // Button/link adaptations
    const clickActions = session.actions.filter(action => 
      action.type === 'click' && action.description.includes('Click')
    );
    if (clickActions.length > 0) {
      adaptations.push(`• **Interactive Elements**: Adapt button/link targets for new task`);
    }
    
    return adaptations.join('\n');
  }

  // Generate expected pattern
  private static generateExpectedPattern(session: SmartRecordingSession): string {
    return session.actions.slice(0, 5).map((action, index) => 
      `${index + 1}. ${action.type.toLowerCase()} → ${action.description.substring(0, 60)}...`
    ).join('\n');
  }

  // Helper methods for term extraction
  private static extractSearchTerms(text: string): string[] {
    const terms = [];
    
    // Extract quoted terms
    const quotedTerms = text.match(/"([^"]+)"/g);
    if (quotedTerms) {
      terms.push(...quotedTerms.map(term => term.replace(/"/g, '')));
    }
    
    // Extract key words (simple approach)
    const words = text.split(' ').filter(word => 
      word.length > 3 && 
      !['search', 'find', 'create', 'task', 'workflow'].includes(word.toLowerCase())
    );
    
    if (words.length > 0 && terms.length === 0) {
      terms.push(words[0]);
    }
    
    return terms;
  }

  private static extractDomains(text: string): string[] {
    const domains: string[] = [];
    const domainPatterns = [
      /([a-zA-Z0-9-]+\.com)/g,
      /([a-zA-Z0-9-]+\.org)/g,
      /([a-zA-Z0-9-]+\.net)/g,
      /(google|amazon|github|linkedin)/gi
    ];
    
    domainPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        domains.push(...matches);
      }
    });
    
    return [...new Set(domains)];
  }

  private static identifyActionPattern(session: SmartRecordingSession): string {
    const actionTypes = session.actions.map(action => action.type);
    const uniqueTypes = [...new Set(actionTypes)];
    
    // Enhanced form interactions
    const formActions = [ActionType.SELECT_OPTION, ActionType.TOGGLE_CHECKBOX, ActionType.SELECT_RADIO, ActionType.SELECT_FILE];
    const hasFormActions = formActions.some(action => uniqueTypes.includes(action));
    
    // Clipboard interactions
    const clipboardActions = [ActionType.COPY, ActionType.CUT, ActionType.PASTE];
    const hasClipboardActions = clipboardActions.some(action => uniqueTypes.includes(action));
    
    if (uniqueTypes.includes(ActionType.TEXT_INPUT) && uniqueTypes.includes(ActionType.NAVIGATION)) {
      return "Search & Navigate";
    } else if (hasFormActions && uniqueTypes.includes(ActionType.FORM_SUBMIT)) {
      return "Advanced Form Interaction";
    } else if (hasClipboardActions) {
      return "Content Manipulation";
    } else if (uniqueTypes.includes(ActionType.CLICK) && uniqueTypes.includes(ActionType.TEXT_INPUT)) {
      return "Form Interaction";
    } else if (uniqueTypes.includes(ActionType.NAVIGATION)) {
      return "Multi-page Navigation";
    } else {
      return "Interactive Workflow";
    }
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
      .filter(action => ['click', 'text_input', 'select', 'submit', 'navigate'].includes(this.mapToUnifiedAction(action.type)))
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


}