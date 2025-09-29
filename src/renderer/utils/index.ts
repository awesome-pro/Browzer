import RecordingUtil from "./RecordingUtil";

class Utils {
  public static markdownToHtml(text: string): string {
    let html = text;
    html = html.replace(/&(?!amp;|lt;|gt;|quot;|#39;|#x27;)/g, '&amp;');
    html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    html = html.replace(/`([^`]*)`/g, '<code>$1</code>');
    html = html.replace(/^\* (.*$)/gm, '<li>$1</li>');
    html = html.replace(/^\- (.*$)/gm, '<li>$1</li>');
    html = html.replace(/^\d+\. (.*$)/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gms, function(match) {
      return '<ul>' + match + '</ul>';
    });
    html = html.replace(/\n(?!<\/|<h|<ul|<ol|<li|<pre|<blockquote|<strong|<em)/g, '<br>');
    html = html.replace(/\[([^\]]*)\]\(([^\)]*)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    html = html.replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>');
    
    return html;
  }
  

  public static async extractPageContent(webview: any): Promise<any> {
    try {
      const extractScript = `
        (function() {
          try {
            const title = document.title || '';
            
            let description = "";
            try {
              const metaDesc = document.querySelector('meta[name="description"]');
              if (metaDesc) description = metaDesc.getAttribute('content') || '';
            } catch(e) {
              console.error('Error getting meta description:', e);
            }
            const mainContent = document.querySelector('article') || 
                              document.querySelector('main') || 
                              document.querySelector('.content') ||
                              document.querySelector('#content') ||
                              document.body;
            
            const bodyText = mainContent ? mainContent.innerText.replace(/\\s+/g, ' ').trim() : '';
            const bodyHTML = mainContent ? mainContent.innerHTML : document.body.innerHTML;
            
            return {
              title: title,
              description: description,
              content: bodyText,
              html: bodyHTML,
              url: window.location.href
            };
          } catch(finalError) {
            console.error('Fatal error in content extraction:', finalError);
            return {
              title: document.title || '',
              description: '',
              content: 'Error extracting content: ' + finalError.message,
              html: '',
              url: window.location.href
            };
          }
        })();
      `;
      
      const result = await webview.executeJavaScript(extractScript);
      return result || { title: '', description: '', content: '', html: '', url: '' };
    } catch (error) {
      console.error('Error in extractPageContent:', error);
      return { title: '', description: '', content: '', html: '', url: '' };
    }
  }

  public static getExtensionDisplayName(extensionId: string): string {
    const displayNames: Record<string, string> = {
      'topic-agent': 'Topic Agent',
      'research-agent': 'Research Agent',
      'conversation-agent': 'Conversation Agent'
    };
    
    return displayNames[extensionId] || extensionId.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
  }


  public static getBrowserApiKeys(): Record<string, string> {
    const providers = ['anthropic']; // ['openai', 'anthropic', 'perplexity', 'chutes'];
    const apiKeys: Record<string, string> = {};
    
    console.log('[DEBUG] Reading API keys from localStorage...');
    
    providers.forEach(provider => {
      const key = localStorage.getItem(`${provider}_api_key`);
      if (key) {
        apiKeys[provider] = key;
        const maskedKey = key.length > 12 ? key.substring(0, 8) + '...' + key.substring(key.length - 4) : 'short_key';
        console.log(`[DEBUG] ${provider}: ${maskedKey} (length: ${key.length})`);
      } else {
        console.log(`[DEBUG] ${provider}: NO KEY FOUND`);
      }
    });
    
    console.log(`[DEBUG] Total API keys found: ${Object.keys(apiKeys).length}`);
    return apiKeys;
  }

}


export {
  RecordingUtil,
  Utils
}
