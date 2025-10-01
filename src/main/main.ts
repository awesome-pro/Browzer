import { app, BrowserWindow, ipcMain, dialog, IpcMainInvokeEvent, session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { AppManager } from '../main/AppManager';
import { WindowManager } from '../main/WindowManager';
import { ExtensionManager } from '../main/ExtensionManager';
import { AgentManager } from '../main/AgentManager';
import { MenuManager } from '../main/MenuManager';
import { LLMService, LLMRequest } from '../main/LLMService';
import { LLMLogger } from '../main/LLMLogger';
import { EmailService } from './services/EmailService';
import { UserService } from './services/UserService';
import { BrowserImportService } from './services/BrowserImportService';
app.setName('Browzer');
process.title = 'Browzer';
function logStartup(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  try {
    const logFile = path.join(app.getPath('userData'), 'startup-debug.log');
    fs.appendFileSync(logFile, logMessage);
  } catch (error) {
  }
}
process.on('uncaughtException', (error) => {
  logStartup(`FATAL ERROR - Uncaught Exception: ${error.message}`);
  logStartup(`Stack: ${error.stack}`);
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
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  console.warn('[SSL Certificate Error]', {
    url: url,
    error: error,
    issuer: certificate.issuer,
    subject: certificate.subject,
    validFrom: certificate.validStart,
    validTo: certificate.validExpiry
  });
  callback(false);
});

class BrowzerApp {
  private appManager: AppManager;
  private windowManager: WindowManager;
  private extensionManager: ExtensionManager;
  private agentManager: AgentManager;
  private menuManager: MenuManager;
  private llmService: LLMService;
  private emailService: EmailService;
  private userService: UserService;
  private browserImportService: BrowserImportService;

  constructor() {
    this.appManager = new AppManager();
    this.windowManager = new WindowManager();
    this.extensionManager = new ExtensionManager();
    this.agentManager = new AgentManager();
    this.menuManager = new MenuManager();
    this.llmService = new LLMService();
    this.emailService = new EmailService();
    this.userService = new UserService();
    this.browserImportService = new BrowserImportService();
  }

  async initialize(): Promise<void> {
    this.setupIpcHandlers();
    await this.appManager.initialize();
    await this.extensionManager.initialize();
    const mainWindow = await this.windowManager.createMainWindow();


    this.agentManager.initialize(mainWindow);
    this.menuManager.initialize();
    await this.extensionManager.loadExtensions();
  }

  async createMainWindow(): Promise<BrowserWindow> {
    return await this.windowManager.createMainWindow();
  }

  private setupIpcHandlers(): void {
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
    ipcMain.handle('call-llm', async (event, request: LLMRequest) => {
      try {
        return await this.llmService.callLLM(request);
      } catch (error) {
        console.error('[Main] LLM call failed:', error);
        return { success: false, error: (error as Error).message };
      }
    });
    ipcMain.handle('log-llm-request', async (event, logData) => {
      try {
        LLMLogger.getInstance().logRequest(logData);
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
    ipcMain.handle('get-app-path', async () => {
      return app.getAppPath();
    });

    ipcMain.handle('get-resource-path', async (event, relativePath: string) => {
      if (app.isPackaged) {
        return path.join(process.resourcesPath, 'app.asar.unpacked', relativePath);
      } else {
        return path.join(process.cwd(), relativePath);
      }
    });
    ipcMain.handle('onboarding-completed', async (event, data) => {
      try {
        await this.windowManager.handleOnboardingComplete(data);
        return { success: true };
      } catch (error: any) {
        console.error('Error handling onboarding completion:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('close-onboarding', async (event) => {
      try {
        await this.windowManager.handleCloseOnboarding();
        return { success: true };
      } catch (error: any) {
        console.error('Error closing onboarding:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('save-api-key', async (event, data: { provider: string; key: string }) => {
      try {
        const userDataPath = app.getPath('userData');
        const apiKeysFile = path.join(userDataPath, 'api-keys.json');
        
        let apiKeys = {};
        if (fs.existsSync(apiKeysFile)) {
          try {
            apiKeys = JSON.parse(fs.readFileSync(apiKeysFile, 'utf8'));
          } catch (error) {
            console.warn('Failed to read existing API keys:', error);
          }
        }
        
        (apiKeys as any)[data.provider] = data.key;
        fs.writeFileSync(apiKeysFile, JSON.stringify(apiKeys, null, 2));
        this.extensionManager.updateBrowserApiKeys(apiKeys as Record<string, string>);
        
        return { success: true };
      } catch (error: any) {
        console.error('Error saving API key:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('open-settings', async (event) => {
      try {
        console.log('⚙️ Opening settings from onboarding');
        return { success: true };
      } catch (error: any) {
        console.error('Error opening settings:', error);
        return { success: false, error: error.message };
      }
    });
    ipcMain.handle('path-join', async (event: IpcMainInvokeEvent, segments: string[]) => {
      return path.join(...segments);
    });
    
    ipcMain.handle('path-dirname', async (event: IpcMainInvokeEvent, p: string) => {
      return path.dirname(p);
    });
    
    ipcMain.handle('path-basename', async (event: IpcMainInvokeEvent, p: string, ext?: string) => {
      return path.basename(p, ext);
    });
    
    ipcMain.handle('path-extname', async (event: IpcMainInvokeEvent, p: string) => {
      return path.extname(p);
    });
    
    ipcMain.handle('path-resolve', async (event: IpcMainInvokeEvent, segments: string[]) => {
      return path.resolve(...segments);
    });
    
    ipcMain.handle('path-relative', async (event: IpcMainInvokeEvent, from: string, to: string) => {
      return path.relative(from, to);
    });
    
    ipcMain.handle('path-isAbsolute', async (event: IpcMainInvokeEvent, p: string) => {
      return path.isAbsolute(p);
    });
    
    ipcMain.handle('path-normalize', async (event: IpcMainInvokeEvent, p: string) => {
      return path.normalize(p);
    });
    ipcMain.handle('send-otp', async (event, email: string) => {
      try {
        return await this.emailService.sendOTP(email);
      } catch (error: any) {
        console.error('Error sending OTP:', error);
        return { success: false, message: 'Failed to send OTP' };
      }
    });

    ipcMain.handle('verify-otp', async (event, data: { email: string; otp: string }) => {
      try {
        const result = await this.emailService.verifyOTP(data.email, data.otp);
        if (result.success) {
          await this.userService.verifyUser(data.email);
        }
        
        return result;
      } catch (error: any) {
        console.error('Error verifying OTP:', error);
        return { success: false, message: 'Failed to verify OTP' };
      }
    });

    ipcMain.handle('configure-email-service', async (event, config: any) => {
      try {
        await this.emailService.saveConfig(config);
        return { success: true, message: 'Email service configured successfully' };
      } catch (error: any) {
        console.error('Error configuring email service:', error);
        return { success: false, message: 'Failed to configure email service' };
      }
    });

    ipcMain.handle('test-email-config', async (event) => {
      try {
        return await this.emailService.testConfiguration();
      } catch (error: any) {
        console.error('Error testing email configuration:', error);
        return { success: false, message: 'Failed to test email configuration' };
      }
    });
    ipcMain.handle('create-user', async (event, email: string) => {
      try {
        return await this.userService.createUser(email);
      } catch (error: any) {
        console.error('Error creating user:', error);
        return { success: false, message: 'Failed to create user' };
      }
    });

    ipcMain.handle('login-user', async (event, email: string) => {
      try {
        return await this.userService.loginUser(email);
      } catch (error: any) {
        console.error('Error logging in user:', error);
        return { success: false, message: 'Failed to login user' };
      }
    });

    ipcMain.handle('validate-session', async (event, sessionId: string) => {
      try {
        return await this.userService.validateSession(sessionId);
      } catch (error: any) {
        console.error('Error validating session:', error);
        return { valid: false, message: 'Failed to validate session' };
      }
    });

    ipcMain.handle('update-user-preferences', async (event, data: { userId: string; preferences: any }) => {
      try {
        return await this.userService.updateUserPreferences(data.userId, data.preferences);
      } catch (error: any) {
        console.error('Error updating user preferences:', error);
        return { success: false, message: 'Failed to update preferences' };
      }
    });

    ipcMain.handle('get-current-user', async (event) => {
      try {
        const user = this.userService.getCurrentUser();
        return { success: true, user };
      } catch (error: any) {
        console.error('Error getting current user:', error);
        return { success: false, message: 'Failed to get current user' };
      }
    });

    ipcMain.handle('logout-user', async (event, sessionId: string) => {
      try {
        return await this.userService.logout(sessionId);
      } catch (error: any) {
        console.error('Error logging out user:', error);
        return { success: false, message: 'Failed to logout user' };
      }
    });

    ipcMain.handle('save-user-email', async (event, email: string) => {
      try {
        const result = await this.userService.createUser(email);
        if (!result.success && result.message.includes('already exists')) {
          return { success: true, message: 'Email saved' };
        }
        return result;
      } catch (error: any) {
        console.error('Error saving user email:', error);
        return { success: false, message: 'Failed to save email' };
      }
    });
    ipcMain.handle('import-browser-data', async (event, data: { browser: string }) => {
      try {
        console.log(`[Main] Importing browser data from: ${data.browser}`);
        return await this.browserImportService.importBrowserData(data.browser);
      } catch (error: any) {
        console.error('Error importing browser data:', error);
        return { success: false, message: 'Failed to import browser data' };
      }
    });

    ipcMain.handle('get-imported-data', async (event) => {
      try {
        const importedData = await this.browserImportService.getImportedData();
        return { success: true, data: importedData };
      } catch (error: any) {
        console.error('Error getting imported data:', error);
        return { success: false, message: 'Failed to get imported data' };
      }
    });

    ipcMain.handle('clear-imported-data', async (event, browser?: string) => {
      try {
        return await this.browserImportService.clearImportedData(browser);
      } catch (error: any) {
        console.error('Error clearing imported data:', error);
        return { success: false, message: 'Failed to clear imported data' };
      }
    });
    

    const { initializeNativeEventMonitor } = require('./native-event-monitor');
    initializeNativeEventMonitor();
  }
}
let browzerApp: BrowzerApp | null = null;
app.whenReady().then(async () => {
  try {
    logStartup('App ready event fired');
    const { registerPythonSetupHandlers } = require('./setupPython');
    registerPythonSetupHandlers();
    logStartup('Python setup handlers registered');
    
    browzerApp = new BrowzerApp();
    logStartup('BrowzerApp instance created');
    await browzerApp.initialize();
    logStartup('BrowzerApp initialization completed successfully');

    const filter = { urls: ['*://*/*'] };
    session.defaultSession.webRequest.onBeforeRequest(filter, (details: any, callback: any) => {
      callback({});
    });
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
app.on('before-quit', async (event) => {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length > 0) {
    event.preventDefault();
    
    try {
      const mainWindow = windows[0];
      const saveTimeout = setTimeout(() => {
        app.exit(0);
      }, 2000);
      try {
        await mainWindow.webContents.executeJavaScript(`
          (function() {
            try {
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
      }
      clearTimeout(saveTimeout);
      setTimeout(() => {
        app.exit(0);
      }, 500);
      
    } catch (error) {
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
    if (!browzerApp) {
      browzerApp = new BrowzerApp();
      await browzerApp.initialize();
    } else {
      await browzerApp.createMainWindow();
    }
  }
}); 