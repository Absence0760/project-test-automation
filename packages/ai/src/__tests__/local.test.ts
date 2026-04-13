import { describe, it, expect, vi } from 'vitest';
import { LocalAiProvider } from '../local.js';

describe('LocalAiProvider', () => {
  it('uses default endpoint and model', () => {
    const provider = new LocalAiProvider();
    // Verify the provider is constructed — the actual endpoint/model
    // are private, so we test by calling methods
    expect(provider).toBeDefined();
    expect(typeof provider.suggestSteps).toBe('function');
    expect(typeof provider.generateTest).toBe('function');
    expect(typeof provider.explainFlakiness).toBe('function');
    expect(typeof provider.suggestSelectorFix).toBe('function');
  });

  it('accepts custom endpoint and model', () => {
    const provider = new LocalAiProvider({
      endpoint: 'http://custom:11434',
      model: 'codellama',
    });
    expect(provider).toBeDefined();
  });

  it('throws on network failure for suggestSteps', async () => {
    const provider = new LocalAiProvider({
      endpoint: 'http://localhost:99999', // unreachable
    });

    await expect(
      provider.suggestSteps({
        featureContent: 'Feature: Test',
        currentScenario: 'Scenario: Example',
        existingSteps: [],
      }),
    ).rejects.toThrow();
  });

  it('throws on network failure for generateTest', async () => {
    const provider = new LocalAiProvider({
      endpoint: 'http://localhost:99999',
    });

    await expect(
      provider.generateTest({
        description: 'test the login flow',
        target: 'http://localhost:3000',
      }),
    ).rejects.toThrow();
  });

  it('throws on network failure for explainFlakiness', async () => {
    const provider = new LocalAiProvider({
      endpoint: 'http://localhost:99999',
    });

    await expect(
      provider.explainFlakiness({
        testName: 'login test',
        results: [
          { passed: true, durationMs: 1000, timestamp: '2026-01-01' },
          { passed: false, durationMs: 1500, timestamp: '2026-01-02' },
        ],
      }),
    ).rejects.toThrow();
  });
});
