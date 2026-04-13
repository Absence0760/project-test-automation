import type {
  AiProvider,
  FlakinessContext,
  GeneratedTest,
  SelectorFixContext,
  StepSuggestion,
  StepSuggestionContext,
  TestGenerationRequest,
} from './types.js';

/**
 * Cloud AI provider for higher-quality inference.
 *
 * Uses a cloud API (configurable) for teams that prefer
 * accuracy over privacy. API key required.
 */
export class CloudAiProvider implements AiProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(options: { apiKey: string; baseUrl?: string }) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'https://api.anthropic.com';
  }

  async suggestSteps(_context: StepSuggestionContext): Promise<StepSuggestion[]> {
    // TODO: Implement cloud-based step suggestion
    throw new Error('Cloud AI provider not yet implemented');
  }

  async generateTest(_request: TestGenerationRequest): Promise<GeneratedTest> {
    // TODO: Implement cloud-based test generation
    throw new Error('Cloud AI provider not yet implemented');
  }

  async explainFlakiness(_history: FlakinessContext): Promise<string> {
    // TODO: Implement cloud-based flakiness analysis
    throw new Error('Cloud AI provider not yet implemented');
  }

  async suggestSelectorFix(_context: SelectorFixContext): Promise<string> {
    // TODO: Implement cloud-based selector fix suggestion
    throw new Error('Cloud AI provider not yet implemented');
  }
}
