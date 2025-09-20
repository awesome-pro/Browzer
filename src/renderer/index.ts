// ========================= IMPORTS =========================
import './styles.css';
import './recording-session-list.css';
import './recording.css';

// Services
import { BrowserService } from './services/BrowserService';
import { TabManager } from './services/TabManager';
import { WebviewManager } from './services/WebviewManager';
import { AgentService } from './services/AgentService';
import { ExtensionStore } from './services/ExtensionStore';
import { RecordingService } from './services/RecordingService';
import { WorkflowService } from './services/WorkflowService';
import { MentionService } from './services/MentionService';
import { HistoryService } from './services/HistoryService';
import { AdBlockService } from './services/AdBlockService';

// Types
import { IpcRenderer, WebpageContext } from './types';
import { McpClientManager } from './services/McpClientManager';
import { DevToolsManager } from './components/DevToolsManager';
import { MemoryService } from './services/MemoryService';
import CONSTANTS from '../constants';
import { getBrowserApiKeys } from './utils';

// ========================= TYPES & INTERFACES =========================
interface AppState {
  isInitialized: boolean;
  homepageUrl: string;
}

// ========================= MAIN APPLICATION CLASS =========================
class BrowzerApp {
  // Core services
  private browserService: BrowserService;
  private tabManager: TabManager;
  private webviewManager: WebviewManager;
  private agentService: AgentService;
  private extensionStore: ExtensionStore;
  private recordingService: RecordingService;
  
  // New modular services
  private workflowService: WorkflowService;
  private mentionService: MentionService;
  private historyService: HistoryService;
  private adBlockService: AdBlockService;
  
  // External services
  private ipcRenderer: IpcRenderer;
  private state: AppState;
  private mcpManager: McpClientManager;
  private devToolsManager: DevToolsManager;
  public memoryService: MemoryService;
  
  public displayAgentResultsCalls: Array<{callNumber: number, timestamp: number, stackTrace: string, data: any}> = [];
  public executionFlow: Array<{timestamp: number, function: string, details: any}> = [];
  private selectedWebpageContexts: WebpageContext[] = [];

  constructor() {
    this.ipcRenderer = this.createIpcRenderer();
    this.state = {
      isInitialized: false,
      homepageUrl: localStorage.getItem(CONSTANTS.HOMEPAGE_KEY) || 'https://www.google.com'
    };

    // Initialize core services first
    this.tabManager = new TabManager();
    this.extensionStore = new ExtensionStore();
    this.historyService = new HistoryService(this.tabManager);
    this.adBlockService = new AdBlockService(this.ipcRenderer);
    this.recordingService = new RecordingService();
    this.mcpManager = new McpClientManager();
    this.devToolsManager = new DevToolsManager();
    this.memoryService = new MemoryService();

    // Initialize new modular services
    this.workflowService = new WorkflowService(this.ipcRenderer);
    this.mentionService = new MentionService();
    this.browserService = new BrowserService(this.ipcRenderer, this.tabManager, this.extensionStore);
    this.webviewManager = new WebviewManager(this.ipcRenderer, this.adBlockService, this.historyService);
    this.agentService = new AgentService(
        this.ipcRenderer, 
        this.tabManager, 
        this.mcpManager, 
        this.memoryService, 
        this.workflowService,
        this.recordingService,
        this.selectedWebpageContexts
    );

    // Bind methods
    this.handleDOMContentLoaded = this.handleDOMContentLoaded.bind(this);
    this.handleGlobalError = this.handleGlobalError.bind(this);
  }

  private createIpcRenderer(): IpcRenderer {
    return {
      invoke: (channel: string, ...args: any[]) => window.electronAPI.ipcInvoke(channel, ...args),
      send: (channel: string, ...args: any[]) => window.electronAPI.ipcSend(channel, ...args),
      on: (channel: string, callback: (...args: any[]) => void) => window.electronAPI.ipcOn(channel, callback),
      off: (channel: string, callback: (...args: any[]) => void) => window.electronAPI.ipcOff(channel, callback),
      removeAllListeners: (channel: string) => window.electronAPI.removeAllListeners(channel)
    };
  }

  // ========================= INITIALIZATION =========================
  public async init(): Promise<void> {
    try {
      document.addEventListener('DOMContentLoaded', this.handleDOMContentLoaded);
      this.setupGlobalErrorHandler();
      console.log('[BrowzerApp] Initialization started');
    } catch (error) {
      console.error('[BrowzerApp] Initialization failed:', error);
      throw error;
    }
  }

  private async handleDOMContentLoaded(): Promise<void> {
    try {
      await this.initializeUI();
      await this.initializeServices();
      this.setupEventListeners();
      this.setupIpcListeners();
      this.workflowService.setupWorkflowEventListeners();
      this.adBlockService.setupAdBlocker();
      this.agentService.setupControls();
      await this.syncApiKeysWithBackend();
      this.state.isInitialized = true;
      console.log('[BrowzerApp] Application initialized successfully');
    } catch (error) {
      console.error('[BrowzerApp] DOM initialization failed:', error);
    }
  }

  private async initializeUI(): Promise<void> {
    // Initialize UI elements
    this.tabManager.initializeElements();
    this.browserService.initializeElements();
    this.webviewManager.initializeElements();
    this.webviewManager.initializeSidebar();
    this.devToolsManager.addDevToolsButton();
    this.devToolsManager.enableDevToolsForAllWebviews();
  }

  private async initializeServices(): Promise<void> {
    await this.recordingService.initialize();
    this.agentService.setupControls();
    this.extensionStore.initialize();
    
    this.workflowService.initialize();
    this.adBlockService.initialize();
    
    this.setupRecordingIntegration();
    
    console.log('[BrowzerApp] All services initialized successfully');
  }

  private async syncApiKeysWithBackend(): Promise<void> {
    try {
      const apiKeys = getBrowserApiKeys();
      const provider = 'anthropic';
      
      console.log('[DEBUG] Syncing API keys with backend...');
      
      // Update API keys in ExtensionManager
      await this.ipcRenderer.invoke('update-browser-api-keys', apiKeys);
      
      // Update selected provider in ExtensionManager
      await this.ipcRenderer.invoke('update-selected-provider', provider);
      
      console.log('[DEBUG] Successfully synced API keys and provider with backend');
    } catch (error) {
      console.error('[DEBUG] Failed to sync API keys with backend:', error);
    }
  }

  private setupRecordingIntegration(): void {
    window.addEventListener('recording:start', (e: Event) => {
      const sessionId = (e as CustomEvent).detail?.sessionId || 
        this.recordingService.getActiveSession()?.id || 'unknown';
      this.webviewManager.notifyAllWebviews('start-recording', sessionId);
    });

    window.addEventListener('recording:stop', () => {
      this.webviewManager.notifyAllWebviews('stop-recording');
    });

    window.addEventListener('show-toast', (e: Event) => {
      const customEvent = e as CustomEvent;
      const { message, type } = customEvent.detail;
      this.showToast(message, type);
    });

    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'recording-event') {
        // Dispatch the event for the recording system to pick up
        const recordingEvent = new CustomEvent('recording:event', {
          detail: {
            type: e.data.eventType,
            timestamp: e.data.timestamp,
            data: e.data.eventData,
            context: { url: e.data.url }
          }
        });
        window.dispatchEvent(recordingEvent);
      }
    }); 
  }

  private updateContextVisualIndicators(): void {
    
    // Update UI to show selected contexts
    const chatInputArea = document.querySelector('.chat-input-area');
    if (!chatInputArea) {
      return;
    }
    
    // Remove existing context indicators
    const existingIndicators = document.querySelectorAll('.context-indicators');
    existingIndicators.forEach(indicator => indicator.remove());
    
    // Add context indicators directly attached to the chat input area
    if (this.selectedWebpageContexts.length > 0) {
      
      const contextContainer = document.createElement('div');
      contextContainer.className = 'context-indicators';
      
      this.selectedWebpageContexts.forEach(context => {
        const indicator = document.createElement('div');
        indicator.className = 'context-indicator';
        indicator.innerHTML = `
          <span class="context-title">${context.title}</span>
          <button class="context-remove" data-context-id="${context.id}">×</button>
        `;
        contextContainer.appendChild(indicator);
      });
      
      // Insert the context container right before the chat input area to create seamless connection
      chatInputArea.parentElement?.insertBefore(contextContainer, chatInputArea);
      
      // Add CSS class to chat input area to modify its styling when context is present
      chatInputArea.classList.add('has-context');
      
      // Add remove event listeners
      contextContainer.querySelectorAll('.context-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const contextId = (e.target as HTMLElement).dataset.contextId;
          if (contextId) {
            this.removeWebpageContext(contextId);
          }
        });
      });
    } else {
      // Remove the has-context class when no contexts
      chatInputArea.classList.remove('has-context');
    }
  }

  private removeWebpageContext(webpageId: string): void {
    this.selectedWebpageContexts = this.selectedWebpageContexts.filter(ctx => ctx.id !== webpageId);
    this.updateContextVisualIndicators();
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

  // ========================= EVENT LISTENERS =========================
  private setupEventListeners(): void {
    this.setupNavigationListeners();
    this.setupTabListeners();
    this.setupKeyboardShortcuts();
  }

  private setupNavigationListeners(): void {
    this.browserService.onBackClick(() => {
      const webview = this.tabManager.getActiveWebview();
      if (webview && this.webviewManager.isWebviewReady(webview)) {
        try {
          if (webview.canGoBack()) {
            webview.goBack();
          }
        } catch (error) {
          console.log('[Navigation] Back navigation failed:', error);
        }
      }
    });

    this.browserService.onForwardClick(() => {
      const webview = this.tabManager.getActiveWebview();
      if (webview && this.webviewManager.isWebviewReady(webview)) {
        try {
          if (webview.canGoForward()) {
            webview.goForward();
          }
        } catch (error) {
          console.log('[Navigation] Forward navigation failed:', error);
        }
      }
    });

    this.browserService.onReloadClick(() => {
      const webview = this.tabManager.getActiveWebview();
      if (webview) {
        webview.reload();
      }
    });

    this.browserService.onGoClick(() => {
      this.browserService.navigateToUrl();
    });

    this.browserService.onUrlEnter(() => {
      this.navigateToUrl();
    });

    this.browserService.onRunAgentClick(() => {
      this.agentService.execute();
    });
  }

  private setupTabListeners(): void {
    this.tabManager.onNewTab(() => {
      this.createNewTab();
    });

    this.tabManager.onTabSelect((tabId: string) => {
      this.selectTab(tabId);
    });

    this.tabManager.onTabClose((tabId: string) => {
      this.closeTab(tabId);
    });
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 't':
            e.preventDefault();
            this.createNewTab();
            break;
          case 'w':
            e.preventDefault();
            const activeTabId = this.tabManager.getActiveTabId();
            if (activeTabId) {
              this.closeTab(activeTabId);
            }
            break;
          case 'l':
            e.preventDefault();
            this.browserService.focusUrlBar();
            break;
          case 'Tab':
            e.preventDefault();
            this.tabManager.cycleTab(e.shiftKey ? -1 : 1);
            break;
        }
      }
    });
  }

  private setupIpcListeners(): void {
    this.ipcRenderer.on('menu-new-tab', () => {
      this.createNewTab();
    });

    this.ipcRenderer.on('menu-new-tab-with-url', (event, url) => {
      this.createNewTab(url);
    });

    this.ipcRenderer.on('menu-close-tab', () => {
      const activeTabId = this.tabManager.getActiveTabId();
      if (activeTabId) {
        this.closeTab(activeTabId);
      }
    });

    this.ipcRenderer.on('menu-reload', () => {
      const webview = this.tabManager.getActiveWebview();
      if (webview && this.webviewManager.isWebviewReady(webview)) {
        try {
          webview.reload();
        } catch (error) {
          console.log('[IPC] Reload failed:', error);
        }
      }
    });

    this.ipcRenderer.on('menu-go-back', () => {
      const webview = this.tabManager.getActiveWebview();
      if (webview && this.webviewManager.isWebviewReady(webview)) {
        try {
          if (webview.canGoBack()) {
            webview.goBack();
          }
        } catch (error) {
          console.log('[IPC] Back navigation failed:', error);
        }
      }
    });

    this.ipcRenderer.on('menu-go-forward', () => {
      const webview = this.tabManager.getActiveWebview();
      if (webview && this.webviewManager.isWebviewReady(webview)) {
        try {
          if (webview.canGoForward()) {
            webview.goForward();
          }
        } catch (error) {
          console.log('[IPC] Forward navigation failed:', error);
        }
      }
    });

    this.ipcRenderer.on('menu-show-history', () => {
      this.historyService.showHistoryPage();
    });
  }

  // ========================= PUBLIC API METHODS =========================
  public createNewTab(url: string = CONSTANTS.NEW_TAB_URL): string | null {
    try {
      const tabId = this.tabManager.createTab(url);
      if (tabId) {
        const webview = this.webviewManager.createWebview(tabId, url);
        if (webview) {
          setTimeout(() => {
            this.recordingService.setupWebviewRecording(webview);
          }, 100);
          
          this.selectTab(tabId);
          return tabId;
        }
      }
      return tabId;
    } catch (error) {
      console.error('[BrowzerApp] Failed to create new tab:', error);
      return null;
    }
  }

  public selectTab(tabId: string): void {
    try {
      this.tabManager.selectTab(tabId);
      this.browserService.updateNavigationButtons();
      this.tabManager.saveTabs();
    } catch (error) {
      console.error('[BrowzerApp] Failed to select tab:', error);
    }
  }

  public closeTab(tabId: string): void {
    this.tabManager.closeTab(tabId);
  }

  public navigateToUrl(): void {
    try {
      const url = this.browserService.getUrlBarValue();
      if (!url) return;

      if (url === 'file://browzer-store' || url === 'browzer-store') {
        this.extensionStore.show();
        return;
      }

      const processedUrl = this.browserService.processUrl(url);
      const webview = this.tabManager.getActiveWebview();
      if (webview) {
        webview.loadURL(processedUrl);
      }
    } catch (error) {
      console.error('[BrowzerApp] Navigation failed:', error);
    }
  }
  
  // ========================= ERROR HANDLING =========================
  private setupGlobalErrorHandler(): void {
    window.addEventListener('error', this.handleGlobalError);
  }

  private handleGlobalError(event: ErrorEvent): void {
    console.error('Global error caught:', event.error);
    
    if (event.error && event.error.stack) {
      console.error('Error stack:', event.error.stack);
    }
    
    try {
      this.showToast('Error: ' + (event.error ? event.error.message : 'Unknown error'));
    } catch (e) {
      console.error('Could not show toast, error occurred before UI initialized:', e);
    }
  }

  // ========================= UTILITY METHODS =========================
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

  public async testMcpIntegration(): Promise<any[]> {
    try {
      const tools = await this.getMcpToolsForAsk();
      console.log('✅ MCP Tools Retrieved:', tools.length);
      
      if (tools.length > 0) {
        console.log('📋 Available MCP Tools:');
        tools.forEach((tool, i) => {
          console.log(`   ${i + 1}. ${tool.name} (${tool.serverName})`);
          console.log(`      Description: ${tool.description || 'No description'}`);
        });
        
        console.log('\n💡 To test: Ask a question that could use these tools');
        console.log('   Example: "Find my latest email" (if gmail tools available)');
        console.log('   Example: "Create a Trello card" (if trello tools available)');
      } else {
        console.log('⚠️ No MCP tools found. Make sure you have:');
        console.log('   1. Added MCP servers in Settings → MCP Servers');
        console.log('   2. Enabled the servers');
        console.log('   3. Servers are connected successfully');
      }
      
      return tools;
    } catch (error) {
      console.error('❌ MCP Integration test failed:', error);
      return [];
    }
  }
  
  // ========================= PUBLIC API =========================
  public getPublicAPI() {
    return {
      // Core functionality
      createNewTab: this.createNewTab.bind(this),
      selectTab: this.selectTab.bind(this),
      closeTab: this.closeTab.bind(this),
      
      // Services
      tabManager: this.tabManager,
      webviewManager: this.webviewManager,
      browserService: this.browserService,
      agentService: this.agentService,
      extensionStore: this.extensionStore,
      recordingService: this.recordingService,
      workflowService: this.workflowService,
      mentionService: this.mentionService,
      historyService: this.historyService,
      adBlockService: this.adBlockService,
      memoryService: this.memoryService,
      mcpManager: this.mcpManager,

      tabs: this.tabManager.getAllTabs(),
      activeTabId: this.tabManager.getActiveTabId(),
      getActiveWebview: () => this.tabManager.getActiveWebview(),
      navigateToUrl: this.navigateToUrl.bind(this),
      executeAgent: () => this.agentService.execute(),
      showExtensionStore: () => this.extensionStore.show(),
      testMcpIntegration: this.testMcpIntegration.bind(this),

      // Utilities
      showToast: this.showToast.bind(this),
      getState: () => ({ ...this.state })
    };
  }
  // ========================= CLEANUP =========================
  public destroy(): void {
    try {
      document.removeEventListener('DOMContentLoaded', this.handleDOMContentLoaded);
      window.removeEventListener('error', this.handleGlobalError);
      
      // Cleanup core services
      this.recordingService.destroy();
      this.agentService.destroy();
      this.extensionStore.destroy();
      this.tabManager.destroy();
      this.webviewManager.destroy();
      this.browserService.destroy();
      
      // Cleanup new modular services
      this.workflowService.destroy();
      this.mentionService.destroy();
      this.adBlockService.destroy();
      
      this.state.isInitialized = false;
      console.log('[BrowzerApp] Application destroyed');
    } catch (error) {
      console.error('[BrowzerApp] Cleanup failed:', error);
    }
  }
}

// ========================= APPLICATION BOOTSTRAP =========================
let browzerApp: BrowzerApp;

// Initialize the application
const initializeApplication = async () => {
  try {
    browzerApp = new BrowzerApp();
    await browzerApp.init();
    
    // Expose public API to window
    (window as any).browzerApp = browzerApp.getPublicAPI();
    
    console.log('[Bootstrap] Browzer application started successfully');
  } catch (error) {
    console.error('[Bootstrap] Failed to initialize Browzer application:', error);
    
    // Show error to user
    document.body.innerHTML = `
      <div style="padding: 20px; color: red; font-family: Arial, sans-serif;">
        <h1>Application Failed to Initialize</h1>
        <p>Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
        <p>Please refresh the page or contact support if the problem persists.</p>
      </div>
    `;
  }
};

// Start the application
initializeApplication();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (browzerApp) {
    browzerApp.destroy();
  }
});

// Export for testing purposes
export { BrowzerApp };
export default () => browzerApp;