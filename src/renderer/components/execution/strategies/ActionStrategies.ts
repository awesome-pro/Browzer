import { ExecuteStep } from '../../../types';

export interface ActionResult {
  success: boolean;
  message?: string;
  error?: string;
  elementInfo?: any;
  [key: string]: any;
}

export interface ActionStrategy {
  execute(step: ExecuteStep, webview: any): Promise<ActionResult>;
}

export abstract class BaseActionStrategy implements ActionStrategy {
  protected readonly DEFAULT_TIMEOUT = 30000;
  protected readonly ACTION_DELAY = 1000;

  abstract execute(step: ExecuteStep, webview: any): Promise<ActionResult>;

  protected async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected isMainAppSelector(selector: string): boolean {
    const mainAppSelectors = [
      '#urlBar', '#backBtn', '#forwardBtn', '#reloadBtn', '#goBtn',
      '#newTabBtn', '#startRecordingBtn', '#stopRecordingBtn',
      '.tab-bar', '.toolbar', '.nav-controls'
    ];
    
    return mainAppSelectors.some(mainSelector => 
      selector === mainSelector || selector.includes(mainSelector)
    );
  }

  protected async executeInWebview(webview: any, script: string): Promise<any> {
    try {
      return await webview.executeJavaScript(script);
    } catch (error) {
      throw new Error(`Script execution failed: ${(error as Error).message}`);
    }
  }
}