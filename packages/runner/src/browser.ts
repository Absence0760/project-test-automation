import type { Page, ElementHandle } from 'puppeteer-core';
import type { StepContext } from '@bettertest/bdd';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

/**
 * Real browser implementation of StepContext using puppeteer.
 *
 * Resolves semantic selectors ("the submit button") against the live DOM
 * using ARIA labels, label text, button text, placeholders, and roles.
 */
export class BrowserContext implements StepContext {
  private page: Page;
  private store = new Map<string, unknown>();
  private actionLog: string[] = [];
  private baseUrl: string;
  private verbose: boolean;
  private screenshotDir: string;
  private stepIndex = 0;

  constructor(page: Page, baseUrl?: string, verbose = false) {
    this.page = page;
    this.baseUrl = baseUrl ?? '';
    this.verbose = verbose;
    this.screenshotDir = join(process.cwd(), 'test-results', 'screenshots');
  }

  async navigate(url: string): Promise<void> {
    const resolved = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
    this.log('navigate', resolved);
    await this.page.goto(resolved, { waitUntil: 'networkidle0', timeout: 10_000 });
  }

  async click(selector: string): Promise<void> {
    this.log('click', selector);
    const el = await this.resolveSelector(selector);

    // Start listening for navigation BEFORE clicking
    const navPromise = this.page.waitForNavigation({ waitUntil: 'load', timeout: 1_000 })
      .catch(() => null);

    await el.click();

    // Wait for navigation if it happened, or settle quickly
    await navPromise;
    // Brief pause for JS DOM updates (form validation, error messages)
    await new Promise((r) => setTimeout(r, 100));
  }

  async fill(selector: string, value: string): Promise<void> {
    this.log('fill', `${selector} = "${value}"`);
    const el = await this.resolveSelector(selector);
    // Triple-click to select all, then type to replace
    await el.click({ count: 3 });
    await el.type(value);
  }

  async assertVisible(selector: string): Promise<void> {
    this.log('assertVisible', selector);
    const el = await this.resolveSelector(selector);
    const isVisible = await el.evaluate((node) => {
      const style = window.getComputedStyle(node);
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        node.getBoundingClientRect().height > 0
      );
    });
    if (!isVisible) {
      throw new Error(`Element "${selector}" exists but is not visible`);
    }
  }

  async assertText(selector: string, expected: string): Promise<void> {
    this.log('assertText', `${selector} contains "${expected}"`);
    const el = await this.resolveSelector(selector);
    const text = await el.evaluate((node) => node.textContent?.trim() ?? '');
    if (!text.includes(expected)) {
      throw new Error(
        `Expected "${selector}" to contain "${expected}", but got "${text}"`,
      );
    }
  }

  set(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  get<T = unknown>(key: string): T {
    return this.store.get(key) as T;
  }

  reset(): void {
    this.store.clear();
    this.actionLog = [];
    this.stepIndex = 0;
  }

  getLog(): string[] {
    return [...this.actionLog];
  }

  /** Take a screenshot — called on failure. */
  async screenshot(testId: string): Promise<string | undefined> {
    try {
      await mkdir(this.screenshotDir, { recursive: true });
      const safeName = testId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePath = join(this.screenshotDir, `${safeName}-${this.stepIndex}.png`);
      await this.page.screenshot({ path: filePath, fullPage: true });
      return filePath;
    } catch {
      return undefined;
    }
  }

  // ─── Semantic Selector Resolution ─────────────────────────

  /**
   * Resolve a semantic selector ("the submit button", "the email input")
   * to a real DOM element.
   *
   * Strategy order:
   * 1. ARIA label match
   * 2. Label text → linked input
   * 3. Button/link text content
   * 4. Role + text match
   * 5. Placeholder match
   * 6. ID heuristic
   */
  private async resolveSelector(intent: string, retries = 5): Promise<ElementHandle<Element>> {
    this.stepIndex++;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const result = await this.tryResolve(intent);
      if (result) return result;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    const keywords = this.extractKeywords(intent);
    throw new Error(
      `Could not resolve semantic selector: "${intent}"\n` +
      `Tried: ARIA label, label text, button text, role, placeholder, ID\n` +
      `Keywords extracted: [${keywords.join(', ')}]`,
    );
  }

  private async tryResolve(intent: string): Promise<ElementHandle<Element> | null> {
    const keywords = this.extractKeywords(intent);

    // 1. ARIA label match
    const ariaMatch = await this.findByAriaLabel(keywords);
    if (ariaMatch) return ariaMatch;

    // 2. Label text → input
    const labelMatch = await this.findByLabelText(keywords);
    if (labelMatch) return labelMatch;

    // 3. Button/link text
    const textMatch = await this.findByTextContent(keywords);
    if (textMatch) return textMatch;

    // 4. Role-based
    const roleMatch = await this.findByRole(intent, keywords);
    if (roleMatch) return roleMatch;

    // 5. Placeholder
    const placeholderMatch = await this.findByPlaceholder(keywords);
    if (placeholderMatch) return placeholderMatch;

    // 6. ID heuristic
    const idMatch = await this.findById(keywords);
    if (idMatch) return idMatch;

    return null;
  }

  private extractKeywords(intent: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'in', 'on', 'at', 'for', 'of', 'to', 'and', 'or',
      'is', 'are', 'was', 'be', 'has', 'have', 'with', 'that', 'this',
    ]);
    return intent
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => !stopWords.has(w) && w.length > 1);
  }

  private async findByAriaLabel(keywords: string[]): Promise<ElementHandle<Element> | null> {
    const elements = await this.page.$$('[aria-label]');
    for (const el of elements) {
      const label = await el.evaluate((node) =>
        (node.getAttribute('aria-label') ?? '').toLowerCase(),
      );
      if (keywords.some((kw) => label.includes(kw))) {
        return el;
      }
    }
    return null;
  }

  private async findByLabelText(keywords: string[]): Promise<ElementHandle<Element> | null> {
    const labels = await this.page.$$('label');
    for (const label of labels) {
      const text = await label.evaluate((node) =>
        (node.textContent ?? '').toLowerCase().trim(),
      );
      if (keywords.some((kw) => text.includes(kw))) {
        // Follow the `for` attribute to find the linked input
        const forId = await label.evaluate((node) => node.getAttribute('for'));
        if (forId) {
          const input = await this.page.$(`#${forId}`);
          if (input) return input;
        }
        // Or find the input inside the label
        const nestedInput = await label.$('input, textarea, select');
        if (nestedInput) return nestedInput;
      }
    }
    return null;
  }

  private async findByTextContent(keywords: string[]): Promise<ElementHandle<Element> | null> {
    // Check buttons, links, and headings
    const selectors = ['button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', '[role="button"]'];
    for (const sel of selectors) {
      const elements = await this.page.$$(sel);
      for (const el of elements) {
        const text = await el.evaluate((node) =>
          (node.textContent ?? '').toLowerCase().trim(),
        );
        if (keywords.some((kw) => text.includes(kw))) {
          return el;
        }
      }
    }
    return null;
  }

  private async findByRole(intent: string, keywords: string[]): Promise<ElementHandle<Element> | null> {
    // Infer the role from the intent
    const lower = intent.toLowerCase();
    let role: string | null = null;
    if (lower.includes('button')) role = 'button';
    else if (lower.includes('alert') || lower.includes('error') || lower.includes('message')) role = 'alert';
    else if (lower.includes('form')) role = 'form';
    else if (lower.includes('nav')) role = 'navigation';

    if (!role) return null;

    const elements = await this.page.$$(`[role="${role}"]`);

    // Filter to visible elements only
    const visible: ElementHandle<Element>[] = [];
    for (const el of elements) {
      const isVis = await el.evaluate((node) => {
        const s = window.getComputedStyle(node);
        return s.display !== 'none' && s.visibility !== 'hidden' && node.getBoundingClientRect().height > 0;
      });
      if (isVis) visible.push(el);
    }

    if (visible.length === 1) return visible[0]!;

    // Multiple visible matches — narrow by text content
    for (const el of visible.length > 0 ? visible : elements) {
      const text = await el.evaluate((node) =>
        (node.textContent ?? '').toLowerCase().trim(),
      );
      if (keywords.some((kw) => text.includes(kw))) {
        return el;
      }
    }

    // Return first visible match, or first overall
    return visible[0] ?? elements[0] ?? null;
  }

  private async findByPlaceholder(keywords: string[]): Promise<ElementHandle<Element> | null> {
    const inputs = await this.page.$$('input[placeholder], textarea[placeholder]');
    for (const el of inputs) {
      const placeholder = await el.evaluate((node) =>
        (node.getAttribute('placeholder') ?? '').toLowerCase(),
      );
      if (keywords.some((kw) => placeholder.includes(kw))) {
        return el;
      }
    }
    return null;
  }

  private async findById(keywords: string[]): Promise<ElementHandle<Element> | null> {
    for (const kw of keywords) {
      // Try the keyword directly as an ID
      const el = await this.page.$(`#${kw}`);
      if (el) return el;

      // Try common ID patterns: submit-btn, login-form, etc.
      const patterns = [`#${kw}-btn`, `#${kw}-input`, `#${kw}-form`, `#${kw}-message`];
      for (const pattern of patterns) {
        const match = await this.page.$(pattern);
        if (match) return match;
      }
    }
    return null;
  }

  private log(action: string, detail: string): void {
    const entry = `[${action}] ${detail}`;
    this.actionLog.push(entry);
    if (this.verbose) {
      console.log(`        ${entry}`);
    }
  }
}
