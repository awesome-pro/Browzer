
export function markdownToHtml(text: string): string {
    let html = text;
    
    // Escape HTML entities in content first, but preserve already-escaped entities
    html = html.replace(/&(?!amp;|lt;|gt;|quot;|#39;|#x27;)/g, '&amp;');
    
    // Headers (must come before other processing)
    html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
    
    // Bold text
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic text
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Code blocks (triple backticks)
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Inline code (single backticks)
    html = html.replace(/`([^`]*)`/g, '<code>$1</code>');
    
    // Lists - simple approach
    // Convert unordered list items
    html = html.replace(/^\* (.*$)/gm, '<li>$1</li>');
    html = html.replace(/^\- (.*$)/gm, '<li>$1</li>');
    
    // Convert ordered list items  
    html = html.replace(/^\d+\. (.*$)/gm, '<li>$1</li>');
    
    // Wrap consecutive <li> elements in appropriate list tags
    html = html.replace(/(<li>.*<\/li>)/gms, function(match) {
      return '<ul>' + match + '</ul>';
    });
    
    // Convert line breaks to <br> but preserve existing HTML structure
    // Don't add <br> before closing tags, opening tags, or after certain elements
    html = html.replace(/\n(?!<\/|<h|<ul|<ol|<li|<pre|<blockquote|<strong|<em)/g, '<br>');
    
    // Links [text](url)
    html = html.replace(/\[([^\]]*)\]\(([^\)]*)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Blockquotes
    html = html.replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>');
    
    return html;
  }
  

  export async function extractPageContent(webview: any): Promise<any> {
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
            
            // Get both text content and full HTML
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

  export function extractTopicSimple(itemContent: any): string {
    try {
      if (!itemContent) return '';
      
      // Simple topic extraction - look for knowledge domains, subjects, or key entities
      const fullText = `${itemContent.title || ''} ${itemContent.question || ''}`.toLowerCase();
      
      // Common subjects and entities people might compare
      const knownDomains = [
        'python', 'javascript', 'react', 'machine learning', 'ai', 'artificial intelligence',
        'computer science', 'programming', 'crypto', 'cryptocurrency', 'bitcoin', 'ethereum',
        'history', 'science', 'physics', 'chemistry', 'biology', 'medicine', 'health',
        'politics', 'economics', 'finance', 'investing', 'stocks', 'business',
        'climate', 'environment', 'technology', 'privacy', 'security',
        'education', 'travel', 'food', 'nutrition', 'diet', 'fitness'
      ];
      
      for (const domain of knownDomains) {
        if (fullText.includes(domain)) {
          return domain;
        }
      }
      
      // If no known domain, try to use first 2-3 significant words from title/question
      const words = fullText.split(/\s+/).filter(w => w && w.length > 3);
      if (words.length >= 2) {
        return words.slice(0, 2).join(' ');
      }
      
      return '';
    } catch (error) {
      console.error('Error extracting topic:', error);
      return '';
    }
  }