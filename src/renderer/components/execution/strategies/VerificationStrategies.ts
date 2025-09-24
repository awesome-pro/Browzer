import { ExecuteStep } from '../../../types';
import { ActionResult, BaseActionStrategy } from './ActionStrategies';
import { WaitForElementStrategy } from './WaitStrategies';

export class VerifyElementStrategy extends BaseActionStrategy {
  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
    // Reuse the wait for element strategy for verification
    const waitStrategy = new WaitForElementStrategy();
    const result = await waitStrategy.execute(step, webview);
    
    return {
      ...result,
      verified: result.success,
      message: result.success ? 'Element verification passed' : 'Element verification failed'
    };
  }
}

export class VerifyTextStrategy extends BaseActionStrategy {
  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
    const text = step.value as string;
    
    if (!text) {
      throw new Error('Text value is required for verify_text action');
    }

    const script = `
      (function() {
        try {
          const pageText = document.body.innerText.toLowerCase();
          const searchText = '${text.replace(/'/g, "\\'").toLowerCase()}';
          const found = pageText.includes(searchText);
          
          return {
            success: found,
            verified: found,
            message: found ? 'Text found on page' : 'Text not found on page',
            searchText: '${text.replace(/'/g, "\\'")}',
            pageTextLength: pageText.length
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `;

    return await this.executeInWebview(webview, script);
  }
}

export class VerifyUrlStrategy extends BaseActionStrategy {
  async execute(step: ExecuteStep, webview: any): Promise<ActionResult> {
    const expectedUrl = step.value as string;
    
    if (!expectedUrl) {
      throw new Error('URL value is required for verify_url action');
    }

    try {
      const currentUrl = webview.getURL();
      const matches = currentUrl.includes(expectedUrl) || expectedUrl.includes(currentUrl);
      
      return {
        success: matches,
        verified: matches,
        message: matches ? 'URL verification passed' : 'URL verification failed',
        expectedUrl,
        currentUrl
      };
    } catch (error) {
      return {
        success: false,
        verified: false,
        message: 'URL verification failed',
        error: (error as Error).message,
        expectedUrl
      };
    }
  }
}
