
export class LLMService {
  public async callLLM(systemPrompt: string, userPrompt: string, apiKey: string): Promise<string> {
    try {
      const response = await window.electronAPI.ipcInvoke('call-llm', {
        provider: 'anthropic',
        apiKey: apiKey,
        systemPrompt: systemPrompt,
        prompt: userPrompt,
        maxTokens: 3000, // Increased for more complex responses
        temperature: 0.1, // Lower temperature for more consistent JSON output
      });

      if (!response.success) {
        console.error('[LLMService] LLM API error:', response.error);
        throw new Error(response.error || 'LLM API call failed');
      }

      console.log('[LLMService] LLM response received, length:', response.response.length);
      console.log('[LLMService] Raw LLM response:', response.response);

      return response.response;
    } catch (error) {
      console.error('[LLMService] LLM API call failed:', error);
      throw new Error(`AI model call failed: ${(error as Error).message}`);
    }
  }
}
