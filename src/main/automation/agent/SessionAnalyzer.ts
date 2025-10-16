/**
 * SessionAnalyzer - Analyzes recorded sessions to extract patterns
 * 
 * Converts recorded user actions into semantic understanding that helps
 * the LLM understand "how" a task was accomplished in the past.
 * 
 * Provides:
 * - Action sequence analysis
 * - Selector pattern extraction
 * - Navigation flow understanding
 * - Form interaction patterns
 * - Multi-tab workflow analysis
 */

import { RecordingSession, RecordedAction } from '@/shared/types';

export interface SessionInsights {
  taskSummary: string;
  keyActions: string[];
  selectorPatterns: Record<string, string[]>;
  navigationFlow: string[];
  formInteractions: Array<{
    field: string;
    value: string;
    type: string;
  }>;
  multiTabUsage: boolean;
  estimatedDuration: number;
}

export class SessionAnalyzer {
  /**
   * Analyze a recorded session and extract insights
   */
  public async analyzeSession(session: RecordingSession): Promise<string> {
    console.log('📊 Analyzing session:', session.name);

    const insights = this.extractInsights(session);
    const narrative = this.generateNarrative(session, insights);

    return narrative;
  }

  /**
   * Extract structured insights from session
   */
  private extractInsights(session: RecordingSession): SessionInsights {
    const insights: SessionInsights = {
      taskSummary: session.description || session.name,
      keyActions: [],
      selectorPatterns: {},
      navigationFlow: [],
      formInteractions: [],
      multiTabUsage: (session.tabSwitchCount || 0) > 0,
      estimatedDuration: session.duration
    };

    // Analyze actions
    for (const action of session.actions) {
      // Track navigation
      if (action.type === 'navigate') {
        insights.navigationFlow.push(action.url || '');
      }

      // Track key interactions
      if (['click', 'submit', 'select'].includes(action.type)) {
        const description = this.describeAction(action);
        insights.keyActions.push(description);
      }

      // Track form inputs
      if (action.type === 'input' && action.target && action.value) {
        insights.formInteractions.push({
          field: action.target.placeholder || action.target.name || action.target.selector,
          value: typeof action.value === 'string' ? action.value : String(action.value),
          type: action.target.type || 'text'
        });
      }

      // Extract selector patterns
      if (action.target?.selectors) {
        const tagName = action.target.tagName.toLowerCase();
        if (!insights.selectorPatterns[tagName]) {
          insights.selectorPatterns[tagName] = [];
        }

        // Store high-confidence selectors
        const bestSelectors = action.target.selectors
          .filter(s => s.score >= 80)
          .map(s => `${s.strategy}: ${s.selector}`);
        
        insights.selectorPatterns[tagName].push(...bestSelectors);
      }
    }

    return insights;
  }

  /**
   * Generate human-readable narrative from insights
   */
  private generateNarrative(session: RecordingSession, insights: SessionInsights): string {
    let narrative = `# Recorded Session Analysis: ${session.name}\n\n`;

    // Task overview
    narrative += `## Task Overview\n`;
    narrative += `${insights.taskSummary}\n\n`;
    narrative += `- Duration: ${(session.duration / 1000).toFixed(1)} seconds\n`;
    narrative += `- Total Actions: ${session.actionCount}\n`;
    narrative += `- Starting URL: ${session.url || 'N/A'}\n`;
    
    if (insights.multiTabUsage) {
      narrative += `- Multi-tab workflow: Yes (${session.tabSwitchCount} tab switches)\n`;
      if (session.tabs && session.tabs.length > 0) {
        narrative += `- Tabs used: ${session.tabs.map(t => t.title).join(', ')}\n`;
      }
    }
    narrative += `\n`;

    // Navigation flow
    if (insights.navigationFlow.length > 0) {
      narrative += `## Navigation Flow\n`;
      insights.navigationFlow.forEach((url, i) => {
        narrative += `${i + 1}. ${url}\n`;
      });
      narrative += `\n`;
    }

    // Key actions
    if (insights.keyActions.length > 0) {
      narrative += `## Key Actions Performed\n`;
      insights.keyActions.forEach((action, i) => {
        narrative += `${i + 1}. ${action}\n`;
      });
      narrative += `\n`;
    }

    // Form interactions
    if (insights.formInteractions.length > 0) {
      narrative += `## Form Interactions\n`;
      insights.formInteractions.forEach(interaction => {
        const valueDisplay = interaction.type === 'password' 
          ? '[PASSWORD]' 
          : interaction.value;
        narrative += `- ${interaction.field}: "${valueDisplay}" (${interaction.type})\n`;
      });
      narrative += `\n`;
    }

    // Selector patterns
    if (Object.keys(insights.selectorPatterns).length > 0) {
      narrative += `## Selector Patterns Used\n`;
      for (const [tagName, selectors] of Object.entries(insights.selectorPatterns)) {
        if (selectors.length > 0) {
          narrative += `### ${tagName.toUpperCase()} elements\n`;
          // Show unique selectors only
          const uniqueSelectors = [...new Set(selectors)].slice(0, 5);
          uniqueSelectors.forEach(selector => {
            narrative += `- ${selector}\n`;
          });
        }
      }
      narrative += `\n`;
    }

    // Action sequence
    narrative += `## Detailed Action Sequence\n`;
    session.actions.forEach((action, i) => {
      const timestamp = ((action.timestamp - session.createdAt) / 1000).toFixed(1);
      const description = this.describeActionDetailed(action);
      narrative += `[${timestamp}s] ${i + 1}. ${description}\n`;
    });
    narrative += `\n`;

    // Insights and recommendations
    narrative += `## Insights for Automation\n`;
    narrative += this.generateRecommendations(session, insights);

    return narrative;
  }

  /**
   * Describe action in simple terms
   */
  private describeAction(action: RecordedAction): string {
    switch (action.type) {
      case 'click':
        return `Clicked on ${this.describeTarget(action.target)}`;
      case 'input':
        return `Entered text in ${this.describeTarget(action.target)}`;
      case 'select':
        return `Selected option in ${this.describeTarget(action.target)}`;
      case 'submit':
        return `Submitted form`;
      case 'navigate':
        return `Navigated to ${action.url}`;
      case 'checkbox':
        return `${action.value ? 'Checked' : 'Unchecked'} ${this.describeTarget(action.target)}`;
      case 'radio':
        return `Selected radio button ${this.describeTarget(action.target)}`;
      case 'keypress':
        return `Pressed ${action.value} key`;
      case 'tab-switch':
        return `Switched to tab: ${action.tabTitle}`;
      default:
        return `Performed ${action.type} action`;
    }
  }

  /**
   * Describe action with more detail
   */
  private describeActionDetailed(action: RecordedAction): string {
    let desc = this.describeAction(action);

    // Add selector info if available
    if (action.target?.selector) {
      desc += ` (selector: ${action.target.selector})`;
    }

    // Add verification info
    if (action.verified && action.effects?.summary) {
      desc += ` → ${action.effects.summary}`;
    }

    // Add tab context
    if (action.tabId && action.tabTitle) {
      desc += ` [Tab: ${action.tabTitle}]`;
    }

    return desc;
  }

  /**
   * Describe target element
   */
  private describeTarget(target: any): string {
    if (!target) return 'element';

    if (target.ariaLabel) return `"${target.ariaLabel}"`;
    if (target.text && target.text.length < 50) return `"${target.text}"`;
    if (target.placeholder) return `"${target.placeholder}"`;
    if (target.id) return `#${target.id}`;
    if (target.name) return `[name="${target.name}"]`;
    
    return `${target.tagName} element`;
  }

  /**
   * Generate recommendations for automation
   */
  private generateRecommendations(session: RecordingSession, insights: SessionInsights): string {
    let recommendations = '';

    // Selector reliability
    recommendations += `- **Selector Strategy**: `;
    const hasReliableSelectors = Object.values(insights.selectorPatterns)
      .some(selectors => selectors.some(s => s.startsWith('id:') || s.startsWith('data-testid:')));
    
    if (hasReliableSelectors) {
      recommendations += `Good - Session uses reliable selectors (IDs, test IDs)\n`;
    } else {
      recommendations += `Moderate - Consider using more stable selectors if page structure changes\n`;
    }

    // Timing considerations
    const avgTimeBetweenActions = session.duration / session.actionCount;
    recommendations += `- **Timing**: Average ${(avgTimeBetweenActions / 1000).toFixed(1)}s between actions. `;
    if (avgTimeBetweenActions < 500) {
      recommendations += `Fast execution - ensure elements are ready before interaction\n`;
    } else {
      recommendations += `Normal pace - should be safe for automation\n`;
    }

    // Multi-tab complexity
    if (insights.multiTabUsage) {
      recommendations += `- **Multi-tab**: Workflow involves ${session.tabSwitchCount} tab switches. Ensure tab context is properly maintained\n`;
    }

    // Form interactions
    if (insights.formInteractions.length > 0) {
      recommendations += `- **Forms**: ${insights.formInteractions.length} form fields detected. Consider validation and error handling\n`;
    }

    // Navigation patterns
    if (insights.navigationFlow.length > 1) {
      recommendations += `- **Navigation**: Multi-page flow detected. Verify each navigation completes successfully\n`;
    }

    return recommendations;
  }

  /**
   * Extract action patterns for similar task detection
   */
  public extractActionPattern(session: RecordingSession): string[] {
    return session.actions.map(action => {
      const type = action.type;
      const target = action.target?.tagName?.toLowerCase() || 'unknown';
      const role = action.target?.role || '';
      return `${type}:${target}${role ? ':' + role : ''}`;
    });
  }

  /**
   * Compare two sessions for similarity
   */
  public calculateSimilarity(session1: RecordingSession, session2: RecordingSession): number {
    const pattern1 = this.extractActionPattern(session1);
    const pattern2 = this.extractActionPattern(session2);

    // Simple Jaccard similarity
    const set1 = new Set(pattern1);
    const set2 = new Set(pattern2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }
}

