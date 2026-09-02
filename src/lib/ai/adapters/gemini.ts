import { AIGatewayAdapter, AIResult, ModelCapabilities, ProviderConfig, ProviderHealth, StructuredAIRequest } from '../gateway';

export class GoogleGeminiAdapter implements AIGatewayAdapter {
  private readonly defaultBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';

  async generateStructured<T>(request: StructuredAIRequest<T>): Promise<AIResult<T>> {
    const baseUrl = this.defaultBaseUrl; // For testing we rely on Google's default endpoint
    const url = `${baseUrl}/${request.modelId}:generateContent?key=${request.secretKey}`;

    const body: any = {
      contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: request.schema,
      }
    };

    if (request.systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: request.systemInstruction }]
      };
    }

    if (request.temperature !== undefined) body.generationConfig.temperature = request.temperature;
    if (request.maxOutputTokens !== undefined) body.generationConfig.maxOutputTokens = request.maxOutputTokens;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), request.timeoutMs || 15000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(`Gemini API Error: ${response.status} - ${JSON.stringify(errData)}`);
      }

      const data = await response.json();
      
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) {
        throw new Error('Gemini API returned empty or malformed response');
      }

      let parsedData: T;
      try {
        parsedData = JSON.parse(textResponse) as T;
      } catch (e) {
        throw new Error('Failed to parse Gemini response as JSON');
      }

      const usageMetadata = data.usageMetadata || {};
      
      return {
        data: parsedData,
        usage: {
          inputTokens: usageMetadata.promptTokenCount || 0,
          outputTokens: usageMetadata.candidatesTokenCount || 0,
          totalTokens: usageMetadata.totalTokenCount || 0,
        },
        rawResponse: data
      };
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Provider timeout after ${request.timeoutMs}ms`);
      }
      throw error;
    }
  }

  async healthCheck(config: ProviderConfig): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      // Use a lightweight call like getting the models list to check if key is valid
      const url = `${this.defaultBaseUrl}?key=${config.secretKey}&pageSize=1`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs || 5000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      const latencyMs = Date.now() - start;

      if (response.ok) {
        return { isHealthy: true, statusMessage: 'OK', latencyMs };
      } else {
        const errData = await response.json().catch(() => ({}));
        return { isHealthy: false, statusMessage: `HTTP ${response.status}: ${JSON.stringify(errData)}`, latencyMs };
      }
    } catch (error: any) {
      return { 
        isHealthy: false, 
        statusMessage: error.name === 'AbortError' ? 'Timeout' : (error.message || 'Unknown error'), 
        latencyMs: Date.now() - start 
      };
    }
  }

  async validateModel(config: ProviderConfig, modelId: string): Promise<ModelCapabilities> {
    try {
      const url = `${this.defaultBaseUrl}/${modelId}?key=${config.secretKey}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        return {
          isValid: false,
          supportsStructuredOutput: false,
          error: `Model ${modelId} not found or access denied (HTTP ${response.status})`
        };
      }

      const data = await response.json();
      
      // Gemini 1.5 Pro and Flash support structured JSON output
      const supportsJson = modelId.includes('gemini-1.5') || modelId.includes('gemini-2.0');

      return {
        isValid: true,
        supportsStructuredOutput: supportsJson,
        maxInputTokens: data.inputTokenLimit || undefined,
        maxOutputTokens: data.outputTokenLimit || undefined,
      };
    } catch (error: any) {
      return {
        isValid: false,
        supportsStructuredOutput: false,
        error: error.message || 'Failed to validate model'
      };
    }
  }
}
