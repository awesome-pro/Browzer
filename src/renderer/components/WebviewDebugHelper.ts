/**
 * WebviewDebugHelper - Utility functions to debug webview recording
 */

/**
 * Injects a script to test if webview preload script is loaded and working
 * @param webview The webview element to test
 */
export function testWebviewPreloadScript(webview: any): void {
  if (!webview) {
    console.error('[WebviewDebug] No webview provided for testing');
    return;
  }

  console.log(`[WebviewDebug] Testing preload script in webview: ${webview.id}`);

  try {
    // Try to access the webviewRecorder object that should be injected by the preload script
    const testScript = `
      (function() {
        console.log('🔍 [WebviewDebug] Testing preload script...');
        
        // Check if webviewRecorder exists
        const hasRecorder = typeof window.webviewRecorder !== 'undefined';
        console.log('🔍 [WebviewDebug] webviewRecorder exists:', hasRecorder);
        
        // Check if checkWebviewRecorder function exists
        const hasCheckFunction = typeof window.checkWebviewRecorder === 'function';
        console.log('🔍 [WebviewDebug] checkWebviewRecorder function exists:', hasCheckFunction);
        
        // Try to call the check function if it exists
        let status = null;
        if (hasCheckFunction) {
          try {
            status = window.checkWebviewRecorder();
            console.log('🔍 [WebviewDebug] checkWebviewRecorder result:', status);
          } catch (e) {
            console.error('🔍 [WebviewDebug] Error calling checkWebviewRecorder:', e);
          }
        }
        
        // Return test results
        return {
          hasRecorder,
          hasCheckFunction,
          status,
          location: window.location.href
        };
      })();
    `;

    webview.executeJavaScript(testScript)
      .then((result: any) => {
        console.log('[WebviewDebug] Test results:', result);
        if (result.hasRecorder) {
          console.log('✅ [WebviewDebug] Preload script is loaded and working!');
        } else {
          console.error('❌ [WebviewDebug] Preload script is NOT loaded properly');
        }
      })
      .catch((error: any) => {
        console.error('[WebviewDebug] Error testing preload script:', error);
      });
  } catch (error) {
    console.error('[WebviewDebug] Failed to execute test script:', error);
  }
}

/**
 * Tests IPC communication between the webview and the main process
 * @param webview The webview element to test
 */
export function testWebviewIpcCommunication(webview: any): void {
  if (!webview) {
    console.error('[WebviewDebug] No webview provided for IPC testing');
    return;
  }

  console.log(`[WebviewDebug] Testing IPC communication with webview: ${webview.id}`);

  try {
    // Set up a listener for test messages
    const testListener = (event: any) => {
      if (event.channel === 'test-ipc-response') {
        console.log('✅ [WebviewDebug] Received IPC test response:', event.args[0]);
        webview.removeEventListener('ipc-message', testListener);
      }
    };

    webview.addEventListener('ipc-message', testListener);

    // Send a test message to the webview
    webview.send('test-ipc', { timestamp: Date.now() });
    console.log('[WebviewDebug] Sent test IPC message to webview');

    // Also inject a script to test sending messages from webview to main process
    const testScript = `
      (function() {
        console.log('🔍 [WebviewDebug] Testing IPC from webview to main process...');
        
        try {
          // Check if ipcRenderer is available
          if (typeof require !== 'undefined') {
            const { ipcRenderer } = require('electron');
            
            // Listen for test messages
            ipcRenderer.once('test-ipc', (event, data) => {
              console.log('🔍 [WebviewDebug] Received test IPC message:', data);
              
              // Send response back
              ipcRenderer.sendToHost('test-ipc-response', {
                received: true,
                timestamp: Date.now(),
                originalTimestamp: data.timestamp
              });
            });
            
            console.log('🔍 [WebviewDebug] IPC test listener set up');
            return true;
          } else {
            console.error('🔍 [WebviewDebug] require is not defined - preload script may not be working');
            return false;
          }
        } catch (e) {
          console.error('🔍 [WebviewDebug] Error setting up IPC test:', e);
          return false;
        }
      })();
    `;

    webview.executeJavaScript(testScript)
      .then((result: any) => {
        if (result) {
          console.log('✅ [WebviewDebug] IPC test script injected successfully');
        } else {
          console.error('❌ [WebviewDebug] IPC test script failed');
        }
      })
      .catch((error: any) => {
        console.error('[WebviewDebug] Error injecting IPC test script:', error);
      });
  } catch (error) {
    console.error('[WebviewDebug] Failed to set up IPC test:', error);
  }
}

/**
 * Adds a test button to manually test webview recording
 */
export function addWebviewDebugButton(): void {
  const container = document.querySelector('.toolbar-actions');
  if (!container) return;

  const debugButton = document.createElement('button');
  debugButton.className = 'action-btn';
  debugButton.id = 'webviewDebugBtn';
  debugButton.title = 'Test Webview Recording';
  debugButton.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 3a5 5 0 0 0-5 5 5 5 0 0 0 5 5 5 5 0 0 0 5-5 5 5 0 0 0-5-5zm0 9a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/>
      <path d="M8 5a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3zm0 5a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>
    </svg>
  `;

  debugButton.addEventListener('click', () => {
    const activeWebview = getActiveWebview();
    if (activeWebview) {
      console.log('[WebviewDebug] Testing active webview:', activeWebview.id);
      testWebviewPreloadScript(activeWebview);
      testWebviewIpcCommunication(activeWebview);
    } else {
      console.error('[WebviewDebug] No active webview found');
    }
  });

  container.appendChild(debugButton);
  console.log('[WebviewDebug] Debug button added to toolbar');
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
