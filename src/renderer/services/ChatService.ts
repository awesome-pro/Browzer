import { IChatService, ChatMessage } from '../types';
import { markdownToHtml } from '../utils';

/**
 * ChatService handles chat functionality and message management
 */
export class ChatService implements IChatService {
  private chatContainer: HTMLElement | null = null;
  private messages: ChatMessage[] = [];

  public initialize(): void {
    try {
      this.setupChatContainer();
      console.log('[ChatService] Initialized successfully');
    } catch (error) {
      console.error('[ChatService] Failed to initialize:', error);
    }
  }

  private setupChatContainer(): void {
    // The chat container will be created dynamically when first message is added
    // This is consistent with the original implementation
  }

  public addMessageToChat(role: string, content: string, timing?: number): void {
    try {
      this.ensureChatContainer();
      
      if (!content || content.trim() === '') {
        return;
      }
      
      const message: ChatMessage = {
        role: role as 'user' | 'assistant' | 'context',
        content: content,
        timestamp: new Date().toISOString(),
        timing: timing
      };
      
      this.messages.push(message);
      this.renderMessage(message);
      
      // Scroll to bottom
      if (this.chatContainer) {
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
      }
      
      console.log('[ChatService] Message added:', role);
    } catch (error) {
      console.error('[ChatService] Error adding message:', error);
    }
  }

  private ensureChatContainer(): void {
    if (!this.chatContainer) {
      this.chatContainer = document.getElementById('chatContainer');
      
      if (!this.chatContainer) {
        const agentResults = document.getElementById('agentResults');
        if (!agentResults) {
          console.error('[ChatService] Agent results container not found');
          return;
        }
        
        // Remove welcome container if it exists
        const existingWelcome = agentResults.querySelector('.welcome-container');
        if (existingWelcome) {
          existingWelcome.remove();
        } 
        
        this.chatContainer = document.createElement('div');
        this.chatContainer.id = 'chatContainer';
        this.chatContainer.className = 'chat-container';
        agentResults.appendChild(this.chatContainer);
      }
    }
  }

  private renderMessage(message: ChatMessage): void {
    if (!this.chatContainer) return;
    
    const messageDiv = document.createElement('div');
    
    if (message.role === 'context') {
      messageDiv.className = 'chat-message context-message';
      messageDiv.innerHTML = `<div class="message-content">${markdownToHtml(message.content)}</div>`;
      messageDiv.dataset.role = 'context';
    } else if (message.role === 'user') {
      messageDiv.className = 'chat-message user-message';
      messageDiv.innerHTML = `<div class="message-content">${markdownToHtml(message.content)}</div>`;
      messageDiv.dataset.role = 'user';
      messageDiv.dataset.timestamp = message.timestamp;
    } else if (message.role === 'assistant') {
      messageDiv.className = 'chat-message assistant-message';
      messageDiv.dataset.role = 'assistant';
      messageDiv.dataset.timestamp = message.timestamp;
      
      const isLoading = message.content.includes('class="loading"') && 
                       !message.content.replace(/<div class="loading">.*?<\/div>/g, '').trim();
      const processedContent = isLoading ? message.content : markdownToHtml(message.content);
      
      if (message.timing && !isLoading) {
        messageDiv.innerHTML = `
          <div class="timing-info">
            <span>Response generated in</span>
            <span class="time-value">${message.timing.toFixed(2)}s</span>
          </div>
          <div class="message-content">${processedContent}</div>
        `;
        messageDiv.dataset.genTime = message.timing.toFixed(2);
      } else {
        messageDiv.innerHTML = `<div class="message-content">${processedContent}</div>`;
      }
    }
    
    this.chatContainer.appendChild(messageDiv);
  }

  public async processFollowupQuestion(question: string): Promise<void> {
    try {
      console.log('[ChatService] Processing followup question:', question);
      
      // Add user message
      this.addMessageToChat('user', question);
      
      // Add loading message
      this.addMessageToChat('assistant', '<div class="loading">Processing your question...</div>');
      
      // This would typically be handled by AgentService
      // For now, just show a placeholder response
      setTimeout(() => {
        this.clearLoadingMessages();
        this.addMessageToChat('assistant', 'Follow-up question processing is handled by AgentService.');
      }, 1000);
      
    } catch (error) {
      console.error('[ChatService] Error processing followup question:', error);
      this.clearLoadingMessages();
      this.addMessageToChat('assistant', 'Error processing your question.');
    }
  }

  public clearLoadingMessages(): void {
    const loadingMessages = document.querySelectorAll('.loading');
    loadingMessages.forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) {
        parentMessage.remove();
      }
    });
  }

  public clearChat(): void {
    this.messages = [];
    if (this.chatContainer) {
      this.chatContainer.innerHTML = '';
    }
    console.log('[ChatService] Chat cleared');
  }

  public getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  public getLastMessage(): ChatMessage | null {
    return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
  }

  public removeLastMessage(): void {
    if (this.messages.length > 0) {
      this.messages.pop();
      this.rerenderMessages();
    }
  }

  private rerenderMessages(): void {
    if (!this.chatContainer) return;
    
    this.chatContainer.innerHTML = '';
    this.messages.forEach(message => {
      this.renderMessage(message);
    });
    
    // Scroll to bottom
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  public exportMessages(): string {
    return JSON.stringify(this.messages, null, 2);
  }

  public importMessages(messagesJson: string): void {
    try {
      const importedMessages = JSON.parse(messagesJson) as ChatMessage[];
      this.messages = importedMessages;
      this.rerenderMessages();
      console.log('[ChatService] Messages imported successfully');
    } catch (error) {
      console.error('[ChatService] Error importing messages:', error);
    }
  }

  public destroy(): void {
    try {
      this.messages = [];
      this.chatContainer = null;
      console.log('[ChatService] Destroyed successfully');
    } catch (error) {
      console.error('[ChatService] Error during destruction:', error);
    }
  }
}
