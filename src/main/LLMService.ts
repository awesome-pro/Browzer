import * as https from 'https';
import { GoogleGenAI } from '@google/genai';

export interface LLMRequest {
  provider: 'anthropic' | 'openai' | 'gemini';
  apiKey: string;
  prompt: string;
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number; // Added for better control
  safetySettings?: GeminiSafetySettings[]; // Gemini-specific
  thinkingBudget?: number; // Gemini 2.5 thinking feature
}

export interface GeminiSafetySettings {
  category: 'HARM_CATEGORY_HARASSMENT' | 'HARM_CATEGORY_HATE_SPEECH' | 'HARM_CATEGORY_SEXUALLY_EXPLICIT' | 'HARM_CATEGORY_DANGEROUS_CONTENT';
  threshold: 'BLOCK_NONE' | 'BLOCK_ONLY_HIGH' | 'BLOCK_MEDIUM_AND_ABOVE' | 'BLOCK_LOW_AND_ABOVE';
}

export interface LLMResponse {
  success: boolean;
  response?: string;
  error?: string;
  finishReason?: string; // Added for better response handling
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export class LLMService {
  constructor() {}

  async callLLM(request: LLMRequest): Promise<LLMResponse> {
    try {
      console.log('[LLMService] Making API call to:', request.provider);
      
      if (request.provider === 'anthropic') {
        return await this.callGeminiAPI(request);
      } else if (request.provider === 'openai') {
        return await this.callOpenAIAPI(request);
      } else if (request.provider === 'gemini') {
        return await this.callGeminiAPI(request);
      } else {
        return {
          success: false,
          error: `Unsupported provider: ${request.provider}`
        };
      }
    } catch (error) {
      console.error('[LLMService] Error calling LLM:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  private async makeHttpsRequest(hostname: string, path: string, headers: Record<string, string>, body: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname,
        path,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(body)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(data));
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(body);
      req.end();
    });
  }

  private async callAnthropicAPI(request: LLMRequest): Promise<LLMResponse> {
    try {
      const requestBody: any = {
        model: request.model || 'claude-sonnet-4-20250514',
        max_tokens: request.maxTokens || 1000,
        messages: [
          {
            role: 'user',
            content: request.prompt
          }
        ]
      };

      if (request.systemPrompt) {
        requestBody.system = request.systemPrompt;
      }

      if (request.temperature !== undefined) {
        requestBody.temperature = request.temperature;
      }

      const headers = {
        'Content-Type': 'application/json',
        'x-api-key': request.apiKey,
        'anthropic-version': '2023-06-01'
      };

      const data = await this.makeHttpsRequest(
        'api.anthropic.com',
        '/v1/messages',
        headers,
        JSON.stringify(requestBody)
      );
      
      if (!data.content || !data.content[0] || !data.content[0].text) {
        return {
          success: false,
          error: 'Invalid response format from Anthropic API'
        };
      }

      return {
        success: true,
        response: data.content[0].text
      };
    } catch (error) {
      console.error('[LLMService] Anthropic API call failed:', error);
      return {
        success: false,
        error: `Anthropic API call failed: ${(error as Error).message}`
      };
    }
  }

  private async callOpenAIAPI(request: LLMRequest): Promise<LLMResponse> {
    try {
      const messages: any[] = [];
      
      if (request.systemPrompt) {
        messages.push({
          role: 'system',
          content: request.systemPrompt
        });
      }

      messages.push({
        role: 'user',
        content: request.prompt
      });

      const requestBody: any = {
        model: request.model || 'gpt-4o',
        max_tokens: request.maxTokens || 1000,
        messages: messages
      };

      if (request.temperature !== undefined) {
        requestBody.temperature = request.temperature;
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${request.apiKey}`
      };

      const data = await this.makeHttpsRequest(
        'api.openai.com',
        '/v1/chat/completions',
        headers,
        JSON.stringify(requestBody)
      );
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
        return {
          success: false,
          error: 'Invalid response format from OpenAI API'
        };
      }

      return {
        success: true,
        response: data.choices[0].message.content,
        finishReason: data.choices[0].finish_reason
      };
    } catch (error) {
      console.error('[LLMService] OpenAI API call failed:', error);
      return {
        success: false,
        error: `OpenAI API call failed: ${(error as Error).message}`
      };
    }
  }

  private async callGeminiAPI(request: LLMRequest): Promise<LLMResponse> {
    try {
      // Initialize Google GenAI with API key
      const genAI = new GoogleGenAI({ apiKey: request.apiKey });

      // Prepare the content string
      let contentString = request.prompt;
      
      // If system prompt is provided, prepend it to the user prompt
      // Note: For proper system instruction support, you might want to use the chat approach
      if (request.systemPrompt) {
        contentString = `${request.systemPrompt}\n\nUser: ${request.prompt}`;
      }

      // Prepare config object
      const config: any = {};

      // Add generation config
      if (request.maxTokens || request.temperature !== undefined) {
        config.generationConfig = {};
        if (request.maxTokens) config.generationConfig.maxOutputTokens = request.maxTokens;
        if (request.temperature !== undefined) config.generationConfig.temperature = request.temperature;
      }

      // Add safety settings
      if (request.safetySettings) {
        config.safetySettings = request.safetySettings;
      }

      config.thinkingConfig = {
        thinkingBudget: 0
      };

      // Determine model (default to gemini-2.5-flash if not specified)
      const model = request.model || 'gemini-2.5-flash';

      // Make the API call using the new @google/genai package
      const response = await genAI.models.generateContent({
        model: model,
        contents: contentString,
        config: config
      });

      // Extract response text
      const responseText = response.text;

      if (!responseText) {
        return {
          success: false,
          error: 'Empty response from Gemini API'
        };
      }

      const result: LLMResponse = {
        success: true,
        response: responseText
      };

      // Add usage metadata if available
      if (response.usageMetadata) {
        result.usageMetadata = {
          promptTokenCount: response.usageMetadata.promptTokenCount,
          candidatesTokenCount: response.usageMetadata.candidatesTokenCount,
          totalTokenCount: response.usageMetadata.totalTokenCount
        };
      }

      return result;

    } catch (error) {
      console.error('[LLMService] Gemini API call failed:', error);
      
      // Handle specific error types
      let errorMessage = `Gemini API call failed: ${(error as Error).message}`;
      
      // Check for safety-related errors
      if (error instanceof Error && error.message.includes('SAFETY')) {
        errorMessage = 'Content blocked due to safety filters';
        return {
          success: false,
          error: errorMessage,
          finishReason: 'SAFETY'
        };
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }
}