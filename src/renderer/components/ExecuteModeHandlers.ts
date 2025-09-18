/**
 * ExecuteModeHandlers.ts
 * 
 * Handlers for the Execute mode in the chat sidebar
 */

import { SmartRecordingSession } from '../../shared/types/recording';
import { RecordingSessionList } from './RecordingSessionList';
import { RecordingExecutor } from './RecordingExecutor';

// Global variables
let sessionListComponent: RecordingSessionList | null = null;
let selectedRecordingSession: SmartRecordingSession | null = null;

/**
 * Initialize the session list sidebar for Execute mode
 */
export function initializeSessionList(): void {
  console.log('[initializeSessionList] Initializing session list for Execute mode');
  
  try {
    // Find or create the session list container
    let sessionListContainer = document.querySelector('.session-list-container');
    
    if (!sessionListContainer) {
      console.log('[initializeSessionList] Creating session list container');
      
      // Find the chat sidebar content
      const sidebarContent = document.querySelector('.chat-sidebar-content');
      if (!sidebarContent) {
        console.error('[initializeSessionList] Chat sidebar content not found');
        return;
      }
      
      // Create the container
      sessionListContainer = document.createElement('div');
      sessionListContainer.className = 'session-list-container';
      sidebarContent.appendChild(sessionListContainer);
      
      // Add CSS for the session list
      const linkElement = document.createElement('link');
      linkElement.rel = 'stylesheet';
      linkElement.href = 'recording-session-list.css';
      document.head.appendChild(linkElement);
    }
    
    // Initialize the session list component
    sessionListComponent = new RecordingSessionList(
      sessionListContainer as HTMLElement,
      (session) => {
        console.log('[SessionList] Session selected:', session.taskGoal);
        selectedRecordingSession = session;
        
        // Update the input placeholder to reflect selected session
        const chatInput = document.getElementById('chatInput') as HTMLInputElement;
        if (chatInput) {
          chatInput.placeholder = `Execute task using "${session.taskGoal}"...`;
        }
      }
    );
    
    console.log('[initializeSessionList] Session list initialized successfully');
  } catch (error) {
    console.error('[initializeSessionList] Error initializing session list:', error);
  }
}

/**
 * Process an Execute mode submission with a selected recording
 */
export async function processExecuteWithRecording(instruction: string): Promise<void> {
  console.log('[processExecuteWithRecording] Processing instruction:', instruction);
  
  // Check if we're already executing a workflow
  try {
    const isExecuting = (window as any).isWorkflowExecuting;
    if (isExecuting) {
      console.log('[processExecuteWithRecording] Workflow already executing, skipping');
      // Use DOM methods instead of direct function calls
      showToastMessage('Task already in progress...', 'info');
      return;
    }
  } catch (error) {
    console.error('[processExecuteWithRecording] Error checking workflow status:', error);
  }
  
  // Check if a recording session is selected
  if (!selectedRecordingSession) {
    console.log('[processExecuteWithRecording] No recording session selected');
    addChatMessage('assistant', 'Please select a recording session from the sidebar first.');
    return;
  }
  
  // Set execution flag
  (window as any).isWorkflowExecuting = true;
  console.log('[processExecuteWithRecording] Setting execution flag');
  
  try {
    // Show initial loading message
    addChatMessage('assistant', '<div class="loading">Analyzing recording and planning execution...</div>');
    
    // Get the active webview
    const activeWebview = getActiveWebviewElement();
    if (!activeWebview) {
      throw new Error('No active webview found');
    }
    
    // Progress handler to update the message
    let progressMessage = '';
    const onProgress = (message: string) => {
      // Find the latest assistant message and update it with progress
      const chatContainer = document.getElementById('chatContainer');
      if (chatContainer) {
        const lastMessage = chatContainer.querySelector('.chat-message.assistant-message:last-child .message-content');
        if (lastMessage) {
          // If it's a loading message, replace it
          if (lastMessage.innerHTML.includes('class="loading"')) {
            lastMessage.innerHTML = `Executing based on "${selectedRecordingSession?.taskGoal}":\n\n${message}`;
            progressMessage = message;
          } else {
            // Add to existing message
            progressMessage += `\n${message}`;
            lastMessage.innerHTML = `Executing based on "${selectedRecordingSession?.taskGoal}":\n\n${progressMessage}`;
          }
        }
      }
    };
    
    // Execute the task
    console.log('[processExecuteWithRecording] Executing task with recording:', selectedRecordingSession.taskGoal);
    const result = await RecordingExecutor.executeTask(
      selectedRecordingSession,
      instruction,
      activeWebview,
      onProgress
    );
    
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
        resultMessage += `\n\n📄 **Result:**\n${JSON.stringify(result.data, null, 2)}`;
      }
      
      addChatMessage('assistant', resultMessage);
    } else {
      addChatMessage('assistant', `❌ **Task failed:** ${result.error}`);
    }
    
  } catch (error) {
    console.error('[processExecuteWithRecording] Error executing task:', error);
    
    // Remove loading message
    const loadingMessages = document.querySelectorAll('.loading');
    loadingMessages.forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) {
        parentMessage.remove();
      }
    });
    
    addChatMessage('assistant', `❌ **Task execution failed:** ${(error as Error).message}`);
  } finally {
    // Always clear execution flag
    (window as any).isWorkflowExecuting = false;
    console.log('[processExecuteWithRecording] Clearing execution flag');
  }
}

/**
 * Helper function to add a message to the chat using DOM manipulation
 */
function addChatMessage(role: string, content: string): void {
  try {
    let chatContainer = document.getElementById('chatContainer');
    
    // Create chat container if it doesn't exist
    if (!chatContainer) {
      console.log('[addChatMessage] Chat container not found, creating one');
      
      const agentResults = document.getElementById('agentResults');
      if (!agentResults) {
        console.error('[addChatMessage] agentResults container not found');
        return;
      }
      
      chatContainer = document.createElement('div');
      chatContainer.id = 'chatContainer';
      chatContainer.className = 'chat-container';
      agentResults.appendChild(chatContainer);
    }
    
    // Create message element
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}-message`;
    messageDiv.dataset.role = role;
    messageDiv.dataset.timestamp = new Date().toISOString();
    
    // Add content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = content;
    messageDiv.appendChild(contentDiv);
    
    // Add to chat container
    chatContainer.appendChild(messageDiv);
    
    // Scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
  } catch (error) {
    console.error('[addChatMessage] Error adding message to chat:', error);
  }
}

/**
 * Helper function to show a toast message
 */
function showToastMessage(message: string, type: string = 'info'): void {
  try {
    // Create toast container if it doesn't exist
    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toastContainer';
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}-toast`;
    toast.textContent = message;
    
    // Add to container
    toastContainer.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 3000);
  } catch (error) {
    console.error('[showToastMessage] Error showing toast:', error);
  }
}

/**
 * Helper function to get the active webview element
 */
function getActiveWebviewElement(): HTMLElement | null {
  try {
    // Try to find the active webview
    const webviews = document.querySelectorAll('webview');
    for (let i = 0; i < webviews.length; i++) {
      const webview = webviews[i] as HTMLElement;
      if (webview.classList.contains('active') || webview.style.display !== 'none') {
        return webview;
      }
    }
    
    // If no active webview found, return the first one
    return webviews.length > 0 ? webviews[0] as HTMLElement : null;
  } catch (error) {
    console.error('[getActiveWebviewElement] Error getting active webview:', error);
    return null;
  }
}

/**
 * Get the currently selected recording session
 */
export function getSelectedRecordingSession(): SmartRecordingSession | null {
  return selectedRecordingSession;
}

/**
 * Reset the selected recording session
 */
export function resetSelectedRecordingSession(): void {
  selectedRecordingSession = null;
}
