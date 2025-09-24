import { IUIService } from './interfaces';
import { ExecuteStep } from '../types';


export class UIService implements IUIService {

  public addMessageToChat(role: string, content: string, timing?: number): void {
    try {
      let chatContainer = document.getElementById('chatContainer');
      
      if (!chatContainer) {
        const agentResults = document.getElementById('agentResults');
        if (!agentResults) return;
        
        const existingWelcome = agentResults.querySelector('.welcome-container');
        if (existingWelcome) existingWelcome.remove();
        
        chatContainer = document.createElement('div');
        chatContainer.id = 'chatContainer';
        chatContainer.className = 'chat-container';
        agentResults.appendChild(chatContainer);
      }
      
      if (!content || content.trim() === '') return;
      
      const messageDiv = document.createElement('div');
      messageDiv.className = `chat-message ${role}-message`;
      messageDiv.dataset.role = role;
      messageDiv.dataset.timestamp = new Date().toISOString();
      
      const isLoading = content.includes('class="loading"');
      const processedContent = isLoading ? content : this.markdownToHtml(content);
      
      if (timing && !isLoading) {
        messageDiv.innerHTML = `
          <div class="timing-info">Response generated in ${timing.toFixed(2)}s</div>
          <div class="message-content">${processedContent}</div>
        `;
      } else {
        messageDiv.innerHTML = `<div class="message-content">${processedContent}</div>`;
      }
      
      chatContainer.appendChild(messageDiv);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    } catch (error) {
      console.error('[UIService] Error adding message to chat:', error);
    }
  }


  public clearLoadingMessages(): void {
    const loadingMessages = document.querySelectorAll('.loading');
    Array.from(loadingMessages).forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) parentMessage.remove();
    });
  }


  public markdownToHtml(markdown: string): string {
    return markdown
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/```([^`]*?)```/gim, '<pre><code>$1</code></pre>')
      .replace(/`([^`]*?)`/gim, '<code>$1</code>')
      .replace(/^(?!<[hou])\s*([^\n].*)$/gim, '<p>$1</p>')
      .replace(/\n/g, '<br/>');
  }


  public generateContextAnalysis(instruction: string, session: any): string {
    const analysis = `## Task Analysis

**New Task:** ${instruction}
**Referenced Workflow:** ${session.taskGoal}
**Session Success:** ${session.metadata.success ? 'Yes' : 'No'}
**Complexity:** ${session.metadata.complexity}
**Original Steps:** ${session.actions.length}
**Pages Visited:** ${session.metadata.pagesVisited.length}

### Workflow Pattern
The recorded session shows a **${this.identifyWorkflowPattern(session)}** pattern. I'll adapt this proven workflow to execute your new task while maintaining the same reliable sequence of actions.

### Adaptation Strategy
I'll modify the specific targets, values, and selectors from the recording to match your new requirements while preserving the timing and flow that made the original workflow successful.`;

    return analysis;
  }


  public displayExecutionPlan(
    steps: ExecuteStep[], 
    session: any, 
    maxRetries: number = 2,
    stepTimeout: number = 30000,
    totalTimeout: number = 120000
  ): void {
    let planMessage = `## Execution Plan

I've analyzed the recorded workflow and generated **${steps.length} execution steps** based on the proven pattern. Here's what I'll do:

### Steps Overview:`;

    steps.forEach((step, index) => {
      planMessage += `\n${index + 1}. ${step.action} - ${step.description}`;
      if (step.reasoning) {
        planMessage += `\n   *${step.reasoning}*`;
      }
    });

    planMessage += `\n\n### Execution Settings
- **Max retries per step:** ${maxRetries}
- **Step timeout:** ${stepTimeout / 1000}s
- **Total timeout:** ${totalTimeout / 1000}s

I'll now begin executing these steps. You'll see real-time progress updates as each step completes.`;

    this.addMessageToChat('assistant', planMessage);
  }


  public updateStepProgress(index: number, step: ExecuteStep, status: string, result?: any, error?: string): void {
    const statusIcon = status === 'completed' ? '✅' : 
                      status === 'failed' ? '❌' : 
                      status === 'running' ? '🔄' : '⭕';

    
    let progressMessage = `**Step ${index + 1}:** ${step.description} ${statusIcon}`;
    
    if (status === 'running') {
      progressMessage += '\n  *Executing...*';
    } else if (status === 'completed' && result?.message) {
      progressMessage += `\n  ✓ ${result.message}`;
    } else if (status === 'failed' && error) {
      progressMessage += `\n  ⚠️ ${error}`;
    }

    if (step.startTime && step.endTime) {
      const duration = step.endTime - step.startTime;
      progressMessage += `\n  ⏱️ ${duration}ms`;
    }

    this.addMessageToChat('assistant', progressMessage);
  }


  public displayExecutionSummary(
    steps: ExecuteStep[], 
    successCount: number, 
    failureCount: number, 
    executionTime: number,
    overallSuccess: boolean
  ): void {
    const summary = `## Execution Summary

${overallSuccess ? '🎉 **Task Completed Successfully!**' : '⚠️ **Task Completed with Issues**'}

### Results:
- **Total Steps:** ${steps.length}
- **Successful:** ${successCount} ✅
- **Failed:** ${failureCount} ❌
- **Success Rate:** ${Math.round((successCount / steps.length) * 100)}%
- **Execution Time:** ${(executionTime / 1000).toFixed(2)}s

### Performance Analysis:
${this.generatePerformanceAnalysis(steps, executionTime)}

${failureCount > 0 ? `### Failed Steps:
${steps.filter(s => s.status === 'failed').map((s) => 
  `- **Step ${steps.indexOf(s) + 1}:** ${s.description}\n  Error: ${s.error}`
).join('\n')}` : ''}

The task execution is now complete. ${overallSuccess ? 'All critical steps were successful.' : 'Some steps failed, but the main workflow completed.'}`;

    this.addMessageToChat('assistant', summary);
  }


  private generatePerformanceAnalysis(steps: ExecuteStep[], totalTime: number): string {
    const avgStepTime = totalTime / steps.length;
    const slowSteps = steps.filter(s => 
      s.startTime && s.endTime && (s.endTime - s.startTime) > avgStepTime * 2
    );

    let analysis = `- **Average step time:** ${avgStepTime.toFixed(0)}ms`;
    
    if (slowSteps.length > 0) {
      analysis += `\n- **Slower steps:** ${slowSteps.length} (primarily wait operations)`;
    }

    if (totalTime > 30000) {
      analysis += `\n- **Note:** Extended execution time due to page loading and dynamic content`;
    }

    return analysis;
  }


  private identifyWorkflowPattern(session: any): string {
    const actions = session.actions.map((a: any) => a.type);
    const hasSearch = session.taskGoal.toLowerCase().includes('search');
    const hasForm = actions.includes('input') && actions.includes('submit');
    const hasNavigation = actions.includes('navigation');
    
    if (hasSearch) return 'search and discovery';
    if (hasForm) return 'form submission';
    if (hasNavigation) return 'multi-page navigation';
    return 'interactive workflow';
  }
}
