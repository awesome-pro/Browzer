import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { AppManager } from '../main/AppManager';
import { WindowManager } from '../main/WindowManager';
import { ExtensionManager } from '../main/ExtensionManager';
import { AgentManager } from '../main/AgentManager';
import { MenuManager } from '../main/MenuManager';
import { LLMService, LLMRequest } from '../main/LLMService';
import { LLMLogger } from '../main/LLMLogger';

// Set the application name early
app.setName('Browzer');
process.title = 'Browzer';

// Startup logging for debugging
function logStartup(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  // Log to console
  console.log(message);
  
  // Log to file for debugging packaged apps
  try {
    const logFile = path.join(app.getPath('userData'), 'startup-debug.log');
    fs.appendFileSync(logFile, logMessage);
  } catch (error) {
    // Ignore file write errors during startup
  }
}

// Global error handlers for packaged apps
process.on('uncaughtException', (error) => {
  logStartup(`FATAL ERROR - Uncaught Exception: ${error.message}`);
  logStartup(`Stack: ${error.stack}`);
  
  // Don't crash the app for EPIPE errors (broken pipe) - these are common with subprocess communication
  if (error.message && error.message.includes('EPIPE') || (error as any).code === 'EPIPE') {
    logStartup('EPIPE error detected - continuing without crash (subprocess communication issue)');
    console.warn('EPIPE error handled gracefully - subprocess pipe closed:', error.message);
    return; // Don't quit the app
  }
  
  dialog.showErrorBox(
    'Browzer - Fatal Error',
    `An unexpected error occurred:\n\n${error.message}\n\nThe application will now close.`
  );
  
  app.quit();
});

process.on('unhandledRejection', (reason, promise) => {
  logStartup(`FATAL ERROR - Unhandled Promise Rejection: ${reason}`);
  
  dialog.showErrorBox(
    'Browzer - Fatal Error', 
    `An unexpected error occurred:\n\n${reason}\n\nThe application will now close.`
  );
  
  app.quit();
});

logStartup('=== Browzer Application Starting ===');
logStartup(`App Version: ${app.getVersion()}`);
logStartup(`Electron Version: ${process.versions.electron}`);
logStartup(`Node Version: ${process.versions.node}`);
logStartup(`Platform: ${process.platform} ${process.arch}`);
logStartup(`App Path: ${app.getAppPath()}`);
logStartup(`Is Packaged: ${app.isPackaged}`);

// Proper certificate handling for production
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  console.warn('[SSL Certificate Error]', {
    url: url,
    error: error,
    issuer: certificate.issuer,
    subject: certificate.subject,
    validFrom: certificate.validStart,
    validTo: certificate.validExpiry
  });
  
  // Let the system handle certificate validation properly
  // This will show certificate error pages to users instead of silently failing
  callback(false);
});

class BrowzerApp {
  private appManager: AppManager;
  private windowManager: WindowManager;
  private extensionManager: ExtensionManager;
  private agentManager: AgentManager;
  private menuManager: MenuManager;
  private llmService: LLMService;

  constructor() {
    this.appManager = new AppManager();
    this.windowManager = new WindowManager();
    this.extensionManager = new ExtensionManager();
    this.agentManager = new AgentManager();
    this.menuManager = new MenuManager();
    this.llmService = new LLMService();
  }

  async initialize(): Promise<void> {
    // Set up IPC handlers
    this.setupIpcHandlers();
    
    // Initialize all managers
    await this.appManager.initialize();
    await this.extensionManager.initialize();
    
    // Create the main window first
    const mainWindow = await this.windowManager.createMainWindow();
    
    // Initialize agent manager with main window reference for workflow progress
    this.agentManager.initialize(mainWindow);
    this.menuManager.initialize();
    
    // Load extensions
    await this.extensionManager.loadExtensions();
  }

  private setupIpcHandlers(): void {
    // Ad Blocker handlers
    ipcMain.handle('get-adblock-css', async () => {
      try {
        return this.appManager.getAdBlocker().getCSSRules();
      } catch (error) {
        console.error('[Main] Error getting ad block CSS:', error);
        return '';
      }
    });

    ipcMain.handle('toggle-adblock', async (event, enabled: boolean) => {
      try {
        this.appManager.getAdBlocker().setEnabled(enabled);
        return { success: true };
      } catch (error) {
        console.error('[Main] Error toggling ad blocker:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('get-adblock-status', async () => {
      try {
        const adBlocker = this.appManager.getAdBlocker();
        return {
          enabled: adBlocker.isEnabled(),
          stats: adBlocker.getStats()
        };
      } catch (error) {
        console.error('[Main] Error getting ad blocker status:', error);
        return { enabled: false, stats: { blockedDomains: 0, cssRules: 0, filterRules: 0 } };
      }
    });

    ipcMain.handle('add-blocked-domain', async (event, domain: string) => {
      try {
        this.appManager.getAdBlocker().addBlockedDomain(domain);
        return { success: true };
      } catch (error) {
        console.error('[Main] Error adding blocked domain:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('add-allowed-domain', async (event, domain: string) => {
      try {
        this.appManager.getAdBlocker().addAllowedDomain(domain);
        return { success: true };
      } catch (error) {
        console.error('[Main] Error adding allowed domain:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('remove-blocked-domain', async (event, domain: string) => {
      try {
        this.appManager.getAdBlocker().removeBlockedDomain(domain);
        return { success: true };
      } catch (error) {
        console.error('[Main] Error removing blocked domain:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('remove-allowed-domain', async (event, domain: string) => {
      try {
        this.appManager.getAdBlocker().removeAllowedDomain(domain);
        return { success: true };
      } catch (error) {
        console.error('[Main] Error removing allowed domain:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    // LLM API call handler
    ipcMain.handle('call-llm', async (event, request: LLMRequest) => {
      try {
        console.log('[Main] Handling LLM call for provider:', request.provider);
        const response = await this.llmService.callLLM(request);
        console.log('[Main] LLM call completed, success:', response.success);
        return response;
      } catch (error) {
        console.error('[Main] LLM call failed:', error);
        return {
          success: false,
          error: (error as Error).message
        };
      }
    });

    // LLM logging handlers
    ipcMain.handle('log-llm-request', async (event, logData) => {
      try {
        const logger = LLMLogger.getInstance();
        logger.logRequest(logData);
      } catch (error) {
        console.error('[Main] Failed to log LLM request:', error);
      }
    });

    ipcMain.handle('log-llm-response', async (event, logData) => {
      try {
        const logger = LLMLogger.getInstance();
        logger.logRequest(logData);
      } catch (error) {
        console.error('[Main] Failed to log LLM response:', error);
      }
    });

    // Path resolution handlers for packaged apps
    ipcMain.handle('get-app-path', async () => {
      return app.getAppPath();
    });

    ipcMain.handle('get-resource-path', async (event, relativePath: string) => {
      if (app.isPackaged) {
        // For packaged apps, HTML/CSS files are in app.asar.unpacked
        return path.join(process.resourcesPath, 'app.asar.unpacked', relativePath);
      } else {
        return path.join(process.cwd(), relativePath);
      }
    });

    console.log('[Main] IPC handlers set up for LLM service');
  }
}

// Handle app lifecycle
app.whenReady().then(async () => {
  try {
    logStartup('App ready event fired');
    const browzerApp = new BrowzerApp();
    logStartup('BrowzerApp instance created');
    await browzerApp.initialize();
    logStartup('BrowzerApp initialization completed successfully');
  } catch (error) {
    logStartup(`FATAL ERROR - Failed to initialize application: ${error}`);
    console.error('Failed to initialize application:', error);
    
    dialog.showErrorBox(
      'Browzer - Startup Error',
      `Failed to start Browzer:\n\n${error}\n\nPlease check the logs for more details.`
    );
    
    app.quit();
  }
});

// Handle app quit events (including force quit from dock)
app.on('before-quit', async (event) => {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length > 0) {
    // Prevent quit to allow save to complete
    event.preventDefault();
    
    try {
      // Request renderer to save session with timeout
      const mainWindow = windows[0];
      
      // Give renderer 2 seconds to save, then force quit
      const saveTimeout = setTimeout(() => {
        app.exit(0);
      }, 2000);
      
      // Try to communicate with renderer
      try {
        await mainWindow.webContents.executeJavaScript(`
          (function() {
            try {
              // Try multiple ways to access the function
              let saveFn = null;
              if (typeof autoSaveTabs === 'function') {
                saveFn = autoSaveTabs;
              } else if (typeof window.autoSaveTabs === 'function') {
                saveFn = window.autoSaveTabs;
              } else {
                return { success: false, error: 'autoSaveTabs function not available' };
              }
              
              saveFn();
              return { success: true, message: 'Save completed' };
              
            } catch (error) {
              return { success: false, error: error.message || error.toString() };
            }
          })();
        `);
      } catch (jsError) {
        // Ignore JavaScript execution errors - app will still quit
      }
      
      // Clear timeout and quit after short delay
      clearTimeout(saveTimeout);
      setTimeout(() => {
        app.exit(0);
      }, 500);
      
    } catch (error) {
      // Force quit after 1 second if save fails
      setTimeout(() => {
        app.exit(0);
      }, 1000);
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const browzerApp = new BrowzerApp();
    await browzerApp.initialize();
  }
}); 