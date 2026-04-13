import type { Page, Frame, ElementHandle } from 'puppeteer-core';
import type { StepContext } from '@bettertest/bdd';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { SelectorCache } from './selector-cache.js';

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
  private selectorCache: SelectorCache | undefined;
  private slowMs: number;
  /** When panel is active, this is the parent page that holds the sidebar + iframe. */
  private panelPage: Page | null = null;
  /** When panel is active, DOM queries run against this frame (the iframe). */
  private appFrame: Frame | null = null;

  constructor(page: Page, baseUrl?: string, verbose = false, selectorCache?: SelectorCache, slowMs = 0) {
    this.selectorCache = selectorCache ?? undefined;
    this.page = page;
    this.baseUrl = baseUrl ?? '';
    this.verbose = verbose;
    this.slowMs = slowMs;
    this.screenshotDir = join(process.cwd(), 'test-results', 'screenshots');
  }

  /** Configure for panel mode: DOM queries target the iframe, navigation changes iframe src. */
  setupPanel(panelPage: Page, appFrame: Frame): void {
    this.panelPage = panelPage;
    this.appFrame = appFrame;
  }

  /** The query target — iframe frame when panel is active, page otherwise. */
  private get target(): Page | Frame {
    return this.appFrame ?? this.page;
  }

  /** Pause between actions so you can watch in headed mode. */
  private async slow(): Promise<void> {
    if (this.slowMs > 0) {
      await new Promise((r) => setTimeout(r, this.slowMs));
    }
  }

  async navigate(url: string): Promise<void> {
    const resolved = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
    this.log('navigate', resolved);

    if (this.panelPage) {
      // Panel mode: change the iframe src, re-acquire frame reference
      await this.panelPage.evaluate((u) => {
        (document.getElementById('bta-app') as HTMLIFrameElement).src = u;
      }, resolved);
      // Wait for iframe to load and re-acquire frame
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 200));
        const frames = this.panelPage.frames();
        const frame = frames.find((f) => f !== this.panelPage!.mainFrame() && f.url().includes(new URL(resolved).pathname));
        if (frame) {
          this.appFrame = frame;
          try { await frame.waitForSelector('body', { timeout: 3000 }); } catch {}
          break;
        }
      }
    } else {
      // Direct mode: navigate the page
      await this.page.bringToFront();
      await this.page.goto(resolved, { waitUntil: 'networkidle0', timeout: 10_000 });
    }
    await this.slow();
  }

  async click(selector: string): Promise<void> {
    this.log('click', selector);
    const el = await this.resolveSelector(selector);

    if (this.panelPage) {
      // Panel mode: click, then re-acquire iframe frame after potential navigation
      await el.click();
      await new Promise((r) => setTimeout(r, 500));
      const frames = this.panelPage.frames();
      const frame = frames.find((f) =>
        f !== this.panelPage!.mainFrame() && f.url() !== 'about:blank' && f.url().startsWith('http'),
      );
      if (frame) this.appFrame = frame;
    } else {
      // Direct mode: listen for navigation
      const navPromise = this.page.waitForNavigation({ waitUntil: 'load', timeout: 1_000 })
        .catch(() => null);
      await el.click();
      await navPromise;
    }
    await new Promise((r) => setTimeout(r, 100));
    await this.slow();
  }

  async fill(selector: string, value: string): Promise<void> {
    this.log('fill', `${selector} = "${value}"`);
    const el = await this.resolveSelector(selector);
    // Triple-click to select all, then type to replace
    await el.click({ count: 3 });
    await el.type(value);
    await this.slow();
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

    // Try cached selector first
    if (this.selectorCache) {
      const cached = this.selectorCache.get(intent);
      if (cached) {
        try {
          const el = await this.target.$(cached.cssSelector);
          if (el) {
            const isVisible = await el.evaluate((node) => {
              const s = window.getComputedStyle(node);
              return s.display !== 'none' && s.visibility !== 'hidden' && node.getBoundingClientRect().height > 0;
            });
            if (isVisible) {
              this.selectorCache.set(intent, cached.strategy, cached.cssSelector);
              return el;
            }
          }
        } catch {
          // Cache miss — fall through to full resolution
        }
        this.selectorCache.invalidate(intent);
      }
    }

    // Full resolution with retries (a11y tree only on first attempt)
    for (let attempt = 0; attempt <= retries; attempt++) {
      const result = await this.tryResolve(intent, attempt === 0);
      if (result) {
        // Cache the successful resolution
        if (this.selectorCache) {
          const cssSelector = await result.evaluate((node) => {
            // Build a unique CSS selector for this element
            if (node.id) return `#${node.id}`;
            const tag = node.tagName.toLowerCase();
            const label = node.getAttribute('aria-label');
            if (label) return `${tag}[aria-label="${label}"]`;
            return '';
          });
          if (cssSelector) {
            this.selectorCache.set(intent, 'resolved', cssSelector);
          }
        }
        return result;
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    const keywords = this.extractKeywords(intent);
    throw new Error(
      `Could not resolve semantic selector: "${intent}"\n` +
      `Tried: cache, ARIA label, label text, button text, role, placeholder, ID, visual\n` +
      `Keywords extracted: [${keywords.join(', ')}]`,
    );
  }

  private async tryResolve(intent: string, useA11yTree = true): Promise<ElementHandle<Element> | null> {
    const keywords = this.extractKeywords(intent);

    // 0. Accessibility tree — single CDP call, walk in memory (first attempt only)
    if (useA11yTree) {
      const a11yMatch = await this.findByAccessibilityTree(intent, keywords);
      if (a11yMatch) return a11yMatch;
    }

    // 1. ARIA label match (DOM fallback)
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

    // 7. Visual/spatial heuristic — positional inference
    const visualMatch = await this.findByVisualHeuristic(intent, keywords);
    if (visualMatch) return visualMatch;

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

  /**
   * Resolve via the browser's accessibility tree.
   *
   * One CDP call gets the full tree — then we walk it in memory to find
   * the best-matching node. This is how screen readers see the page.
   *
   * The a11y tree gives us role + name for every element, which maps
   * directly to semantic selectors like "the submit button" (role=button, name~=submit).
   */
  private async findByAccessibilityTree(
    intent: string,
    keywords: string[],
  ): Promise<ElementHandle<Element> | null> {
    try {
      // Timeout the snapshot call — it can hang during navigation
      const snapshot = await Promise.race([
        this.page.accessibility.snapshot({ interestingOnly: false }),
        new Promise<null>((r) => setTimeout(() => r(null), 500)),
      ]);
      if (!snapshot) return null;

      // Infer the target role from the intent
      const targetRole = this.inferRole(intent);

      // Walk the tree to find matching nodes, scored by relevance
      const matches = this.walkA11yTree(snapshot, keywords, targetRole);
      if (matches.length === 0) return null;

      // Sort by score descending, pick the best
      matches.sort((a, b) => b.score - a.score);
      const best = matches[0]!;

      // Convert the a11y match back to a DOM element
      return this.a11yNodeToElement(best);
    } catch {
      // accessibility.snapshot() can fail on some pages — fall through to DOM strategies
      return null;
    }
  }

  /** Infer the ARIA role from the intent text. */
  private inferRole(intent: string): string | null {
    const lower = intent.toLowerCase();
    if (lower.includes('button') || lower.includes('submit')) return 'button';
    if (lower.includes('input') || lower.includes('field')) return 'textbox';
    if (lower.includes('link')) return 'link';
    if (lower.includes('heading') || lower.includes('title')) return 'heading';
    if (lower.includes('menu') || lower.includes('nav')) return 'navigation';
    if (lower.includes('checkbox') || lower.includes('toggle')) return 'checkbox';
    if (lower.includes('dropdown') || lower.includes('select')) return 'combobox';
    if (lower.includes('alert') || lower.includes('error') || lower.includes('message')) return 'alert';
    if (lower.includes('label')) return 'LabelText';
    return null;
  }

  /** Accessibility tree node from puppeteer's snapshot. */
  private walkA11yTree(
    node: A11yNode,
    keywords: string[],
    targetRole: string | null,
    depth = 0,
  ): A11yMatch[] {
    const matches: A11yMatch[] = [];
    const name = (node.name ?? '').toLowerCase();
    const role = (node.role ?? '').toLowerCase();

    let score = 0;

    // Role match
    if (targetRole && role === targetRole.toLowerCase()) {
      score += 3;
    }

    // Name keyword match
    for (const kw of keywords) {
      if (name.includes(kw)) {
        score += 2;
      }
    }

    // Special: "label" intent — match StaticText or LabelText roles
    if (targetRole === 'LabelText' && (role === 'statictext' || role === 'labeltext' || role === 'label')) {
      score += 2;
    }

    // Bonus for focused or interactive elements
    if (node.focused) score += 1;

    // Only include if there's some match
    if (score > 0) {
      matches.push({ node, score, depth });
    }

    // Recurse into children
    if (node.children) {
      for (const child of node.children) {
        matches.push(...this.walkA11yTree(child, keywords, targetRole, depth + 1));
      }
    }

    return matches;
  }

  /** Convert an a11y tree match back to a real DOM element. */
  private async a11yNodeToElement(match: A11yMatch): Promise<ElementHandle<Element> | null> {
    const { node } = match;
    const name = node.name ?? '';
    const role = (node.role ?? '').toLowerCase();

    // Strategy 1: use ARIA role + name to build a selector
    if (role && name) {
      // Try puppeteer's built-in ARIA selector
      const el = await this.target.$(`aria/${name}`).catch(() => null);
      if (el) return el;
    }

    // Strategy 2: find by role attribute + text content
    if (role === 'button' || role === 'link') {
      const elements = await this.target.$$(role === 'button' ? 'button, [role="button"], input[type="submit"]' : 'a, [role="link"]');
      for (const el of elements) {
        const text = await el.evaluate((n) => (n.textContent ?? '').trim());
        if (text.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(text.toLowerCase())) {
          return el;
        }
      }
    }

    // Strategy 3: find by aria-label
    if (name) {
      const el = await this.target.$(`[aria-label="${name}"], [aria-label*="${name}"]`).catch(() => null);
      if (el) return el;
    }

    // Strategy 4: for textbox role, find input with matching label
    if (role === 'textbox' && name) {
      const labels = await this.target.$$('label');
      for (const label of labels) {
        const text = await label.evaluate((n) => (n.textContent ?? '').trim().toLowerCase());
        if (text.includes(name.toLowerCase())) {
          const forId = await label.evaluate((n) => n.getAttribute('for'));
          if (forId) {
            const input = await this.target.$(`#${forId}`);
            if (input) return input;
          }
        }
      }
    }

    return null;
  }

  private async findByAriaLabel(keywords: string[]): Promise<ElementHandle<Element> | null> {
    const elements = await this.target.$$('[aria-label]');
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
    const labels = await this.target.$$('label');
    for (const label of labels) {
      const text = await label.evaluate((node) =>
        (node.textContent ?? '').toLowerCase().trim(),
      );
      if (keywords.some((kw) => text.includes(kw))) {
        // Follow the `for` attribute to find the linked input
        const forId = await label.evaluate((node) => node.getAttribute('for'));
        if (forId) {
          const input = await this.target.$(`#${forId}`);
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
      const elements = await this.target.$$(sel);
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

    const elements = await this.target.$$(`[role="${role}"]`);

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
    const inputs = await this.target.$$('input[placeholder], textarea[placeholder]');
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
      const el = await this.target.$(`#${kw}`);
      if (el) return el;

      // Try common ID patterns: submit-btn, login-form, etc.
      const patterns = [`#${kw}-btn`, `#${kw}-input`, `#${kw}-form`, `#${kw}-message`];
      for (const pattern of patterns) {
        const match = await this.target.$(pattern);
        if (match) return match;
      }
    }
    return null;
  }

  /**
   * Visual/spatial heuristic: infer the element from positional context.
   *
   * - "submit button" → the last button inside a <form>
   * - "error message" / "success message" → visible element near the top with alert-like styling
   * - "input" near a label → the closest input to a label containing keywords
   */
  private async findByVisualHeuristic(
    intent: string,
    keywords: string[],
  ): Promise<ElementHandle<Element> | null> {
    const lower = intent.toLowerCase();

    // "submit button" → last button in a form (submit buttons are typically at the bottom)
    if (lower.includes('submit') && lower.includes('button')) {
      const buttons = await this.target.$$('form button, form [type="submit"], form input[type="submit"]');
      if (buttons.length > 0) return buttons[buttons.length - 1]!;
    }

    // "X message" / "X notification" → visible element with text matching keywords
    if (lower.includes('message') || lower.includes('notification') || lower.includes('alert')) {
      const candidates = await this.target.$$('div, p, span, section');
      for (const el of candidates) {
        const info = await el.evaluate((node) => {
          const style = window.getComputedStyle(node);
          const text = (node.textContent ?? '').trim().toLowerCase();
          const visible = style.display !== 'none' && style.visibility !== 'hidden' && node.getBoundingClientRect().height > 0;
          return { text, visible, height: node.getBoundingClientRect().height };
        });
        if (info.visible && info.text.length > 0 && info.text.length < 200) {
          if (keywords.some((kw) => info.text.includes(kw))) {
            return el;
          }
        }
      }
    }

    // "X input" / "X field" → find input closest (in DOM order) to a text node containing keywords
    if (lower.includes('input') || lower.includes('field')) {
      const allInputs = await this.target.$$('input, textarea, select');
      for (const input of allInputs) {
        const nearby = await input.evaluate((node, kws) => {
          // Check previous sibling text, parent text, nearby label
          const parent = node.parentElement;
          if (!parent) return false;
          const parentText = parent.textContent?.toLowerCase() ?? '';
          return (kws as string[]).some((kw) => parentText.includes(kw));
        }, keywords);
        if (nearby) return input;
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

// ─── Accessibility Tree Types ────────────────────────────────

/** Puppeteer accessibility snapshot node (matches SerializedAXNode). */
interface A11yNode {
  role?: string;
  name?: string;
  value?: string | number;
  focused?: boolean;
  children?: A11yNode[];
}

/** A scored match from walking the accessibility tree. */
interface A11yMatch {
  node: A11yNode;
  score: number;
  depth: number;
}
