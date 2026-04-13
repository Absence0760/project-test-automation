/**
 * Step definition registry and decorators for BDD tests.
 *
 * Usage:
 * ```ts
 * import { Given, When, Then } from '@bettertest/bdd';
 *
 * Given('the user is on the login page', async (ctx) => {
 *   await ctx.navigate('/login');
 * });
 *
 * When('they enter valid credentials', async (ctx) => {
 *   await ctx.fill('the email input', 'user@example.com');
 *   await ctx.fill('the password input', 'secret');
 *   await ctx.click('the submit button');
 * });
 *
 * Then('they should see the dashboard', async (ctx) => {
 *   await ctx.assertVisible('the dashboard heading');
 * });
 * ```
 */

export interface StepContext {
  /** Navigate to a URL. */
  navigate(url: string): Promise<void>;
  /** Click an element using a semantic selector. */
  click(selector: string): Promise<void>;
  /** Fill an input using a semantic selector. */
  fill(selector: string, value: string): Promise<void>;
  /** Assert an element is visible. */
  assertVisible(selector: string): Promise<void>;
  /** Assert an element contains text. */
  assertText(selector: string, expected: string): Promise<void>;
  /** Store a value for later steps. */
  set(key: string, value: unknown): void;
  /** Retrieve a stored value. */
  get<T = unknown>(key: string): T;
}

export type StepHandler = (
  ctx: StepContext,
  ...args: string[]
) => Promise<void>;

export interface StepDefinition {
  keyword: 'Given' | 'When' | 'Then' | 'And' | 'But';
  pattern: string | RegExp;
  handler: StepHandler;
}

/**
 * Global step definition registry.
 */
export class StepRegistry {
  private steps: StepDefinition[] = [];

  register(definition: StepDefinition): void {
    this.steps.push(definition);
  }

  /**
   * Find a step definition matching the given text.
   */
  find(text: string): { definition: StepDefinition; args: string[] } | null {
    for (const def of this.steps) {
      if (typeof def.pattern === 'string') {
        // Exact match or parameterized match
        const paramPattern = def.pattern.replace(
          /\{(\w+)}/g,
          '(?<$1>[^\\s]+)',
        );
        const regex = new RegExp(`^${paramPattern}$`);
        const match = text.match(regex);
        if (match) {
          const args = Object.values(match.groups ?? {});
          return { definition: def, args };
        }
      } else {
        const match = text.match(def.pattern);
        if (match) {
          return { definition: def, args: match.slice(1) };
        }
      }
    }
    return null;
  }

  clear(): void {
    this.steps = [];
  }

  get count(): number {
    return this.steps.length;
  }
}

// Global registry instance
const globalRegistry = new StepRegistry();

/** Register a Given step definition. */
export function Given(pattern: string | RegExp, handler: StepHandler): void {
  globalRegistry.register({ keyword: 'Given', pattern, handler });
}

/** Register a When step definition. */
export function When(pattern: string | RegExp, handler: StepHandler): void {
  globalRegistry.register({ keyword: 'When', pattern, handler });
}

/** Register a Then step definition. */
export function Then(pattern: string | RegExp, handler: StepHandler): void {
  globalRegistry.register({ keyword: 'Then', pattern, handler });
}

/** Register an And step definition. */
export function And(pattern: string | RegExp, handler: StepHandler): void {
  globalRegistry.register({ keyword: 'And', pattern, handler });
}

/** Register a But step definition. */
export function But(pattern: string | RegExp, handler: StepHandler): void {
  globalRegistry.register({ keyword: 'But', pattern, handler });
}

/** Get the global step registry. */
export function getGlobalRegistry(): StepRegistry {
  return globalRegistry;
}
