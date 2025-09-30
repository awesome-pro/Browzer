import { BrowserWindow, WebContents, ipcMain, webContents } from 'electron';

/**
 * NativeEventMonitor captures events at the Electron/Chromium level
 * This bypasses Content Security Policy restrictions and works on all sites
 */
export class NativeEventMonitor {
  private static instance: NativeEventMonitor;
  private monitoredWebContents = new Map<number, WebContents>();
  private isRecording = false;
  private currentSessionId: string | null = null;

  private constructor() {
    this.setupIpcHandlers();
  }

  public static getInstance(): NativeEventMonitor {
    if (!NativeEventMonitor.instance) {
      NativeEventMonitor.instance = new NativeEventMonitor();
    }
    return NativeEventMonitor.instance;
  }

  private setupIpcHandlers(): void {
    ipcMain.on('start-native-recording', (event, sessionId: string) => {
      this.startRecording(sessionId);
    });

    ipcMain.on('stop-native-recording', () => {
      this.stopRecording();
    });
    ipcMain.on('register-webview-for-monitoring', (event, webContentsId: number) => {
      this.registerWebContents(webContentsId);
    });
    ipcMain.on('unregister-webview-for-monitoring', (event, webContentsId: number) => {
      this.unregisterWebContents(webContentsId);
    });
  }

  private startRecording(sessionId: string): void {
    console.log(`[NativeEventMonitor] Starting recording with session ID: ${sessionId}`);
    this.isRecording = true;
    this.currentSessionId = sessionId;
    this.monitoredWebContents.forEach((webContents, id) => {
      this.attachEventListeners(webContents);
    });
  }

  private stopRecording(): void {
    console.log('[NativeEventMonitor] Stopping recording');
    this.isRecording = false;
    this.currentSessionId = null;
    this.monitoredWebContents.forEach((webContents, id) => {
      this.detachEventListeners(webContents);
    });
  }

  private registerWebContents(webContentsId: number): void {
    const webContents = this.getWebContentsById(webContentsId);
    if (webContents) {
      console.log(`[NativeEventMonitor] Registering webContents ID: ${webContentsId}`);
      this.monitoredWebContents.set(webContentsId, webContents);
      
      if (this.isRecording) {
        this.attachEventListeners(webContents);
      }
    }
  }

  private unregisterWebContents(webContentsId: number): void {
    const webContents = this.monitoredWebContents.get(webContentsId);
    if (webContents) {
      console.log(`[NativeEventMonitor] Unregistering webContents ID: ${webContentsId}`);
      this.detachEventListeners(webContents);
      this.monitoredWebContents.delete(webContentsId);
    }
  }

  private getWebContentsById(webContentsId: number): WebContents | null {
    try {
      const allWebContents = webContents.getAllWebContents();
      return allWebContents.find((wc: WebContents) => wc.id === webContentsId) || null;
    } catch (error: any) {
      console.error(`[NativeEventMonitor] Error getting WebContents for ID ${webContentsId}:`, error);
      return null;
    }
  }

  private attachEventListeners(webContents: WebContents): void {
    if (!webContents || webContents.isDestroyed()) return;

    try {
      this.injectEventMonitoringScript(webContents);
      webContents.addListener('did-navigate', this.handleNavigation);
      webContents.addListener('did-navigate-in-page', this.handleInPageNavigation);
      webContents.addListener('console-message', this.handleConsoleMessage);
    } catch (error) {
      console.error('[NativeEventMonitor] Error attaching event listeners:', error);
    }
  }

  private detachEventListeners(webContents: WebContents): void {
    if (!webContents || webContents.isDestroyed()) return;

    try {
      webContents.removeListener('did-navigate', this.handleNavigation);
      webContents.removeListener('did-navigate-in-page', this.handleInPageNavigation);
      webContents.removeListener('console-message', this.handleConsoleMessage);
      this.injectCleanupScript(webContents);
    } catch (error) {
      console.error('[NativeEventMonitor] Error detaching event listeners:', error);
    }
  }

  private handleNavigation = (event: any, url: string): void => {
    if (!this.isRecording) return;
  
    if (!event || !event.sender) return;
    
    const webContents = event.sender as WebContents;
    const webContentsId = webContents.id;
    if (!this.monitoredWebContents.has(webContentsId)) return;
    
    this.sendEventToRenderer({
      type: 'navigation',
      url,
      timestamp: Date.now(),
      sessionId: this.currentSessionId,
      webContentsId,
      title: webContents.getTitle() || ''
    });
    setTimeout(() => {
      this.injectEventMonitoringScript(webContents);
    }, 500);
  };

  private handleInPageNavigation = (event: any, url: string, isMainFrame: boolean): void => {
    if (!this.isRecording || !isMainFrame) return;
    
    if (!event || !event.sender) return;
    
    const webContents = event.sender as WebContents;
    const webContentsId = webContents.id;
    
    if (!this.monitoredWebContents.has(webContentsId)) return;
    
    this.sendEventToRenderer({
      type: 'in_page_navigation',
      url,
      timestamp: Date.now(),
      sessionId: this.currentSessionId,
      webContentsId,
      title: webContents.getTitle() || ''
    });
  };

  private handleConsoleMessage = (event: any, level: number, message: string, line: number, sourceId: string): void => {
    if (!event) return;

    if (message.startsWith('__NATIVE_EVENT__:')) {
      try {
        const eventData = JSON.parse(message.substring('__NATIVE_EVENT__:'.length));
        this.sendEventToRenderer(eventData);
      } catch (error) {
        console.error('[NativeEventMonitor] Error parsing event data:', error);
      }
    }
  };

private async injectEventMonitoringScript(webContents: WebContents): Promise<void> {
  if (!webContents || webContents.isDestroyed()) return;

  try {
    if (webContents.isLoading()) {
      try {
        await new Promise<void>((resolve) => {
          const loadHandler = () => {
            webContents.off('did-finish-load', loadHandler);
            resolve();
          };
          webContents.on('did-finish-load', loadHandler);
          setTimeout(resolve, 3000);
        });
      } catch (error) {
      }
    }
    await webContents.executeJavaScript(`
      (function() {
        if (window.__nativeEventMonitorInjected) return;
        window.__nativeEventMonitorInjected = true;
        
        console.log('[NativeEventMonitor] Injecting event monitoring script');
        const originalAddEventListener = EventTarget.prototype.addEventListener;
        const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        const eventsToMonitor = [
          'click', 'input', 'change', 'submit',
          'keydown', 'keyup', 'keypress', 'focus', 'blur', 'contextmenu',
          'select', 'reset', 'invalid',
          'copy', 'cut', 'paste',
          'dragstart', 'dragend', 'dragenter', 'dragleave', 'dragover', 'drop',
          'scroll',
          'cancel', 'close',
          'play', 'pause', 'ended', 'volumechange',
          'touchstart', 'touchend', 'touchmove', 'touchcancel',
          'mousedown', 'mouseup'
        ];
        window.__nativeEventListeners = new Map();
        
        function captureElement(element) {
          if (!element || !element.tagName) return null;
          
          try {
            const rect = element.getBoundingClientRect();
            const computedStyle = window.getComputedStyle(element);
            
            const isVisible = !(computedStyle.display === 'none' || 
                             computedStyle.visibility === 'hidden' || 
                             computedStyle.opacity === '0' ||
                             rect.width === 0 || 
                             rect.height === 0);
            
            const isSvg = element.tagName.toLowerCase() === 'svg' || element.ownerSVGElement != null;
            
            let parentInteractiveElement = null;
            if (isSvg || ['span', 'i', 'div'].includes(element.tagName.toLowerCase())) {
              let currentEl = element;
              let depth = 0;
              while (currentEl && depth < 4) { // Increased depth
                const parent = currentEl.parentElement;
                if (parent && (
                  parent.tagName.toLowerCase() === 'button' || 
                  parent.tagName.toLowerCase() === 'a' || 
                  parent.getAttribute('role') === 'button' || 
                  parent.getAttribute('role') === 'link' ||
                  parent.onclick ||
                  (parent.className && (
                    parent.className.includes('btn') || 
                    parent.className.includes('button') ||
                    parent.className.includes('submit')
                  )) ||
                  parent.type === 'submit'
                )) {
                  parentInteractiveElement = parent;
                  break;
                }
                currentEl = parent;
                depth++;
              }
            }
            
            const primaryElement = parentInteractiveElement || element;
            
            let classNameStr = null;
            if (primaryElement.className) {
              if (typeof primaryElement.className === 'string') {
                classNameStr = primaryElement.className;
              } else if (isSvg && primaryElement.className.baseVal !== undefined) {
                classNameStr = primaryElement.className.baseVal;
              }
            }
            
            let svgData = null;
            if (isSvg) {
              svgData = {
                id: element.id || null,
                viewBox: element.getAttribute('viewBox') || null,
                path: element.querySelector('path')?.getAttribute('d') || null,
                use: element.querySelector('use')?.getAttribute('href') || null
              };
            }
            
            let role = primaryElement.getAttribute('role');
            if (!role) {
              const tagName = primaryElement.tagName.toLowerCase();
              const type = primaryElement.type?.toLowerCase();
              if (tagName === 'a') role = 'link';
              else if (tagName === 'button') role = 'button';
              else if (type === 'submit' || type === 'button') role = 'button';
              else if (tagName === 'input') {
                if (type === 'checkbox') role = 'checkbox';
                else if (type === 'radio') role = 'radio';
                else role = 'textbox';
              }
              else if (tagName === 'select') role = 'combobox';
              else if (tagName === 'textarea') role = 'textbox';
              else if (tagName === 'img') role = 'img';
              else if (tagName === 'svg') role = 'image';
              else if (/^h[1-6]$/.test(tagName)) role = 'heading';
              else if (classNameStr && (classNameStr.includes('btn') || 
                       classNameStr.includes('button'))) role = 'button';
              else role = 'generic';
            }
            
            const dataAttributes = {};
            Array.from(primaryElement.attributes || []).forEach(attr => {
              if (attr.name.startsWith('data-')) {
                dataAttributes[attr.name] = attr.value;
              }
            });
            
            let parentContext = null;
            try {
              const parentElement = primaryElement.parentElement;
              if (parentElement && parentElement.tagName) {
                let parentClassNameStr = null;
                if (parentElement.className) {
                  if (typeof parentElement.className === 'string') {
                    parentClassNameStr = parentElement.className;
                  } else if (parentElement.className.baseVal !== undefined) {
                    parentClassNameStr = parentElement.className.baseVal;
                  }
                }
                
                parentContext = {
                  tagName: parentElement.tagName.toLowerCase(),
                  id: parentElement.id || null,
                  className: parentClassNameStr,
                  role: parentElement.getAttribute('role') || null,
                  href: parentElement.getAttribute('href') || null,
                  onclick: !!parentElement.onclick,
                  ariaLabel: parentElement.getAttribute('aria-label') || null,
                  title: parentElement.title || null,
                  type: parentElement.type || null
                };
              }
            } catch (e) { /* Ignore parent context errors */ }
            
            let formContext = null;
            try {
              const form = primaryElement.form || primaryElement.closest('form');
              if (form) {
                formContext = {
                  id: form.id || null,
                  name: form.name || null,
                  action: form.action || null,
                  method: form.method || 'get',
                  target: form.target || null,
                  enctype: form.enctype || null
                };
              }
            } catch (e) { /* Ignore form context errors */ }
            
            let nearestTextContent = null;
            if (isSvg && !primaryElement.textContent?.trim()) {
              if (parentInteractiveElement) {
                const siblings = Array.from(parentInteractiveElement.childNodes);
                for (const sibling of siblings) {
                  if (sibling !== element && sibling.textContent?.trim()) {
                    nearestTextContent = sibling.textContent.trim().substring(0, 100);
                    break;
                  }
                }
                
                if (!nearestTextContent && parentInteractiveElement.textContent?.trim()) {
                  nearestTextContent = parentInteractiveElement.textContent.trim().substring(0, 100);
                }
              }
            }
            
            const isInteractive = ['a', 'button', 'input', 'select', 'textarea', 
                                 'details', 'summary'].includes(primaryElement.tagName.toLowerCase()) || 
                                !!primaryElement.getAttribute('role') || 
                                !!primaryElement.onclick || 
                                computedStyle.cursor === 'pointer' ||
                                (classNameStr && (classNameStr.includes('btn') || 
                                 classNameStr.includes('button') || 
                                 classNameStr.includes('clickable'))) ||
                                primaryElement.type === 'submit';
            
            let textContent = primaryElement.textContent?.trim() || primaryElement.innerText?.trim() || '';
            if (!textContent && element !== primaryElement) {
              textContent = element.textContent?.trim() || element.innerText?.trim() || '';
            }
            
            return {
              tagName: primaryElement.tagName.toLowerCase(),
              id: primaryElement.id || null,
              className: classNameStr,
              type: primaryElement.type || null,
              name: primaryElement.name || null,
              value: primaryElement.value || null,
              href: primaryElement.href || null,
              src: primaryElement.src || null,
              alt: primaryElement.alt || null,
              placeholder: primaryElement.placeholder || null,
              checked: primaryElement.checked !== undefined ? primaryElement.checked : null,
              selected: primaryElement.selected !== undefined ? primaryElement.selected : null,
              disabled: primaryElement.disabled !== undefined ? primaryElement.disabled : null,
              readOnly: primaryElement.readOnly !== undefined ? primaryElement.readOnly : null,
              required: primaryElement.required !== undefined ? primaryElement.required : null,
              text: textContent.substring(0, 100) || null,
              innerText: primaryElement.innerText?.trim().substring(0, 100) || null,
              title: primaryElement.title || null,
              ariaLabel: primaryElement.getAttribute('aria-label') || null,
              role: role || null,
              isVisible: isVisible,
              isInteractive: isInteractive,
              attributes: Array.from(primaryElement.attributes || []).reduce((obj, attr) => {
                obj[attr.name] = attr.value;
                return obj;
              }, {}),
              dataAttributes: Object.keys(dataAttributes).length > 0 ? dataAttributes : null,
              svgData: svgData,
              isSvg: isSvg,
              nearestTextContent: nearestTextContent,
              parentInteractiveElement: parentInteractiveElement ? {
                tagName: parentInteractiveElement.tagName.toLowerCase(),
                id: parentInteractiveElement.id || null,
                className: typeof parentInteractiveElement.className === 'string' ? 
                           parentInteractiveElement.className : 
                           (parentInteractiveElement.className?.baseVal || null),
                role: parentInteractiveElement.getAttribute('role') || null,
                text: parentInteractiveElement.textContent?.trim().substring(0, 100) || null,
                ariaLabel: parentInteractiveElement.getAttribute('aria-label') || null,
                title: parentInteractiveElement.title || null,
                type: parentInteractiveElement.type || null
              } : null,
              boundingRect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                right: rect.right
              },
              styles: {
                display: computedStyle.display,
                visibility: computedStyle.visibility,
                position: computedStyle.position,
                zIndex: computedStyle.zIndex,
                opacity: computedStyle.opacity,
                cursor: computedStyle.cursor
              },
              parentContext: parentContext,
              formContext: formContext,
              usedParentAsPrimary: !!parentInteractiveElement
            };
          } catch (e) {
            console.error('Error in captureElement:', e);
            return { tagName: element.tagName.toLowerCase() };
          }
        }
        window.__selectStateTracker = new Map();
        window.__selectInteractionBuffer = new Map();
        
        function handleNativeEvent(event) {
          const asyncEvents = ['play', 'pause', 'ended'];
          if (!event.isTrusted && !asyncEvents.includes(event.type)) return;
          
          const target = event.target;
          if (!target) return;
          
          if (event.type === 'change' && isSelectElement(target)) {
            handleSelectChange(event);
            return;
          }
          
          if (event.type === 'click') {
            handlePotentialSelectClick(event);
          }
          
          if (event.type === 'input' && isAutocompleteInput(target)) {
            handleAutocompleteInput(event);
          }
          if (event.type === 'scroll') {
            if (!window.__lastScrollPosition) {
              window.__lastScrollPosition = { x: window.scrollX, y: window.scrollY };
              return;
            }
            
            const scrollDiffY = Math.abs(window.scrollY - window.__lastScrollPosition.y);
            const scrollDiffX = Math.abs(window.scrollX - window.__lastScrollPosition.x);
            
            if (scrollDiffY < 100 && scrollDiffX < 100) return;
            
            window.__lastScrollPosition = { x: window.scrollX, y: window.scrollY };
          }
          
          const eventData = {
            type: event.type,
            timestamp: Date.now(),
            target: captureElement(target),
            coordinates: event.clientX !== undefined ? { x: event.clientX, y: event.clientY } : null,
            key: event.key,
            keyCode: event.keyCode,
            value: target.value,
            checked: target.checked,
            url: window.location.href,
            title: document.title
          };
          if (event.type === 'scroll') {
            eventData.scrollPosition = { x: window.scrollX, y: window.scrollY };
            eventData.viewportHeight = window.innerHeight;
            eventData.documentHeight = document.documentElement.scrollHeight;
            eventData.scrollPercentage = Math.round((window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100);
          } else if (['dragstart', 'dragend', 'drop'].includes(event.type)) {
            eventData.dataTransfer = event.dataTransfer ? {
              types: Array.from(event.dataTransfer.types || []),
              effectAllowed: event.dataTransfer.effectAllowed
            } : null;
          } else if (['play', 'pause', 'ended'].includes(event.type)) {
            const mediaElement = target;
            eventData.mediaInfo = {
              currentTime: mediaElement.currentTime,
              duration: mediaElement.duration,
              paused: mediaElement.paused,
              muted: mediaElement.muted,
              volume: mediaElement.volume
            };
          }

          console.log('__NATIVE_EVENT__:' + JSON.stringify(eventData));
        }
        
        function isSelectElement(element) {
          if (!element) return false;
          
          if (element.tagName && element.tagName.toLowerCase() === 'select') {
            return true;
          }
          
          const role = element.getAttribute('role');
          if (role && ['combobox', 'listbox'].includes(role)) {
            return true;
          }
          
          const ariaHaspopup = element.getAttribute('aria-haspopup');
          if (ariaHaspopup === 'listbox' || ariaHaspopup === 'true') {
            return true;
          }
          
          const className = element.className || '';
          const selectPatterns = [
            'select', 'dropdown', 'combobox', 'autocomplete',
            'react-select', 'mui-select', 'ant-select', 'ng-select',
            'multiselect', 'chosen', 'select2'
          ];
          
          if (typeof className === 'string') {
            const lowerClass = className.toLowerCase();
            if (selectPatterns.some(pattern => lowerClass.includes(pattern))) {
              return true;
            }
          }
          
          return false;
        }
        
        function isAutocompleteInput(element) {
          if (!element || element.tagName?.toLowerCase() !== 'input') return false;
          
          const role = element.getAttribute('role');
          if (role === 'combobox' || role === 'searchbox') return true;
          
          const ariaAutocomplete = element.getAttribute('aria-autocomplete');
          if (ariaAutocomplete === 'list' || ariaAutocomplete === 'both') return true;
          
          const className = element.className || '';
          if (typeof className === 'string') {
            const lowerClass = className.toLowerCase();
            const autocompletePatterns = ['autocomplete', 'search', 'typeahead', 'combobox'];
            if (autocompletePatterns.some(pattern => lowerClass.includes(pattern))) {
              return true;
            }
          }
          
          const type = element.getAttribute('type');
          if (type === 'search') return true;
          
          return false;
        }
        
        function findSelectContainer(element) {
          let current = element;
          let depth = 0;
          const maxDepth = 5;
          
          while (current && depth < maxDepth) {
            if (isSelectElement(current)) {
              return current;
            }
            
            const parent = current.parentElement;
            if (!parent) break;
            
            const className = parent.className || '';
            if (typeof className === 'string') {
              const lowerClass = className.toLowerCase();
              if (lowerClass.includes('select') || lowerClass.includes('dropdown') || 
                  lowerClass.includes('combobox') || lowerClass.includes('autocomplete')) {
                return parent;
              }
            }
            
            current = parent;
            depth++;
          }
          
          return null;
        }
        
        function captureSelectOptions(selectElement) {
          const options = [];
          
          if (selectElement.tagName && selectElement.tagName.toLowerCase() === 'select') {
            const optionElements = selectElement.querySelectorAll('option');
            optionElements.forEach((opt, index) => {
              options.push({
                value: opt.value,
                text: opt.textContent?.trim() || opt.innerText?.trim(),
                selected: opt.selected,
                disabled: opt.disabled,
                index: index
              });
            });
          } else {
            const listbox = selectElement.querySelector('[role="listbox"]') || 
                           document.querySelector('[role="listbox"]');
            
            if (listbox) {
              const optionElements = listbox.querySelectorAll('[role="option"]');
              optionElements.forEach((opt, index) => {
                const ariaSelected = opt.getAttribute('aria-selected') === 'true';
                const ariaDisabled = opt.getAttribute('aria-disabled') === 'true';
                
                options.push({
                  value: opt.getAttribute('data-value') || opt.textContent?.trim(),
                  text: opt.textContent?.trim() || opt.innerText?.trim(),
                  selected: ariaSelected,
                  disabled: ariaDisabled,
                  index: index,
                  className: opt.className
                });
              });
            } else {
              const dropdownItems = selectElement.querySelectorAll(
                '.select-option, .dropdown-item, .option, [data-option], .MuiMenuItem-root, .ant-select-item'
              );
              
              dropdownItems.forEach((item, index) => {
                const isSelected = item.classList.contains('selected') || 
                                 item.classList.contains('active') ||
                                 item.getAttribute('aria-selected') === 'true';
                
                options.push({
                  value: item.getAttribute('data-value') || item.textContent?.trim(),
                  text: item.textContent?.trim() || item.innerText?.trim(),
                  selected: isSelected,
                  disabled: item.classList.contains('disabled'),
                  index: index,
                  className: item.className
                });
              });
            }
          }
          
          return options;
        }
        
        function getSelectedValues(selectElement) {
          const selectedValues = [];
          
          if (selectElement.tagName && selectElement.tagName.toLowerCase() === 'select') {
            if (selectElement.multiple) {
              const selectedOptions = selectElement.selectedOptions || 
                                    Array.from(selectElement.options).filter(opt => opt.selected);
              selectedOptions.forEach(opt => {
                selectedValues.push({
                  value: opt.value,
                  text: opt.textContent?.trim() || opt.innerText?.trim()
                });
              });
            } else {
              const selectedOption = selectElement.options[selectElement.selectedIndex];
              if (selectedOption) {
                selectedValues.push({
                  value: selectedOption.value,
                  text: selectedOption.textContent?.trim() || selectedOption.innerText?.trim()
                });
              }
            }
          } else {
            const selectedItems = selectElement.querySelectorAll(
              '[aria-selected="true"], .selected, .active, .is-selected'
            );
            
            selectedItems.forEach(item => {
              selectedValues.push({
                value: item.getAttribute('data-value') || item.textContent?.trim(),
                text: item.textContent?.trim() || item.innerText?.trim(),
                className: item.className
              });
            });
            
            if (selectedValues.length === 0) {
              const valueDisplay = selectElement.querySelector(
                '.select-value, .selected-value, .value, [class*="singleValue"], [class*="placeholder"]'
              );
              
              if (valueDisplay && valueDisplay.textContent?.trim()) {
                selectedValues.push({
                  value: valueDisplay.textContent.trim(),
                  text: valueDisplay.textContent.trim()
                });
              }
            }
          }
          
          return selectedValues;
        }
        
        function handleSelectChange(event) {
          const target = event.target;
          const selectContainer = findSelectContainer(target) || target;
          
          const options = captureSelectOptions(selectContainer);
          const selectedValues = getSelectedValues(selectContainer);
          const previousValues = window.__selectStateTracker.get(selectContainer) || [];
          
          const isMultiSelect = selectContainer.multiple || 
                               selectContainer.getAttribute('aria-multiselectable') === 'true' ||
                               selectedValues.length > 1;
          
          const selectContext = {
            isMultiSelect: isMultiSelect,
            totalOptions: options.length,
            availableOptions: options,
            selectedValues: selectedValues,
            previousValues: previousValues,
            selectType: detectSelectType(selectContainer),
            hasSearch: !!selectContainer.querySelector('input[type="search"], input[role="searchbox"]'),
            isAsync: selectContainer.classList.contains('async') || 
                    selectContainer.getAttribute('data-async') === 'true'
          };
          
          window.__selectStateTracker.set(selectContainer, selectedValues);
          
          console.log('__NATIVE_EVENT__:' + JSON.stringify({
            type: 'select_change',
            timestamp: Date.now(),
            target: captureElement(selectContainer),
            url: window.location.href,
            title: document.title,
            selectContext: selectContext,
            value: selectedValues
          }));
        }
        
        function detectSelectType(element) {
          const className = element.className || '';
          const classStr = typeof className === 'string' ? className.toLowerCase() : '';
          
          if (classStr.includes('react-select')) return 'react-select';
          if (classStr.includes('mui') || classStr.includes('material')) return 'material-ui';
          if (classStr.includes('ant-select')) return 'ant-design';
          if (classStr.includes('ng-select')) return 'angular-select';
          if (classStr.includes('vue-select')) return 'vue-select';
          if (classStr.includes('select2')) return 'select2';
          if (classStr.includes('chosen')) return 'chosen';
          if (classStr.includes('multiselect')) return 'multiselect';
          if (element.tagName && element.tagName.toLowerCase() === 'select') return 'native-select';
          
          return 'custom-select';
        }
        
        function handlePotentialSelectClick(event) {
          const target = event.target;
          const selectContainer = findSelectContainer(target);
          
          if (!selectContainer) return;
          
          const isOption = target.getAttribute('role') === 'option' ||
                          target.classList.contains('option') ||
                          target.classList.contains('select-option') ||
                          target.classList.contains('dropdown-item') ||
                          target.classList.contains('MuiMenuItem-root') ||
                          target.classList.contains('ant-select-item');
          
          if (isOption) {
            const optionValue = target.getAttribute('data-value') || target.textContent?.trim();
            const optionText = target.textContent?.trim() || target.innerText?.trim();
            const isSelected = target.getAttribute('aria-selected') === 'true' ||
                             target.classList.contains('selected') ||
                             target.classList.contains('active');
            
            const allOptions = captureSelectOptions(selectContainer);
            const currentSelected = getSelectedValues(selectContainer);
            
            console.log('__NATIVE_EVENT__:' + JSON.stringify({
              type: 'select_option_click',
              timestamp: Date.now(),
              target: captureElement(target),
              url: window.location.href,
              title: document.title,
              optionContext: {
                value: optionValue,
                text: optionText,
                isSelected: isSelected,
                allOptions: allOptions,
                currentSelected: currentSelected,
                selectContainer: captureElement(selectContainer)
              }
            }));
          }
          
          const isSelectTrigger = target.classList.contains('select-trigger') ||
                                 target.classList.contains('dropdown-toggle') ||
                                 target.getAttribute('aria-haspopup') === 'listbox';
          
          if (isSelectTrigger || selectContainer === target) {
            const isOpen = selectContainer.classList.contains('open') ||
                          selectContainer.classList.contains('is-open') ||
                          selectContainer.getAttribute('aria-expanded') === 'true';
            
            setTimeout(() => {
              const nowOpen = selectContainer.classList.contains('open') ||
                            selectContainer.classList.contains('is-open') ||
                            selectContainer.getAttribute('aria-expanded') === 'true';
              
              if (nowOpen !== isOpen) {
                console.log('__NATIVE_EVENT__:' + JSON.stringify({
                  type: nowOpen ? 'select_open' : 'select_close',
                  timestamp: Date.now(),
                  target: captureElement(selectContainer),
                  url: window.location.href,
                  title: document.title,
                  selectContext: {
                    isOpen: nowOpen,
                    options: captureSelectOptions(selectContainer),
                    selectedValues: getSelectedValues(selectContainer)
                  }
                }));
              }
            }, 50);
          }
        }
        
        function handleAutocompleteInput(event) {
          const target = event.target;
          const searchQuery = target.value;
          const selectContainer = findSelectContainer(target);
          
          if (!selectContainer && !isAutocompleteInput(target)) return;
          
          const bufferId = target.id || target.name || 'autocomplete_' + Date.now();
          
          if (window.__selectInteractionBuffer.has(bufferId)) {
            clearTimeout(window.__selectInteractionBuffer.get(bufferId).timeout);
          }
          
          const timeout = setTimeout(() => {
            const listbox = document.querySelector('[role="listbox"]');
            const options = listbox ? captureSelectOptions(listbox) : [];
            
            console.log('__NATIVE_EVENT__:' + JSON.stringify({
              type: 'autocomplete_search',
              timestamp: Date.now(),
              target: captureElement(target),
              url: window.location.href,
              title: document.title,
              autocompleteContext: {
                searchQuery: searchQuery,
                resultsCount: options.length,
                options: options.slice(0, 10),
                hasResults: options.length > 0,
                selectContainer: selectContainer ? captureElement(selectContainer) : null
              }
            }));
            
            window.__selectInteractionBuffer.delete(bufferId);
          }, 500);
          
          window.__selectInteractionBuffer.set(bufferId, {
            searchQuery: searchQuery,
            timeout: timeout,
            timestamp: Date.now()
          });
        }
        
        eventsToMonitor.forEach(eventType => {
          const listener = (event) => handleNativeEvent(event);
          window.__nativeEventListeners.set(eventType, listener);
          originalAddEventListener.call(document, eventType, listener, { capture: true, passive: true });
        });
        history.pushState = function() {
          const result = originalPushState.apply(this, arguments);
          console.log('__NATIVE_EVENT__:' + JSON.stringify({
            type: 'history_push_state',
            timestamp: Date.now(),
            url: window.location.href,
            title: document.title
          }));
          return result;
        };
        
        history.replaceState = function() {
          const result = originalReplaceState.apply(this, arguments);
          console.log('__NATIVE_EVENT__:' + JSON.stringify({
            type: 'history_replace_state',
            timestamp: Date.now(),
            url: window.location.href,
            title: document.title
          }));
          return result;
        };
        window.__cleanupNativeEventMonitor = function() {
            if (!window.__nativeEventListeners) return;
            
            eventsToMonitor.forEach(eventType => {
              const listener = window.__nativeEventListeners.get(eventType);
              if (listener) {
                originalRemoveEventListener.call(document, eventType, listener, { capture: true });
              }
            });
            
            window.__nativeEventListeners.clear();
            window.__nativeEventMonitorInjected = false;
            history.pushState = originalPushState;
            history.replaceState = originalReplaceState;
            if (originalXHROpen && originalXHRSend) {
              XMLHttpRequest.prototype.open = originalXHROpen;
              XMLHttpRequest.prototype.send = originalXHRSend;
            }
            
            if (originalFetch) {
              window.fetch = originalFetch;
            }
            if (window.__dynamicContentObserver) {
              window.__dynamicContentObserver.disconnect();
              window.__dynamicContentObserver = null;
            }
            
            if (window.__reactRouterObserver) {
              window.__reactRouterObserver.disconnect();
              window.__reactRouterObserver = null;
            }
            
            if (window.__vueRouterObserver) {
              window.__vueRouterObserver.disconnect();
              window.__vueRouterObserver = null;
            }
            if (window.__monitorIntervals) {
              window.__monitorIntervals.forEach(clearInterval);
              window.__monitorIntervals = [];
            }
          };
          const setupDynamicContentObserver = () => {
            let domChangeTimeout = null;
            let pendingMutations = [];
            
            const reportSignificantDOMChange = (mutations, isDebounced = false) => {
              if (!isDebounced && domChangeTimeout) {
                pendingMutations = pendingMutations.concat(mutations);
                return;
              }
              const allMutations = isDebounced ? pendingMutations : mutations;
              pendingMutations = [];
              let addedElements = 0;
              let removedElements = 0;
              let changedAttributes = 0;
              let textChanges = 0;
              const affectedElements = new Set();
              const addedNodes = [];
              
              allMutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                  mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // ELEMENT_NODE
                      addedElements++;
                      affectedElements.add(node);
                      if (node.tagName && [
                        'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE',
                        'UL', 'OL', 'TABLE', 'FORM'
                      ].includes(node.tagName.toUpperCase()) && node.childElementCount > 0) {
                        addedNodes.push(captureElement(node));
                      }
                    }
                  });
                  mutation.removedNodes.forEach(node => {
                    if (node.nodeType === 1) { // ELEMENT_NODE
                      removedElements++;
                    }
                  });
                } else if (mutation.type === 'attributes') {
                  changedAttributes++;
                  affectedElements.add(mutation.target);
                } else if (mutation.type === 'characterData') {
                  textChanges++;
                  affectedElements.add(mutation.target.parentElement);
                }
              });
              const isSignificant = (
                addedElements > 3 || 
                removedElements > 3 ||
                (addedElements > 0 && addedNodes.length > 0) ||
                affectedElements.size > 5 ||
                (changedAttributes > 5 && affectedElements.size > 2)
              );
              
              if (isSignificant) {
                console.log('__NATIVE_EVENT__:' + JSON.stringify({
                  type: 'dynamic_content_change',
                  timestamp: Date.now(),
                  url: window.location.href,
                  title: document.title,
                  details: {
                    addedElements,
                    removedElements,
                    changedAttributes,
                    textChanges,
                    affectedElementsCount: affectedElements.size,
                    significantAddedNodes: addedNodes.slice(0, 3) // Limit to 3 nodes for size
                  }
                }));
              }
            };
            const observer = new MutationObserver((mutations) => {
              if (mutations.length > 10) {
                reportSignificantDOMChange(mutations);
                return;
              }
              pendingMutations = pendingMutations.concat(mutations);
              
              if (domChangeTimeout) {
                clearTimeout(domChangeTimeout);
              }
              
              domChangeTimeout = setTimeout(() => {
                domChangeTimeout = null;
                reportSignificantDOMChange([], true); // Process accumulated mutations
              }, 500); // 500ms debounce
            });
            if (document.body) {
              observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'disabled'],
                characterData: false // Skip text changes to reduce noise
              });
              window.__dynamicContentObserver = observer;
            } else {
              const bodyCheckInterval = setInterval(() => {
                if (document.body) {
                  clearInterval(bodyCheckInterval);
                  setupDynamicContentObserver();
                }
              }, 100);
            }
          };
          setupDynamicContentObserver();
          const originalXHROpen = XMLHttpRequest.prototype.open;
          const originalXHRSend = XMLHttpRequest.prototype.send;
          const originalFetch = window.fetch;
          window.__activeRequests = new Map();
          window.__requestCounter = 0;
          XMLHttpRequest.prototype.open = function(method, url) {
            this.__requestId = ++window.__requestCounter;
            this.__requestMethod = method;
            this.__requestUrl = url;
            this.__requestStartTime = Date.now();
            return originalXHROpen.apply(this, arguments);
          };
          
          XMLHttpRequest.prototype.send = function() {
            const requestId = this.__requestId;
            const method = this.__requestMethod;
            const url = this.__requestUrl;
            const startTime = this.__requestStartTime;
            window.__activeRequests.set(requestId, {
              type: 'xhr',
              method,
              url,
              startTime
            });
            console.log('__NATIVE_EVENT__:' + JSON.stringify({
              type: 'async_request_start',
              timestamp: startTime,
              url: window.location.href,
              title: document.title,
              request: {
                id: requestId,
                type: 'xhr',
                method,
                url
              }
            }));
            this.addEventListener('load', function() {
              const endTime = Date.now();
              const duration = endTime - startTime;
              console.log('__NATIVE_EVENT__:' + JSON.stringify({
                type: 'async_request_complete',
                timestamp: endTime,
                url: window.location.href,
                title: document.title,
                request: {
                  id: requestId,
                  type: 'xhr',
                  method,
                  url,
                  status: this.status,
                  duration
                }
              }));
              window.__activeRequests.delete(requestId);
            });
            
            this.addEventListener('error', function() {
              const endTime = Date.now();
              const duration = endTime - startTime;
              console.log('__NATIVE_EVENT__:' + JSON.stringify({
                type: 'async_request_error',
                timestamp: endTime,
                url: window.location.href,
                title: document.title,
                request: {
                  id: requestId,
                  type: 'xhr',
                  method,
                  url,
                  duration
                }
              }));
              window.__activeRequests.delete(requestId);
            });
            
            return originalXHRSend.apply(this, arguments);
          };
          window.fetch = async function(input, init) {
            const requestId = ++window.__requestCounter;
            const startTime = Date.now();
            let url = typeof input === 'string' ? input : input.url;
            let method = init?.method || (input instanceof Request ? input.method : 'GET');
            window.__activeRequests.set(requestId, {
              type: 'fetch',
              method,
              url,
              startTime
            });
            console.log('__NATIVE_EVENT__:' + JSON.stringify({
              type: 'async_request_start',
              timestamp: startTime,
              url: window.location.href,
              title: document.title,
              request: {
                id: requestId,
                type: 'fetch',
                method,
                url
              }
            }));
            
            try {
              const response = await originalFetch.apply(this, arguments);
              const endTime = Date.now();
              const duration = endTime - startTime;
              console.log('__NATIVE_EVENT__:' + JSON.stringify({
                type: 'async_request_complete',
                timestamp: endTime,
                url: window.location.href,
                title: document.title,
                request: {
                  id: requestId,
                  type: 'fetch',
                  method,
                  url,
                  status: response.status,
                  duration
                }
              }));
              window.__activeRequests.delete(requestId);
              
              return response;
            } catch (error) {
              const endTime = Date.now();
              const duration = endTime - startTime;
              console.log('__NATIVE_EVENT__:' + JSON.stringify({
                type: 'async_request_error',
                timestamp: endTime,
                url: window.location.href,
                title: document.title,
                request: {
                  id: requestId,
                  type: 'fetch',
                  method,
                  url,
                  duration
                }
              }));
              window.__activeRequests.delete(requestId);
              
              throw error;
            }
          };
          const monitorModalsAndDialogs = () => {
            document.querySelectorAll('dialog').forEach(dialog => {
              if (dialog.__monitored) return;
              dialog.__monitored = true;
              
              const showEvent = () => {
                console.log('__NATIVE_EVENT__:' + JSON.stringify({
                  type: 'modal_open',
                  timestamp: Date.now(),
                  url: window.location.href,
                  title: document.title,
                  target: captureElement(dialog)
                }));
              };
              
              const hideEvent = () => {
                console.log('__NATIVE_EVENT__:' + JSON.stringify({
                  type: 'modal_close',
                  timestamp: Date.now(),
                  url: window.location.href,
                  title: document.title,
                  target: captureElement(dialog)
                }));
              };
              
              dialog.addEventListener('close', hideEvent);
              dialog.addEventListener('cancel', hideEvent);
              if (dialog.open || dialog.hasAttribute('open') || 
                  window.getComputedStyle(dialog).display !== 'none') {
                showEvent();
              }
            });
            const modalSelectors = [
              '[role="dialog"]',
              '[aria-modal="true"]',
              '.modal:not(.modal-hidden):not(.hidden)',
              '.dialog:not(.dialog-hidden):not(.hidden)',
              '.overlay:not(.overlay-hidden):not(.hidden)'
            ];
            
            modalSelectors.forEach(selector => {
              document.querySelectorAll(selector).forEach(modal => {
                if (modal.__monitored) return;
                modal.__monitored = true;
                if (window.getComputedStyle(modal).display !== 'none') {
                  console.log('__NATIVE_EVENT__:' + JSON.stringify({
                    type: 'modal_open',
                    timestamp: Date.now(),
                    url: window.location.href,
                    title: document.title,
                    target: captureElement(modal)
                  }));
                }
              });
            });
          };
          monitorModalsAndDialogs();
          setInterval(monitorModalsAndDialogs, 2000);
          if (typeof React !== 'undefined' || window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
            const originalDispatchEvent = EventTarget.prototype.dispatchEvent;
            EventTarget.prototype.dispatchEvent = function(event) {
              const result = originalDispatchEvent.call(this, event);
              if (event && event._reactName && this.tagName) {
                console.log('__NATIVE_EVENT__:' + JSON.stringify({
                  type: 'react_synthetic_event',
                  reactType: event._reactName,
                  timestamp: Date.now(),
                  target: captureElement(this),
                  url: window.location.href,
                  title: document.title
                }));
              }
              
              return result;
            };
          }
          const setupSPARouteMonitoring = () => {
            window.addEventListener('popstate', () => {
              console.log('__NATIVE_EVENT__:' + JSON.stringify({
                type: 'spa_navigation',
                navigationType: 'popstate',
                timestamp: Date.now(),
                url: window.location.href,
                title: document.title
              }));
            });
            if (window.angular || document.querySelector('[ng-app]')) {
              document.addEventListener('$routeChangeStart', () => {
                console.log('__NATIVE_EVENT__:' + JSON.stringify({
                  type: 'spa_navigation',
                  navigationType: 'angular_route_change',
                  timestamp: Date.now(),
                  url: window.location.href,
                  title: document.title
                }));
              });
            }
            if (document.querySelector('#root') || document.querySelector('[data-reactroot]')) {
              const reactRouterObserver = new MutationObserver((mutations) => {
                if (window.__lastReactUrl !== window.location.href) {
                  window.__lastReactUrl = window.location.href;
                  console.log('__NATIVE_EVENT__:' + JSON.stringify({
                    type: 'spa_navigation',
                    navigationType: 'react_router',
                    timestamp: Date.now(),
                    url: window.location.href,
                    title: document.title
                  }));
                }
              });
              const reactRoot = document.querySelector('#root') || document.querySelector('[data-reactroot]');
              if (reactRoot) {
                reactRouterObserver.observe(reactRoot, { childList: true, subtree: true });
                window.__reactRouterObserver = reactRouterObserver;
              }
            }
            if (window.Vue || document.querySelector('[data-v-app]')) {
              const vueRouterObserver = new MutationObserver((mutations) => {
                if (window.__lastVueUrl !== window.location.href) {
                  window.__lastVueUrl = window.location.href;
                  console.log('__NATIVE_EVENT__:' + JSON.stringify({
                    type: 'spa_navigation',
                    navigationType: 'vue_router',
                    timestamp: Date.now(),
                    url: window.location.href,
                    title: document.title
                  }));
                }
              });
              const vueRoot = document.querySelector('[data-v-app]') || document.body;
              vueRouterObserver.observe(vueRoot, { childList: true, subtree: true });
              window.__vueRouterObserver = vueRouterObserver;
            }
          };
          setupSPARouteMonitoring();
        
          console.log('[NativeEventMonitor] Event monitoring script injected successfully');
      })();
    `, true);
  } catch (error) {
    console.error('[NativeEventMonitor] Error injecting event monitoring script:', error);
  }
}

  private async injectCleanupScript(webContents: WebContents): Promise<void> {
    if (!webContents || webContents.isDestroyed()) return;

    try {
      await webContents.executeJavaScript(`
        (function() {
          if (window.__cleanupNativeEventMonitor) {
            window.__cleanupNativeEventMonitor();
            console.log('[NativeEventMonitor] Cleanup function executed');
          }
          if (window.__dynamicContentObserver) {
            window.__dynamicContentObserver.disconnect();
            window.__dynamicContentObserver = null;
          }
          
          if (window.__reactRouterObserver) {
            window.__reactRouterObserver.disconnect();
            window.__reactRouterObserver = null;
          }
          
          if (window.__vueRouterObserver) {
            window.__vueRouterObserver.disconnect();
            window.__vueRouterObserver = null;
          }
          
          return true;
        })();
      `, true);
    } catch (error) {
      console.error('[NativeEventMonitor] Error injecting cleanup script:', error);
    }
  }

  private sendEventToRenderer(eventData: any): void {
    if (!eventData) {
      console.warn('[NativeEventMonitor] Attempted to send undefined/null event data');
      return;
    }
    const windows = BrowserWindow.getAllWindows();
    if (windows.length === 0) {
      console.warn('[NativeEventMonitor] No browser windows found to send event to');
      return;
    }
    
    windows.forEach(window => {
      if (!window.isDestroyed() && window.webContents && !window.webContents.isDestroyed()) {
        window.webContents.send('native-event', eventData);
      }
    });
  }
}
export function initializeNativeEventMonitor(): NativeEventMonitor {
  return NativeEventMonitor.getInstance();
}
