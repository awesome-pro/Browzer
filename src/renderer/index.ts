import './styles.css';
import './recording.css';
import './recording-session-list.css';
import { RecordingControls } from './components/RecordingControls';
import { RecordingIndicator } from './components/RecordingIndicator';
import { SessionManager } from './components/SessionManager';
import { SmartRecordingEngine } from './components/RecordingEngine';
import { initializeSessionList, processExecuteWithRecording } from './components/ExecuteModeHandlers';

const ipcRenderer = {
  invoke: (channel: string, ...args: any[]) => window.electronAPI.ipcInvoke(channel, ...args),
  send: (channel: string, ...args: any[]) => window.electronAPI.ipcSend(channel, ...args),
  on: (channel: string, callback: (...args: any[]) => void) => window.electronAPI.ipcOn(channel, callback),
  off: (channel: string, callback: (...args: any[]) => void) => window.electronAPI.ipcOff(channel, callback),
  removeAllListeners: (channel: string) => window.electronAPI.removeAllListeners(channel)
};

const DOAGENT_ENABLED = true;

interface TabInfo {
  id: string;
  url: string;
  title: string;
  isActive: boolean;
  webviewId: string;
  history: any[];
  currentHistoryIndex: number;
  isProblematicSite: boolean;
}

let tabs: TabInfo[] = [];
let activeTabId: string = '';
let webviewsContainer: HTMLElement | null = null;
let urlBar: HTMLInputElement | null = null;
let backBtn: HTMLButtonElement | null = null;
let forwardBtn: HTMLButtonElement | null = null;
let reloadBtn: HTMLButtonElement | null = null;
let goBtn: HTMLButtonElement;
let runAgentBtn: HTMLButtonElement;
let tabsContainer: HTMLElement;
let newTabBtn: HTMLElement;

const SAVED_TABS_KEY = 'saved_tabs';
const NEW_TAB_URL = 'about:blank';
const HOMEPAGE_KEY = 'homepage_url';

let homepageUrl = localStorage.getItem(HOMEPAGE_KEY) || 'https://www.google.com';

function applySidebarLayout(enabled: boolean): void {
  const browserContainer = document.querySelector('.browser-container');
  if (browserContainer) {
    if (enabled) {
      browserContainer.classList.add('sidebar-enabled');
    } else {
      browserContainer.classList.remove('sidebar-enabled');
    }
  }
}

function initializeSidebar(): void {
  const rawValue = localStorage.getItem('sidebarEnabled');
  const savedSidebarEnabled = rawValue === 'true';  
  applySidebarLayout(savedSidebarEnabled);
  setupCollapseExpandButtons();
}

function setupCollapseExpandButtons(): void {
  const browserContainer = document.querySelector('.browser-container')  
  const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn')
  if (sidebarCollapseBtn && browserContainer) {
    const sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (sidebarCollapsed) {
      browserContainer.classList.add('sidebar-collapsed');
    }
    sidebarCollapseBtn.addEventListener('click', () => {
      const isCurrentlyCollapsed = browserContainer.classList.contains('sidebar-collapsed'); 
      if (isCurrentlyCollapsed) {
        browserContainer.classList.remove('sidebar-collapsed');
        localStorage.setItem('sidebarCollapsed', 'false');
      } else {
        browserContainer.classList.add('sidebar-collapsed');
        localStorage.setItem('sidebarCollapsed', 'true');
      }
    });
  }

  localStorage.removeItem('assistantCollapsed');
  if (browserContainer) {
    browserContainer.classList.remove('assistant-collapsed');
  }
}


document.addEventListener('DOMContentLoaded', () => {
  initializeUI();
  setupEventListeners();
  initializeSidebar(); 
  setupAgentControls();
  setupGlobalErrorHandler();
});
function initializeUI(): void {
  
  urlBar = document.getElementById('urlBar') as HTMLInputElement;
  backBtn = document.getElementById('backBtn') as HTMLButtonElement;
  forwardBtn = document.getElementById('forwardBtn') as HTMLButtonElement;
  reloadBtn = document.getElementById('reloadBtn') as HTMLButtonElement;
  goBtn = document.getElementById('goBtn') as HTMLButtonElement;
  runAgentBtn = document.getElementById('runAgentBtn') as HTMLButtonElement;
  tabsContainer = document.getElementById('tabsContainer') as HTMLElement;
  newTabBtn = document.getElementById('newTabBtn') as HTMLElement;
  webviewsContainer = document.querySelector('.webviews-container') as HTMLElement
  
  initializeRecordingSystem();  
}


import { addWebviewDebugButton } from './components/WebviewDebugHelper';
import { addPreloadTestButton } from './components/WebviewPreloadTest';
import { extractPageContent, markdownToHtml } from './utils';

let recordingControls: RecordingControls;
let recordingIndicator: RecordingIndicator;
let sessionManager: SessionManager;

function initializeRecordingSystem(): void {
  try {
    recordingControls = new RecordingControls();
    recordingIndicator = new RecordingIndicator();
    sessionManager = new SessionManager();
    window.sessionManager = sessionManager;
    addSessionManagerButton();
    
    const recordingEngine = SmartRecordingEngine.getInstance();
    recordingEngine.initializeWebviewRecording();
    
    addWebviewDebugButton();
    addPreloadTestButton();
    
    window.addEventListener('recording:start', (e: Event) => {
      console.log('[Index] Recording started, notifying webviews');
      const sessionId = (e as CustomEvent).detail?.sessionId || SmartRecordingEngine.getInstance().getActiveSession()?.id || 'unknown';
      
      document.querySelectorAll('webview').forEach((webview: any) => {
        try {
          console.log(`[Index] Sending start-recording to webview ${webview.id}`);
          webview.send('start-recording', sessionId);
        } catch (error) {
          console.error('[Index] Failed to send start-recording command to webview:', error);
        }
      });
    });
    
    window.addEventListener('recording:stop', () => {
      console.log('[Index] Recording stopped, notifying webviews');
      document.querySelectorAll('webview').forEach((webview: any) => {
        try {
          console.log(`[Index] Sending stop-recording to webview ${webview.id}`);
          webview.send('stop-recording');
        } catch (error) {
          console.error('[Index] Failed to send stop-recording command to webview:', error);
        }
      });
    });
    
    window.addEventListener('show-toast', (e: Event) => {
      const customEvent = e as CustomEvent;
      const { message, type } = customEvent.detail;
      showToast(message, type);
    });
    
    console.log('[Index] Recording system initialized successfully');
  } catch (error) {
    console.error('Failed to initialize recording system:', error);
  }
}

function addSessionManagerButton(): void {
  
  const toolbarActions = document.querySelector('.toolbar-actions') as HTMLDivElement;
  if (!toolbarActions) return;
  
  const sessionManagerBtn = document.createElement('button');
  sessionManagerBtn.id = 'sessionManagerBtn';
  sessionManagerBtn.className = 'action-btn';
  sessionManagerBtn.title = 'Recording Sessions';
  sessionManagerBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm1 0v10h10V3H3z"/>
      <path d="M5 5.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5z"/>
    </svg>
  `;
  
  sessionManagerBtn.addEventListener('click', () => {
    sessionManager.show();
  });
  
  
  const extensionsBtn = document.getElementById('extensionsBtn') as HTMLButtonElement;
  if (extensionsBtn) {
    toolbarActions.insertBefore(sessionManagerBtn, extensionsBtn);
  } else {
    toolbarActions.appendChild(sessionManagerBtn);
  }
}

function setupRecordingForWebview(webview: any): void {
  console.log('[Recording] Setting up recording for webview:', webview.id);
  try {
    const recordingEngine = SmartRecordingEngine.getInstance();
    recordingEngine.setupWebviewRecording(webview);
    console.log('[Recording] ✅ Recording setup complete for webview:', webview.id);
  } catch (error) {
    console.error('[Recording] Failed to setup recording for webview:', error);
  }
}


function setupEventListeners(): void {
  if (newTabBtn) {
    const newNewTabBtn = newTabBtn.cloneNode(true) as HTMLElement;
    newTabBtn.parentNode?.replaceChild(newNewTabBtn, newTabBtn);
    newTabBtn = newNewTabBtn;
  }

  // Navigation buttons
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      const webview = getActiveWebview();
      if (webview && isWebviewReady(webview)) {
        try {
          if (webview.canGoBack()) {
            webview.goBack();
          }
        } catch (error) {
          console.log('[Index] ⚠️ Error navigating back, webview not ready:', error);
        }
      }
    });
  }

  if (forwardBtn) {
    forwardBtn.addEventListener('click', () => {
      const webview = getActiveWebview();
      if (webview && isWebviewReady(webview)) {
        try {
          if (webview.canGoForward()) {
            webview.goForward();
          }
        } catch (error) {
          console.log('[Index] ⚠️ Error navigating forward, webview not ready:', error);
        }
      }
    });
  }

  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      const webview = getActiveWebview();
      if (webview) {
        webview.reload();
      }
    });
  }

  if (goBtn) {
    goBtn.addEventListener('click', navigateToUrl);
  }

  // URL bar navigation
  if (urlBar) {
    urlBar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        navigateToUrl();
      }
    });
  }

  if (runAgentBtn) {
    runAgentBtn.addEventListener('click', executeAgent);
  }
  if (newTabBtn) {
    newTabBtn.addEventListener('click', () => {
      createNewTab();
    });
  } else {
    console.error('newTabBtn element not found!');
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 't':
          e.preventDefault();
          createNewTab();
          break;
        case 'w':
          e.preventDefault();
          if (activeTabId) {
            closeTab(activeTabId);
          }
          break;
        case 'l':
          e.preventDefault();
          if (urlBar) {
            urlBar.focus();
            urlBar.select();
          }
          break;
        case 'Tab':
          e.preventDefault();
          cycleTab(e.shiftKey ? -1 : 1);
          break;
      }
    }
  });

  ipcRenderer.on('menu-new-tab', () => {
    createNewTab();
  });

  ipcRenderer.on('menu-new-tab-with-url', (event, url) => {
    createNewTab(url);
  });
  
  ipcRenderer.on('menu-close-tab', () => {
    if (activeTabId) {
      closeTab(activeTabId);
    }
  });

  ipcRenderer.on('menu-reload', () => {
    const webview = getActiveWebview();
    if (webview && isWebviewReady(webview)) {
      try {
        webview.reload();
      } catch (error) {
        console.log('⚠️ Error reloading, webview not ready:', error);
      }
    }
  });
  
  ipcRenderer.on('menu-go-back', () => {
    const webview = getActiveWebview();
    if (webview && isWebviewReady(webview)) {
      try {
        if (webview.canGoBack()) {
          webview.goBack();
        }
      } catch (error) {
        console.log('⚠️ Error going back, webview not ready:', error);
      }
    }
  });
  
  ipcRenderer.on('menu-go-forward', () => {
    const webview = getActiveWebview();
    if (webview && isWebviewReady(webview)) {
      try {
        if (webview.canGoForward()) {
          webview.goForward();
        }
      } catch (error) {
        console.log('⚠️ Error going forward, webview not ready:', error);
      }
    }
  });

}
function setupGlobalErrorHandler(): void {
  window.addEventListener('error', (event) => {
    console.error('Global error caught:', event.error);
    
    if (event.error && event.error.stack) {
      console.error('Error stack:', event.error.stack);
    }
    
    try {
      showToast('Error: ' + (event.error ? event.error.message : 'Unknown error'));
    } catch (e) {
      console.error('Could not show toast, error occurred before UI initialized:', e);
    }
  });
}

function navigateToUrl(): void {
  if (!urlBar) return;

  let url = urlBar.value.trim();
  if (!url) return;

  if (url === 'file://browzer-store' || url === 'browzer-store') {
    showExtensionStore();
    return;
  }

  if (!url.includes('.') || url.includes(' ')) {
    url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
  } 
  else if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  const webview = getActiveWebview();
  if (webview) {
    webview.loadURL(url);
  }
}

function updateNavigationButtons(): void {
  const webview = getActiveWebview();
  if (webview && isWebviewReady(webview)) {
    try {
      if (backBtn) {
        backBtn.disabled = !webview.canGoBack();
      }
      if (forwardBtn) {
        forwardBtn.disabled = !webview.canGoForward();
      }
    } catch (error) {
      console.log('⚠️ Webview not ready for navigation buttons, using defaults');
      if (backBtn) backBtn.disabled = true;
      if (forwardBtn) forwardBtn.disabled = true;
    }
  } else {
    if (backBtn) {
      backBtn.disabled = true;
    }
    if (forwardBtn) {
      forwardBtn.disabled = true;
    }
  }
}

function isWebviewReady(webview: any): boolean {
  try {
    return webview && 
           webview.nodeType === Node.ELEMENT_NODE &&
           webview.parentNode &&
           typeof webview.canGoBack === 'function' &&
           webview.getWebContentsId !== undefined;
  } catch (error) {
    return false;
  }
}

function getActiveWebview(): any {
  if (!activeTabId) return null;
  const tab = tabs.find(tab => tab.id === activeTabId);
  if (!tab) return null;
  return document.getElementById(tab.webviewId);
}

function cycleTab(direction: number): void {
  if (tabs.length <= 1) return;
  
  const currentIndex = tabs.findIndex(tab => tab.id === activeTabId);
  if (currentIndex === -1) return;
  
  let newIndex = currentIndex + direction;
  if (newIndex >= tabs.length) {
    newIndex = 0;
  } else if (newIndex < 0) {
    newIndex = tabs.length - 1;
  }
  
  selectTab(tabs[newIndex].id);
}

function showToast(message: string, type: string = 'info'): void {
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

// ========================= TAB MANAGEMENT =========================


function saveTabs(): void {
  autoSaveTabs();
}

function createNewTab(url: string = NEW_TAB_URL): string | null {
  if (!tabsContainer || !webviewsContainer) {
    console.error('Cannot create tab: containers not found');
    return null;
  }
  
  const tabId = 'tab-' + Date.now();
  const webviewId = 'webview-' + tabId;
  
  try {
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.id = tabId;
    tab.dataset.webviewId = webviewId;
    
    const initialTitle = url.startsWith('file://browzer-settings') ? '⚙️ Browzer Settings' : 'New Tab';
    tab.innerHTML = `
      <div class="tab-favicon"></div>
      <span class="tab-title">${initialTitle}</span>
      <button class="tab-close">×</button>
    `;
    
    tabsContainer.appendChild(tab);
    console.log('Tab element created:', tabId);
    
    const webview = document.createElement('webview') as any;
    webview.id = webviewId;
    webview.className = 'webview';

    // Configure webview asynchronously
    configureWebview(webview, url).catch(error => {
      console.error('[Tab Creation] Failed to configure webview:', error);
    });
    
    webviewsContainer.appendChild(webview);
    console.log('Webview element created:', webviewId);
    
    const newTab = {
      id: tabId,
      url: url,
      title: initialTitle,
      isActive: false,
      webviewId: webviewId,
      history: [],
      currentHistoryIndex: -1,
      isProblematicSite: false
    };
    
    tabs.push(newTab);
    
    setupTabEventListeners(tab, tabId);
    setupWebviewEvents(webview);
    
    selectTab(tabId);
    
    saveTabs();
    
      console.log('🚨 [NEW TAB DEBUG] Tab created successfully:', tabId);
  return tabId;
} catch (error) {
  console.error('Error creating tab:', error);
  return null;
}
}


function injectAdBlockCSS(webview: any): void {
  if (!webview) return;
  
  if (!webview.id || !webview.src || webview.src === 'about:blank') {
    console.log('[AdBlock] Skipping CSS injection - webview not ready');
    return;
  }
  
  try {
    ipcRenderer.invoke('get-adblock-css').then((cssRules: string) => {
      if (!cssRules || !cssRules.trim()) {
        console.log('[AdBlock] No CSS rules to inject');
        return;
      }
      
      if (!webview || !webview.executeJavaScript) {
        console.log('[AdBlock] Webview no longer valid, skipping injection');
        return;
      }
      
      const script = `
        (function() {
          try {
            if (!document || !document.head) {
              console.log('[AdBlock] Document not ready, skipping CSS injection');
              return;
            }
            
            const existingStyle = document.getElementById('browzer-adblock-css');
            if (existingStyle) {
              existingStyle.remove();
            }
            
            // Inject new ad block styles
            const style = document.createElement('style');
            style.id = 'browzer-adblock-css';
            style.type = 'text/css';
            style.innerHTML = \`${cssRules.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;
            document.head.appendChild(style);
            
            console.log('[AdBlock] CSS rules injected successfully');
          } catch (injectionError) {
            console.warn('[AdBlock] CSS injection failed:', injectionError.message);
          }
        })();
      `;
      
      // Execute with error handling
      webview.executeJavaScript(script).catch((error: any) => {
        // Don't log errors for destroyed webviews or navigation
        if (!error.message.includes('Object has been destroyed') && 
            !error.message.includes('navigation') &&
            !error.message.includes('Script failed to execute')) {
          console.warn('[AdBlock] Script execution failed:', error.message);
        }
      });
      
    }).catch((error: any) => {
      console.error('[AdBlock] Error getting CSS rules:', error);
    });
  } catch (error) {
    console.error('[AdBlock] Error in CSS injection setup:', error);
  }
}

// Replace your configureWebview function in index.ts with this:

async function configureWebview(webview: any, url: string): Promise<void> {
  
  // CRITICAL FIX: Use contextIsolation=false and nodeIntegration=true for webview preload
  const webPreferencesArray = [
    'contextIsolation=false',  // MUST be false for webview preload to work
    'nodeIntegration=true',    // MUST be true for ipcRenderer access
    'webSecurity=true',
    'sandbox=false',
    'javascript=true',
    'plugins=true',
    'images=true',
    'devTools=true'
  ];

  // Set attributes
  webview.setAttribute('webpreferences', webPreferencesArray.join(', '));
  webview.setAttribute('allowpopups', 'true');
  webview.setAttribute('nodeintegration', 'true');
  webview.setAttribute('disablewebsecurity', 'false');

  try {
    // CRITICAL: Set preload FIRST, BEFORE setting src
    console.log('[Webview Config] Getting preload path for webview...');
    
    const preloadPath = await window.electronAPI.ipcInvoke('get-webview-preload-path');
    console.log('[Webview Config] Got preload path:', preloadPath);
    
    // STEP 1: Set preload attribute
    webview.setAttribute('preload', preloadPath);
    console.log('[Webview Config] Preload attribute set');
    
    // STEP 2: Set the src URL
    let finalUrl = url;
    
    if (url === NEW_TAB_URL) {
      finalUrl = homepageUrl;
      console.log('[Webview Config] Setting homepage URL:', finalUrl);
    } else if (url.startsWith('file://browzer-settings')) {
      // Handle settings pages
      try {
        const settingsFilePath = await window.electronAPI.getResourcePath('src/renderer/settings.html');
        const settingsPath = `file://${settingsFilePath}`;
        const anchorIndex = url.indexOf('#');
        finalUrl = anchorIndex !== -1 ? settingsPath + url.substring(anchorIndex) : settingsPath;
        console.log('[Webview Config] Setting settings URL:', finalUrl);
      } catch (error) {
        console.error('[Webview Config] Settings path error:', error);
        const cwd = window.electronAPI.cwd();
        finalUrl = `file://${window.electronAPI.path.join(cwd, 'src/renderer/settings.html')}`;
      }
    } else {
      console.log('[Webview Config] Setting regular URL:', finalUrl);
    }
    
    webview.setAttribute('src', finalUrl);
    console.log('[Webview Config] Configuration complete for URL:', finalUrl);
    
  } catch (error) {
    console.error('[Webview Config] Failed to get preload path:', error);
    // Set URL anyway as fallback
    if (url !== NEW_TAB_URL && !url.startsWith('file://browzer-settings')) {
      webview.setAttribute('src', url);
    } else {
      webview.setAttribute('src', homepageUrl);
    }
  }
}

function setupTabEventListeners(tab: HTMLElement, tabId: string): void {
  tab.addEventListener('click', (e) => {
    if (!e.target || !(e.target as HTMLElement).classList.contains('tab-close')) {
      selectTab(tabId);
    }
  });
  
  const closeBtn = tab.querySelector('.tab-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('Close button clicked for tab:', tabId);
      closeTab(tabId);
    });
  }
}

function setupWebviewEvents(webview: any): void {
  console.log('Setting up webview events for webview:', webview.id);
  
  webview.addEventListener('did-start-loading', () => {
    const webviewId = webview.id;
    if (webviewId) {
      const tabId = getTabIdFromWebview(webviewId);
      if (tabId) {
        const tab = document.getElementById(tabId);
        if (tab) {
          tab.classList.add('loading');
        }   
      }
    }
  });

  webview.addEventListener('did-finish-load', () => {
    const webviewId = webview.id;
    if (webviewId) {
      const tabId = getTabIdFromWebview(webviewId);
      if (tabId) {
        const tab = document.getElementById(tabId);
        if (tab) {
          tab.classList.remove('loading');
        }
      }
    }
    
    // Update URL bar, title, and navigation buttons
    if (urlBar) {
      urlBar.value = webview.src;
    }
    
    updateNavigationButtons();
    
    setupRecordingForWebview(webview);

    const url = webview.src;
    const webviewTitle = webview.getTitle();
    
    console.log('🔍 [HISTORY TRACK] did-finish-load event:', {
      webviewId: webview.id,
      url: url,
      webviewTitle: webviewTitle,
      isAboutBlank: url === 'about:blank'
    });
 });

  webview.addEventListener('did-fail-load', () => {
    const webviewId = webview.id;
    if (webviewId) {
      const tabId = getTabIdFromWebview(webviewId);
      if (tabId) {
        const tab = document.getElementById(tabId);
        if (tab) {
          tab.classList.remove('loading');
        }
      }
    }

    // Update URL bar on failed loads (but don't track in history)
    if (urlBar) {
      urlBar.value = webview.src;
    }
    
    updateNavigationButtons();
  });

  webview.addEventListener('new-window', (e: any) => {
    console.log('New window requested:', e.url);
    
    // For OAuth flows, open in the same tab to maintain session
    const isAuthFlow = e.url && (
      e.url.includes('accounts.google.com') ||
      e.url.includes('login.microsoftonline.com') ||
      e.url.includes('oauth') ||
      e.url.includes('auth') ||
      e.url.includes('signin') ||
      e.url.includes('login') ||
      e.url.includes('authorize')
    );
    
    if (isAuthFlow) {
      console.log('OAuth flow detected, navigating in current tab');
      webview.src = e.url;
    } else {
      console.log('Opening in new tab');
      createNewTab(e.url);
    }
  });

  // Enhanced event handlers for OAuth and security
  webview.addEventListener('will-navigate', (e: any) => {
    console.log('Navigation will start to:', e.url);
    // Update URL bar during navigation
    if (urlBar && getTabIdFromWebview(webview.id) === activeTabId) {
      urlBar.value = e.url;
    }
  });

  webview.addEventListener('did-navigate', (e: any) => {
    console.log('Navigation completed to:', e.url);
    // Final URL update after navigation
    if (urlBar && getTabIdFromWebview(webview.id) === activeTabId) {
      urlBar.value = e.url;
    }
    // Auto-save tabs when navigation completes
    autoSaveTabs();
  });

  webview.addEventListener('did-navigate-in-page', (e: any) => {
    console.log('In-page navigation to:', e.url);
    // Handle hash/history changes (common in OAuth flows)
    if (urlBar && getTabIdFromWebview(webview.id) === activeTabId) {
      urlBar.value = e.url;
    }
    // Auto-save tabs when in-page navigation completes
    autoSaveTabs();
  });

  webview.addEventListener('did-fail-load', (e: any) => {
    console.log('Load failed:', e.errorDescription, 'for URL:', e.validatedURL);
    // Don't auto-retry for authentication pages as it might interfere with OAuth
    const isAuthPage = e.validatedURL && (
      e.validatedURL.includes('accounts.google.com') ||
      e.validatedURL.includes('login.') ||
      e.validatedURL.includes('oauth') ||
      e.validatedURL.includes('auth')
    );
    
    if (!isAuthPage && e.errorCode === -105) { // NAME_NOT_RESOLVED
      console.log('DNS resolution failed, this is normal for some sites');
    }
  });

  // Handle certificate errors for OAuth sites
  webview.addEventListener('certificate-error', (e: any) => {
    console.log('Certificate error for:', e.url);
    // For OAuth flows, we might need to be more permissive
    // but still maintain security for the main browsing
  });

  // Handle permission requests (important for OAuth flows)
  webview.addEventListener('permission-request', (e: any) => {
    console.log('Permission requested:', e.permission, 'for:', webview.src);
    
    // Allow certain permissions for OAuth flows
    const allowedPermissions = ['geolocation', 'notifications', 'camera', 'microphone'];
    const isAuthSite = webview.src && (
      webview.src.includes('accounts.google.com') ||
      webview.src.includes('login.microsoftonline.com') ||
      webview.src.includes('github.com') ||
      webview.src.includes('oauth')
    );
    
    if (isAuthSite && allowedPermissions.includes(e.permission)) {
      e.request.allow();
    } else if (e.permission === 'notifications') {
      // Generally allow notifications
      e.request.allow();
    } else {
      e.request.deny();
    }
  });
  
  // Listen for IPC messages from webview (for Add to Chat)
  webview.addEventListener('ipc-message', (event: any) => {
    console.log('🔍 [IPC DEBUG] Received ipc-message from webview:', webview.id, 'channel:', event.channel, 'args:', event.args);
  });

  // Inject text selection handler and ad block CSS
  webview.addEventListener('did-finish-load', () => {
    try {
      // Inject ad block CSS after page loads with validation
      setTimeout(() => {
        // Double-check webview is still valid before injection
        if (webview && !webview.isDestroyed && webview.executeJavaScript) {
          injectAdBlockCSS(webview);
        }
      }, 500);
    } catch (error) {
      console.error('[Text Selection] Failed to inject handler:', error);
    }
  });

  webview.addEventListener('dom-ready', () => {
    console.log(`[Webview] DOM ready for webview: ${webview.id}`);
    
    // Test preload script loading
    setTimeout(async () => {
      console.log(`[Webview] Testing preload script for webview: ${webview.id}`);
      
      try {
        const testResult = await webview.executeJavaScript(`
          (function() {
            if (typeof window.__webviewRecorder !== 'undefined') {
              console.log('[Webview Test] Preload script loaded successfully!');
              return { success: true, message: 'Preload script loaded' };
            } else {
              console.error('[Webview Test] Preload script NOT loaded!');
              return { success: false, message: 'Preload script missing' };
            }
          })();
        `);
        
        console.log(`[Webview] Preload test result for ${webview.id}:`, testResult);
        
        if (!testResult.success) {
          console.error(`[Webview] ⚠️ Preload script failed to load for ${webview.id}`);
          // Optional: Show visual indicator in webview
          webview.executeJavaScript(`
            (function() {
              const div = document.createElement('div');
              div.style.cssText = 'position:fixed;top:0;left:0;background:rgba(255,0,0,0.8);color:white;padding:5px;font-size:12px;z-index:9999;';
              div.textContent = 'Recording preload failed!';
              document.body.appendChild(div);
              setTimeout(() => div.remove(), 3000);
            })();
          `).catch(() => {}); // Ignore errors
        }
      } catch (error) {
        console.error(`[Webview] Failed to test preload script for ${webview.id}:`, error);
      }
    }, 1000);
    
    // Register with RecordingEngine
    const recordingEngine = SmartRecordingEngine.getInstance();
    recordingEngine.setupWebviewRecording(webview);
    console.log(`[Recording] Webview ${webview.id} registered with RecordingEngine`);
  });

  console.log('All webview event listeners set up for:', webview.id);
}

function selectTab(tabId: string): void {
  console.log('Selecting tab:', tabId);
  
  try {
    if (!tabs || tabs.length === 0) {
      console.log('No tabs available, creating a new one');
      createNewTab();
      return;
    }
    
    const tabIndex = tabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) {
      console.error('Tab not found in tabs array:', tabId);
      if (tabs.length > 0) {
        selectTab(tabs[0].id);
      } else {
        createNewTab();
      }
      return;
    }
    
    // Update active tab
    activeTabId = tabId;
    tabs.forEach(tab => tab.isActive = tab.id === tabId);
    
    // Update UI
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.remove('active');
    });
    
    const tabElement = document.getElementById(tabId);
    if (tabElement) {
      tabElement.classList.add('active');
    }
    
    // Show corresponding webview or extension store
    document.querySelectorAll('.webview').forEach((view: any) => {
      view.style.display = 'none';
      view.classList.remove('active');
    });
    
    const tab = tabs[tabIndex];
    
    // Check if this tab is showing the extension store
    if (tab.url === 'file://browzer-store') {
      // Show extension store instead of webview
      const storeContainer = document.getElementById('extension-store-container');
      if (storeContainer) {
        storeContainer.style.display = 'block';
        storeContainer.classList.add('active');
      }
      
      if (urlBar) {
        urlBar.value = 'file://browzer-store';
      }
      
      // Disable navigation buttons for the store
      if (backBtn) backBtn.disabled = true;
      if (forwardBtn) forwardBtn.disabled = true;
    } else {
      // Hide extension store if it's visible
      const storeContainer = document.getElementById('extension-store-container');
      if (storeContainer) {
        storeContainer.style.display = 'none';
        storeContainer.classList.remove('active');
      }
      
      // Show regular webview
      const webview = document.getElementById(tab.webviewId) as any;
      
      if (webview) {
        webview.style.display = 'flex';
        webview.classList.add('active');
        
        if (urlBar) {
          urlBar.value = webview.src;
        }
      }
    }
    
    updateNavigationButtons();
    autoSaveTabs();
    
  } catch (error) {
    console.error('Error in selectTab:', error);
  }
}

function closeTab(tabId: string): void {
  console.log('closeTab called for tab:', tabId);
  
  if (tabs.length <= 1) {
    console.log('Preventing closing the last tab, creating a new one instead');
    createNewTab();
    return;
  }
  
  try {
    const tabIndex = tabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) {
      console.error('Tab not found in tabs array:', tabId);
      return;
    }
    
    const webviewId = tabs[tabIndex].webviewId;
    const webview = document.getElementById(webviewId);
    const tabElement = document.getElementById(tabId);
    
    if (tabElement) tabElement.remove();
    if (webview) webview.remove();
    
    tabs.splice(tabIndex, 1);
    console.log('Tab removed from tabs array, remaining tabs:', tabs.length);
    
    if (activeTabId === tabId) {
      const newTabId = tabs[Math.max(0, tabIndex - 1)].id;
      selectTab(newTabId);
    }
    
    saveTabs();
    console.log('Tab closed successfully:', tabId);
  } catch (error) {
    console.error('Error closing tab:', error);
  }
}
function getTabIdFromWebview(webviewId: string): string | null {
  const tab = tabs.find(tab => tab.webviewId === webviewId);
  return tab ? tab.id : null;
}
  

// ========================= EXTENSIONS PANEL =========================

function setupAgentControls(): void {
  // Initialize chat UI in the fixed container
  const chatInputContainer = document.querySelector('.chat-input-container');
  if (chatInputContainer) {
    console.log('[setupAgentControls] Chat input container found');   
    let chatInputArea = document.querySelector('.chat-input-area');
    if (!chatInputArea) {
      console.log('[setupAgentControls] Creating chat input area');
      chatInputArea = document.createElement('div');
      chatInputArea.className = 'chat-input-area';
      chatInputArea.innerHTML = `
        <div class="chat-mode-selector">
          <label class="mode-option">
            <input type="radio" name="chatMode" value="ask" checked />
            <span>Ask</span>
          </label>
          ${DOAGENT_ENABLED ? `
          <label class="mode-option">
            <input type="radio" name="chatMode" value="do" />
            <span>Do</span>
          </label>
          <label class="mode-option">
            <input type="radio" name="chatMode" value="execute" />
            <span>Execute</span>
          </label>
          ` : ''}
        </div>
        <div class="chat-input-row">
          <input type="text" id="chatInput" placeholder="Ask a follow-up question..." />
          <button id="sendMessageBtn" class="chat-send-btn">Send</button>
        </div>
      `;
      
      chatInputContainer.appendChild(chatInputArea);
      
      setupChatInputHandlers();
    } else {
      console.log('[setupAgentControls] Chat input area already exists, ensuring handlers are set up');
      setupChatInputHandlers();
    }
  }
}

function setupChatInputHandlers(): void {
  console.log('[setupChatInputHandlers] Setting up chat input handlers...');
  
  setTimeout(() => {
    const sendButton = document.getElementById('sendMessageBtn');
    const chatInput = document.getElementById('chatInput') as HTMLInputElement;
    
    if (!sendButton || !chatInput) {
      console.error('[setupChatInputHandlers] Chat input elements not found');
      console.log('[setupChatInputHandlers] Available elements:', {
        sendButton: !!sendButton,
        chatInput: !!chatInput,
        allButtons: document.querySelectorAll('button').length,
        allInputs: document.querySelectorAll('input').length
      });
      return;
    }
    
    console.log('[setupChatInputHandlers] Found chat elements, attaching handlers...');
    
    if ((sendButton as any).hasHandlers) {
      console.log('[setupChatInputHandlers] Handlers already set up, skipping');
      return;
    }
    
    const sendMessage = () => {
      const message = chatInput.value.trim();
      if (message) {
        
        const selectedMode = document.querySelector('input[name="chatMode"]:checked') as HTMLInputElement;
        const mode = selectedMode ? selectedMode.value : 'ask';
        console.log('[sendMessage] Selected mode:', mode);
        
        let placeholderText = 'Ask a follow-up question...';
        if (mode === 'do') {
          placeholderText = 'Enter a task to perform...';
        } else if (mode === 'execute') {
          placeholderText = 'Describe what to do with the recording...';
        }
        chatInput.placeholder = placeholderText;
        
        addMessageToChat('user', message);
        
        if (mode === 'do') {
          console.log('[sendMessage] Using DoAgent for automation task');
          // processDoTask(message);
        } else if (mode === 'execute') {

          processExecuteWithRecording(message).catch(error => {
            console.error('Failed to execute with recording:', error);
            addMessageToChat('assistant', 'Error: Failed to execute with recording.');
          })
        } else {
          processFollowupQuestion(message);
        }
        
        chatInput.value = '';
      }
    };
    
    sendButton.addEventListener('click', (e) => {
      e.preventDefault();
      sendMessage();
    });
    
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
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
        }
        chatInput.placeholder = placeholderText;
        
        const sidebarContent = document.querySelector('.chat-sidebar-content');
        if (sidebarContent) {
          if (mode === 'execute') {
            sidebarContent.classList.add('execute-mode');
            initializeSessionList();
          } else {
            sidebarContent.classList.remove('execute-mode');
          }
        }
      });
    });
    
    (sendButton as any).hasHandlers = true;
    
  }, 100); 
}

function getBrowserApiKeys(): Record<string, string> {

  const providers = ['anthropic']; // ['openai', 'anthropic', 'perplexity', 'chutes'];
  const apiKeys: Record<string, string> = {};
  
  providers.forEach(provider => {
    const key = localStorage.getItem(`${provider}_api_key`);
    if (key) {
      apiKeys[provider] = key;
    } else {
      
    }
  });
  
  return apiKeys;
}

async function executeAgent(): Promise<void> {

  try {
    const webview = getActiveWebview();

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
    
    const currentTime = Date.now();
    const queryKey = `${query}-${url}`;
    const lastProcessedKey = `lastProcessed_${queryKey}`;
    const lastProcessedTime = parseInt(localStorage.getItem(lastProcessedKey) || '0');
    
    if (currentTime - lastProcessedTime < 5000) {
      showToast('This query was just processed, skipping duplicate execution', 'info');
      return;
    }
    
    localStorage.setItem(lastProcessedKey, currentTime.toString());
    
    
    // Ensure chat input area exists in the fixed container
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
          ${DOAGENT_ENABLED ? `
          <label class="mode-option">
            <input type="radio" name="chatMode" value="do" />
            <span>Do</span>
          </label>
          <label class="mode-option">
            <input type="radio" name="chatMode" value="execute" />
            <span>Execute</span>
          </label>
          ` : ''}
        </div>
        <div class="chat-input-row">
          <input type="text" id="chatInput" placeholder="Ask a follow-up question..." />
          <button id="sendMessageBtn" class="chat-send-btn">Send</button>
        </div>
      `;
      
      chatInputContainer.appendChild(chatInputArea);
      setupChatInputHandlers();
    }

    addMessageToChat('assistant', '<div class="loading">Analyzing request and routing to appropriate agent...</div>');
    
    const pageContent = await extractPageContent(webview);
    const routingResult = await ipcRenderer.invoke('route-extension-request', query);
    
    const loadingMessages = document.querySelectorAll('.loading');
    loadingMessages.forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) {
        parentMessage.remove();
      }
    });
    
    const extensionId = routingResult.extensionId;
    if (!extensionId) {
      addMessageToChat('assistant', 'Error: No extension available for your request');
      return;
    }
    
    const action = 'process_page';
    const data = {
      query,
      pageContent,
      isQuestion: false,
    };
    
    
    try {
      const result = await ipcRenderer.invoke('execute-python-extension', {
        extensionId,
        action,
        data,
        browserApiKeys: getBrowserApiKeys(),
        selectedProvider: provider
      });      
      if (result.success === false) {
        addMessageToChat('assistant', `Error: ${result.error}`);
      } else {
      displayAgentResults(result.data);
      }
    } catch (extensionError) {
      

        addMessageToChat('assistant', `Error: ${(extensionError as Error).message}`);
      }
  } catch (error) {
    console.error("Agent execution error:", error);
    
    
    const loadingMessages = document.querySelectorAll('.loading');
    loadingMessages.forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) {
        parentMessage.remove();
      }
    });
    
    addMessageToChat('assistant', `Error: ${(error as Error).message}`);
  } finally {
    
    console.log('[executeAgent] Clearing execution flag on function completion');
  }
}

function addMessageToChat(role: string, content: string, timing?: number): void {
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
          ${DOAGENT_ENABLED ? `
          <label class="mode-option">
            <input type="radio" name="chatMode" value="do" />
            <span>Do</span>
          </label>
          <label class="mode-option">
            <input type="radio" name="chatMode" value="execute" />
            <span>Execute</span>
          </label>
          ` : ''}
        </div>
        <div class="chat-input-row">
          <input type="text" id="chatInput" placeholder="Ask a follow-up question..." />
          <button id="sendMessageBtn" class="chat-send-btn">Send</button>
        </div>
      `;
      
      chatInputContainer.appendChild(chatInputArea);
      setupChatInputHandlers();
    }
    
  } catch (error) {
    console.error('[addMessageToChat] Error adding message to chat:', error);
  }
}

function displayAgentResults(data: any): void {
  try {
    
    if (!data) {
      addMessageToChat('assistant', 'No data received from agent');
      return;
    }
    const currentTime = Date.now();
    const contentHash = JSON.stringify(data).substring(0, 200); 
    const lastDisplayKey = `lastDisplayed_${contentHash}`;
    
    localStorage.setItem(lastDisplayKey, currentTime.toString());

    if (data.consolidated_summary) {
      addMessageToChat('assistant', data.consolidated_summary, data.generation_time);
    } else if (data.summaries && data.summaries.length > 0) {
      const summariesText = data.summaries.map((s: any) => `<b>${s.title}</b>\n${s.summary}`).join('\n\n');
      addMessageToChat('assistant', summariesText, data.generation_time);
    } else {
      addMessageToChat('assistant', 'No relevant information found.', data.generation_time);
    }
    
  } catch (error) {
    try {
      addMessageToChat('assistant', 'Error displaying results: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } catch (chatError) {
    }
  }
}

async function processFollowupQuestion(question: string): Promise<void> {
  
  
  const currentTime = Date.now();
  const queryKey = `followup_${question}`;
  const lastProcessedKey = `lastProcessed_${queryKey}`;
  const lastProcessedTime = parseInt(localStorage.getItem(lastProcessedKey) || '0');
  
  if (currentTime - lastProcessedTime < 5000) {
    showToast('This question was just processed, skipping duplicate execution', 'info');
    return;
  }
  
  localStorage.setItem(lastProcessedKey, currentTime.toString());
  
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
    addMessageToChat('assistant', '<div class="loading">Processing your question...</div>');
    const provider = 'anthropic'; 
    const apiKey = localStorage.getItem(`${provider}_api_key`);
    
    if (!apiKey) {
      clearLoadingIndicators();
      addMessageToChat('assistant', 'Please configure your API key in the Extensions panel.');
      
      return;
    }
    
    const activeWebview = getActiveWebview();
    if (!activeWebview) {
      clearLoadingIndicators();
      addMessageToChat('assistant', 'No active webview found.');
      
      return;
    }
    
    const pageContent = await extractPageContent(activeWebview);
    const questionRequest = `Answer this question about the page: ${question}`;
    const routingResult = await ipcRenderer.invoke('route-extension-request', questionRequest);
    
    clearLoadingIndicators();
    
    if (routingResult.type === 'workflow') {
      
      try {
        const workflowData = {
          pageContent,
          browserApiKeys: getBrowserApiKeys(),
          selectedProvider: provider,
          selectedModel: 'claude-3-5-sonnet-20241022', // Always use Claude 3.5 Sonnet
          isQuestion: true,
        };

        await ipcRenderer.invoke('execute-workflow', {
          query: questionRequest,
          data: workflowData
        });
        
      } catch (workflowError) {
        console.error('Follow-up workflow execution failed:', workflowError);
        addMessageToChat('assistant', `Workflow execution failed: ${(workflowError as Error).message}`);
      }
      
      return; 
    }
    
    
    const extensionId = routingResult.extensionId;
    if (!extensionId) {
      addMessageToChat('assistant', 'Error: No extension available to answer your question');
      return;
    }
    
    
    
    const action = 'process_page';
    const data = {
      query: questionRequest,
      pageContent,
      isQuestion: true,
    };
    
    
    try {
      const result = await ipcRenderer.invoke('execute-python-extension', {
        extensionId,
        action,
        data,
        browserApiKeys: getBrowserApiKeys(),
        selectedProvider: provider
      });
      
      if (result.success === false) {
        addMessageToChat('assistant', `Error: ${result.error || 'Unknown error'}`);
        return;
      }
      
      displayAgentResults(result.data);
    } catch (error) {
      console.error('Error in processFollowupQuestion:', error);
    }
    clearLoadingIndicators();
  } finally {

  }
}

// ========================= EXTENSION STORE =========================

function showExtensionStore(): void {
  const currentWebview = getActiveWebview();
  if (currentWebview) {
    currentWebview.style.display = 'none';
  }
  
  let storeContainer = document.getElementById('extension-store-container');
  if (!storeContainer) {
    storeContainer = document.createElement('div');
    storeContainer.id = 'extension-store-container';
    storeContainer.className = 'webview'; 
    storeContainer.style.display = 'none';
    if (webviewsContainer) {
      webviewsContainer.appendChild(storeContainer);
    }
  }
  storeContainer.style.display = 'block';
  
  if (urlBar) {
    urlBar.value = 'file://browzer-store';
  }

  if (activeTabId) {
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) {
      tab.title = 'Browzer Extension Store';
      tab.url = 'file://browzer-store';
      const titleElement = document.querySelector(`#${activeTabId} .tab-title`);
      if (titleElement) {
        titleElement.textContent = 'Extension Store';
      }
    }
  }
  if (backBtn) backBtn.disabled = true;
  if (forwardBtn) forwardBtn.disabled = true;
}


(window as any).browzerApp = {
  tabs,
  activeTabId,
  getActiveWebview,
  createNewTab,
  selectTab,
  closeTab,
  navigateToUrl,
  executeAgent,
  showExtensionStore
}; 

function autoSaveTabs(): void {
  try {
    if (!tabs || tabs.length === 0) {
      
      const existing = localStorage.getItem(SAVED_TABS_KEY);
      if (existing) {
        try {
          const parsed = JSON.parse(existing);
          if (parsed.tabs && parsed.tabs.length > 0) {
            return; 
          }
        } catch (e) {
          
        }
      }
      return;
    }

    const tabsToSave = tabs.map((tab) => {
      try {
        const webview = document.getElementById(tab.webviewId) as any;
        const titleElem = document.querySelector(`#${tab.id} .tab-title`);
        
        return {
          url: webview && webview.src ? webview.src : tab.url,
          title: titleElem ? titleElem.textContent || 'New Tab' : tab.title,
          isActive: tab.isActive,
          webviewId: tab.webviewId
        };
      } catch (err) {
        return {
          url: tab.url || 'about:blank',
          title: tab.title || 'New Tab',
          isActive: tab.isActive,
          webviewId: tab.webviewId
        };
      }
    });
    const sessionData = {
      tabs: tabsToSave,
      timestamp: Date.now(),
      activeTabId: activeTabId
    };
    localStorage.setItem(SAVED_TABS_KEY, JSON.stringify(sessionData));
  } catch (err) {
    console.error('Error in autoSaveTabs:', err);
  }
}