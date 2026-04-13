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
 * Local AI provider using Ollama.
 *
 * Keeps all data on-machine — no code leaves your environment.
 * Requires Ollama running locally with a model pulled.
 */
export class LocalAiProvider implements AiProvider {
  private endpoint: string;
  private model: string;

  constructor(options: { endpoint?: string; model?: string } = {}) {
    this.endpoint = options.endpoint ?? 'http://localhost:11434';
    this.model = options.model ?? 'llama3';
  }

  async suggestSteps(context: StepSuggestionContext): Promise<StepSuggestion[]> {
    const prompt = this.buildStepSuggestionPrompt(context);
    const response = await this.complete(prompt);
    return this.parseStepSuggestions(response);
  }

  async generateTest(request: TestGenerationRequest): Promise<GeneratedTest> {
    const prompt = this.buildTestGenerationPrompt(request);
    const response = await this.complete(prompt);
    return {
      code: response,
      confidence: 0.7,
      notes: ['Generated via local LLM — review before committing'],
    };
  }

  async explainFlakiness(history: FlakinessContext): Promise<string> {
    const prompt = this.buildFlakinessPrompt(history);
    return this.complete(prompt);
  }

  async suggestSelectorFix(context: SelectorFixContext): Promise<string> {
    const prompt = this.buildSelectorFixPrompt(context);
    return this.complete(prompt);
  }

  private async complete(prompt: string): Promise<string> {
    const response = await fetch(`${this.endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as { response: string };
    return data.response;
  }

  private buildStepSuggestionPrompt(context: StepSuggestionContext): string {
    return [
      'You are a test automation assistant. Suggest the next BDD steps for this scenario.',
      '',
      'Feature content so far:',
      context.featureContent,
      '',
      'Current scenario:',
      context.currentScenario,
      '',
      context.domSnapshot ? `Current page DOM:\n${context.domSnapshot}\n` : '',
      'Existing step patterns:',
      context.existingSteps.join('\n'),
      '',
      'Suggest 1-3 next steps. Format each as: Given/When/Then <step text>',
    ].join('\n');
  }

  private buildTestGenerationPrompt(request: TestGenerationRequest): string {
    return [
      'Generate a test for the following workflow:',
      request.description,
      '',
      `Target: ${request.target}`,
      request.domSnapshot ? `\nDOM:\n${request.domSnapshot}` : '',
      '',
      'Output a Gherkin feature file with scenarios.',
    ].join('\n');
  }

  private buildFlakinessPrompt(history: FlakinessContext): string {
    const passRate =
      history.results.filter((r) => r.passed).length / history.results.length;
    return [
      `Analyze flakiness for test: ${history.testName}`,
      `Pass rate: ${(passRate * 100).toFixed(1)}%`,
      `Results: ${JSON.stringify(history.results.slice(-10))}`,
      '',
      'Classify the flakiness type (race condition, animation timing, network timing, data dependency, environment) and explain why.',
    ].join('\n');
  }

  private buildSelectorFixPrompt(context: SelectorFixContext): string {
    return [
      `A semantic selector broke. Intent: "${context.intent}"`,
      `Broken selector: ${context.brokenSelector}`,
      '',
      'DOM diff:',
      `Before: ${context.domBefore.slice(0, 2000)}`,
      `After: ${context.domAfter.slice(0, 2000)}`,
      '',
      'Suggest the corrected CSS or ARIA selector.',
    ].join('\n');
  }

  private parseStepSuggestions(response: string): StepSuggestion[] {
    return response
      .split('\n')
      .filter((line) => /^(Given|When|Then|And|But)\s/.test(line.trim()))
      .map((line) => ({
        text: line.trim(),
        confidence: 0.7,
        reasoning: 'Suggested by local LLM',
      }));
  }
}
