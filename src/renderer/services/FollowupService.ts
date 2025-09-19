import { IpcRenderer, WebpageContext } from '../types';
import { getBrowserApiKeys, getExtensionDisplayName, markdownToHtml } from '../utils';
import { WorkflowService } from './WorkflowService';
import { MemoryService } from './MemoryService';
import { TabManager } from './TabManager';
import { WebviewManager } from './WebviewManager';
import { McpClientManager } from './McpClientManager';

/**
 * FollowupService handles question processing, agent routing, and result display
 */
export class FollowupService {
  private ipcRenderer: IpcRenderer;
  private workflowService: WorkflowService;
  private memoryService: MemoryService;
  private tabManager: TabManager;
  private webviewManager: WebviewManager;
  private mcpManager: McpClientManager;
  private globalQueryTracker = new Map<string, number>();

  constructor(
    ipcRenderer: IpcRenderer,
    workflowService: WorkflowService,
    memoryService: MemoryService,
    tabManager: TabManager,
    webviewManager: WebviewManager,
    mcpManager: McpClientManager
  ) {
    this.ipcRenderer = ipcRenderer;
    this.workflowService = workflowService;
    this.memoryService = memoryService;
    this.tabManager = tabManager;
    this.webviewManager = webviewManager;
    this.mcpManager = mcpManager;
  }

  public async processFollowupQuestion(question: string): Promise<void> {
    console.log('[FollowupService] Processing question:', question);
    
    // Global duplicate check - prevent same query from any path
    if (this.isQueryRecentlyProcessed(question)) {
      console.log('🚨 [GLOBAL DUPLICATE FIX] Duplicate query detected in processFollowupQuestion, aborting');
      this.showToast('This question was just processed, skipping duplicate', 'info');
      return;
    }
    
    // Prevent follow-up execution when workflow is already executing
    if (this.workflowService.isExecuting()) {
      console.log('[FollowupService] Workflow already executing, skipping follow-up execution');
      this.showToast('Workflow already in progress...', 'info');
      return;
    }
    
    // Prevent duplicate processing of the same query within 5 seconds
    const currentTime = Date.now();
    const queryKey = `followup_${question}`;
    const lastProcessedKey = `lastProcessed_${queryKey}`;
    const lastProcessedTime = parseInt(localStorage.getItem(lastProcessedKey) || '0');
    
    if (currentTime - lastProcessedTime < 5000) {
      console.log('[FollowupService] Same question processed recently, skipping duplicate execution');
      this.showToast('This question was just processed, skipping duplicate execution', 'info');
      return;
    }
    
    // Store current processing time
    localStorage.setItem(lastProcessedKey, currentTime.toString());
    
    // Set execution flag immediately to prevent race conditions
    this.workflowService.setExecuting(true);
    console.log('[FollowupService] Setting execution flag at start to prevent conflicts');
    
    // Helper function to clear loading indicators
    const clearLoadingIndicators = () => {
      const loadingMessages = document.querySelectorAll('.loading');
      loadingMessages.forEach(message => {
        const parentMessage = message.closest('.chat-message');
        if (parentMessage) {
          parentMessage.remove();
        }
      });
    };
    
    try {
      this.addMessageToChat('assistant', '<div class="loading">Processing your question...</div>');
      
      const provider = 'anthropic'; // Always use Anthropic Claude
      const apiKey = localStorage.getItem(`${provider}_api_key`);
      
      if (!apiKey) {
        clearLoadingIndicators();
        this.addMessageToChat('assistant', 'Please configure your API key in the Extensions panel.');
        this.workflowService.setExecuting(false);
        return;
      }
      
      const activeWebview = this.tabManager.getActiveWebview();
      if (!activeWebview) {
        clearLoadingIndicators();
        this.addMessageToChat('assistant', 'No active webview found.');
        this.workflowService.setExecuting(false);
        return;
      }
      
      const currentUrl = activeWebview.src || '';
      console.log('[FollowupService] Extracting page content from:', currentUrl);
      const pageContent = await this.webviewManager.extractPageContent(activeWebview);
      
      // Debug: Log that HTML content is being passed to agent
      console.log('🔍 [CONTENT DEBUG] Page content extracted for agent:');
      console.log('📄 Title:', pageContent.title);
      console.log('📝 Text content length:', pageContent.content?.length || 0, 'chars');
      console.log('🌐 HTML content length:', pageContent.html?.length || 0, 'chars');
      console.log('🔗 HTML includes links:', pageContent.html?.includes('<a ') || false);
      
      // Route request to appropriate extension for question answering
      const questionRequest = `Answer this question about the page: ${question}`;
      
      console.log('[FollowupService] Routing extension request...');
      const routingResult = await this.ipcRenderer.invoke('route-extension-request', questionRequest);
      console.log('Follow-up question routing result:', routingResult);
      console.log('Follow-up question routing result type:', routingResult.type);
      console.log('Follow-up question workflow_info:', routingResult.workflow_info);
      
      // Clear loading indicators first
      clearLoadingIndicators();
      
      // Check if routing returned a workflow result
      if (routingResult.type === 'workflow') {
        console.log('Follow-up question received workflow result:', routingResult);
        
        // Don't initialize workflow progress indicator here - let the backend workflow-start event handle it
        // This fixes the workflow ID mismatch issue where frontend uses Date.now() but backend uses uuid4()
        console.log('Follow-up workflow detected - progress will be initialized by backend workflow-start event');
        
        // Execute workflow asynchronously with progress events
        try {
          const workflowData = {
            pageContent,
            browserApiKeys: getBrowserApiKeys(),
            selectedProvider: provider,
            selectedModel: 'claude-3-5-sonnet-20241022', // Always use Claude 3.5 Sonnet
            isQuestion: true,
            conversationHistory: await this.buildConversationHistoryWithMemories(currentUrl, question),
            mcpTools: await this.getMcpToolsForAsk() // Add MCP tools to workflow data
          };  

          await this.workflowService.executeWorkflow(questionRequest, workflowData);
          
          // Workflow execution is async - progress events will handle UI updates
          // The workflow-complete event listener will call displayAgentResults when done
          
        } catch (workflowError) {
          console.error('Follow-up workflow execution failed:', workflowError);
          this.addMessageToChat('assistant', `Workflow execution failed: ${(workflowError as Error).message}`);
        }
        
        return; // Don't execute single extension path
      }
      
      // Handle single extension result
      const extensionId = routingResult.extensionId;
      if (!extensionId) {
        this.addMessageToChat('assistant', 'Error: No extension available to answer your question');
        return;
      }
      
      // Create progress indicator for single extension execution
      const progressInfo = this.workflowService.createSingleExtensionProgress(extensionId, getExtensionDisplayName(extensionId));
      
      const action = 'process_page';
      const data = {
        query: questionRequest,
        pageContent,
        isQuestion: true,
        mcpTools: await this.getMcpToolsForAsk() // Add MCP tools to extension data
      };
      
      console.log(`[FollowupService] Executing extension with question: ${extensionId} (confidence: ${routingResult.confidence}) - ${question}`);
      console.log(`Follow-up routing reason: ${routingResult.reason}`);
      
      const startTime = Date.now();
      
      try {
        const result = await this.ipcRenderer.invoke('execute-python-extension', {
          extensionId,
          action,
          data,
          browserApiKeys: getBrowserApiKeys(),
          selectedProvider: provider
        });
        
        const endTime = Date.now();
        const executionTime = endTime - startTime;
        
        console.log('[FollowupService] Extension result received:', result);
        
        // Complete the progress indicator
        if (progressInfo.progressElement && (progressInfo.progressElement as any).progressIndicator) {
          (progressInfo.progressElement as any).progressIndicator.updateProgress({
            workflowId: progressInfo.workflowData.workflowId,
            currentStep: 0,
            stepStatus: 'completed',
            stepResult: result.data
          });
          
          (progressInfo.progressElement as any).progressIndicator.completeWorkflow({
            workflowId: progressInfo.workflowData.workflowId,
            result: result.data
          });
        }
        
        if (result.success === false) {
          this.addMessageToChat('assistant', `Error: ${result.error || 'Unknown error'}`);
          return;
        }
        
        console.log('[FollowupService] Displaying results...');
        this.displayAgentResults(result.data);
        
        // Store memory if available - try multiple content sources
        if (this.memoryService && result.data) {
          let summary = '';
          
          // Try different content sources in order of preference
          if (result.data.consolidated_summary) {
            summary = result.data.consolidated_summary;
          } else if (result.data.summaries && result.data.summaries.length > 0) {
            summary = result.data.summaries.map((s: any) => `${s.title}: ${s.summary}`).join('\n\n');
          } else if (typeof result.data === 'string') {
            // Handle simple string responses
            summary = result.data;
          } else if (result.data.content) {
            // Handle responses with content field
            summary = result.data.content;
          } else if (result.data.response) {
            // Handle responses with response field
            summary = result.data.response;
          }
          
          if (summary && summary.trim()) {
            console.log('[Memory] Storing followup result in memory');
            
            // Get current page info for memory context
            const webview = this.tabManager.getActiveWebview();
            const url = webview?.src || '';
            const title = webview?.getTitle ? webview.getTitle() : '';
            
            this.storeInMemory(url, question, summary, title);
          } else {
            console.log('[Memory] No suitable content found for memory storage in followup');
          }
        }
      } catch (extensionError) {
        console.error('Follow-up extension execution failed:', extensionError);
        
        // Mark progress as failed
        if (progressInfo.progressElement && (progressInfo.progressElement as any).progressIndicator) {
          (progressInfo.progressElement as any).progressIndicator.handleWorkflowError({
            workflowId: progressInfo.workflowData.workflowId,
            error: (extensionError as Error).message
          });
        }
        
        this.addMessageToChat('assistant', `Error: ${(extensionError as Error).message}`);
      }
    } catch (error) {
      console.error('Error in processFollowupQuestion:', error);
      
      // Ensure loading indicators are cleared even on error
      clearLoadingIndicators();
      
      this.addMessageToChat('assistant', `Error: ${(error as Error).message}`);
    } finally {
      // Always clear the execution flag when function ends
      this.workflowService.setExecuting(false);
      console.log('[FollowupService] Clearing execution flag on function completion');
    }
  }

  public displayAgentResults(data: any): void {
    // Track this call for duplicate debugging
    this.workflowService.trackDisplayAgentResultsCall(data);
    
    try {
      console.log('[FollowupService] Called with data:', data);
      console.log('[FollowupService] Data type:', typeof data);
      console.log('[FollowupService] Data keys:', data ? Object.keys(data) : 'null');
      
      if (!data) {
        console.log('[FollowupService] No data - showing fallback message');
        this.addMessageToChat('assistant', 'No data received from agent');
        return;
      }

      // Prevent duplicate results within 3 seconds
      const currentTime = Date.now();
      const contentHash = JSON.stringify(data).substring(0, 200); // Use first 200 chars as hash
      const lastDisplayKey = `lastDisplayed_${contentHash}`;
      const lastDisplayTime = parseInt(localStorage.getItem(lastDisplayKey) || '0');
      
      if (currentTime - lastDisplayTime < 3000) {
        console.log('[FollowupService] Same content displayed recently, skipping duplicate');
        return;
      }
      
      // Store current display time
      localStorage.setItem(lastDisplayKey, currentTime.toString());

      console.log("[FollowupService] Agent result data:", data);
      console.log('[FollowupService] Has consolidated_summary:', !!data.consolidated_summary);
      console.log('[FollowupService] Has summaries:', !!data.summaries);
      console.log('[FollowupService] Summaries length:', data.summaries ? data.summaries.length : 'none');
      
      if (data.consolidated_summary) {
        console.log('[FollowupService] Displaying consolidated summary:', data.consolidated_summary.substring(0, 100) + '...');
        this.addMessageToChat('assistant', data.consolidated_summary, data.generation_time);
        console.log('[FollowupService] Consolidated summary displayed successfully');
      } else if (data.summaries && data.summaries.length > 0) {
        console.log('[FollowupService] Displaying individual summaries');
        const summariesText = data.summaries.map((s: any) => `<b>${s.title}</b>\n${s.summary}`).join('\n\n');
        this.addMessageToChat('assistant', summariesText, data.generation_time);
        console.log('[FollowupService] Individual summaries displayed successfully');
      } else {
        console.log('[FollowupService] No summaries found - showing fallback message');
        this.addMessageToChat('assistant', 'No relevant information found.', data.generation_time);
        console.log('[FollowupService] Fallback message displayed successfully');
      }
      
      console.log('[FollowupService] Function completed successfully');
    } catch (error) {
      console.error('[FollowupService] Error in displayAgentResults:', error);
      console.error('[FollowupService] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('[FollowupService] Data that caused error:', data);
      
      // Fallback error handling - show user-friendly message
      try {
        this.addMessageToChat('assistant', 'Error displaying results: ' + (error instanceof Error ? error.message : 'Unknown error'));
      } catch (chatError) {
        console.error('[FollowupService] Even fallback chat message failed:', chatError);
      }
    }
  }

  private addMessageToChat(role: string, content: string, timing?: number): void {
    try {
      let chatContainer = document.getElementById('chatContainer');
      
      // Create chat container if it doesn't exist
      if (!chatContainer) {
        console.log('[FollowupService] Chat container not found, creating one');
        
        const agentResults = document.getElementById('agentResults');
        if (!agentResults) {
          console.error('[FollowupService] agentResults container not found');
          return;
        }
        
        // Remove any existing welcome containers when starting chat
        const existingWelcome = agentResults.querySelector('.welcome-container');
        if (existingWelcome) {
          existingWelcome.remove();
        }
        
        // Create the chat container
        chatContainer = document.createElement('div');
        chatContainer.id = 'chatContainer';
        chatContainer.className = 'chat-container';
        agentResults.appendChild(chatContainer);
        
        console.log('[FollowupService] Chat container created successfully');
      }
      
      if (!content || content.trim() === '') {
        console.log('[FollowupService] Empty content, skipping');
        return;
      }
      
      console.log(`[FollowupService] Adding ${role} message:`, content.substring(0, 100) + '...');
      
      const messageDiv = document.createElement('div');
      
      if (role === 'context') {
        // Special handling for context messages
        messageDiv.className = 'chat-message context-message';
        messageDiv.innerHTML = `<div class="message-content">${markdownToHtml(content)}</div>`;
        messageDiv.dataset.role = 'context';
      } else if (role === 'user') {
        messageDiv.className = 'chat-message user-message';
        messageDiv.innerHTML = `<div class="message-content">${markdownToHtml(content)}</div>`;
        messageDiv.dataset.role = 'user';
        messageDiv.dataset.timestamp = new Date().toISOString();
      } else if (role === 'assistant') {
        messageDiv.className = 'chat-message assistant-message';
        messageDiv.dataset.role = 'assistant';
        messageDiv.dataset.timestamp = new Date().toISOString();
        
        // Check if content contains only a loading indicator
        const isLoading = content.includes('class="loading"') && !content.replace(/<div class="loading">.*?<\/div>/g, '').trim();
        
        // Apply markdown processing for assistant messages (but not for loading indicators)
        const processedContent = isLoading ? content : markdownToHtml(content);
        
        if (timing && !isLoading) {
          messageDiv.innerHTML = `
            <div class="timing-info">
              <span>Response generated in</span>
              <span class="time-value">${timing.toFixed(2)}s</span>
            </div>
            <div class="message-content">${processedContent}</div>
          `;
          messageDiv.dataset.genTime = timing.toFixed(2);
        } else {
          messageDiv.innerHTML = `<div class="message-content">${processedContent}</div>`;
        }
      }
      
      chatContainer.appendChild(messageDiv);
      
      // Scroll to bottom with smooth behavior
      chatContainer.scrollTop = chatContainer.scrollHeight;
      
      console.log(`[FollowupService] Message added successfully. Total messages: ${chatContainer.children.length}`);
    } catch (error) {
      console.error('[FollowupService] Error adding message to chat:', error);
      console.error('[FollowupService] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('[FollowupService] Parameters that caused error:', { role, content: content?.substring(0, 100), timing });
    }
  }

  private isQueryRecentlyProcessed(query: string, windowMs: number = 3000): boolean {
    const normalizedQuery = query.toLowerCase().trim();
    const currentTime = Date.now();
    const lastProcessedTime = this.globalQueryTracker.get(normalizedQuery) || 0;
    
    if (currentTime - lastProcessedTime < windowMs) {
      console.log('🚨 [GLOBAL DUPLICATE FIX] Query recently processed, skipping:', normalizedQuery.substring(0, 50));
      return true;
    }
    
    this.globalQueryTracker.set(normalizedQuery, currentTime);
    
    // Clean up old entries to prevent memory leaks
    if (this.globalQueryTracker.size > 100) {
      const cutoffTime = currentTime - (windowMs * 10);
      for (const [key, time] of this.globalQueryTracker.entries()) {
        if (time < cutoffTime) {
          this.globalQueryTracker.delete(key);
        }
      }
    }
    
    return false;
  }

  private async buildConversationHistoryWithMemories(currentUrl: string, question: string): Promise<any[]> {
    // This is a simplified version - implement based on your memory service
    return [];
  }

  private async getMcpToolsForAsk(): Promise<any[]> {
    if (!this.mcpManager) {
      console.log('[MCP] No MCP Manager available, returning empty tools list');
      return [];
    }

    try {
      const toolNames = await this.mcpManager.listAllTools();
      const tools = [];
      
      for (const toolName of toolNames) {
        const toolInfo = this.mcpManager.getToolInfo(toolName);
        if (toolInfo) {
          tools.push({
            name: toolName,
            description: toolInfo.description || '',
            inputSchema: toolInfo.inputSchema || {},
            serverName: toolInfo.serverName
          });
        }
      }
      
      console.log(`[MCP] Retrieved ${tools.length} tools for Ask query`);
      if (tools.length > 0) {
        console.log('[MCP] Available tools:', tools.map(t => t.name).join(', '));
      }
      return tools;
    } catch (error) {
      console.error('[MCP] Error getting MCP tools:', error);
      return [];
    }
  }

  private storeInMemory(url: string, question: string, answer: string, title: string = ''): void {
    if (this.memoryService) {
      this.memoryService.storeMemory(url, question, answer, title);
    }
  }

  private showToast(message: string, type: string = 'info'): void {
    const event = new CustomEvent('show-toast', {
      detail: { message, type }
    });
    window.dispatchEvent(event);
  }

  public destroy(): void {
    try {
      this.globalQueryTracker.clear();
      console.log('[FollowupService] Destroyed successfully');
    } catch (error) {
      console.error('[FollowupService] Error during destruction:', error);
    }
  }
}
