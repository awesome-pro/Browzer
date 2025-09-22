export interface DoStep {
    id: string;
    action: 'navigate' | 'click' | 'type' | 'wait' | 'extract' | 'scroll' | 'analyze' | 
            'select' | 'hover' | 'focus' | 'blur' | 'keypress' | 'clear' | 
            'wait_for_element' | 'wait_for_text' | 'screenshot' | 'evaluate' |
            'select_dropdown' | 'check' | 'uncheck' | 'double_click' | 'right_click' |
            'wait_for_dynamic_content';
    target?: string;
    value?: string;
    selector?: string;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: any;
    error?: string;
    reasoning?: string;
    options?: {
      timeout?: number;
      waitAfter?: boolean;
      multiple?: boolean;
      index?: number;
      key?: string;
      button?: 'left' | 'right' | 'middle';
      clickCount?: number;
      delay?: number;
      position?: { x: number; y: number };
    };
  }
  
  export interface DoResult {
    success: boolean;
    data?: any;
    error?: string;
    executionTime: number;
  }
  
  export interface PlaywrightPage {
    goto: (url: string) => Promise<void>;
    click: (selector: string, options?: any) => Promise<void>;
    fill: (selector: string, value: string) => Promise<void>;
    type: (selector: string, text: string, options?: any) => Promise<void>;
    waitForSelector: (selector: string, options?: any) => Promise<any>;
    waitForTimeout: (timeout: number) => Promise<void>;
    evaluate: (script: string | Function, ...args: any[]) => Promise<any>;
    locator: (selector: string) => any;
    selectOption: (selector: string, values: string | string[]) => Promise<void>;
    screenshot: (options?: any) => Promise<Buffer>;
    content: () => Promise<string>;
    telegramSendMessage: (messageText: string) => Promise<any>;
    telegramSearch: (searchQuery: string, preferPrivateChat?: boolean) => Promise<any>;
    getDebugInfo: () => Promise<any>;
    title: () => Promise<string>;
    url: () => string;
    keyboard: {
      press: (key: string) => Promise<void>;
      type: (text: string) => Promise<void>;
    };
    mouse: {
      click: (x: number, y: number, options?: any) => Promise<void>;
    };
  }
  
  export interface PageState {
    url: string;
    title: string;
    dom: string;
    screenshot?: string;
    interactiveElements: ElementInfo[];
    rawHTML?: string;
    visibleText?: string;
    detectedPatterns?: {
      prices: string[];
      times: string[];
      hasContent: boolean;
      contentLength: number;
    };
  }
  
  export interface ElementInfo {
    tag: string;
    text: string;
    selector: string;
    type?: string;
    placeholder?: string;
    value?: string;
    href?: string;
    visible: boolean;
    clickable: boolean;
    id?: string;
    className?: string;
    name?: string;
    ariaLabel?: string;
    ariaRole?: string;
    dataTestId?: string;
    checked?: boolean;
    selected?: boolean;
    disabled?: boolean;
    readonly?: boolean;
    options?: string[]; // For select elements
    parentText?: string; // Text of parent element for context
    siblingText?: string; // Text of nearby siblings
    position?: { x: number; y: number; width: number; height: number };
    isInViewport?: boolean;
    tabIndex?: number;
    contentEditable?: boolean;
    hasDropdown?: boolean;
    isDateInput?: boolean;
    isSearchInput?: boolean;
  }

  export interface DoTask {
    id: string;
    instruction: string;
    steps: DoStep[];
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: any;
    error?: string;
  }