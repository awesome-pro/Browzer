// Recording utility functions - extracted for better code organization
import { SmartRecordingSession, AIReadyContext, ActionType } from '../../shared/types/recording';

export class RecordingUtils {
  /**
   * Format timestamp to human-readable date
   */
  static formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString();
  }

  /**
   * Format duration from milliseconds to human-readable format
   */
  static formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m ${seconds % 60}s`;
  }

  /**
   * Format timestamp to human-readable time
   */
  static formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  /**
   * Format action type to human-readable string
   */
  static formatActionType(type: string): string {
    return type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Escape HTML to prevent XSS
   */
  static escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Convert SmartRecordingSession to AI-ready context
   */
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
      
      pageStructure: RecordingUtils.extractPageStructures(session)
    };
  }

  /**
   * Extract unique page structures from session
   */
  static extractPageStructures(session: SmartRecordingSession): Array<any> {
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

  /**
   * Humanize action description for better readability
   */
  static humanizeAction(step: any): string {
    switch (step.action) {
      case ActionType.TEXT_INPUT:
        return `Type the required information`;
      case ActionType.CLICK:
        return `Click on the element`;
      case ActionType.SELECT:
        return `Choose from the dropdown options`;
      case ActionType.TOGGLE:
        return `Check or uncheck the option`;
      case ActionType.FORM_SUBMIT:
        return `Submit the form`;
      case ActionType.NAVIGATION:
        return `Navigate to the new page`;
      default:
        return `Perform the ${step.action} action`;
    }
  }

  /**
   * Generate filename for session export
   */
  static generateExportFilename(session: SmartRecordingSession, type: 'json' | 'prompt' = 'json'): string {
    const taskName = (session.taskGoal || 'session')
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase();
    const date = new Date(session.startTime).toISOString().split('T')[0];
    const extension = type === 'json' ? 'json' : 'txt';
    
    return `recording_${taskName}_${date}.${extension}`;
  }

  /**
   * Validate session data integrity
   */
  static validateSession(session: SmartRecordingSession): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!session.id) errors.push('Missing session ID');
    if (!session.taskGoal) errors.push('Missing task goal');
    if (!session.startTime) errors.push('Missing start time');
    if (!session.initialContext) errors.push('Missing initial context');
    if (!Array.isArray(session.actions)) errors.push('Invalid actions array');
    if (!session.metadata) errors.push('Missing metadata');

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Filter sessions by date range
   */
  static filterSessionsByDateRange(
    sessions: SmartRecordingSession[], 
    startDate?: Date, 
    endDate?: Date
  ): SmartRecordingSession[] {
    return sessions.filter(session => {
      const sessionDate = new Date(session.startTime);
      
      if (startDate && sessionDate < startDate) return false;
      if (endDate && sessionDate > endDate) return false;
      
      return true;
    });
  }

  /**
   * Sort sessions by various criteria
   */
  static sortSessions(
    sessions: SmartRecordingSession[], 
    sortBy: 'date' | 'name' | 'duration' | 'actions' = 'date',
    order: 'asc' | 'desc' = 'desc'
  ): SmartRecordingSession[] {
    return [...sessions].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'date':
          comparison = a.startTime - b.startTime;
          break;
        case 'name':
          comparison = (a.taskGoal || '').localeCompare(b.taskGoal || '');
          break;
        case 'duration':
          comparison = (a.metadata.duration || 0) - (b.metadata.duration || 0);
          break;
        case 'actions':
          comparison = (a.metadata.totalActions || 0) - (b.metadata.totalActions || 0);
          break;
      }
      
      return order === 'desc' ? -comparison : comparison;
    });
  }

  /**
   * Calculate session statistics
   */
  static calculateSessionStats(sessions: SmartRecordingSession[]): {
    totalSessions: number;
    totalDuration: number;
    totalActions: number;
    averageDuration: number;
    averageActions: number;
    complexityDistribution: Record<string, number>;
  } {
    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        totalDuration: 0,
        totalActions: 0,
        averageDuration: 0,
        averageActions: 0,
        complexityDistribution: {}
      };
    }

    const totalDuration = sessions.reduce((sum, s) => sum + (s.metadata.duration || 0), 0);
    const totalActions = sessions.reduce((sum, s) => sum + (s.metadata.totalActions || 0), 0);
    
    const complexityDistribution = sessions.reduce((dist, s) => {
      const complexity = s.metadata.complexity || 'unknown';
      dist[complexity] = (dist[complexity] || 0) + 1;
      return dist;
    }, {} as Record<string, number>);

    return {
      totalSessions: sessions.length,
      totalDuration,
      totalActions,
      averageDuration: totalDuration / sessions.length,
      averageActions: totalActions / sessions.length,
      complexityDistribution
    };
  }

  /**
   * Create download link and trigger download
   */
  static downloadFile(content: string, filename: string, mimeType: string = 'application/json'): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    
    URL.revokeObjectURL(url);
  }

  /**
   * Show toast notification
   */
  static showToast(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info'): void {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
      toast!.className = 'toast';
    }, 3000);
  }

  /**
   * Deep clone object (for session manipulation)
   */
  static deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime()) as any;
    if (Array.isArray(obj)) return obj.map(item => RecordingUtils.deepClone(item)) as any;
    
    const cloned = {} as T;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = RecordingUtils.deepClone(obj[key]);
      }
    }
    return cloned;
  }

  /**
   * Sanitize session data for export (remove sensitive info)
   */
  static sanitizeSession(session: SmartRecordingSession, removeScreenshots: boolean = false): SmartRecordingSession {
    const sanitized = RecordingUtils.deepClone(session);
    
    // Remove screenshots if requested
    if (removeScreenshots) {
      sanitized.screenshots = [];
    }
    
    // Mask sensitive values
    sanitized.actions = sanitized.actions.map(action => {
      if (action.value && typeof action.value === 'string') {
        // Basic patterns for sensitive data
        if (/password|pwd|pass/i.test(action.target.description)) {
          action.value = '[MASKED]';
        }
        if (/email|e-mail/i.test(action.target.description) && action.value.includes('@')) {
          action.value = '[MASKED_EMAIL]';
        }
        if (/credit.*card|card.*number/i.test(action.target.description)) {
          action.value = '[MASKED_CARD]';
        }
      }
      return action;
    });
    
    return sanitized;
  }
}