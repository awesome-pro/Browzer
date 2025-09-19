/**
 * WebviewPreloadTest - Utility to test and debug webview preload script
 */

/**
 * Directly tests if the preload script is loaded in a webview
 * @param webview The webview to test
 */
export function testPreloadScript(webview: any): Promise<boolean> {
  if (!webview) {
    console.error('[PreloadTest] No webview provided');
    return Promise.resolve(false);
  }

  console.log(`[PreloadTest] Testing preload script in webview: ${webview.id}`);

  return new Promise((resolve) => {
    try {
      const testScript = `
        (function() {
          console.log('[PreloadTest] Running test in webview');
          
          // Check for the existence of the webviewRecorder object
          const hasRecorder = typeof window.webviewRecorder !== 'undefined';
          console.log('[PreloadTest] webviewRecorder exists:', hasRecorder);
          
          // Check for the existence of the ipcRenderer object
          const hasIpc = typeof require !== 'undefined' && require('electron').ipcRenderer;
          console.log('[PreloadTest] ipcRenderer available:', !!hasIpc);
          
          // Return test results
          return {
            hasRecorder,
            hasIpc,
            location: window.location.href,
            preloadPath: window.navigator.userAgent // Just for debugging
          };
        })();
      `;

      webview.executeJavaScript(testScript)
        .then((result: any) => {
          console.log('[PreloadTest] Results:', result);
          
          if (result.hasRecorder && result.hasIpc) {
            console.log('✅ [PreloadTest] Preload script is loaded and working!');
            resolve(true);
          } else {
            console.error('❌ [PreloadTest] Preload script is NOT loaded properly');
            console.error('❌ [PreloadTest] webviewRecorder:', result.hasRecorder);
            console.error('❌ [PreloadTest] ipcRenderer:', result.hasIpc);
            resolve(false);
          }
        })
        .catch((error: any) => {
          console.error('[PreloadTest] Error executing test script:', error);
          resolve(false);
        });
    } catch (error) {
      console.error('[PreloadTest] Failed to run test:', error);
      resolve(false);
    }
  });
}

/**
 * Tests if the webview can communicate with the main process
 * @param webview The webview to test
 */
export function testIpcCommunication(webview: any): Promise<boolean> {
  if (!webview) {
    console.error('[PreloadTest] No webview provided for IPC test');
    return Promise.resolve(false);
  }

  console.log(`[PreloadTest] Testing IPC communication with webview: ${webview.id}`);

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.error('[PreloadTest] IPC test timed out after 5 seconds');
      webview.removeEventListener('ipc-message', messageHandler);
      resolve(false);
    }, 5000);

    const messageHandler = (event: any) => {
      if (event.channel === 'preload-test-response') {
        console.log('✅ [PreloadTest] Received IPC response:', event.args[0]);
        clearTimeout(timeoutId);
        webview.removeEventListener('ipc-message', messageHandler);
        resolve(true);
      }
    };

    webview.addEventListener('ipc-message', messageHandler);

    try {
      const testScript = `
        (function() {
          console.log('[PreloadTest] Testing IPC in webview');
          
          try {
            // Use the global testIpc function if it exists (from our preload script)
            if (typeof window.testIpc === 'function') {
              console.log('[PreloadTest] Using global testIpc function');
              const result = window.testIpc();
              console.log('[PreloadTest] testIpc result:', result);
              
              // The testIpc function will send the message itself
              return { success: true, usedGlobalFunction: true };
            }
            
            // Fallback to direct approach
            console.log('[PreloadTest] Global testIpc function not found, trying direct approach');
            
            // Check if we can access electron
            if (typeof require === 'undefined') {
              console.error('[PreloadTest] require is not defined');
              return { success: false, error: 'require_undefined' };
            }
            
            const { ipcRenderer } = require('electron');
            if (!ipcRenderer) {
              console.error('[PreloadTest] ipcRenderer is not defined');
              return { success: false, error: 'ipcRenderer_undefined' };
            }
            
            // Try to send a message to the host
            ipcRenderer.sendToHost('preload-test-response', {
              success: true,
              timestamp: Date.now(),
              message: 'IPC communication is working!'
            });
            
            console.log('[PreloadTest] IPC message sent to host');
            return { success: true, usedGlobalFunction: false };
          } catch (e) {
            console.error('[PreloadTest] Error in IPC test:', e);
            return { success: false, error: e.message };
          }
        })();
      `;

      webview.executeJavaScript(testScript)
        .then((result: any) => {
          console.log('[PreloadTest] Script execution result:', result);
          if (!result.success) {
            console.error('[PreloadTest] Script execution failed:', result.error);
            clearTimeout(timeoutId);
            webview.removeEventListener('ipc-message', messageHandler);
            resolve(false);
          }
          // Don't resolve here - wait for the IPC message or timeout
        })
        .catch((error: any) => {
          console.error('[PreloadTest] Error executing IPC test script:', error);
          clearTimeout(timeoutId);
          webview.removeEventListener('ipc-message', messageHandler);
          resolve(false);
        });
    } catch (error) {
      console.error('[PreloadTest] Failed to set up IPC test:', error);
      clearTimeout(timeoutId);
      webview.removeEventListener('ipc-message', messageHandler);
      resolve(false);
    }
  });
}

/**
 * Adds a test button to the toolbar to test preload script
 */
export function addPreloadTestButton(): void {
  const container = document.querySelector('.toolbar-actions');
  if (!container) return;

  const debugButton = document.createElement('button');
  debugButton.className = 'action-btn';
  debugButton.id = 'preloadTestBtn';
  debugButton.title = 'Test Webview Preload';
  debugButton.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 3a5 5 0 0 0-5 5 5 5 0 0 0 5 5 5 5 0 0 0 5-5 5 5 0 0 0-5-5zm0 9a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/>
      <path d="M8 5a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3zm0 5a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>
    </svg>
  `;

  debugButton.addEventListener('click', async () => {
    const activeWebview = getActiveWebview();
    if (activeWebview) {
      console.log('[PreloadTest] Testing active webview:', activeWebview.id);
      
      // First test if preload script is loaded
      const preloadLoaded = await testPreloadScript(activeWebview);
      
      if (preloadLoaded) {
        // If preload is loaded, test IPC communication
        await testIpcCommunication(activeWebview);
      } else {
        console.error('[PreloadTest] Skipping IPC test because preload script is not loaded');
      }
    } else {
      console.error('[PreloadTest] No active webview found');
    }
  });

  container.appendChild(debugButton);
  console.log('[PreloadTest] Test button added to toolbar');
}

/**
 * Gets the currently active webview
 */
function getActiveWebview(): any {
  const activeTabId = (window as any).activeTabId;
  if (!activeTabId) return null;

  const webviewId = activeTabId.replace('tab-', 'webview-');
  return document.getElementById(webviewId);
}
