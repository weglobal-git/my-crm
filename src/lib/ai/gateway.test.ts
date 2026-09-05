import { test, describe } from 'node:test';
import assert from 'node:assert';
import { aiGateway, AIGatewayAdapter, AIResult, ProviderHealth, ModelCapabilities, StructuredAIRequest, ProviderConfig } from './gateway';

// Mock Adapter
class MockAdapter implements AIGatewayAdapter {
  async generateStructured<T>(request: StructuredAIRequest): Promise<AIResult<T>> {
    void request;
    return {
      data: { success: true } as unknown as T,
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    };
  }

  async healthCheck(config: ProviderConfig): Promise<ProviderHealth> {
    if (config.secretKey === 'bad') {
      return { isHealthy: false, statusMessage: 'Unauthorized', latencyMs: 50 };
    }
    return { isHealthy: true, statusMessage: 'OK', latencyMs: 10 };
  }

  async validateModel(config: ProviderConfig, modelId: string): Promise<ModelCapabilities> {
    if (modelId === 'unsupported') {
      return { isValid: false, supportsStructuredOutput: false, error: 'Model not found' };
    }
    return { isValid: true, supportsStructuredOutput: true, maxInputTokens: 1000, maxOutputTokens: 1000 };
  }
}

describe('AIGateway', () => {
  test('registers and retrieves adapters', () => {
    aiGateway.registerAdapter('MOCK', new MockAdapter());
    
    const adapter = aiGateway.getAdapter('MOCK');
    assert.ok(adapter);
    
    assert.throws(() => aiGateway.getAdapter('NOT_FOUND'), /No AI adapter registered for provider: NOT_FOUND/);
  });

  test('MockAdapter methods work through interface', async () => {
    const adapter = aiGateway.getAdapter('MOCK');
    
    const health = await adapter.healthCheck({ secretKey: 'good' });
    assert.strictEqual(health.isHealthy, true);
    
    const badHealth = await adapter.healthCheck({ secretKey: 'bad' });
    assert.strictEqual(badHealth.isHealthy, false);
    
    const modelCaps = await adapter.validateModel({ secretKey: 'good' }, 'mock-model-1');
    assert.strictEqual(modelCaps.isValid, true);
    
    const result = await adapter.generateStructured({
      providerKey: 'MOCK',
      modelId: 'mock-model-1',
      secretKey: 'good',
      prompt: 'Hello',
      schema: { type: 'object' }
    });
    
    assert.strictEqual((result.data as { success: boolean }).success, true);
    assert.strictEqual(result.usage.totalTokens, 15);
  });
});
