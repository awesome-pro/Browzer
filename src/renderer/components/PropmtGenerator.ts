// AI Prompt Generator - Converts recorded sessions into effective AI prompts
// This shows how the optimized recording data becomes actionable AI context

import { SmartRecordingSession, AIReadyContext } from '../../shared/types/recording';

export class AIPromptGenerator {
  
  static generateTaskPrompt(session: SmartRecordingSession): string {
    const aiContext = this.convertToAIContext(session);
    return this.createPromptFromContext(aiContext);
  }
  
  static convertToAIContext(session: SmartRecordingSession): AIReadyContext {
    return {
      task: session.taskGoal,
      description: session.description,
      success: session.metadata.success,
      complexity: session.metadata.complexity,
      duration: session.metadata.duration,
      
      steps: session.actions.map((action, index) => ({
        step: index + 1,
        action: action.type,
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
        ['initial', 'final_state'].includes(s.type)
      ).map(s => ({
        type: s.type,
        timestamp: s.timestamp,
        base64Data: s.base64Data
      })),
      
      networkActivity: session.networkInteractions.map(ni => ({
        url: ni.url,
        method: ni.method,
        status: ni.status || 0,
        timestamp: ni.timestamp
      })),
      
      pageStructure: this.extractPageStructures(session)
    };
  }
  
  private static extractPageStructures(session: SmartRecordingSession): Array<any> {
    const structures = new Map();
    
    // Get unique page contexts
    [session.initialContext, ...session.actions.map(a => a.context)]
      .forEach(context => {
        if (!structures.has(context.url)) {
          structures.set(context.url, {
            url: context.url,
            title: context.title,
            keyElements: context.keyElements || []
          });
        }
      });
    
    return Array.from(structures.values());
  }
  
  static createPromptFromContext(context: AIReadyContext): string {
    return `# Task Automation Request

## GOAL
${context.task}${context.description ? `\n${context.description}` : ''}

## ENVIRONMENT
- Starting URL: ${context.environment.initialUrl}
- Browser: ${context.environment.userAgent.split(' ')[0]}
- Screen: ${context.environment.viewport.width}x${context.environment.viewport.height}
- Pages visited: ${context.environment.pagesVisited.length}

## TASK SEQUENCE
I need you to automate the following workflow:

${context.steps.map(step => 
  `${step.step}. ${step.description}
   - Target: ${step.target}
   - Intent: ${step.intent}${step.value ? `
   - Value: ${step.value}` : ''}`
).join('\n\n')}

## SUCCESS CRITERIA
${context.success ? 'This task was completed successfully' : 'Task completion needs verification'}
Complexity: ${context.complexity}
Duration: ${Math.round(context.duration / 1000)}s

${context.networkActivity.length > 0 ? `## NETWORK INTERACTIONS
${context.networkActivity.map(req => 
  `- ${req.method} ${req.url} (${req.status})`
).join('\n')}` : ''}

## PAGE CONTEXTS
${context.pageStructure.map(page => 
  `### ${page.title || page.url}
Key Elements:
${page.keyElements.map(el => `- ${el.role}: "${el.text}" (${el.selector})`).join('\n')}`
).join('\n\n')}

## INSTRUCTIONS
Using this context, please:
1. Generate the appropriate browser automation code
2. Handle potential errors and variations
3. Make the code robust and reusable
4. Include proper waits and element verification
5. Add comments explaining the intent of each action

Focus on the high-level workflow rather than exact coordinates or timing.`;
  }
  
  // Generate different types of prompts for different AI models
  
  static generatePlaywrightCode(context: AIReadyContext): string {
    return `# Generate Playwright Test for: ${context.task}

Based on this recorded workflow, create a Playwright test that:

## Actions to Automate:
${context.steps.map(step => 
  `// Step ${step.step}: ${step.description}
// Intent: ${step.intent}
// Target: ${step.target}`
).join('\n\n')}

## Requirements:
- Use proper selectors (prefer data-testid, then semantic selectors)
- Add proper waits for network requests and DOM changes
- Include assertions to verify success
- Handle potential race conditions
- Make it maintainable and readable

## Environment:
- Initial URL: ${context.environment.initialUrl}
- Viewport: ${context.environment.viewport.width}x${context.environment.viewport.height}

Please generate the complete Playwright test code.`;
  }
  
  static generateSeleniumCode(context: AIReadyContext): string {
    return `# Generate Selenium WebDriver code for: ${context.task}

Create a robust Selenium automation script based on this workflow:

## User Actions:
${context.steps.map(step => 
  `${step.step}. ${step.description} (${step.intent})`
).join('\n')}

## Technical Context:
- Browser: ${context.environment.userAgent}
- Starting point: ${context.environment.initialUrl}
- Success criteria: ${context.success ? 'Workflow completed' : 'Needs verification'}

Generate clean, maintainable Selenium code with proper error handling.`;
  }
  
  static generateCypressCode(context: AIReadyContext): string {
    return `# Generate Cypress E2E test for: ${context.task}

Create a Cypress test based on this user workflow:

## Workflow Steps:
${context.steps.map((step, index) => 
  `cy.step('${step.description}', () => {
  // Intent: ${step.intent}
  // Target: ${step.target}
  // TODO: Implement ${step.action} action
});`
).join('\n\n')}

## Context:
- Task complexity: ${context.complexity}
- Duration: ~${Math.round(context.duration / 1000)}s
- Pages: ${context.pageStructure.length}

Please generate the complete Cypress test with proper commands and assertions.`;
  }
  
  // Generate natural language instructions
  static generateHumanInstructions(context: AIReadyContext): string {
    return `# How to ${context.task}

## Overview
${context.description || `This workflow involves ${context.steps.length} main steps and visits ${context.environment.pagesVisited.length} page(s).`}

## Step-by-Step Instructions

${context.steps.map(step => 
  `### Step ${step.step}: ${step.description}
  
**What to do:** ${this.humanizeAction(step)}
**Where:** ${step.target}
**Purpose:** ${step.intent}
${step.value ? `**Value to enter:** ${step.value}` : ''}`
).join('\n\n')}

## Tips for Success
- Start at: ${context.environment.initialUrl}
- Expected completion time: ~${Math.round(context.duration / 1000)} seconds
- Task complexity: ${context.complexity}
${context.success ? '- This workflow has been verified to work' : '- Workflow may need adjustment'}`;
  }
  
  private static humanizeAction(step: any): string {
    switch (step.action) {
      case 'text_input':
        return `Type the required information`;
      case 'click':
        return `Click on the element`;
      case 'select':
        return `Choose from the dropdown options`;
      case 'toggle':
        return `Check or uncheck the option`;
      case 'submit':
        return `Submit the form`;
      case 'navigation':
        return `Navigate to the new page`;
      default:
        return `Perform the ${step.action} action`;
    }
  }
  
  // Generate training data for custom AI models
  static generateTrainingData(sessions: SmartRecordingSession[]): Array<{
    input: string;
    output: string;
  }> {
    return sessions.map(session => {
      const context = this.convertToAIContext(session);
      return {
        input: `Task: ${context.task}\nEnvironment: ${context.environment.initialUrl}\nGoal: Automate this workflow`,
        output: JSON.stringify({
          steps: context.steps,
          success: context.success,
          complexity: context.complexity
        }, null, 2)
      };
    });
  }
}