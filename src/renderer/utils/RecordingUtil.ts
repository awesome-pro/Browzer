import { ActionType } from "../types";

export default class RecordingUtil {
    
    static mapEventTypeToActionType(eventType: string): ActionType {
    switch (eventType) {
      case 'click': return ActionType.CLICK;
      case 'input': return ActionType.TYPE;
      case 'type': return ActionType.TYPE; // Handle aggregated text input from webview
      case 'keypress': return ActionType.KEYPRESS; // Map keypress (like Enter) to navigation
      case 'change': return ActionType.SELECT;
      case 'submit': return ActionType.SUBMIT;
      case 'focus': return ActionType.FOCUS;
      case 'blur': return ActionType.BLUR;
      case 'scroll': return ActionType.SCROLL;
      case 'navigation': return ActionType.NAVIGATION;
      case 'in_page_navigation': return ActionType.NAVIGATION;
      case 'history_push_state': return ActionType.NAVIGATION;
      case 'history_replace_state': return ActionType.NAVIGATION;
      case 'spa_navigation': return ActionType.SPA_NAVIGATION;
      case 'turbo_navigation': return ActionType.SPA_NAVIGATION;
      case 'github_navigation': return ActionType.SPA_NAVIGATION;
      case 'page_load_complete': return ActionType.PAGE_LOAD;
      case 'search_results': return ActionType.SEARCH_RESULTS;
      case 'dynamic_content': return ActionType.DYNAMIC_CONTENT;
      case 'select': return ActionType.SELECT;
      case 'reset': return ActionType.SUBMIT;
      case 'invalid': return ActionType.SUBMIT;
      case 'select_option': return ActionType.SELECT_OPTION;
      case 'toggle_checkbox': return ActionType.TOGGLE_CHECKBOX;
      case 'select_radio': return ActionType.SELECT_RADIO;
      case 'select_file': return ActionType.SELECT_FILE;
      case 'adjust_slider': return ActionType.ADJUST_SLIDER;
      case 'form_submit': return ActionType.SUBMIT;
      case 'copy': return ActionType.COPY;
      case 'cut': return ActionType.CUT;
      case 'paste': return ActionType.PASTE;
      case 'context_menu': return ActionType.CONTEXT_MENU;
      case 'contextmenu': return ActionType.CONTEXT_MENU;
      case 'mouseover': 
      case 'mouseenter': 
        return ActionType.HOVER;
      case 'dragstart': return ActionType.DRAG_START;
      case 'drag': return ActionType.DRAG;
      case 'dragend': return ActionType.DRAG_END;
      case 'drop': return ActionType.DROP;
      
      case 'react_synthetic_event': return ActionType.REACT_EVENT;
      
      default: return ActionType.UNKNOWN;
    }
    } 

    static generateEnhancedElementDescription(element: any): string {
        const elementType = element.elementType || element.tagName || 'element';
        const text = element.text || '';
        const purpose = element.purpose || '';
        const context = element.context || '';
        const targetUrl = element.targetUrl;
        const uniqueIdentifiers = element.uniqueIdentifiers || [];
        const interactionContext = element.interactionContext || '';
        if (elementType === 'link') {
        let description = 'Link';
        
        if (targetUrl) {
            try {
            const url = new URL(targetUrl);
            const domain = url.hostname.replace('www.', '');
            description = `Link to ${domain}`;
            } catch (e) {
            description = 'Link';
            }
        }
        
        if (text) {
            description += ` ("${text.substring(0, 30)}")`;
        }
        const bestSelector = this.getBestSelector(uniqueIdentifiers, text, elementType);
        if (bestSelector) {
            description += ` [${bestSelector}]`;
        }
        
        if (interactionContext && interactionContext !== 'page') {
            description += ` in ${interactionContext}`;
        }
        
        return description;
        }
        
        if (elementType === 'button' || purpose.includes('button')) {
        let description = 'Button';
        if (purpose === 'search') description = 'Search button';
        else if (purpose === 'form_submission') description = 'Submit button';
        else if (purpose === 'toggle_setting') description = 'Toggle button';
        else if (purpose === 'navigation_menu') description = 'Menu button';
        else if (purpose === 'authentication') description = 'Authentication button';
        
        if (text) {
            description += ` ("${text.substring(0, 30)}")`;
        }
        const bestSelector = this.getBestSelector(uniqueIdentifiers, text, elementType);
        if (bestSelector) {
            description += ` [${bestSelector}]`;
        }
        
        if (interactionContext && interactionContext !== 'page') {
            description += ` in ${interactionContext}`;
        }
        
        return description;
        }
        
        if (elementType.includes('input')) {
        let description = 'Input field';
        if (purpose === 'search_input') description = 'Search input';
        else if (purpose === 'email_input') description = 'Email input';
        else if (purpose === 'password_input') description = 'Password input';
        else if (purpose === 'name_input') description = 'Name input';
        
        if (text) {
            description += ` [${text.substring(0, 30)}]`;
        }
        const bestSelector = this.getBestSelector(uniqueIdentifiers, text, elementType);
        if (bestSelector) {
            description += ` {${bestSelector}}`;
        }
        
        if (interactionContext && interactionContext !== 'page') {
            description += ` in ${interactionContext}`;
        }
        
        return description;
        }
        let description = elementType;
        if (text) description += ` ("${text.substring(0, 60)}")`;
        const bestSelector = this.getBestSelector(uniqueIdentifiers, text, elementType);
        if (bestSelector) {
        description += ` [${bestSelector}]`;
        }
        
        if (interactionContext && interactionContext !== 'page') {
        description += ` in ${interactionContext}`;
        } else if (context && context !== 'on_page') {
        description += ` ${context}`;
        }
        
        return description;
    }

  static getBestSelector(uniqueIdentifiers: string[], text: string, elementType: string): string {
    if (!uniqueIdentifiers || uniqueIdentifiers.length === 0) return '';
    const priorities = [
      (selector: string) => selector.startsWith('#'), // ID selectors
      (selector: string) => selector.includes('data-testid'), // Test ID selectors
      (selector: string) => selector.includes('aria-label'), // Aria label selectors
      (selector: string) => selector.includes('name='), // Name attribute selectors
      (selector: string) => selector.includes(':contains('), // Text-based selectors
      (selector: string) => selector.startsWith('.') // Class selectors
    ];
    
    for (const priorityCheck of priorities) {
      const selector = uniqueIdentifiers.find(priorityCheck);
      if (selector) return selector;
    }
    return uniqueIdentifiers[0] || '';
  }

  static cleanGoogleUrlInDescription(description: string): string {
    const googleUrlRegex = /(https:\/\/www\.google\.com\/search\?[^\s)]+)/g;
    
    return description.replace(googleUrlRegex, (match) => {
      return this.cleanGoogleUrl(match);
    });
  }

  static cleanGoogleUrl(url: string): string {
    if (!url) {
      return url;
    }
    
    try {
      // Handle relative Google redirect URLs
      if (url.startsWith('/url') && url.includes('url=')) {
        const urlParams = new URLSearchParams(url.split('?')[1]);
        const destinationUrl = urlParams.get('url');
        if (destinationUrl) {
          try {
            // URL decode the destination URL
            const decodedUrl = decodeURIComponent(destinationUrl);
            new URL(decodedUrl); // Validate it's a valid URL
            return decodedUrl;
          } catch (e) {
            // If decoding fails, return the original URL
          }
        }
      }
      
      const urlObj = new URL(url);
      
      // Handle Google redirect URLs
      if ((urlObj.hostname.includes('google.com') || urlObj.hostname.includes('google.')) && urlObj.pathname === '/url') {
        const destinationUrl = urlObj.searchParams.get('url') || urlObj.searchParams.get('q');
        if (destinationUrl) {
          try {
            // URL decode the destination URL
            const decodedUrl = decodeURIComponent(destinationUrl);
            new URL(decodedUrl); // Validate it's a valid URL
            return decodedUrl;
          } catch (e) {
            // If decoding fails, return the original URL
          }
        }
      }
      
      // Clean Google search URLs
      if (url.includes('google.com') || url.includes('google.')) {
        // Only keep essential search parameters
        const essentialParams = ['q', 'tbm', 'safe', 'lr', 'hl'];
        const cleanParams = new URLSearchParams();
        
        for (const param of essentialParams) {
          const value = urlObj.searchParams.get(param);
          if (value) {
            cleanParams.set(param, value);
          }
        }
        
        return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}${cleanParams.toString() ? '?' + cleanParams.toString() : ''}`;
      }
      
      return url;
    } catch (e) {
      console.warn('[RecordingEngine] Failed to clean Google URL:', e);
      return url;
    }
  }

  static isInteractiveElement(element: any): boolean {
    if (!element || !element.tagName) return false;
    
    const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'];
    const tagName = element.tagName.toUpperCase();
    if (interactiveTags.includes(tagName)) {
      return true;
    }
    const interactiveRoles = ['button', 'link', 'checkbox', 'menuitem', 'tab', 'radio'];
    const role = element.attributes?.role;
    if (role && interactiveRoles.includes(role)) {
      return true;
    }
    if (element.attributes) {
      const attrs = Object.keys(element.attributes);
      if (attrs.some(attr => attr.startsWith('on'))) {
        return true;
      }
    }
    
    return false;
  }

  static generateWebviewActionDescription(actionData: any): string {
    const element = actionData.target;
    const type = actionData.type;
    const value = actionData.value;
    if (type === 'page_load_complete') {
      if (typeof value === 'string') {
        return RecordingUtil.cleanGoogleUrlInDescription(value);
      }
      return `Page loaded - "${element.text}"`;
    }
    
    if (type === 'search_results_loaded') {
      return typeof value === 'string' ? value : `Search results loaded`;
    }
    
    if (type === 'dynamic_content_loaded') {
      if (typeof value === 'string') {
        return value;
      }
      const pageTitle = element.text || '';
      const context = element.context || 'page';
      
      if (pageTitle && pageTitle.length > 0) {
        return `${pageTitle} on ${context}`;
      }
      
      return `Content loaded on ${context}`;
    }
    const elementType = element.elementType || element.tagName;
    const purpose = element.purpose || 'interactive_element';
    const text = element.text || '';
    const targetUrl = element.targetUrl;
    
    switch (type) {
      case 'click':
        if (elementType === 'link') {
          if (targetUrl) {
            try {
              const cleanUrl = RecordingUtil.cleanGoogleUrl(targetUrl);
              const url = new URL(cleanUrl);
              const domain = url.hostname.replace('www.', '');
              return `Click link to ${domain}${text ? ` ("${text.substring(0, 30)}")` : ''} → ${cleanUrl}`;
            } catch (e) {
              const cleanUrl = RecordingUtil.cleanGoogleUrl(targetUrl);
              return `Click link${text ? ` ("${text.substring(0, 30)}")` : ''} → ${cleanUrl}`;
            }
          } else if (purpose === 'in_page_navigation') {
            return `Click in-page link${text ? ` ("${text.substring(0, 30)}")` : ''}`;
          } else {
            return `Click link${text ? ` ("${text.substring(0, 30)}")` : ''}`;
          }
        } else if (elementType === 'button' || purpose.includes('button')) {
          let buttonDescription = 'button';
          if (purpose === 'search') {
            buttonDescription = 'search button';
          } else if (purpose === 'form_submission') {
            buttonDescription = 'submit button';
          } else if (purpose === 'toggle_setting') {
            buttonDescription = 'toggle button';
          } else if (purpose === 'authentication') {
            buttonDescription = 'authentication button';
          }
          
          const elementContext = element.interactionContext || '';
          const contextSuffix = elementContext ? ` in ${elementContext}` : '';
          
          return `Click ${buttonDescription}${text ? ` ("${text.substring(0, 30)}")` : ''}${contextSuffix}`;
        } else {
          const elementContext = element.interactionContext || '';
          const contextSuffix = elementContext ? ` in ${elementContext}` : '';
          return `Click ${elementType}${text ? ` ("${text.substring(0, 30)}")` : ''}${contextSuffix}`;
        }
        
      case 'type':
        return `Enter "${value}" in ${elementType}`;
        
      case 'keypress':
        if (value === 'Enter' || value === 'Return' || value === 'enter' || value === 'return') {
          if (purpose === 'search_input') {
            return `Press Enter to search`;
          }
          return `Press Enter${text ? ` in ${elementType}` : ''}`;
        }
        return `Press ${value} key`;
        
      case 'navigation':
        if (value && typeof value === 'object') {
          const navType = value.navigationType;
          const url = value.url || value.toUrl;
          
          if (navType === 'google_search_result') {
            try {
              const isRedirect = value.isRedirect;
              const actualUrl = isRedirect ? value.url : url;
              const urlObj = new URL(actualUrl);
              const domain = urlObj.hostname.replace('www.', '');
              
              return `Navigate from search results to ${domain} → ${RecordingUtil.cleanGoogleUrl(actualUrl)}`;
            } catch (e) {
              return `Navigate from search results to website ${url}`;
            }
          } else if (navType === 'external_link' || navType === 'external_navigation') {
            try {
              const urlObj = new URL(url);
              const domain = urlObj.hostname.replace('www.', '');
              return `Navigate to ${domain} → ${url}`;
            } catch (e) {
              return `Navigate to external page → ${url}`;
            }
          } else if (navType === 'in_page_navigation') {
            return `Navigate within page`;
          } else if (url) {
            try {
              const urlObj = new URL(url);
              const domain = urlObj.hostname.replace('www.', '');
              return `Navigate to ${domain}`;
            } catch (e) {
              return `Navigate to ${url}`;
            }
          }
        }
        return `Navigate to page ${text ? ` ("${text.substring(0, 50)}")` : ''}`;
        
      case 'change':
        return `Select "${value}" from ${elementType}`;
        
      case 'submit':
      case 'form_submit':
        if (typeof value === 'object' && value !== null) {
          if (value.buttonText) {
            return `Click "${value.buttonText}" button to submit form`;
          } else if (value.fields) {
            const fieldCount = value.fieldCount || Object.keys(value.fields).length || 0;
            return `Submit form with ${fieldCount} fields`;
          }
        }
        return `Submit form`;
        
      default:
        return `${type} on ${elementType}${text ? ` ("${text.substring(0, 30)}")` : ''}`;
    }
  }

  static  getFormInputTypes(formElement: any): string[] {
    if (!formElement) return [];
    if (formElement.tagName && formElement.tagName === 'form') {
      if (formElement.attributes) {
        const inputTypes: string[] = [];
        
        if (formElement.attributes['data-purpose'] === 'search-form') {
          inputTypes.push('search');
        }
        if (formElement.elements) {
          for (const element of formElement.elements) {
            if (element.type) {
              inputTypes.push(element.type);
            }
          }
        }
        
        return inputTypes;
      }
    }
    
    return [];
  }

  static findLinkElementInHierarchy(element: any): any {
    try {
      if (!element) return null;
      if (element.tagName && typeof element.tagName === 'string' && 
          element.tagName.toLowerCase() === 'a' && element.href) {
        return element;
      }
      if (element.parentContext && element.parentContext.tagName && 
          typeof element.parentContext.tagName === 'string' && 
          element.parentContext.tagName.toLowerCase() === 'a' && 
          element.parentContext.href) {
        return element.parentContext;
      }
      if (element.closest && typeof element.closest === 'function') {
        try {
          const closestLink = element.closest('a[href]');
          if (closestLink) {
            return closestLink;
          }
        } catch (closestError) {
          console.log('[RecordingEngine] Error in closest():', closestError);
        }
      }
      if (element.parentElement) {
        let parent = element.parentElement;
        let depth = 0;
        const maxDepth = 3;
        
        while (parent && depth < maxDepth) {
          if (parent.tagName && 
              typeof parent.tagName === 'string' && 
              parent.tagName.toLowerCase() === 'a' && 
              parent.href) {
            return parent;
          }
          parent = parent.parentElement;
          depth++;
        }
      }
      
      return null;
    } catch (error) {
      console.error('[RecordingEngine] Error in findLinkElementInHierarchy:', error);
      return null;
    }
  }
}
