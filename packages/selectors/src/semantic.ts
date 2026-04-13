/**
 * Semantic selector API for TypeScript tests.
 *
 * Instead of:
 *   cy.get('[data-testid="submit-btn"]')
 *   page.locator('.MuiButton-root')
 *
 * You write:
 *   select('the submit button')
 *   select('the email input').within('the login form')
 *
 * The engine resolves this at runtime via accessibility tree,
 * visual heuristics, and NLP text matching.
 */

export interface SemanticQuery {
  /** The natural language intent. */
  intent: string;
  /** Optional parent scope. */
  scope?: string;
  /** Override the minimum confidence threshold. */
  minConfidence?: number;

  /** Scope this query within a parent element. */
  within(scope: string): SemanticQuery;

  /** Set a minimum confidence for resolution. */
  confidence(min: number): SemanticQuery;
}

/**
 * Create a semantic selector.
 *
 * ```ts
 * await click(select('the submit button'));
 * await fill(select('the email input'), 'user@example.com');
 * await assertVisible(select('the welcome heading'));
 * ```
 */
export function select(intent: string): SemanticQuery {
  const query: SemanticQuery = {
    intent,
    within(scope: string): SemanticQuery {
      return { ...this, scope };
    },
    confidence(min: number): SemanticQuery {
      return { ...this, minConfidence: min };
    },
  };
  return query;
}

/**
 * Shorthand for scoping selectors within a parent.
 *
 * ```ts
 * const loginForm = within('the login form');
 * await click(loginForm.select('the submit button'));
 * ```
 */
export function within(scope: string) {
  return {
    select(intent: string): SemanticQuery {
      return select(intent).within(scope);
    },
  };
}
