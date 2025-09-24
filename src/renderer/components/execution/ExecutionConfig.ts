export interface ExecutionConfig {
    defaultTimeout: number;
    actionDelay: number;
    maxRetries: number;
    retryBackoffMultiplier: number;
    maxRetryDelay: number;
    enableRecovery: boolean;
    enableLogging: boolean;
    mainAppSelectors: string[];
    formSubmitSelectors: string[];
  }
  
  export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
    defaultTimeout: 30000,
    actionDelay: 1000,
    maxRetries: 3,
    retryBackoffMultiplier: 2,
    maxRetryDelay: 5000,
    enableRecovery: true,
    enableLogging: true,
    mainAppSelectors: [
      '#urlBar',
      '#backBtn',
      '#forwardBtn', 
      '#reloadBtn',
      '#goBtn',
      '#newTabBtn',
      '#startRecordingBtn',
      '#stopRecordingBtn',
      '.tab-bar',
      '.toolbar',
      '.nav-controls'
    ],
    formSubmitSelectors: [
      'button[type="submit"]',
      'input[type="submit"]',
      '[role="button"]',
      '.btn',
      'button:contains("Create Short URL")',
      'button:contains("Submit")',
      'button:contains("Create")',
      'form button:last-child'
    ]
  };
  
  export class ExecutionConfigManager {
    private static instance: ExecutionConfigManager;
    private config: ExecutionConfig;
  
    private constructor() {
      this.config = { ...DEFAULT_EXECUTION_CONFIG };
    }
  
    public static getInstance(): ExecutionConfigManager {
      if (!ExecutionConfigManager.instance) {
        ExecutionConfigManager.instance = new ExecutionConfigManager();
      }
      return ExecutionConfigManager.instance;
    }
  
    public getConfig(): ExecutionConfig {
      return { ...this.config };
    }
  
    public updateConfig(updates: Partial<ExecutionConfig>): void {
      this.config = { ...this.config, ...updates };
    }
  
    public resetConfig(): void {
      this.config = { ...DEFAULT_EXECUTION_CONFIG };
    }
  }