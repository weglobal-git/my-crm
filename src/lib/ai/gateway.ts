export interface StructuredAIRequest<T = any> {
  providerKey: string;
  modelId: string;
  secretKey: string;
  systemInstruction?: string;
  prompt: string;
  schema: object; // JSON Schema for output
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AIResult<T = any> {
  data: T;
  usage: AIUsage;
  providerRequestId?: string;
  rawResponse?: any;
}

export interface ProviderConfig {
  secretKey: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface ProviderHealth {
  isHealthy: boolean;
  statusMessage: string;
  latencyMs: number;
}

export interface ModelCapabilities {
  isValid: boolean;
  supportsStructuredOutput: boolean;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  error?: string;
}

export interface AIGatewayAdapter {
  generateStructured<T>(request: StructuredAIRequest<T>): Promise<AIResult<T>>;
  healthCheck(config: ProviderConfig): Promise<ProviderHealth>;
  validateModel(config: ProviderConfig, modelId: string): Promise<ModelCapabilities>;
}

export class AIGateway {
  private adapters: Map<string, AIGatewayAdapter> = new Map();

  registerAdapter(providerKey: string, adapter: AIGatewayAdapter) {
    this.adapters.set(providerKey, adapter);
  }

  getAdapter(providerKey: string): AIGatewayAdapter {
    const adapter = this.adapters.get(providerKey);
    if (!adapter) {
      throw new Error(`No AI adapter registered for provider: ${providerKey}`);
    }
    return adapter;
  }
}

import { GoogleGeminiAdapter } from "./adapters/gemini";

export const aiGateway = new AIGateway();

// Register adapters
aiGateway.registerAdapter("GOOGLE_GEMINI", new GoogleGeminiAdapter());
