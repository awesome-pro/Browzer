// ========================= CORE TYPES =========================

export interface TabInfo {
  id: string;
  url: string;
  title: string;
  isActive: boolean;
  webviewId: string;
  history: any[];
  currentHistoryIndex: number;
  isProblematicSite: boolean;
}

export interface AppConfig {
  homepageUrl: string;
  sidebarEnabled: boolean;
  sidebarCollapsed: boolean;
  doAgentEnabled: boolean;
}

export interface IpcRenderer {
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  send: (channel: string, ...args: any[]) => void;
  on: (channel: string, callback: (...args: any[]) => void) => void;
  off: (channel: string, callback: (...args: any[]) => void) => void;
  removeAllListeners: (channel: string) => void;
}

// ========================= SERVICE INTERFACES =========================

export interface IBrowserService {
  initializeElements(): void;
  onBackClick(callback: () => void): void;
  onForwardClick(callback: () => void): void;
  onReloadClick(callback: () => void): void;
  onGoClick(callback: () => void): void;
  onUrlEnter(callback: () => void): void;
  onRunAgentClick(callback: () => void): void;
  updateNavigationButtons(): void;
  getUrlBarValue(): string;
  setUrlBarValue(value: string): void;
  focusUrlBar(): void;
  processUrl(url: string): string;
  destroy(): void;
}

export interface ITabManager {
  initializeElements(): void;
  createTab(url?: string): string | null;
  selectTab(tabId: string): void;
  closeTab(tabId: string): void;
  cycleTab(direction: number): void;
  getActiveTabId(): string;
  getActiveWebview(): any;
  getAllTabs(): TabInfo[];
  getTabCount(): number;
  saveTabs(): void;
  loadTabs(): void;
  onNewTab(callback: () => void): void;
  onTabSelect(callback: (tabId: string) => void): void;
  onTabClose(callback: (tabId: string) => void): void;
  destroy(): void;
}

export interface IWebviewManager {
  initializeElements(): void;
  createWebview(tabId: string, url: string): any;
  setupWebviewEvents(webview: any): void;
  isWebviewReady(webview: any): boolean;
  notifyAllWebviews(message: string, data?: any): void;
  configureWebview(webview: any, url: string): Promise<void>;
  destroy(): void;
}

export interface IAgentService {
  setupControls(): void;
  execute(): Promise<void>;
  destroy(): void;
}

export interface IChatService {
  initialize(): void;
  addMessageToChat(role: string, content: string, timing?: number): void;
  processFollowupQuestion(question: string): Promise<void>;
  destroy(): void;
}

export interface IExtensionStore {
  initialize(): void;
  show(): void;
  hide(): void;
  destroy(): void;
}

export interface IRecordingService {
  initialize(): Promise<void>;
  setupWebviewRecording(webview: any): void;
  getRecordingEngine(): any;
  getRecordingControls(): any;
  getRecordingIndicator(): any;
  isRecording(): boolean;
  getActiveSession(): any;
  startRecording(taskGoal: string, description?: string): any;
  stopRecording(): any;
  destroy(): void;
}

// ========================= CHAT TYPES =========================

export interface ChatMessage {
  role: 'user' | 'assistant' | 'context';
  content: string;
  timestamp: string;
  timing?: number;
}

export interface ChatMode {
  type: 'ask' | 'do' | 'execute';
  placeholder: string;
}

// ========================= EXTENSION TYPES =========================

export interface ExtensionResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface ExtensionRequest {
  extensionId: string;
  action: string;
  data: any;
  browserApiKeys: Record<string, string>;
  selectedProvider: string;
}

// ========================= RECORDING TYPES =========================

export interface RecordingSession {
  id: string;
  name: string;
  timestamp: number;
  steps: RecordingStep[];
  isActive: boolean;
}

export interface RecordingStep {
  type: string;
  selector?: string;
  value?: string;
  timestamp: number;
  url: string;
}

// ========================= WEBVIEW TYPES =========================

export interface WebviewEvent {
  type: string;
  url: string;
  timestamp: number;
  data?: any;
}

export interface WebviewPreferences {
  contextIsolation: boolean;
  nodeIntegration: boolean;
  webSecurity: boolean;
  sandbox: boolean;
  javascript: boolean;
  plugins: boolean;
  images: boolean;
  devTools: boolean;
}

// ========================= NAVIGATION TYPES =========================

export interface NavigationState {
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  url: string;
  title: string;
}

// ========================= ERROR TYPES =========================

export interface AppError {
  message: string;
  stack?: string;
  timestamp: number;
  context?: string;
}

// ========================= EVENT TYPES =========================

export interface CustomEventDetail<T = any> {
  detail: T;
}

export interface RecordingEventDetail {
  sessionId?: string;
  action?: string;
  data?: any;
}

export interface ToastEventDetail {
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

// ========================= UTILITY TYPES =========================

export type EventCallback<T = any> = (data: T) => void;

export type DestroyFunction = () => void;

export interface Destroyable {
  destroy(): void;
}

export interface WebpageContext {
  id: string;
  title: string;
  url: string;
  timestamp: number;
  content?: {
    title: string;
    description: string;
    content: string;
    html: string;
    url: string;
  };
}

/**
 * Interface for Execute Task steps
 */
export interface ExecuteStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  reasoning?: string;
  action?: string;
  target?: string;
  value?: string;
}

/**
 * Interface for Execute Task
 */
export interface ExecuteTask {
  id: string;
  instruction: string;
  recordingSessionId: string;
  steps: ExecuteStep[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

/**
 * Interface for Execute Result
 */
export interface ExecuteResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTime: number;
}
