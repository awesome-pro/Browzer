import CONSTANTS from '../../constants';
import { IAgentService, IpcRenderer, WebpageContext } from '../types';
import { extractPageContent, getBrowserApiKeys, getExtensionDisplayName, markdownToHtml } from '../utils';
import { DoAgentService, DoStep, DoTask } from './DoAgent';
import { ExecuteAgentService } from './ExecuteAgentService';
import { McpClientManager } from './McpClientManager';
import { MemoryService } from './MemoryService';
import { RecordingService } from './RecordingService';
import { TabManager } from './TabManager';
import { WorkflowService } from './WorkflowService';

/**
 * AgentService handles AI agent execution and related functionality
 */
export class AgentService implements IAgentService {
  private ipcRenderer: IpcRenderer;
  private isExecuting: boolean = false;
  private tabManager: TabManager;
  private mcpManager: McpClientManager;
  private memoryService: MemoryService;
  private workflowService: WorkflowService;
  private recordingService: RecordingService;
  private executeAgentService: ExecuteAgentService;
  private selectedWebpageContexts: WebpageContext[];
  private globalQueryTracker: Map<string, number>;

  constructor(
    ipcRenderer: IpcRenderer, 
    tabManager: TabManager, 
    mcpManager: McpClientManager, 
    memoryService: MemoryService, 
    workflowService: WorkflowService,
    recordingService: RecordingService,
    selectedWebpageContexts: WebpageContext[],
  ) {
    this.ipcRenderer = ipcRenderer;
    this.tabManager = tabManager;
    this.mcpManager = mcpManager;
    this.memoryService = memoryService;
    this.workflowService = workflowService;
    this.recordingService = recordingService;
    this.selectedWebpageContexts = selectedWebpageContexts;
    this.globalQueryTracker = new Map<string, number>();
    this.executeAgentService = new ExecuteAgentService(tabManager);
  }

  public setupControls(): void {
    try {
      this.setupAgentControls();
      console.log('[AgentService] Controls setup successfully');
    } catch (error) {
      console.error('[AgentService] Failed to setup controls:', error);
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

  private setupAgentControls(): void {
    // Initialize chat UI in the fixed container
    const chatInputContainer = document.querySelector('.chat-input-container');
    if (chatInputContainer) {
      console.log('[AgentService] Chat input container found');   
      let chatInputArea = document.querySelector('.chat-input-area');
      if (!chatInputArea) {
        console.log('[AgentService] Creating chat input area');
        chatInputArea = document.createElement('div');
        chatInputArea.className = 'chat-input-area';
        chatInputArea.innerHTML = `
          <div class="chat-mode-selector">
            <label class="mode-option">
              <input type="radio" name="chatMode" value="ask" checked />
              <span>Ask</span>
            </label>
            <label class="mode-option">
              <input type="radio" name="chatMode" value="do" />
              <span>Do</span>
            </label>
            <label class="mode-option">
              <input type="radio" name="chatMode" value="execute" />
              <span>Execute</span>
            </label>
          </div>
          <div class="chat-input-row">
            <input type="text" id="chatInput" placeholder="Ask a follow-up question..." />
            <button id="sendMessageBtn" class="chat-send-btn">Send</button>
          </div>
        `;
        
        chatInputContainer.appendChild(chatInputArea);
        this.setupChatInputHandlers();
      } else {
        console.log('[AgentService] Chat input area already exists, ensuring handlers are set up');
        this.setupChatInputHandlers();
      }
    }
  }

  private setupChatInputHandlers(): void {
    console.log('[AgentService] Setting up chat input handlers...');
    
    setTimeout(() => {
      const sendButton = document.getElementById('sendMessageBtn');
      const chatInput = document.getElementById('chatInput') as HTMLInputElement;
      
      if (!sendButton || !chatInput) {
        console.error('[AgentService] Chat input elements not found');
        return;
      }
      
      console.log('[AgentService] Found chat elements, attaching handlers...');
      
      if ((sendButton as any).hasHandlers) {
        console.log('[AgentService] Handlers already set up, skipping');
        return;
      }
      
      const sendMessage = () => {
        const message = chatInput.value.trim();
        if (message) {
          const selectedMode = document.querySelector('input[name="chatMode"]:checked') as HTMLInputElement;
          const mode = selectedMode ? selectedMode.value : 'ask';
          console.log('[AgentService] Selected mode:', mode);
          
          let placeholderText = 'Ask a follow-up question...';
          if (mode === 'do') {
            placeholderText = 'Enter a task to perform...';
          } else if (mode === 'execute') {
            placeholderText = 'Describe what to do with the recording...';
          }
          chatInput.placeholder = placeholderText;
          
          this.addMessageToChat('user', message);
          
          if (mode === 'do') {
            console.log('[AgentService] Using DoAgent for automation task');
            this.processDoTask(message);
          } else if (mode === 'execute') {
            if (this.executeAgentService) {
              this.processExecuteWithRecording(message).catch(error => {
                console.error('Failed to execute with recording:', error);
                this.addMessageToChat('assistant', 'Error: Failed to execute with recording.');
              });
            } else {
              this.addMessageToChat('assistant', 'Error: Execute agent service not initialized.');
            }
          } else {
            if (this.selectedWebpageContexts.length > 0) {
              console.log('🚨 [SEND DEBUG] Found contexts, calling processFollowupQuestionWithContexts');
              this.processFollowupQuestionWithContexts(message, this.selectedWebpageContexts);
            } else {
              console.log('🚨 [SEND DEBUG] Calling processFollowupQuestion');
              this.processFollowupQuestion(message);
            }
          }
          
          chatInput.value = '';
        }
      };
      
      sendButton.addEventListener('click', (e) => {
        e.preventDefault();
        // this.hideMentionDropdown();
        sendMessage();
      });
      
      chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          // this.hideMentionDropdown();
          sendMessage();
        }
      });    
      
      const modeRadios = document.querySelectorAll('input[name="chatMode"]');
      modeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
          const mode = (e.target as HTMLInputElement).value;
          
          let placeholderText = 'Ask a follow-up question...';
          if (mode === 'do') {
            placeholderText = 'Enter a task to perform...';
          } else if (mode === 'execute') {
            placeholderText = 'Describe what to do with the recording...';
            // this.setupSessionSelectorUI();
          }
          chatInput.placeholder = placeholderText;
          
          const sidebarContent = document.querySelector('.chat-sidebar-content');
          if (sidebarContent) {
            if (mode === 'execute') {
              sidebarContent.classList.add('execute-mode');
              // this.setupSessionSelectorUI();
            } else {
              sidebarContent.classList.remove('execute-mode');
            }
          }
        });
      });
      
      (sendButton as any).hasHandlers = true;
    }, 100); 
  }

  public async execute(): Promise<void> {
    if (this.isExecuting) {
      console.log('[AgentService] Agent already executing, skipping');
      return;
    }

    this.isExecuting = true;

    try {
      const webview = this.getActiveWebview();
      if (!webview) {
        throw new Error('No active webview found');
      }

      const provider = 'anthropic'; // Always use Anthropic Claude
      
      const url = webview.src || '';
      let title = '';
      try {
        title = webview.getTitle ? webview.getTitle() : '';
      } catch (e) {
        console.error('Error getting title:', e);
        title = '';
      }
      
      if (!title) title = url;
      
      let query = url;
      if (url.includes('google.com/search')) {
        try {
          const urlObj = new URL(url);
          const searchParams = urlObj.searchParams;
          if (searchParams.has('q')) {
            query = searchParams.get('q') || '';
          }
        } catch (e) {
          console.error('Error extracting search query:', e);
        }
      } else {
        query = title;
      }

      if (this.isQueryRecentlyProcessed(query)) {
        console.log('🚨 [GLOBAL DUPLICATE FIX] Duplicate query detected in executeAgent, aborting');
        this.showToast('This query was just processed, skipping duplicate', 'info');
        return;
      }
      
      // Prevent duplicate execution
      const currentTime = Date.now();
      const queryKey = `${query}-${url}`;
      const lastProcessedKey = `lastProcessed_${queryKey}`;
      const lastProcessedTime = parseInt(localStorage.getItem(lastProcessedKey) || '0');
      
      if (currentTime - lastProcessedTime < 5000) {
        this.showToast('This query was just processed, skipping duplicate execution', 'info');
        return;
      }
      
      localStorage.setItem(lastProcessedKey, currentTime.toString());
      
      // Ensure chat input area exists
      this.ensureChatInputArea();

      this.addMessageToChat('assistant', '<div class="loading">Analyzing request and routing to appropriate agent...</div>');
      
      const pageContent = await extractPageContent(webview);
      const routingResult = await this.ipcRenderer.invoke('route-extension-request', query);
      
      this.clearLoadingMessages();

      if (routingResult.type === 'workflow') {
        // Execute workflow asynchronously - progress events will update the UI
        // The workflow-complete event listener will call displayAgentResults when done
        try {
          const workflowData = {
            pageContent,
            browserApiKeys: getBrowserApiKeys(),
            selectedProvider: provider,
            selectedModel: 'claude-3-5-sonnet-20241022', // Always use Claude 3.5 Sonnet
            isQuestion: false,
            conversationHistory: await this.buildConversationHistoryWithMemories(url, query),
            mcpTools: await this.getMcpToolsForAsk() // Add MCP tools to workflow data
          };
  
          await this.ipcRenderer.invoke('execute-workflow', {
            query,
            data: workflowData
          });
          
          // Workflow execution is async - progress events will handle UI updates
          // The workflow-complete event listener will call displayAgentResults when done
          
        } catch (workflowError) {
          console.error('Workflow execution failed:', workflowError);
          this.addMessageToChat('assistant', `Workflow execution failed: ${(workflowError as Error).message}`);
        } finally {
          // Always clear the execution flag
          this.isExecuting = false;
          console.log('[executeAgent] Workflow execution finished, clearing execution flag');
        }
        
        return; // Don't execute single extension path
      }
      
      
      const extensionId = routingResult.extensionId;
      if (!extensionId) {
        this.addMessageToChat('assistant', 'Error: No extension available for your request');
        return;
      }

      const singleExtensionWorkflowData = {
        workflowId: `single-${Date.now()}`,
        type: 'single_extension',
        steps: [{
          extensionId: extensionId,
          extensionName: getExtensionDisplayName(extensionId)
        }]
      };
      
      console.log('🚨 [SINGLE EXTENSION DEBUG] Creating progress indicator for single extension:', singleExtensionWorkflowData);
      const progressElement = this.workflowService.addWorkflowProgressToChat(singleExtensionWorkflowData);
      
      // Start the progress indicator
      if (progressElement && (progressElement as any).progressIndicator) {
        (progressElement as any).progressIndicator.startWorkflow(singleExtensionWorkflowData);
        
        // Update to running state
        (progressElement as any).progressIndicator.updateProgress({
          workflowId: singleExtensionWorkflowData.workflowId,
          currentStep: 0,
          stepStatus: 'running'
        });
      }
      
      const action = 'process_page';
      const data = {
        query,
        pageContent,
        isQuestion: false,
        conversationHistory: await this.buildConversationHistoryWithMemories(url, query),
        mcpTools: await this.getMcpToolsForAsk()
      };
      
      try {
        const result = await this.ipcRenderer.invoke('execute-python-extension', {
          extensionId,
          action,
          data,
          browserApiKeys: this.getBrowserApiKeys(),
          selectedProvider: provider
        });      

        if (progressElement && (progressElement as any).progressIndicator) {
          (progressElement as any).progressIndicator.updateProgress({
            workflowId: singleExtensionWorkflowData.workflowId,
            currentStep: 0,
            stepStatus: 'completed',
            stepResult: result.data
          });
          
          (progressElement as any).progressIndicator.completeWorkflow({
            workflowId: singleExtensionWorkflowData.workflowId,
            result: result.data
          });
        }
        
        if (result.success === false) {
          this.addMessageToChat('assistant', `Error: ${result.error}`);
        } else {
          this.displayAgentResults(result.data);
        }

        if (this.memoryService && result.data) {
          let summary = '';
          let memoryQuery = query || 'Agent Query';
          
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
            console.log('[Memory] Storing agent result in memory from workflow-complete');
            
            // Get current page info for memory context
            const webview = this.getActiveWebview();
            const url = webview?.src || '';
            const title = webview?.getTitle ? webview.getTitle() : '';
            
            this.memoryService.storeMemory(url, memoryQuery, summary, title);
          } else {
            console.log('[Memory] No suitable content found for memory storage in workflow-complete');
          }
        }

      } catch (extensionError) {
        this.addMessageToChat('assistant', `Error: ${(extensionError as Error).message}`);
      }
    } catch (error) {
      console.error("Agent execution error:", error);
      this.clearLoadingMessages();
      this.addMessageToChat('assistant', `Error: ${(error as Error).message}`);
    } finally {
      this.isExecuting = false;
      console.log('[AgentService] Clearing execution flag on function completion');
    }
  }

  private setupSessionSelectorUI(): void {
    // Check if we need to create the session list container
    let sessionListContainer = document.querySelector('.session-list-container');
    
    if (!sessionListContainer) {
      // Create the session list container
      const agentContainer = document.querySelector('.agent-container');
      const chatSidebar = document.createElement('div');
      chatSidebar.className = 'chat-sidebar';
      
      const chatSidebarContent = document.createElement('div');
      chatSidebarContent.className = 'chat-sidebar-content';
      
      sessionListContainer = document.createElement('div');
      sessionListContainer.className = 'session-list-container';
      
      // Create session list header
      const sessionListHeader = document.createElement('div');
      sessionListHeader.className = 'session-list-header';
      sessionListHeader.innerHTML = `
        <h3>Recording Sessions</h3>
        <button class="refresh-btn" title="Refresh">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/>
            <path d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/>
          </svg>
        </button>
      `;
      
      // Create session list items container
      const sessionListItems = document.createElement('div');
      sessionListItems.className = 'session-list-items';
      sessionListItems.id = 'sessionListItems';
      
      // Assemble the session list container
      sessionListContainer.appendChild(sessionListHeader);
      sessionListContainer.appendChild(sessionListItems);
      
      // Add to the DOM
      if (agentContainer) {
        chatSidebarContent.appendChild(sessionListContainer);
        chatSidebar.appendChild(chatSidebarContent);
        
        // Insert before the agent-results
        const agentResults = document.getElementById('agentResults');
        if (agentResults) {
          agentContainer.insertBefore(chatSidebar, agentResults);
          
          // Add session selection required message
          const selectionMessage = document.createElement('div');
          selectionMessage.className = 'session-selection-required';
          selectionMessage.id = 'sessionSelectionRequired';
          selectionMessage.innerHTML = `
            <strong>Please select a recording session</strong>
            <p>Select a recording from the list to use as context for your task</p>
          `;
          agentResults.insertBefore(selectionMessage, agentResults.firstChild);
        } else {
          agentContainer.appendChild(chatSidebar);
        }
      }
      
      // Setup refresh button
      const refreshBtn = sessionListHeader.querySelector('.refresh-btn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => this.loadRecordingSessions());
      }
    }
    
    // Load the recording sessions
    this.loadRecordingSessions();
  }

  private loadRecordingSessions(): void {
    if (!this.recordingService) {
      console.error('[AgentService] Recording service not initialized');
      return;
    }
    
    const sessionListItems = document.getElementById('sessionListItems');
    if (!sessionListItems) {
      console.error('[AgentService] Session list items container not found');
      return;
    }
    
    sessionListItems.innerHTML = '<div class="session-list-loading">Loading sessions...</div>';
    
    try {
      const sessions = this.recordingService.getAllSessions();
      
      if (sessions.length === 0) {
        sessionListItems.innerHTML = `
          <div class="session-list-empty">
            <svg width="48" height="48" viewBox="0 0 16 16" fill="#9ca3af">
              <path d="M13 16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V2a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10z"/>
            </svg>
            <p>No recording sessions found</p>
            <p class="session-list-empty-hint">Record a workflow first to use with Execute mode</p>
          </div>
        `;
        return;
      }
      
      sessions.sort((a, b) => b.startTime - a.startTime);
      
      sessionListItems.innerHTML = '';
      sessions.forEach(session => {
        const sessionItem = document.createElement('div');
        sessionItem.className = 'session-list-item';
        sessionItem.dataset.sessionId = session.id;
        
        // Format date
        const date = new Date(session.startTime);
        const formattedDate = date.toLocaleDateString();
        
        // Calculate duration
        const duration = session.endTime ? Math.round((session.endTime - session.startTime) / 1000) : 0;
        const formattedDuration = `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`;
        
        // Count events
        const eventCount = session.events?.length || 0;
        
        sessionItem.innerHTML = `
          <div class="session-item-name">${this.escapeHtml(session.taskGoal || 'Unnamed Session')}</div>
          <div class="session-item-info">
            <span class="session-item-date">${formattedDate}</span>
            <span class="session-item-duration">${formattedDuration}</span>
            <span class="session-item-events">${eventCount} events</span>
          </div>
        `;
        
        // Add click event
        sessionItem.addEventListener('click', () => {
          // Remove selected class from all items
          document.querySelectorAll('.session-list-item').forEach(item => {
            item.classList.remove('selected');
          });
          
          // Add selected class to clicked item
          sessionItem.classList.add('selected');
          
          // Store selected session ID
          if (this.executeAgentService) {
            this.executeAgentService.setSelectedSessionId(session.id);
            
            // Hide the selection required message
            const selectionMessage = document.getElementById('sessionSelectionRequired');
            if (selectionMessage) {
              selectionMessage.classList.add('session-selected');
            }
          }
        });
        
        sessionListItems.appendChild(sessionItem);
      });
    } catch (error) {
      console.error('[AgentService] Error loading recording sessions:', error);
      sessionListItems.innerHTML = `
        <div class="session-list-error">
          <p>Failed to load recording sessions</p>
          <button class="retry-btn">Retry</button>
        </div>
      `;
      
      // Add retry button event listener
      const retryBtn = sessionListItems.querySelector('.retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => this.loadRecordingSessions());
      }
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private async processExecuteWithRecording(message: string): Promise<void> {
    if (!this.executeAgentService) {
      this.addMessageToChat('assistant', 'Error: Execute agent service not initialized.');
      return;
    }
    
    if (this.isExecuting) {
      this.addMessageToChat('assistant', 'Another task is already in progress. Please wait for it to complete.');
      return;
    }
    
    this.isExecuting = true;
    
    try {
      // Execute the task using the ExecuteAgentService
      const result = await this.executeAgentService.executeTask(message);
      
      if (!result.success && result.error) {
        console.error('[AgentService] Execute task failed:', result.error);
      }
      
    } catch (error) {
      console.error('[AgentService] Execute with recording error:', error);
      this.addMessageToChat('assistant', `Error: ${(error as Error).message}`);
    } finally {
      this.isExecuting = false;
    }
  }

  private async getMcpToolsForAsk(): Promise<any[]> {
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
  }

  private clearLoadingIndicators = () => {
    const loadingMessages = document.querySelectorAll('.loading');
    loadingMessages.forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) {
        parentMessage.remove();
      }
    });
  };

  private async processFollowupQuestion(question: string): Promise<void> {
    if (this.isExecuting) {
      console.log('[AgentService] Agent already executing, skipping');
      return;
    }

    const currentTime = Date.now();
    const queryKey = `followup_${question}`;
    const lastProcessedKey = `lastProcessed_${queryKey}`;
    const lastProcessedTime = parseInt(localStorage.getItem(lastProcessedKey) || '0');
    
    if (currentTime - lastProcessedTime < 5000) {
      this.showToast('This question was just processed, skipping duplicate execution', 'info');
      return;
    }
    
    localStorage.setItem(lastProcessedKey, currentTime.toString());
    
    try {
      this.addMessageToChat('assistant', '<div class="loading">Processing your question...</div>');
      const provider = 'anthropic'; 
      const apiKey = localStorage.getItem(`${provider}_api_key`);
      
      if (!apiKey) {
        this.clearLoadingMessages();
        this.addMessageToChat('assistant', 'Please configure your API key in the Extensions panel.');
        return;
      }
      
      const activeWebview = this.getActiveWebview();
      if (!activeWebview) {
        this.clearLoadingMessages();
        this.addMessageToChat('assistant', 'No active webview found.');
        return;
      }
      
      const pageContent = await extractPageContent(activeWebview);
      const questionRequest = `Answer this question about the page: ${question}`;
      const routingResult = await this.ipcRenderer.invoke('route-extension-request', questionRequest);
      
      this.clearLoadingMessages();
      
      if (routingResult.type === 'workflow') {
        try {
          const workflowData = {
            pageContent,
            browserApiKeys: this.getBrowserApiKeys(),
            selectedProvider: provider,
            selectedModel: 'claude-3-5-sonnet-20241022',
            isQuestion: true,
          };

          await this.ipcRenderer.invoke('execute-workflow', {
            query: questionRequest,
            data: workflowData
          });
          
        } catch (workflowError) {
          console.error('Follow-up workflow execution failed:', workflowError);
          this.addMessageToChat('assistant', `Workflow execution failed: ${(workflowError as Error).message}`);
        }
        
        return; 
      }
      
      const extensionId = routingResult.extensionId;
      if (!extensionId) {
        this.addMessageToChat('assistant', 'Error: No extension available to answer your question');
        return;
      }
      
      const action = 'process_page';
      const data = {
        query: questionRequest,
        pageContent,
        isQuestion: true,
      };
      
      try {
        const result = await this.ipcRenderer.invoke('execute-python-extension', {
          extensionId,
          action,
          data,
          browserApiKeys: this.getBrowserApiKeys(),
          selectedProvider: provider
        });
        
        if (result.success === false) {
          this.addMessageToChat('assistant', `Error: ${result.error || 'Unknown error'}`);
          return;
        }
        
        this.displayAgentResults(result.data);

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
            const webview = this.getActiveWebview();
            const url = webview?.src || '';
            const title = webview?.getTitle ? webview.getTitle() : '';
            
            this.memoryService.storeMemory(url, question, summary, title);
          } else {
            console.log('[Memory] No suitable content found for memory storage in followup');
          }
        }
      } catch (error) {
        console.error('Error in processFollowupQuestion:', error);
      }
      this.clearLoadingMessages();
    } catch (error) {
      console.error('Error in processFollowupQuestion:', error);
      this.clearLoadingMessages();
    }
  }

  private async processFollowupQuestionWithContexts(question: string, contexts: WebpageContext[]): Promise<void> {
    if (this.isExecuting) {
      console.log('[AgentService] Workflow already executing, skipping follow-up execution');
      this.showToast('Workflow already in progress...', 'info');
      return;
    }
    
    // Set execution flag immediately to prevent race conditions
    this.isExecuting = true;
    
    try {
      this.addMessageToChat('assistant', '<div class="loading">Processing your question with webpage contexts...</div>');
      
      const provider = 'anthropic'; // Always use Anthropic Claude
      const apiKey = localStorage.getItem(`${provider}_api_key`);
      
      if (!apiKey) {
        this.clearLoadingIndicators();
        this.addMessageToChat('assistant', 'Please configure your API key in the Extensions panel.');
        this.isExecuting = false;
        return;
      } 
      
      const activeWebview = this.getActiveWebview();
      if (!activeWebview) {
        this.clearLoadingIndicators();
        this.addMessageToChat('assistant', 'No active webview found.');
        this.isExecuting = false;
        return;
      }
      
      const currentUrl = activeWebview.src || '';
      console.log('[AgentService] Extracting page content from:', currentUrl);
      const pageContent = await extractPageContent(activeWebview);
      
      const enhancedPageContent = {
        ...pageContent,
        additionalContexts: contexts.map(ctx => ({
          title: ctx.title,
          url: ctx.url,
          content: ctx.content || {}
        }))
      };
      
      const questionRequest = `Answer this question using the current page and any provided webpage contexts: ${question}`;

      const routingResult = await this.ipcRenderer.invoke('route-extension-request', questionRequest);
      
      this.clearLoadingIndicators();
      
      if (routingResult.type === 'workflow') {
        
        try {
          const workflowData = {
            pageContent: enhancedPageContent,
            browserApiKeys: this.getBrowserApiKeys(),
            selectedProvider: provider,
            selectedModel: 'claude-3-5-sonnet-20241022', // Always use Claude 3.5 Sonnet
            isQuestion: true,
            conversationHistory: await this.buildConversationHistoryWithMemories(currentUrl, question),
            mcpTools: await this.getMcpToolsForAsk() // Add MCP tools to workflow data
          };
  
          await this.ipcRenderer.invoke('execute-workflow', {
            query: questionRequest,
            data: workflowData
          });
          
        } catch (workflowError) {
          console.error('Follow-up workflow with contexts execution failed:', workflowError);
          this.addMessageToChat('assistant', `Workflow execution failed: ${(workflowError as Error).message}`);
        }
        
        return;
      }
      
      // Handle single extension result
      const extensionId = routingResult.extensionId;
      if (!extensionId) {
        this.addMessageToChat('assistant', 'Error: No extension available to answer your question');
        return;
      }
      
      // Create progress indicator for single extension execution
      const singleExtensionWorkflowData = {
        workflowId: `followup-context-single-${Date.now()}`,
        type: 'single_extension',
        steps: [{
          extensionId: extensionId,
          extensionName: getExtensionDisplayName(extensionId)
        }]
      };

      const progressElement = this.workflowService.addWorkflowProgressToChat(singleExtensionWorkflowData);
      
      // Start the progress indicator
      if (progressElement && (progressElement as any).progressIndicator) {
        (progressElement as any).progressIndicator.startWorkflow(singleExtensionWorkflowData);
        
        // Update to running state
        (progressElement as any).progressIndicator.updateProgress({
          workflowId: singleExtensionWorkflowData.workflowId,
          currentStep: 0,
          stepStatus: 'running'
        });
      }
      
      const action = 'process_page';
      const data = {
        query: questionRequest,
        pageContent: enhancedPageContent,
        isQuestion: true,
        conversationHistory: await this.buildConversationHistoryWithMemories(currentUrl, question),
        mcpTools: await this.getMcpToolsForAsk() // Add MCP tools to extension data
      };
      
      console.log(`[processFollowupQuestionWithContexts] Executing extension with question: ${extensionId} (confidence: ${routingResult.confidence}) - ${question}`);
      console.log(`Follow-up with contexts routing reason: ${routingResult.reason}`);
      
      const startTime = Date.now();
      
      try {
        const result = await this.ipcRenderer.invoke('execute-python-extension', {
          extensionId,
          action,
          data,
          browserApiKeys: this.getBrowserApiKeys(),
          selectedProvider: provider
        });
        
        const endTime = Date.now();
        
        console.log('[processFollowupQuestionWithContexts] Extension result received:', result);
        
        // Complete the progress indicator
        if (progressElement && (progressElement as any).progressIndicator) {
          (progressElement as any).progressIndicator.updateProgress({
            workflowId: singleExtensionWorkflowData.workflowId,
            currentStep: 0,
            stepStatus: 'completed',
            stepResult: result.data
          });
          
          (progressElement as any).progressIndicator.completeWorkflow({
            workflowId: singleExtensionWorkflowData.workflowId,
            result: result.data
          });
        }
        
        if (result.success === false) {
          this.addMessageToChat('assistant', `Error: ${result.error || 'Unknown error'}`);
          return;
        }
        
        console.log('[processFollowupQuestionWithContexts] Displaying results...');
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
            console.log('[Memory] Storing followup with contexts result in memory');
            
            // Get current page info for memory context
            const webview = this.getActiveWebview();
            const url = webview?.src || '';
            const title = webview?.getTitle ? webview.getTitle() : '';
            
            this.memoryService.storeMemory(url, question, summary, title);
          } else {
            console.log('[Memory] No suitable content found for memory storage in followup with contexts');
          }
        }
      } catch (extensionError) {
        console.error('Follow-up extension with contexts execution failed:', extensionError);
        
        // Mark progress as failed
        if (progressElement && (progressElement as any).progressIndicator) {
          (progressElement as any).progressIndicator.handleWorkflowError({
            workflowId: singleExtensionWorkflowData.workflowId,
            error: (extensionError as Error).message
          });
        }
        
        this.addMessageToChat('assistant', `Error: ${(extensionError as Error).message}`);
      }
    } catch (error) {
      console.error('Error in processFollowupQuestionWithContexts:', error);
      this.clearLoadingIndicators();
      this.addMessageToChat('assistant', `Error: ${(error as Error).message}`);
    } finally {
      this.isExecuting = false;
    }
  }

  private getActiveWebview(): any {
    return this.tabManager.getActiveWebview();
  }

  private getBrowserApiKeys(): Record<string, string> {
    const providers = ['anthropic'];
    const apiKeys: Record<string, string> = {};
    
    providers.forEach(provider => {
      const key = localStorage.getItem(`${provider}_api_key`);
      if (key) {
        apiKeys[provider] = key;
      }
    });
    
    return apiKeys;
  }

  private ensureChatInputArea(): void {
    const chatInputContainer = document.querySelector('.chat-input-container');
    if (chatInputContainer && !document.querySelector('.chat-input-area')) {
      const chatInputArea = document.createElement('div');
      chatInputArea.className = 'chat-input-area';
      chatInputArea.innerHTML = `
        <div class="chat-mode-selector">
          <label class="mode-option">
            <input type="radio" name="chatMode" value="ask" checked />
            <span>Ask</span>
          </label>
          <label class="mode-option">
            <input type="radio" name="chatMode" value="do" />
            <span>Do</span>
          </label>
          <label class="mode-option">
            <input type="radio" name="chatMode" value="execute" />
            <span>Execute</span>
          </label>
        </div>
        <div class="chat-input-row">
          <input type="text" id="chatInput" placeholder="Ask a follow-up question..." />
          <button id="sendMessageBtn" class="chat-send-btn">Send</button>
        </div>
      `;
      
      chatInputContainer.appendChild(chatInputArea);
      this.setupChatInputHandlers();
    }
  }

  private addMessageToChat(role: string, content: string, timing?: number): void {
    try {
      let chatContainer = document.getElementById('chatContainer');
      
      if (!chatContainer) {
        const agentResults = document.getElementById('agentResults');
        if (!agentResults) {
          return;
        }
        
        const existingWelcome = agentResults.querySelector('.welcome-container');
        if (existingWelcome) {
          existingWelcome.remove();
        } 
        chatContainer = document.createElement('div');
        chatContainer.id = 'chatContainer';
        chatContainer.className = 'chat-container';
        agentResults.appendChild(chatContainer);
      }
      
      if (!content || content.trim() === '') {
        return;
      }
      
      const messageDiv = document.createElement('div');
      
      if (role === 'context') {
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
        
        const isLoading = content.includes('class="loading"') && !content.replace(/<div class="loading">.*?<\/div>/g, '').trim();
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
      chatContainer.scrollTop = chatContainer.scrollHeight;
      
      this.ensureChatInputArea();
      
    } catch (error) {
      console.error('[AgentService] Error adding message to chat:', error);
    }
  }

  private displayAgentResults(data: any): void {
    try {
      if (!data) {
        this.addMessageToChat('assistant', 'No data received from agent');
        return;
      }
      
      const currentTime = Date.now();
      const contentHash = JSON.stringify(data).substring(0, 200); 
      const lastDisplayKey = `lastDisplayed_${contentHash}`;
      
      localStorage.setItem(lastDisplayKey, currentTime.toString());

      if (data.consolidated_summary) {
        this.addMessageToChat('assistant', data.consolidated_summary, data.generation_time);
      } else if (data.summaries && data.summaries.length > 0) {
        const summariesText = data.summaries.map((s: any) => `<b>${s.title}</b>\n${s.summary}`).join('\n\n');
        this.addMessageToChat('assistant', summariesText, data.generation_time);
      } else {
        this.addMessageToChat('assistant', 'No relevant information found.', data.generation_time);
      }
      
    } catch (error) {
      try {
        this.addMessageToChat('assistant', 'Error displaying results: ' + (error instanceof Error ? error.message : 'Unknown error'));
      } catch (chatError) {
        console.error('[AgentService] Error displaying results and adding chat message:', chatError);
      }
    }
  }

  private clearLoadingMessages(): void {
    const loadingMessages = document.querySelectorAll('.loading');
    loadingMessages.forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) {
        parentMessage.remove();
      }
    });
  }

  private showToast(message: string, type: string = 'info'): void {
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

  private async processDoTask(taskInstruction: string): Promise<void> {
    console.log('[AgentService] Processing task:', taskInstruction);
    
    if (!CONSTANTS.DOAGENT_ENABLED) {
      this.addMessageToChat('assistant', 'DoAgent functionality is disabled in this build.');
      return;
    }
  
    if (this.isExecuting) {
      console.log('[processDoTask] Workflow already executing, skipping task execution');
      this.showToast('Task already in progress...', 'info');
      return;
    }
    
    this.isExecuting = true;
    
    try {
      const activeWebview = this.getActiveWebview();
      if (!activeWebview) {
        this.addMessageToChat('assistant', 'No active webview found.');
        return;
      }
      
      const doAgent = new DoAgentService(activeWebview, (task: DoTask, step: DoStep) => {
        console.log('[DoAgentService Progress]', `Step ${step.id}: ${step.description} - ${step.status}`);
        
        let progressMessage = `**${step.id}:** ${step.description}`;
        
        if (step.reasoning) {
          progressMessage += `\n  *AI Reasoning: ${step.reasoning}*`;
        }
        
        if (step.status === 'completed') {
          progressMessage += ' ✅';
        } else if (step.status === 'failed') {
          progressMessage += ' ❌';
          if (step.error) {
            progressMessage += `\n  Error: ${step.error}`;
          }
        } else if (step.status === 'running') {
          progressMessage += ' ⏳';
        }
        
        // Find the latest assistant message and update it with progress
        const chatContainer = document.getElementById('chatContainer');
        if (chatContainer) {
          const lastMessage = chatContainer.querySelector('.chat-message.assistant-message:last-child .message-content');
          if (lastMessage) {
            // If it's a loading message, replace it
            if (lastMessage.innerHTML.includes('class="loading"')) {
              lastMessage.innerHTML = progressMessage;
            } else {
              // Add to existing message
              lastMessage.innerHTML += `<br/>${progressMessage}`;
            }
          }
        }
      });
      
      // Show initial loading message
      this.addMessageToChat('assistant', '<div class="loading">🤖 Analyzing page and planning actions with AI...</div>');
      
      // Execute the task
      const result = await doAgent.executeTask(taskInstruction);
      
      // Remove loading message
      const loadingMessages = document.querySelectorAll('.loading');
      loadingMessages.forEach(message => {
        const parentMessage = message.closest('.chat-message');
        if (parentMessage) {
          parentMessage.remove();
        }
      });
      
      // Display results
      if (result.success) {
        let resultMessage = `✅ **Task completed successfully!**\n⏱️ *Execution time: ${(result.executionTime / 1000).toFixed(2)}s*`;
        
        if (result.data) {
          // Handle generic extracted content format
          if (typeof result.data === 'string') {
            // Simple string result (like summaries)
            resultMessage += `\n\n📄 **Result:**\n${result.data}`;
          } else if (result.data.error) {
            // Error in extraction
            resultMessage += `\n\n⚠️ **Note:** ${result.data.error}`;
          } else if (result.data.url) {
            // Generic extracted content structure
            resultMessage += `\n\n📄 **Extracted from:** ${result.data.url}`;
            
            // Show headings if available
            if (result.data.headings && result.data.headings.length > 0) {
              resultMessage += '\n\n📋 **Page Structure:**\n';
              result.data.headings.slice(0, 5).forEach((heading: any) => {
                resultMessage += `${'#'.repeat(heading.level === 'h1' ? 1 : heading.level === 'h2' ? 2 : 3)} ${heading.text}\n`;
              });
            }
            
            // Show main content if available
            if (result.data.textContent && result.data.textContent.length > 0) {
              resultMessage += '\n\n📝 **Main Content:**\n';
              result.data.textContent.slice(0, 3).forEach((content: any, index: number) => {
                if (content.text && content.text.length > 50) {
                  resultMessage += `${index + 1}. ${content.text.substring(0, 200)}${content.text.length > 200 ? '...' : ''}\n`;
                }
              });
            }
            
            // Show links if available
            if (result.data.links && result.data.links.length > 0) {
              resultMessage += '\n\n🔗 **Links found:**\n';
              result.data.links.slice(0, 5).forEach((link: any, index: number) => {
                resultMessage += `${index + 1}. [${link.text}](${link.href})\n`;
              });
            }
            
            // Show lists if available
            if (result.data.lists && result.data.lists.length > 0) {
              resultMessage += '\n\n📝 **Lists found:**\n';
              result.data.lists.slice(0, 2).forEach((list: any, index: number) => {
                resultMessage += `**List ${index + 1}:**\n`;
                list.items.slice(0, 3).forEach((item: string) => {
                  resultMessage += `• ${item}\n`;
                });
              });
            }
            
            // Show page type information
            if (result.data.pageStructure) {
              const structure = result.data.pageStructure;
              const pageTypes = [];
              if (structure.hasPosts) pageTypes.push('Posts');
              if (structure.hasBookmarks) pageTypes.push('Bookmarks');
              if (structure.hasProducts) pageTypes.push('Products');
              if (structure.hasFlights) pageTypes.push('Flights');
              if (structure.hasComments) pageTypes.push('Comments');
              if (structure.hasArticles) pageTypes.push('Articles');
              
              if (pageTypes.length > 0) {
                resultMessage += `\n\n🏷️ **Page Type:** ${pageTypes.join(', ')}`;
              }
            }
            
            // Show fallback content if no structured data
            if (result.data.fallbackContent && 
                (!result.data.textContent || result.data.textContent.length === 0) &&
                (!result.data.headings || result.data.headings.length === 0)) {
              resultMessage += `\n\n📄 **Page content:**\n${result.data.fallbackContent}`;
            }
          } else {
            // Unknown result format, show as is
            resultMessage += `\n\n📄 **Result:**\n${JSON.stringify(result.data, null, 2)}`;
          }
        }
        
        this.addMessageToChat('assistant', resultMessage, result.executionTime / 1000);
      } else {
        this.addMessageToChat('assistant', `❌ **Task failed:** ${result.error}`);
      }
      
    } catch (error) {
      console.error('[processDoTask] Error executing task:', error);
      
      // Remove loading message
      const loadingMessages = document.querySelectorAll('.loading');
      loadingMessages.forEach(message => {
        const parentMessage = message.closest('.chat-message');
        if (parentMessage) {
          parentMessage.remove();
        }
      });
      
      this.addMessageToChat('assistant', `❌ **Task execution failed:** ${(error as Error).message}`);
    } finally {
      // Always clear execution flag
      this.isExecuting = false;
      console.log('[processDoTask] Clearing execution flag');
    }
  }
  
  public async buildConversationHistoryWithMemories(currentUrl: string, query: string): Promise<any[]> {
    const conversationHistory: any[] = [];
    
    try {
      // Get recent chat messages from the UI
      const chatContainer = document.getElementById('chatContainer');
      if (chatContainer) {
        const messages = chatContainer.querySelectorAll('.chat-message');
        
        // Add recent chat messages (last 10)
        const recentMessages = Array.from(messages).slice(-10);
        recentMessages.forEach(message => {
          // Skip loading messages
          if (message.querySelector('.loading')) return;
          
          // Determine role (user or assistant)
          let role = 'assistant';
          if (message.classList.contains('user-message')) {
            role = 'user';
          }
          
          // Get text content, stripping HTML
          const contentEl = message.querySelector('.message-content');
          let content = '';
          if (contentEl) {
            // Create a temporary div to extract text without HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = contentEl.innerHTML;
            content = tempDiv.textContent || tempDiv.innerText || '';
          }
          
          if (content && !content.includes('class="loading"')) {
            conversationHistory.push({
              role: role,
              content: content
            });
          }
        });
      }
      
      // Get relevant memories from localStorage (simple approach)
      try {
        const allMemories = JSON.parse(localStorage.getItem(CONSTANTS.MEMORY_KEY) || '[]');
        if (allMemories && allMemories.length > 0) {
          // Simple relevance scoring - get recent memories from same domain or with query keywords
          const relevantMemories = allMemories.slice(0, 10).filter((memory: any) => {
            if (!memory) return false;
            
            // Check domain match
            const currentDomain = currentUrl ? new URL(currentUrl).hostname : '';
            const memoryDomain = memory.domain || '';
            if (currentDomain && memoryDomain && currentDomain === memoryDomain) {
              return true;
            }
            
            // Check keyword match in question or answer
            const queryLower = query.toLowerCase();
            const questionMatch = memory.question && memory.question.toLowerCase().includes(queryLower);
            const answerMatch = memory.answer && memory.answer.toLowerCase().includes(queryLower);
            
            return questionMatch || answerMatch;
          }).slice(0, 5); // Take top 5 relevant memories
          
          console.log(`[Memory] Found ${relevantMemories.length} relevant memories for query:`, query);
          
          // Format memories with proper structure expected by Python agents
          relevantMemories.forEach((memory: any) => {
            // Add the original question as a user message with memory flag
            conversationHistory.push({
              role: 'user',
              content: memory.question,
              isMemory: true,
              source: {
                url: memory.url,
                domain: memory.domain,
                title: memory.title,
                timestamp: memory.timestamp,
                topic: memory.topic
              }
            });
            
            // Add the answer as an assistant message with memory flag  
            conversationHistory.push({
              role: 'assistant',
              content: memory.answer,
              isMemory: true,
              source: {
                url: memory.url,
                domain: memory.domain,
                title: memory.title,
                timestamp: memory.timestamp,
                topic: memory.topic
              }
            });
          });
        }
      } catch (memoryError) {
        console.error('[Memory] Error retrieving memories:', memoryError);
      }
      
           console.log(`[Memory] Built conversation history with ${conversationHistory.length} items (${conversationHistory.filter(item => item.isMemory).length} from memory)`);
       return conversationHistory;
       
     } catch (error) {
       console.error('[Memory] Error building conversation history with memories:', error);
       return conversationHistory; // Return whatever we have so far
     }
   }

  public destroy(): void {
    try {
      this.isExecuting = false;
      this.executeAgentService.destroy();
      
      console.log('[AgentService] Destroyed successfully');
    } catch (error) {
      console.error('[AgentService] Error during destruction:', error);
    }
  }
}