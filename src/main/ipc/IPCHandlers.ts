import { ipcMain, shell } from 'electron';
import { BrowserManager } from '@/main/BrowserManager';
import { LayoutManager } from '@/main/window/LayoutManager';
import { WindowManager } from '@/main/window/WindowManager';
import { SettingsStore, AppSettings } from '@/main/settings/SettingsStore';
import { UserService } from '@/main/user/UserService';
import { PasswordManager } from '@/main/password/PasswordManager';
import { AutomationService } from '@/main/automation';
import { ChatSessionService } from '@/main/services/ChatSessionService';
import { RecordedAction, HistoryQuery, LLMAutomationRequest } from '@/shared/types';

/**
 * IPCHandlers - Centralized IPC communication setup
 * Registers all IPC handlers for main <-> renderer communication
 */
export class IPCHandlers {
  private settingsStore: SettingsStore;
  private userService: UserService;
  private passwordManager: PasswordManager;
  private chatSessionService: ChatSessionService;
  private automationService: AutomationService;

  constructor(
    private browserManager: BrowserManager,
    private layoutManager: LayoutManager,
    private windowManager: WindowManager
  ) {
    this.settingsStore = new SettingsStore();
    this.userService = new UserService();
    // Use the existing PasswordManager from BrowserManager instead of creating a new one
    this.passwordManager = this.browserManager.getPasswordManager();
    
    // Initialize ChatSessionService (persistent storage)
    this.chatSessionService = new ChatSessionService();
    
    // AutomationService will be initialized when needed (requires active browser view)
    this.automationService = null!;
    
    this.setupHandlers();

    console.log('IPCHandlers initialized');
  }

  private setupHandlers(): void {
    this.setupTabHandlers();
    this.setupNavigationHandlers();
    this.setupSidebarHandlers();
    this.setupRecordingHandlers();
    this.setupSettingsHandlers();
    this.setupUserHandlers();
    this.setupHistoryHandlers();
    this.setupPasswordHandlers();
    this.setupWindowHandlers();
    this.setupAutomationHandlers();
    this.setupChatSessionHandlers();
  }

  private setupTabHandlers(): void {
    ipcMain.handle('browser:create-tab', async (_, url?: string) => {
      return this.browserManager.createTab(url);
    });

    ipcMain.handle('browser:close-tab', async (_, tabId: string) => {
      return this.browserManager.closeTab(tabId);
    });

    ipcMain.handle('browser:switch-tab', async (_, tabId: string) => {
      return this.browserManager.switchToTab(tabId);
    });

    ipcMain.handle('browser:get-tabs', async () => {
      return this.browserManager.getAllTabs();
    });
  }

  private setupNavigationHandlers(): void {
    ipcMain.handle('browser:navigate', async (_, tabId: string, url: string) => {
      return this.browserManager.navigate(tabId, url);
    });

    ipcMain.handle('browser:go-back', async (_, tabId: string) => {
      return this.browserManager.goBack(tabId);
    });

    ipcMain.handle('browser:go-forward', async (_, tabId: string) => {
      return this.browserManager.goForward(tabId);
    });

    ipcMain.handle('browser:reload', async (_, tabId: string) => {
      return this.browserManager.reload(tabId);
    });

    ipcMain.handle('browser:stop', async (_, tabId: string) => {
      return this.browserManager.stop(tabId);
    });

    ipcMain.handle('browser:can-go-back', async (_, tabId: string) => {
      return this.browserManager.canGoBack(tabId);
    });

    ipcMain.handle('browser:can-go-forward', async (_, tabId: string) => {
      return this.browserManager.canGoForward(tabId);
    });
  }

  private setupSidebarHandlers(): void {
    ipcMain.handle('browser:set-sidebar-state', async (_, visible: boolean, widthPercent: number) => {
      this.layoutManager.setSidebarState(visible, widthPercent);
      this.updateLayout();
      return true;
    });
  }

  private setupRecordingHandlers(): void {
    // Start recording
    ipcMain.handle('browser:start-recording', async () => {
      return this.browserManager.startRecording();
    });

    // Stop recording - returns actions
    ipcMain.handle('browser:stop-recording', async () => {
      return this.browserManager.stopRecording();
    });

    // Save recording
    ipcMain.handle('browser:save-recording', async (_, name: string, description: string, actions: RecordedAction[]) => {
      return this.browserManager.saveRecording(name, description, actions);
    });

    // Get all recordings
    ipcMain.handle('browser:get-all-recordings', async () => {
      return this.browserManager.getAllRecordings();
    });

    // Delete recording
    ipcMain.handle('browser:delete-recording', async (_, id: string) => {
      return this.browserManager.deleteRecording(id);
    });

    // Check if recording is active
    ipcMain.handle('browser:is-recording', async () => {
      return this.browserManager.isRecordingActive();
    });

    // Get recorded actions
    ipcMain.handle('browser:get-recorded-actions', async () => {
      return this.browserManager.getRecordedActions();
    });
    
    // Video file operations
    ipcMain.handle('video:open-file', async (_, videoPath: string) => {
      try {
        await shell.openPath(videoPath);
      } catch (error) {
        console.error('Failed to open video file:', error);
        throw error;
      }
    });
    
    ipcMain.handle('video:get-file-url', async (_, videoPath: string) => {
      try {
        // Use custom protocol that Electron can serve
        return `video-file://${encodeURIComponent(videoPath)}`;
      } catch (error) {
        console.error('Failed to get video file URL:', error);
        throw error;
      }
    });
  }

  private setupSettingsHandlers(): void {
    ipcMain.handle('settings:get-all', async () => {
      return this.settingsStore.getAllSettings();
    });

    ipcMain.handle('settings:get-category', async (_, category: keyof AppSettings) => {
      return this.settingsStore.getSetting(category);
    });

    ipcMain.handle('settings:update', async (_, category: keyof AppSettings, key: string, value: unknown) => {
      this.settingsStore.updateSetting(category, key as never, value as never);
      return true;
    });

    ipcMain.handle('settings:update-category', async (_, category: keyof AppSettings, values: unknown) => {
      this.settingsStore.updateCategory(category, values as never);
      return true;
    });

    ipcMain.handle('settings:reset-all', async () => {
      this.settingsStore.resetToDefaults();
      return true;
    });

    ipcMain.handle('settings:reset-category', async (_, category: keyof AppSettings) => {
      this.settingsStore.resetCategory(category);
      return true;
    });

    ipcMain.handle('settings:export', async () => {
      return this.settingsStore.exportSettings();
    });

    ipcMain.handle('settings:import', async (_, jsonString: string) => {
      return this.settingsStore.importSettings(jsonString);
    });
  }

  private setupUserHandlers(): void {
    ipcMain.handle('user:get-current', async () => {
      return this.userService.getCurrentUser();
    });

    ipcMain.handle('user:is-authenticated', async () => {
      return this.userService.isAuthenticated();
    });

    ipcMain.handle('user:sign-in', async (_, email: string, password?: string) => {
      return this.userService.signIn(email, password);
    });

    ipcMain.handle('user:sign-out', async () => {
      return this.userService.signOut();
    });

    ipcMain.handle('user:create', async (_, data: { email: string; name: string; password?: string }) => {
      return this.userService.createUser(data);
    });

    ipcMain.handle('user:update-profile', async (_, updates: Parameters<typeof this.userService.updateProfile>[0]) => {
      return this.userService.updateProfile(updates);
    });

    ipcMain.handle('user:update-preferences', async (_, preferences: Parameters<typeof this.userService.updatePreferences>[0]) => {
      return this.userService.updatePreferences(preferences);
    });

    ipcMain.handle('user:delete-account', async () => {
      return this.userService.deleteAccount();
    });

    ipcMain.handle('user:create-guest', async () => {
      return this.userService.createGuestUser();
    });
  }

  private setupHistoryHandlers(): void {
    const historyService = this.browserManager.getHistoryService();

    ipcMain.handle('history:get-all', async (_, limit?: number) => {
      return historyService.getAll(limit);
    });

    ipcMain.handle('history:search', async (_, query: HistoryQuery) => {
      return historyService.search(query);
    });

    ipcMain.handle('history:get-today', async () => {
      return historyService.getToday();
    });

    ipcMain.handle('history:get-last-n-days', async (_, days: number) => {
      return historyService.getLastNDays(days);
    });

    ipcMain.handle('history:delete-entry', async (_, id: string) => {
      return historyService.deleteEntry(id);
    });

    ipcMain.handle('history:delete-entries', async (_, ids: string[]) => {
      return historyService.deleteEntries(ids);
    });

    ipcMain.handle('history:delete-by-date-range', async (_, startTime: number, endTime: number) => {
      return historyService.deleteByDateRange(startTime, endTime);
    });

    ipcMain.handle('history:clear-all', async () => {
      return historyService.clearAll();
    });

    ipcMain.handle('history:get-stats', async () => {
      return historyService.getStats();
    });

    ipcMain.handle('history:get-most-visited', async (_, limit?: number) => {
      return historyService.getMostVisited(limit);
    });

    ipcMain.handle('history:get-recently-visited', async (_, limit?: number) => {
      return historyService.getRecentlyVisited(limit);
    });
  }

  private updateLayout(): void {
    const agentUIView = this.windowManager.getAgentUIView();
    const baseWindow = this.windowManager.getWindow();
    
    if (!baseWindow) return;

    const bounds = baseWindow.getBounds();
    const sidebarState = this.layoutManager.getSidebarState();
    const sidebarWidth = sidebarState.visible 
      ? Math.floor(bounds.width * (sidebarState.widthPercent / 100))
      : 0;

    if (agentUIView) {
      const agentUIBounds = this.layoutManager.calculateAgentUIBounds();
      agentUIView.setBounds(agentUIBounds);
    }
    
    this.browserManager.updateLayout(bounds.width, bounds.height, sidebarWidth);
  }

  private setupWindowHandlers(): void {
    ipcMain.handle('window:toggle-maximize', async () => {
      const window = this.windowManager.getWindow();
      if (window) {
        if (window.isMaximized()) {
          window.unmaximize();
        } else {
          window.maximize();
        }
      }
    });
  }

  private setupAutomationHandlers(): void {
    // Initialize automation service with API key (no-op now, kept for compatibility)
    ipcMain.handle('automation:initialize', async () => {
      try {
        // AutomationService will be initialized when automation is executed
        return { success: true };
      } catch (error) {
        console.error('[IPC] Failed to initialize automation:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    // Execute automation
    ipcMain.handle('automation:execute', async (_, request: LLMAutomationRequest) => {
      try {
        // Get active tab's browser view
        const browserView = this.browserManager.getActiveTabView();
        
        if (!browserView) {
          return {
            success: false,
            plan: {
              id: 'error',
              steps: [],
              userPrompt: request.userPrompt,
              recordingSessionId: request.recordingSession.id,
              createdAt: Date.now(),
              status: 'failed',
              completedSteps: 0,
              failedSteps: 0
            },
            error: 'No active tab for automation',
            executionTime: 0
          };
        }

        // Initialize AutomationService with current browser view and chat session service
        this.automationService = new AutomationService(browserView, this.chatSessionService);

        const result = await this.automationService.executeAutomation(
          request,
          (step, index, total) => {
            // Send progress updates to renderer
            const agentUIView = this.windowManager.getAgentUIView();
            if (agentUIView && !agentUIView.webContents.isDestroyed()) {
              agentUIView.webContents.send('automation:progress', {
                step,
                index,
                total
              });
            }
          }
        );

        return result;
      } catch (error) {
        console.error('[IPC] Automation execution failed:', error);
        return {
          success: false,
          plan: {
            id: 'error',
            steps: [],
            userPrompt: request.userPrompt,
            recordingSessionId: request.recordingSession.id,
            createdAt: Date.now(),
            status: 'failed',
            completedSteps: 0,
            failedSteps: 0
          },
          error: (error as Error).message,
          executionTime: 0
        };
      }
    });

    // Get automation status
    ipcMain.handle('automation:get-status', async () => {
      if (!this.automationService) {
        return { isExecuting: false };
      }
      return this.automationService.getStatus();
    });

    // Cancel automation
    ipcMain.handle('automation:cancel', async () => {
      if (this.automationService) {
        this.automationService.cancel();
      }
      return { success: true };
    });
  }

  private setupChatSessionHandlers(): void {
    // Get all sessions
    ipcMain.handle('chat-session:get-all', async (_, limit?: number) => {
      try {
        return this.chatSessionService.getAllSessions(limit);
      } catch (error) {
        console.error('[IPC] Failed to get chat sessions:', error);
        return [];
      }
    });

    // Get session by ID
    ipcMain.handle('chat-session:get', async (_, sessionId: string) => {
      try {
        return this.chatSessionService.getSession(sessionId);
      } catch (error) {
        console.error('[IPC] Failed to get chat session:', error);
        return null;
      }
    });

    // Get complete session data (session + messages + tools)
    ipcMain.handle('chat-session:get-complete', async (_, sessionId: string) => {
      try {
        return this.chatSessionService.getCompleteSession(sessionId);
      } catch (error) {
        console.error('[IPC] Failed to get complete session:', error);
        return { session: null, messages: [], toolExecutions: [] };
      }
    });

    // Get sessions by status
    ipcMain.handle('chat-session:get-by-status', async (_, status: string, limit?: number) => {
      try {
        return this.chatSessionService.getSessionsByStatus(status as any, limit);
      } catch (error) {
        console.error('[IPC] Failed to get sessions by status:', error);
        return [];
      }
    });

    // Delete session
    ipcMain.handle('chat-session:delete', async (_, sessionId: string) => {
      try {
        return this.chatSessionService.deleteSession(sessionId);
      } catch (error) {
        console.error('[IPC] Failed to delete session:', error);
        return false;
      }
    });

    // Get session statistics
    ipcMain.handle('chat-session:get-stats', async () => {
      try {
        return this.chatSessionService.getStats();
      } catch (error) {
        console.error('[IPC] Failed to get session stats:', error);
        return {
          totalSessions: 0,
          completedSessions: 0,
          failedSessions: 0,
          totalTokens: 0,
          totalCost: 0
        };
      }
    });

    // Export session
    ipcMain.handle('chat-session:export', async (_, sessionId: string) => {
      try {
        return this.chatSessionService.exportSession(sessionId);
      } catch (error) {
        console.error('[IPC] Failed to export session:', error);
        throw error;
      }
    });

    // Delete old sessions
    ipcMain.handle('chat-session:delete-old', async (_, daysToKeep: number) => {
      try {
        return this.chatSessionService.deleteOldSessions(daysToKeep);
      } catch (error) {
        console.error('[IPC] Failed to delete old sessions:', error);
        return 0;
      }
    });
  }

  public cleanup(): void {
    ipcMain.removeAllListeners('browser:create-tab');
    ipcMain.removeAllListeners('browser:close-tab');
    ipcMain.removeAllListeners('browser:switch-tab');
    ipcMain.removeAllListeners('browser:get-tabs');
    ipcMain.removeAllListeners('browser:navigate');
    ipcMain.removeAllListeners('browser:go-back');
    ipcMain.removeAllListeners('browser:go-forward');
    ipcMain.removeAllListeners('browser:reload');
    ipcMain.removeAllListeners('browser:stop');
    ipcMain.removeAllListeners('browser:can-go-back');
    ipcMain.removeAllListeners('browser:can-go-forward');
    ipcMain.removeAllListeners('browser:set-sidebar-state');
    ipcMain.removeAllListeners('browser:start-recording');
    ipcMain.removeAllListeners('browser:stop-recording');
    ipcMain.removeAllListeners('browser:save-recording');
    ipcMain.removeAllListeners('browser:get-all-recordings');
    ipcMain.removeAllListeners('browser:delete-recording');
    ipcMain.removeAllListeners('browser:is-recording');
    ipcMain.removeAllListeners('browser:get-recorded-actions');
    ipcMain.removeAllListeners('settings:get-all');
    ipcMain.removeAllListeners('settings:get-category');
    ipcMain.removeAllListeners('settings:update');
    ipcMain.removeAllListeners('settings:update-category');
    ipcMain.removeAllListeners('settings:reset-all');
    ipcMain.removeAllListeners('settings:reset-category');
    ipcMain.removeAllListeners('settings:export');
    ipcMain.removeAllListeners('settings:import');
    ipcMain.removeAllListeners('user:get-current');
    ipcMain.removeAllListeners('user:is-authenticated');
    ipcMain.removeAllListeners('user:sign-in');
    ipcMain.removeAllListeners('user:sign-out');
    ipcMain.removeAllListeners('user:create');
    ipcMain.removeAllListeners('user:update-profile');
    ipcMain.removeAllListeners('user:update-preferences');
    ipcMain.removeAllListeners('user:delete-account');
    ipcMain.removeAllListeners('user:create-guest');
    ipcMain.removeAllListeners('history:get-all');
    ipcMain.removeAllListeners('history:search');
    ipcMain.removeAllListeners('history:get-today');
    ipcMain.removeAllListeners('history:get-last-n-days');
    ipcMain.removeAllListeners('history:delete-entry');
    ipcMain.removeAllListeners('history:delete-entries');
    ipcMain.removeAllListeners('history:delete-by-date-range');
    ipcMain.removeAllListeners('history:clear-all');
    ipcMain.removeAllListeners('history:get-stats');
    ipcMain.removeAllListeners('history:get-most-visited');
    ipcMain.removeAllListeners('history:get-recently-visited');
    
    // Password manager cleanup
    ipcMain.removeAllListeners('password:save');
    ipcMain.removeAllListeners('password:get-for-origin');
    ipcMain.removeAllListeners('password:get-password');
    ipcMain.removeAllListeners('password:delete');
    ipcMain.removeAllListeners('password:add-to-blacklist');
    ipcMain.removeAllListeners('password:is-blacklisted');
    
    // Window handlers cleanup
    ipcMain.removeAllListeners('window:toggle-maximize');
    
    // Automation handlers cleanup
    ipcMain.removeAllListeners('automation:initialize');
    ipcMain.removeAllListeners('automation:execute');
    ipcMain.removeAllListeners('automation:generate-plan');
    ipcMain.removeAllListeners('automation:get-status');
    ipcMain.removeAllListeners('automation:cancel');
  }

  private setupPasswordHandlers(): void {
    // Save password
    ipcMain.handle('password:save', async (_, origin: string, username: string, password: string) => {
      return this.passwordManager.saveCredential(origin, username, password);
    });

    // Get credentials for origin
    ipcMain.handle('password:get-for-origin', async (_, origin: string) => {
      return this.passwordManager.getCredentialsForOrigin(origin);
    });

    // Get decrypted password
    ipcMain.handle('password:get-password', async (_, credentialId: string) => {
      return this.passwordManager.getPassword(credentialId);
    });

    // Delete credential
    ipcMain.handle('password:delete', async (_, credentialId: string) => {
      return this.passwordManager.deleteCredential(credentialId);
    });

    // Add to blacklist
    ipcMain.handle('password:add-to-blacklist', async (_, origin: string) => {
      this.passwordManager.addToBlacklist(origin);
      return true;
    });

    // Check if blacklisted
    ipcMain.handle('password:is-blacklisted', async (_, origin: string) => {
      return this.passwordManager.isBlacklisted(origin);
    });
  }
}
