import { describe, it, expect } from 'vitest';
import { BrowserContext } from '../browser.js';

/**
 * Tests for the pure logic in BrowserContext that doesn't require a real browser.
 * The extractKeywords method is private, so we test it indirectly through
 * the public interface by checking error messages that include extracted keywords.
 *
 * Full integration tests (with a real browser) run via:
 *   pnpm exec tsx packages/runner/src/cli.ts --testDir examples --base-url http://localhost:3000
 */

// We can test the keyword extraction logic by creating a BrowserContext with a mock page
// and checking what happens when resolution fails — the error message includes the keywords.

describe('BrowserContext', () => {
  // Create a mock page that always returns empty arrays for queries
  function mockPage() {
    return {
      goto: async () => null,
      $$: async () => [],
      $: async () => null,
      waitForNavigation: async () => null,
      setViewport: async () => {},
      screenshot: async () => Buffer.from(''),
      bringToFront: async () => {},
      frames: () => [],
      mainFrame: () => ({}),
      accessibility: { snapshot: async () => null },
    } as any;
  }

  it('constructs with a page and base URL', () => {
    const ctx = new BrowserContext(mockPage(), 'http://localhost:3000');
    expect(ctx).toBeDefined();
  });

  it('resolves absolute URLs in navigate', async () => {
    let navigatedUrl = '';
    const page = {
      ...mockPage(),
      goto: async (url: string) => {
        navigatedUrl = url;
        return null;
      },
    };
    const ctx = new BrowserContext(page as any, 'http://localhost:3000');
    await ctx.navigate('http://example.com/page');
    expect(navigatedUrl).toBe('http://example.com/page');
  });

  it('prepends baseUrl to relative paths in navigate', async () => {
    let navigatedUrl = '';
    const page = {
      ...mockPage(),
      goto: async (url: string) => {
        navigatedUrl = url;
        return null;
      },
    };
    const ctx = new BrowserContext(page as any, 'http://localhost:3000');
    await ctx.navigate('/login');
    expect(navigatedUrl).toBe('http://localhost:3000/login');
  });

  it('throws when selector cannot be resolved', async () => {
    const ctx = new BrowserContext(mockPage() as any, '', false);
    await expect(ctx.click('the nonexistent element')).rejects.toThrow(
      'Could not resolve semantic selector',
    );
  });

  it('error message includes extracted keywords', async () => {
    const ctx = new BrowserContext(mockPage() as any, '', false);
    await expect(ctx.click('the submit button')).rejects.toThrow('submit');
  });

  it('error message includes the original intent', async () => {
    const ctx = new BrowserContext(mockPage() as any, '', false);
    await expect(ctx.assertVisible('the welcome heading')).rejects.toThrow('the welcome heading');
  });

  it('set/get works for cross-step state', () => {
    const ctx = new BrowserContext(mockPage() as any);
    ctx.set('userId', 42);
    expect(ctx.get('userId')).toBe(42);
  });

  it('reset clears state and log', async () => {
    const ctx = new BrowserContext(mockPage() as any, 'http://localhost:3000');
    await ctx.navigate('/page');
    ctx.set('key', 'value');

    ctx.reset();

    expect(ctx.getLog()).toEqual([]);
    expect(ctx.get('key')).toBeUndefined();
  });

  it('logs actions in verbose mode', async () => {
    let navigatedUrl = '';
    const page = {
      ...mockPage(),
      goto: async (url: string) => {
        navigatedUrl = url;
        return null;
      },
    };
    const ctx = new BrowserContext(page as any, 'http://localhost:3000', true);
    await ctx.navigate('/login');

    expect(ctx.getLog()).toHaveLength(1);
    expect(ctx.getLog()[0]).toContain('[navigate]');
    expect(ctx.getLog()[0]).toContain('http://localhost:3000/login');
  });

  it('finds element by ARIA label', async () => {
    let clicked = false;
    const mockElement = {
      evaluate: async (fn: Function) =>
        fn({ getAttribute: (a: string) => (a === 'aria-label' ? 'email address' : null) }),
      click: async () => {
        clicked = true;
      },
    };
    const page = {
      ...mockPage(),
      $$: async (sel: string) => (sel === '[aria-label]' ? [mockElement] : []),
      waitForNavigation: async () => null,
    };

    const ctx = new BrowserContext(page as any, '');
    await ctx.click('the email input');
    expect(clicked).toBe(true);
  });

  it('finds button by text content', async () => {
    let clicked = false;
    const mockButton = {
      evaluate: async (fn: Function) => fn({ textContent: 'Sign in', getAttribute: () => null }),
      click: async () => {
        clicked = true;
      },
    };
    const page = {
      ...mockPage(),
      $$: async (sel: string) => {
        if (sel === 'button') return [mockButton];
        return [];
      },
      waitForNavigation: async () => null,
    };

    const ctx = new BrowserContext(page as any, '');
    await ctx.click('the sign button');
    expect(clicked).toBe(true);
  });
});
