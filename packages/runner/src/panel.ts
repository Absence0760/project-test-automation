import type { Browser, Page, Frame } from 'puppeteer-core';
import { createServer, type Server } from 'node:http';

/**
 * Cypress-style sidebar panel + app iframe in one window.
 *
 * Architecture:
 * - A tiny HTTP server serves the panel shell page
 * - The browser loads the panel page (sidebar on left, iframe on right)
 * - The iframe loads the app under test
 * - Puppeteer accesses the iframe via page.frames() for test actions
 * - The panel page NEVER navigates — only the iframe does
 * - Panel state is held in Node.js and rendered via page.evaluate()
 *
 * This gives you the Cypress experience: persistent sidebar with live
 * step updates on the left, app running on the right, all in one window.
 */

interface ScenarioState {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  durationMs: number;
  steps: StepState[];
}

interface StepState {
  description: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  durationMs: number;
  error?: string;
}

interface Stats {
  passed: number;
  failed: number;
  total: number;
  durationMs: number;
}

export class PanelState {
  private panelPage: Page | null = null;
  private suiteName = '';
  private scenarios: ScenarioState[] = [];
  private stats: Stats = { passed: 0, failed: 0, total: 0, durationMs: 0 };
  private enabled: boolean;
  private server: Server | null = null;

  constructor(panelPage: Page | null, enabled: boolean, server?: Server) {
    this.panelPage = panelPage;
    this.enabled = enabled;
    this.server = server ?? null;
  }

  /**
   * Set up the panel: serve HTML, load in browser, return the iframe frame for test actions.
   */
  static async create(
    browser: Browser,
    enabled: boolean,
    appBaseUrl: string,
  ): Promise<{ panel: PanelState; appFrame: Frame; page: Page }> {
    const pages = await browser.pages();
    const page = pages[0] ?? (await browser.newPage());

    if (!enabled) {
      return { panel: new PanelState(null, false), appFrame: page.mainFrame(), page };
    }

    // Start a tiny HTTP server to serve the panel shell
    const panelHtml = buildPanelHtml(appBaseUrl);
    const { port, server } = await startPanelServer(panelHtml);

    // Load the panel page from our local server (same-origin with nothing, but
    // puppeteer can access cross-origin iframes regardless)
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });

    // Wait for the iframe to load the app
    await new Promise((r) => setTimeout(r, 2000));

    // Find the iframe frame
    const appFrame = await waitForAppFrame(page);

    const panel = new PanelState(page, true, server);
    return { panel, appFrame, page };
  }

  async destroy(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  async setSuite(name: string): Promise<void> {
    this.suiteName = name;
    await this.render();
  }

  async addScenario(id: string, name: string): Promise<void> {
    this.scenarios.push({ id, name, status: 'pending', durationMs: 0, steps: [] });
    await this.render();
  }

  async scenarioRunning(id: string): Promise<void> {
    const sc = this.scenarios.find((s) => s.id === id);
    if (sc) sc.status = 'running';
    await this.render();
  }

  async scenarioPassed(id: string, durationMs: number): Promise<void> {
    const sc = this.scenarios.find((s) => s.id === id);
    if (sc) { sc.status = 'passed'; sc.durationMs = durationMs; }
    await this.render();
  }

  async scenarioFailed(id: string, durationMs: number): Promise<void> {
    const sc = this.scenarios.find((s) => s.id === id);
    if (sc) { sc.status = 'failed'; sc.durationMs = durationMs; }
    await this.render();
  }

  async addStep(scenarioId: string, description: string): Promise<void> {
    const sc = this.scenarios.find((s) => s.id === scenarioId);
    if (sc) sc.steps.push({ description, status: 'running', durationMs: 0 });
    await this.render();
  }

  async stepPassed(scenarioId: string, stepIdx: number, durationMs: number): Promise<void> {
    const step = this.scenarios.find((s) => s.id === scenarioId)?.steps[stepIdx];
    if (step) { step.status = 'passed'; step.durationMs = durationMs; }
    await this.render();
  }

  async stepFailed(scenarioId: string, stepIdx: number, errorMsg: string): Promise<void> {
    const step = this.scenarios.find((s) => s.id === scenarioId)?.steps[stepIdx];
    if (step) { step.status = 'failed'; step.error = errorMsg; }
    await this.render();
  }

  async stepSkipped(scenarioId: string, stepIdx: number): Promise<void> {
    const step = this.scenarios.find((s) => s.id === scenarioId)?.steps[stepIdx];
    if (step) step.status = 'skipped';
    await this.render();
  }

  async updateStats(passed: number, failed: number, total: number, durationMs: number): Promise<void> {
    this.stats = { passed, failed, total, durationMs };
    await this.render();
  }

  private async render(): Promise<void> {
    if (!this.enabled || !this.panelPage) return;
    const state = { suiteName: this.suiteName, scenarios: this.scenarios, stats: this.stats };
    // Build HTML in Node.js to avoid tsx __name compilation issues in page.evaluate
    const icons: Record<string, string> = { pending: '\u25CB', running: '\u25B6', passed: '\u2713', failed: '\u2717' };
    const stepPre: Record<string, string> = { passed: '\u2713 ', failed: '\u2717 ', skipped: '\u2013 ', running: '', pending: '' };

    let scenariosHtml = '';
    for (const scenario of state.scenarios) {
      const collapsed = scenario.status === 'passed' ? ' collapsed' : '';
      scenariosHtml += `<div class="bsc${collapsed}">`;
      scenariosHtml += `<div class="bsh ${scenario.status}" onclick="this.parentElement.classList.toggle('collapsed')">`;
      scenariosHtml += `<span class="bi">${icons[scenario.status] || '\u25CB'}</span>`;
      scenariosHtml += `<span>${esc(scenario.name)}</span>`;
      scenariosHtml += `<span class="bd">${scenario.durationMs > 0 ? Math.round(scenario.durationMs) + 'ms' : ''}</span>`;
      scenariosHtml += '</div><div class="bst">';
      for (const step of scenario.steps) {
        scenariosHtml += `<div class="bs ${step.status}">`;
        const pre = stepPre[step.status] || '';
        if (pre) scenariosHtml += `<span class="si">${pre}</span>`;
        scenariosHtml += esc(step.description);
        if (step.durationMs > 0) scenariosHtml += ` <span class="bm">${Math.round(step.durationMs)}ms</span>`;
        scenariosHtml += '</div>';
        if (step.error) scenariosHtml += `<div class="be">${esc(step.error)}</div>`;
      }
      scenariosHtml += '</div></div>';
    }

    try {
      // Pass pre-built HTML strings to avoid function serialization issues
      await this.panelPage.evaluate(`
        document.getElementById('bta-sn').textContent = ${JSON.stringify(state.suiteName)};
        document.getElementById('bta-sc').innerHTML = ${JSON.stringify(scenariosHtml)};
        document.getElementById('bta-sc').scrollTop = document.getElementById('bta-sc').scrollHeight;
        document.getElementById('bta-p').textContent = ${JSON.stringify(String(state.stats.passed))};
        document.getElementById('bta-f').textContent = ${JSON.stringify(String(state.stats.failed))};
        document.getElementById('bta-t').textContent = ${JSON.stringify(String(state.stats.total))};
        document.getElementById('bta-d').textContent = ${JSON.stringify(Math.round(state.stats.durationMs) + 'ms')};
      `);
    } catch (err) { /* panel page closed */ }
  }
}

// ─── Helpers ──────────────────────────────────────────────

/** HTML-escape a string (runs in Node.js, not browser). */
function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function startPanelServer(html: string): Promise<{ port: number; server: Server }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ port, server });
    });
  });
}

async function waitForAppFrame(page: Page, maxWait = 10_000): Promise<Frame> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const frames = page.frames();
    const appFrame = frames.find((f) =>
      f !== page.mainFrame() && f.url() !== 'about:blank' && f.url() !== '',
    );
    if (appFrame) return appFrame;
    await new Promise((r) => setTimeout(r, 300));
  }
  // Fallback: return any non-main frame
  const frames = page.frames();
  return frames.find((f) => f !== page.mainFrame()) ?? page.mainFrame();
}

function buildPanelHtml(appUrl: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Better Test Automation</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;overflow:hidden;background:#111;color:#e0e0e0;font-family:system-ui,-apple-system,sans-serif;font-size:12px}
body{display:flex}
#bta-sidebar{width:380px;min-width:380px;height:100vh;background:#111;border-right:2px solid #333;display:flex;flex-direction:column;overflow:hidden}
#bta-hdr{padding:14px 16px;background:#0a0a0a;border-bottom:1px solid #333}
#bta-hdr h1{font-size:11px;font-weight:700;color:#4ade80;letter-spacing:.08em;text-transform:uppercase}
#bta-hdr .sn{font-size:11px;color:#888;margin-top:4px}
#bta-sc{flex:1;overflow-y:auto;padding:8px 0}
.bsc{margin-bottom:2px}
.bsh{padding:8px 14px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:7px;border-left:3px solid transparent;user-select:none}
.bsh:hover{background:#1a1a1a}
.bsh .bi{width:16px;text-align:center;font-size:13px}
.bsh.running{border-left-color:#60a5fa;color:#60a5fa}
.bsh.passed{border-left-color:#4ade80}
.bsh.failed{border-left-color:#f87171}
.bsh.pending{color:#555}
.bsh .bd{margin-left:auto;font-size:10px;color:#555;font-weight:400}
.bst{padding:2px 0}
.bsc.collapsed .bst{display:none}
.bs{padding:5px 14px 5px 36px;font-size:10.5px;font-family:'SF Mono','Cascadia Code','Fira Code',monospace;line-height:1.6;color:#666;border-left:3px solid transparent}
.bs.running{color:#60a5fa;border-left-color:#60a5fa;background:rgba(96,165,250,.05)}
.bs.passed{color:#999}
.bs .si{font-weight:700;margin-right:2px}
.bs.passed .si{color:#4ade80}
.bs.failed{color:#f87171}
.bs.failed .si{color:#f87171}
.bs.skipped{color:#444;font-style:italic}
.bs.skipped .si{color:#555}
.bs .bm{color:#444;font-size:9px}
.be{padding:5px 14px 5px 36px;font-size:10px;color:#f87171;background:rgba(248,113,113,.05);font-family:'SF Mono',monospace;white-space:pre-wrap;word-break:break-word}
#bta-ft{padding:10px 14px;background:#0a0a0a;border-top:1px solid #333;display:flex;gap:16px;font-size:11px}
#bta-ft .bs2{display:flex;align-items:center;gap:4px}
.bp{color:#4ade80;font-weight:600}
.bf{color:#f87171;font-weight:600}
.bt{color:#888}
.bv{color:#666}
#bta-app{flex:1;border:none;height:100vh}
</style></head><body>
<div id="bta-sidebar">
<div id="bta-hdr"><h1>BETTER TEST AUTOMATION</h1><div class="sn" id="bta-sn">Waiting for tests...</div></div>
<div id="bta-sc"></div>
<div id="bta-ft">
<div class="bs2"><span class="bp" id="bta-p">0</span> passed</div>
<div class="bs2"><span class="bf" id="bta-f">0</span> failed</div>
<div class="bs2"><span class="bt" id="bta-t">0</span> total</div>
<div class="bs2"><span class="bv" id="bta-d">0ms</span></div>
</div>
</div>
<iframe id="bta-app" src="${appUrl}"></iframe>
</body></html>`;
}
