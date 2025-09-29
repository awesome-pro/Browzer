/**
 * ChatMessage Component
 * Handles rendering of different message types in the chat sidebar
 */
export class ChatMessage {
  private static readonly MESSAGE_TYPES = {
    USER: 'user',
    ASSISTANT: 'assistant',
    LOADING: 'loading',
    STEP: 'step',
    ERROR: 'error',
    SUCCESS: 'success',
    INFO: 'info',
    CONTEXT: 'context'
  };

  /**
   * Creates a new message element in the chat container
   */
  public static createMessage(role: string, content: string, options: any = {}): HTMLElement {
    const messageDiv = document.createElement('div');
    const timestamp = new Date().toISOString();
    
    // Set common message properties
    (messageDiv as HTMLElement).dataset.role = role;
    (messageDiv as HTMLElement).dataset.timestamp = timestamp;
    
    // Determine message type and apply appropriate styling
    if (role === this.MESSAGE_TYPES.USER) {
      messageDiv.className = 'chat-message user-message';
      messageDiv.innerHTML = `<div class="message-content">${this.markdownToHtml(content)}</div>`;
    } 
    else if (role === this.MESSAGE_TYPES.ASSISTANT) {
      messageDiv.className = 'chat-message assistant-message';
      
      // Check if this is a loading message
      const isLoading = content.includes('class="loading"');
      
      if (isLoading) {
        messageDiv.classList.add('loading-message');
        messageDiv.innerHTML = `<div class="message-content">${content}</div>`;
      } 
      else {
        // Check if this is a step message (execution step)
        if (content.includes('Step') && (content.includes('✅') || content.includes('❌') || content.includes('🔄'))) {
          messageDiv.classList.add('step-message');
          messageDiv.innerHTML = this.formatStepMessage(content);
        } 
        // Check if this is an execution summary
        else if (content.includes('Execution Summary')) {
          messageDiv.classList.add('summary-message');
          messageDiv.innerHTML = `<div class="message-content">${this.markdownToHtml(content)}</div>`;
        }
        // Regular assistant message
        else {
          if (options.timing) {
            messageDiv.innerHTML = `
              <div class="timing-info">
                <span>Response generated in</span>
                <span class="time-value">${options.timing.toFixed(2)}s</span>
              </div>
              <div class="message-content">${this.markdownToHtml(content)}</div>
            `;
            (messageDiv as HTMLElement).dataset.genTime = options.timing.toFixed(2);
          } else {
            messageDiv.innerHTML = `<div class="message-content">${this.markdownToHtml(content)}</div>`;
          }
        }
      }
    } 
    else if (role === this.MESSAGE_TYPES.CONTEXT) {
      messageDiv.className = 'chat-message context-message';
      messageDiv.innerHTML = `<div class="message-content">${this.markdownToHtml(content)}</div>`;
    }
    
    return messageDiv;
  }

  /**
   * Format step messages for better readability
   */
  private static formatStepMessage(content: string): string {
    // Extract step number, description, and status
    const stepMatch = content.match(/\*\*Step (\d+):\*\* (.*?)(?:\s+([✅❌🔄]))/);
    
    if (!stepMatch) {
      // If not matching our expected format, just render as markdown
      return `<div class="message-content">${this.markdownToHtml(content)}</div>`;
    }
    
    const stepNumber = stepMatch[1];
    const description = stepMatch[2];
    const status = stepMatch[3];
    
    // Extract any additional information (error messages, timing, etc.)
    let additionalInfo = '';
    
    // Check for error messages
    const errorMatch = content.match(/⚠️\s*(.*?)(?:\n|$)/);
    if (errorMatch) {
      additionalInfo += `<div class="step-error">${errorMatch[1]}</div>`;
    }
    
    // Check for success messages
    const successMatch = content.match(/✓\s*(.*?)(?:\n|$)/);
    if (successMatch) {
      additionalInfo += `<div class="step-success">${successMatch[1]}</div>`;
    }
    
    // Check for timing information
    const timingMatch = content.match(/⏱️\s*(.*?)(?:\n|$)/);
    if (timingMatch) {
      additionalInfo += `<div class="step-timing">${timingMatch[1]}</div>`;
    }
    
    // Determine status class
    let statusClass = 'pending';
    if (status === '✅') statusClass = 'completed';
    else if (status === '❌') statusClass = 'failed';
    else if (status === '🔄') statusClass = 'running';
    
    // Create a modern step card
    return `
      <div class="step-card ${statusClass}">
        <div class="step-header">
          <div class="step-number">${stepNumber}</div>
          <div class="step-status-icon">${status}</div>
        </div>
        <div class="step-content">
          <div class="step-description">${description}</div>
          ${additionalInfo ? `<div class="step-details">${additionalInfo}</div>` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Convert markdown to HTML (simplified version)
   * In a real implementation, you'd use a proper markdown parser
   */
  private static markdownToHtml(markdown: string): string {
    // This is a placeholder - your app should have a proper markdown parser
    // We're assuming your app already has a Utils.markdownToHtml function
    if (typeof window !== 'undefined' && window.Utils && window.Utils.markdownToHtml) {
      return window.Utils.markdownToHtml(markdown);
    }
    
    // Simple fallback if Utils is not available
    return markdown
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  /**
   * Add a message to the chat container
   */
  public static addMessageToChat(role: string, content: string, timing?: number): void {
    try {
      let chatContainer = document.getElementById('chatContainer');
      
      if (!chatContainer) {
        const agentResults = document.getElementById('agentResults');
        if (!agentResults) return;
        
        const existingWelcome = agentResults.querySelector('.welcome-container');
        if (existingWelcome) existingWelcome.remove();
        
        chatContainer = document.createElement('div');
        chatContainer.id = 'chatContainer';
        chatContainer.className = 'chat-container';
        agentResults.appendChild(chatContainer);
      }
      
      if (!content || content.trim() === '') return;
      
      const messageDiv = this.createMessage(role, content, { timing });
      
      // Check if this is a duplicate user message (fixes the bug where user prompts appear twice)
      if (role === this.MESSAGE_TYPES.USER) {
        const lastMessage = chatContainer.querySelector('.chat-message:last-child');
        if (lastMessage && 
            (lastMessage as HTMLElement).dataset.role === this.MESSAGE_TYPES.USER && 
            lastMessage.querySelector('.message-content')?.textContent === content) {
          console.log('[ChatMessage] Preventing duplicate user message');
          return;
        }
      }
      
      chatContainer.appendChild(messageDiv);
      chatContainer.scrollTop = chatContainer.scrollHeight;
      
      // Ensure chat input area is visible
      this.ensureChatInputArea();
    } catch (error) {
      console.error('[ChatMessage] Error adding message to chat:', error);
    }
  }

  /**
   * Clear loading messages from the chat
   */
  public static clearLoadingMessages(): void {
    const loadingMessages = document.querySelectorAll('.loading');
    Array.from(loadingMessages).forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) parentMessage.remove();
    });
  }

  /**
   * Ensure the chat input area is visible
   */
  private static ensureChatInputArea(): void {
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
    }
  }
}

// Add to global window object for access from other modules
declare global {
  interface Window {
    ChatMessage: typeof ChatMessage;
    Utils: any;
  }
}

if (typeof window !== 'undefined') {
  window.ChatMessage = ChatMessage;
}

export default ChatMessage;
