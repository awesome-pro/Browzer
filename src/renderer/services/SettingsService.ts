import { TabService } from './TabService';

/**
 * SettingsService handles the settings page functionality
 */
export class SettingsService {
  private tabService: TabService;

  constructor(tabService: TabService) {
    this.tabService = tabService;
  }

  /**
   * Shows the settings page in the current tab or a new tab
   * @param section Optional settings section to navigate to
   */
  public async showSettingsPage(section?: string): Promise<void> {
    try {
      const webview = this.tabService.getActiveWebview();
      
      // Get the actual file path to settings.html
      let settingsFilePath;
      try {
        settingsFilePath = await (window as any).electronAPI.getResourcePath('src/renderer/settings.html');
      } catch (error) {
        console.error('[SettingsService] Failed to get resource path:', error);
        // Fallback to development path
        const cwd = (window as any).electronAPI.cwd();
        settingsFilePath = (window as any).electronAPI.path.join(cwd, 'src/renderer/settings.html');
      }
      
      // Construct the proper file URL
      let settingsURL = `file://${settingsFilePath}`;
      
      // Add section anchor if provided
      if (section) {
        settingsURL += `#${section}`;
      }
      
      if (webview) {
        // Use existing tab
        webview.loadURL(settingsURL);
      } else {
        // Create new tab
        this.tabService.createTab(settingsURL);
      }
    } catch (error) {
      console.error('[SettingsService] Error opening settings page:', error);
    }
  }

  /**
   * Shows the extensions panel
   */
  public showExtensionsPanel(): void {
    try {
      const extensionsPanel = document.getElementById('extensionsPanel');
      if (extensionsPanel) {
        extensionsPanel.classList.remove('hidden');
        
        // Setup close button handler
        const closeBtn = document.getElementById('closeExtensionsBtn');
        if (closeBtn) {
          // Remove existing event listeners by cloning the button
          const newCloseBtn = closeBtn.cloneNode(true);
          closeBtn.parentNode?.replaceChild(newCloseBtn, closeBtn);
          
          // Add new event listener
          newCloseBtn.addEventListener('click', () => {
            extensionsPanel.classList.add('hidden');
          });
        }
      } else {
        console.error('[SettingsService] Extensions panel not found');
      }
    } catch (error) {
      console.error('[SettingsService] Error showing extensions panel:', error);
    }
  }
}
