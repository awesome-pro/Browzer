import { WebpageContext } from '../types';
import { extractPageContent } from '../utils';
import CONSTANTS from '../../constants';

/**
 * MentionService handles @ mention functionality for webpage context selection
 */
export class MentionService {
  private selectedWebpageContexts: WebpageContext[] = [];
  private isShowingMentionDropdown = false;

  constructor() {
    this.setupGlobalEventListeners();
  }

  private setupGlobalEventListeners(): void {
    // Hide dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (this.isShowingMentionDropdown && 
          !target.closest('#mentionDropdown') && 
          !target.closest('#chatInput')) {
        this.hideMentionDropdown();
      }
    });
  }

  public getSelectedContexts(): WebpageContext[] {
    return [...this.selectedWebpageContexts];
  }

  public clearAllContexts(): void {
    console.log('🚨 [CLEAR CONTEXTS] Clearing all contexts, current count:', this.selectedWebpageContexts.length);
    this.selectedWebpageContexts = [];
    console.log('🔍 [CONTEXT] Cleared all webpage contexts');
    this.updateContextVisualIndicators();
  }

  public showMentionDropdown(chatInput: HTMLInputElement): void {
    console.log('🚨 [MENTION DROPDOWN] showMentionDropdown called');
    console.log('🚨 [MENTION DROPDOWN] isShowingMentionDropdown:', this.isShowingMentionDropdown);
    
    if (this.isShowingMentionDropdown) {
      console.log('🚨 [MENTION DROPDOWN] Already showing, returning');
      return;
    }
    
    console.log('🚨 [MENTION DROPDOWN] Creating mention dropdown');
    const dropdown = this.createMentionDropdown();
    this.isShowingMentionDropdown = true;
    
    // Position dropdown above the input
    const inputRect = chatInput.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.left = `${inputRect.left}px`;
    dropdown.style.bottom = `${window.innerHeight - inputRect.top + 5}px`;
    dropdown.style.width = `${inputRect.width}px`;
    dropdown.style.maxHeight = '200px';
    
    document.body.appendChild(dropdown);
    console.log('🚨 [MENTION DROPDOWN] Dropdown added to body');
    
    console.log('🔍 [MENTION] Showing mention dropdown');
  }

  public hideMentionDropdown(): void {
    console.log('🚨 [MENTION DROPDOWN] hideMentionDropdown called');
    
    const dropdown = document.getElementById('mentionDropdown');
    if (dropdown) {
      console.log('🚨 [MENTION DROPDOWN] Removing dropdown from DOM');
      dropdown.remove();
      this.isShowingMentionDropdown = false;
      console.log('🔍 [MENTION] Hiding mention dropdown');
    } else {
      console.log('🚨 [MENTION DROPDOWN] No dropdown found to remove');
    }
  }

  public isDropdownVisible(): boolean {
    return this.isShowingMentionDropdown;
  }

  private createMentionDropdown(): HTMLElement {
    const dropdown = document.createElement('div');
    dropdown.className = 'mention-dropdown';
    dropdown.id = 'mentionDropdown';
    
    const webpages = this.getAvailableWebpages();
    
    if (webpages.length === 0) {
      dropdown.innerHTML = '<div class="mention-item empty">No recent webpages found</div>';
    } else {
      dropdown.innerHTML = webpages.map((webpage: any) => `
        <div class="mention-item" data-webpage-id="${webpage.id}" data-webpage-url="${webpage.url}">
          <div class="mention-title">${webpage.title}</div>
          <div class="mention-url">${webpage.url}</div>
        </div>
      `).join('');
    }
    
    // Add click handlers
    dropdown.querySelectorAll('.mention-item:not(.empty)').forEach(item => {
      item.addEventListener('click', async (e) => {
        const webpageId = (e.currentTarget as HTMLElement).dataset.webpageId;
        const webpageUrl = (e.currentTarget as HTMLElement).dataset.webpageUrl;
        
        console.log('🚨 [MENTION CLICK] Webpage selected:', { webpageId, webpageUrl });
        
        if (webpageId && webpageUrl) {
          const webpage = webpages.find(w => w.id === webpageId);
          if (webpage) {
            console.log('🚨 [MENTION CLICK] Found webpage object:', webpage.title);
            console.log('🚨 [MENTION CLICK] Calling fetchWebpageContent for:', webpageUrl);
            
            // Fetch content for this webpage
            const content = await this.fetchWebpageContent(webpageUrl);
            console.log('🚨 [MENTION CLICK] Content fetched:', {
              title: content.title,
              contentLength: content.content?.length || 0,
              htmlLength: content.html?.length || 0
            });
            
            webpage.content = content;
            
            console.log('🚨 [MENTION CLICK] Adding webpage context');
            this.addWebpageContext(webpage);
            console.log('🚨 [MENTION CLICK] Context added, total contexts:', this.selectedWebpageContexts.length);
            
            this.hideMentionDropdown();
            
            // Update chat input to remove the @ trigger
            const chatInput = document.getElementById('chatInput') as HTMLInputElement;
            if (chatInput) {
              const value = chatInput.value;
              const lastAtIndex = value.lastIndexOf('@');
              if (lastAtIndex !== -1) {
                console.log('🚨 [MENTION CLICK] Removing @ from input');
                chatInput.value = value.substring(0, lastAtIndex);
                chatInput.focus();
              }
            }
          } else {
            console.error('🚨 [MENTION CLICK] Webpage object not found for ID:', webpageId);
          }
        } else {
          console.error('🚨 [MENTION CLICK] Missing webpageId or webpageUrl');
        }
      });
    });
    
    return dropdown;
  }

  private getAvailableWebpages(): WebpageContext[] {
    try {
      const history = JSON.parse(localStorage.getItem(CONSTANTS.HISTORY_STORAGE_KEY) || '[]');
      console.log('🔍 [DROPDOWN DEBUG] Total history items:', history.length);
      
      // Filter out internal pages and take up to 15 items for @ mentions
      const filteredHistory = history.filter((item: any) => {
        return item.url && 
               !item.url.startsWith('about:') && 
               !item.url.startsWith('file://') &&
               !item.url.includes('localhost') &&
               item.title && 
               item.title.length > 0 &&
               item.title !== 'New Tab';
      });
      
      console.log('🔍 [DROPDOWN DEBUG] Filtered history items:', filteredHistory.length);
      
      const webpages = filteredHistory.slice(0, 15).map((item: any) => ({
        id: item.id.toString(),
        title: item.title,
        url: item.url,
        timestamp: item.timestamp
      }));
      
      console.log('🔍 [DROPDOWN DEBUG] Available webpages for dropdown:', webpages.length);
      webpages.forEach((webpage: WebpageContext, index: number) => {
        console.log(`🔍 [DROPDOWN DEBUG] ${index + 1}. ${webpage.title} - ${webpage.url}`);
      });
      
      return webpages;
    } catch (error) {
      console.error('Error getting available webpages:', error);
      return [];
    }
  }

  private async fetchWebpageContent(url: string): Promise<any> {
    try {
      // Check if we can get content from an open tab with this URL
      const allTabs = this.getAllOpenTabs();
      const matchingTab = allTabs.find((tab: any) => tab.url === url);
      if (matchingTab) {
        const webview = document.getElementById(matchingTab.webviewId);
        if (webview) {
          console.log('🔍 [FETCH] Found open tab for URL:', url);
          return await extractPageContent(webview);
        }
      }
      
      console.log('🔍 [FETCH] Creating hidden webview to fetch content for:', url);
      
      // Create a hidden webview to fetch the content
      return new Promise((resolve, reject) => {
        const hiddenWebview = document.createElement('webview') as any;
        hiddenWebview.style.display = 'none';
        hiddenWebview.style.position = 'absolute';
        hiddenWebview.style.top = '-10000px';
        hiddenWebview.style.width = '1024px';
        hiddenWebview.style.height = '768px';
        
        // Add timeout to prevent hanging
        const timeout = setTimeout(() => {
          console.warn('🔍 [FETCH] Timeout fetching content for:', url);
          hiddenWebview.remove();
          resolve({
            title: '',
            description: '',
            content: `Timeout loading content from ${url}`,
            html: '',
            url: url
          });
        }, 15000); // 15 second timeout
        
        hiddenWebview.addEventListener('did-finish-load', async () => {
          try {
            console.log('🔍 [FETCH] Hidden webview loaded, extracting content for:', url);
            clearTimeout(timeout);
            
            // Extract content from the hidden webview
            const content = await extractPageContent(hiddenWebview);
            console.log('🔍 [FETCH] Content extracted successfully:', content.title);
            
            // Clean up
            hiddenWebview.remove();
            resolve(content);
          } catch (error) {
            console.error('🔍 [FETCH] Error extracting content:', error);
            clearTimeout(timeout);
            hiddenWebview.remove();
            resolve({
              title: '',
              description: '',
              content: `Error extracting content from ${url}`,
              html: '',
              url: url
            });
          }
        });
        
        hiddenWebview.addEventListener('did-fail-load', (event: any) => {
          console.error('🔍 [FETCH] Failed to load webpage:', url, event);
          clearTimeout(timeout);
          hiddenWebview.remove();
          resolve({
            title: '',
            description: '',
            content: `Failed to load content from ${url}`,
            html: '',
            url: url
          });
        });
        
        // Add to DOM and load URL
        document.body.appendChild(hiddenWebview);
        hiddenWebview.src = url;
      });
      
    } catch (error) {
      console.error('🔍 [FETCH] Error in fetchWebpageContent:', error);
      return {
        title: '',
        description: '',
        content: `Error loading content from ${url}`,
        html: '',
        url: url
      };
    }
  }

  private getAllOpenTabs(): any[] {
    // This should get tabs from TabManager - we'll need to inject this dependency
    // For now, return empty array as fallback
    return [];
  }

  private addWebpageContext(webpage: WebpageContext): void {
    console.log('🚨 [ADD CONTEXT] Adding webpage context:', webpage.title);
    console.log('🚨 [ADD CONTEXT] Current contexts before add:', this.selectedWebpageContexts.length);
    
    // Avoid duplicates
    if (!this.selectedWebpageContexts.find(ctx => ctx.url === webpage.url)) {
      this.selectedWebpageContexts.push(webpage);
      console.log('🔍 [CONTEXT] Added webpage context:', webpage.title);
      console.log('🚨 [ADD CONTEXT] Context added successfully, new total:', this.selectedWebpageContexts.length);
      this.updateContextVisualIndicators();
    } else {
      console.log('🚨 [ADD CONTEXT] Context already exists, skipping duplicate');
    }
  }

  private removeWebpageContext(webpageId: string): void {
    console.log('🚨 [REMOVE CONTEXT] Removing context with ID:', webpageId);
    const beforeCount = this.selectedWebpageContexts.length;
    this.selectedWebpageContexts = this.selectedWebpageContexts.filter(ctx => ctx.id !== webpageId);
    console.log('🔍 [CONTEXT] Removed webpage context:', webpageId);
    console.log('🚨 [REMOVE CONTEXT] Contexts before/after:', beforeCount, '→', this.selectedWebpageContexts.length);
    this.updateContextVisualIndicators();
  }

  private updateContextVisualIndicators(): void {
    console.log('🚨 [VISUAL INDICATORS] Updating context visual indicators');
    console.log('🚨 [VISUAL INDICATORS] Selected contexts count:', this.selectedWebpageContexts.length);
    
    // Update UI to show selected contexts
    const chatInputArea = document.querySelector('.chat-input-area');
    if (!chatInputArea) {
      console.log('🚨 [VISUAL INDICATORS] Chat input area not found, returning');
      return;
    }
    
    // Remove existing context indicators
    const existingIndicators = document.querySelectorAll('.context-indicators');
    console.log('🚨 [VISUAL INDICATORS] Removing existing indicators:', existingIndicators.length);
    existingIndicators.forEach(indicator => indicator.remove());
    
    // Add context indicators directly attached to the chat input area
    if (this.selectedWebpageContexts.length > 0) {
      console.log('🚨 [VISUAL INDICATORS] Creating context container for', this.selectedWebpageContexts.length, 'contexts');
      
      const contextContainer = document.createElement('div');
      contextContainer.className = 'context-indicators';
      
      this.selectedWebpageContexts.forEach(context => {
        console.log('🚨 [VISUAL INDICATORS] Creating indicator for:', context.title);
        const indicator = document.createElement('div');
        indicator.className = 'context-indicator';
        indicator.innerHTML = `
          <span class="context-title">${context.title}</span>
          <button class="context-remove" data-context-id="${context.id}">×</button>
        `;
        contextContainer.appendChild(indicator);
      });
      
      // Insert the context container right before the chat input area to create seamless connection
      chatInputArea.parentElement?.insertBefore(contextContainer, chatInputArea);
      console.log('🚨 [VISUAL INDICATORS] Context container inserted before chat input area');
      
      // Add CSS class to chat input area to modify its styling when context is present
      chatInputArea.classList.add('has-context');
      console.log('🚨 [VISUAL INDICATORS] Added has-context class to chat input area');
      
      // Add remove event listeners
      contextContainer.querySelectorAll('.context-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const contextId = (e.target as HTMLElement).dataset.contextId;
          if (contextId) {
            console.log('🚨 [VISUAL INDICATORS] Remove button clicked for context:', contextId);
            this.removeWebpageContext(contextId);
          }
        });
      });
    } else {
      console.log('🚨 [VISUAL INDICATORS] No contexts, removing has-context class');
      // Remove the has-context class when no contexts
      chatInputArea.classList.remove('has-context');
    }
  }

  public setupChatInputMentionHandlers(chatInput: HTMLInputElement): void {
    // Add input handler for @ mention detection
    chatInput.addEventListener('input', (e) => {
      const value = chatInput.value;
      const cursorPosition = chatInput.selectionStart || 0;
      // Check if user just typed @
      if (value.charAt(cursorPosition - 1) === '@') {
        console.log('🔍 [MENTION] @ detected, showing dropdown');
        console.log('🚨 [INPUT HANDLER] Calling showMentionDropdown');
        this.showMentionDropdown(chatInput);
      } else if (this.isShowingMentionDropdown) {
        console.log('🚨 [INPUT HANDLER] Dropdown is showing, checking if should hide');
        // Check if we should hide the dropdown
        const lastAtIndex = value.lastIndexOf('@');
        console.log('🚨 [INPUT HANDLER] Last @ index:', lastAtIndex, 'cursor position:', cursorPosition);
        if (lastAtIndex === -1 || cursorPosition <= lastAtIndex) {
          console.log('🚨 [INPUT HANDLER] Hiding dropdown');
          this.hideMentionDropdown();
        }
      }
    });

    // Add keyboard navigation for dropdown
    chatInput.addEventListener('keydown', (e) => {
      if (this.isShowingMentionDropdown) {
        const dropdown = document.getElementById('mentionDropdown');
        if (dropdown) {
          const items = dropdown.querySelectorAll('.mention-item:not(.empty)');
          const currentActive = dropdown.querySelector('.mention-item.active');
          let activeIndex = currentActive ? Array.from(items).indexOf(currentActive) : -1;
          
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, items.length - 1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
          } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault();
            (items[activeIndex] as HTMLElement).click();
            return;
          } else if (e.key === 'Escape') {
            e.preventDefault();
            this.hideMentionDropdown();
            return;
          }
          
          // Update active state
          items.forEach((item, index) => {
            item.classList.toggle('active', index === activeIndex);
          });
        }
      }
    });

    // Add blur handler to hide dropdown
    chatInput.addEventListener('blur', (e) => {
      // Small delay to allow clicking on dropdown items
      setTimeout(() => {
        if (this.isShowingMentionDropdown && !document.querySelector('#mentionDropdown:hover')) {
          this.hideMentionDropdown();
        }
      }, 150);
    });
  }

  public destroy(): void {
    try {
      this.selectedWebpageContexts = [];
      this.isShowingMentionDropdown = false;
      this.hideMentionDropdown();
      console.log('[MentionService] Destroyed successfully');
    } catch (error) {
      console.error('[MentionService] Error during destruction:', error);
    }
  }
}
