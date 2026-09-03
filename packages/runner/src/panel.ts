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
  snapshotId?: string;
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
  private snapshots = new Map<string, string>();
  private serverPort = 0;
  private appBaseUrl = '';

  // ─── Execution control ────────────────────────────
  private _paused = false;
  private _stopped = false;
  private _pauseResolve: (() => void) | null = null;
  /** Queued replay requests: { scenarioId, stepIdx } */
  private _replayQueue: Array<{ scenarioId: string; stepIdx: number }> = [];

  constructor(
    panelPage: Page | null,
    enabled: boolean,
    server?: Server,
    port = 0,
    appBaseUrl = '',
  ) {
    this.panelPage = panelPage;
    this.enabled = enabled;
    this.server = server ?? null;
    this.serverPort = port;
    this.appBaseUrl = appBaseUrl;
  }

  /** Is the runner currently paused? */
  isPaused(): boolean {
    return this._paused;
  }

  /** Has the user requested a stop? */
  isStopped(): boolean {
    return this._stopped;
  }

  /** Pause execution. The runner's step loop will wait. */
  pause(): void {
    this._paused = true;
    this.updatePauseState();
  }

  /** Resume execution after a pause. */
  resume(): void {
    this._paused = false;
    this.updatePauseState();
    if (this._pauseResolve) {
      this._pauseResolve();
      this._pauseResolve = null;
    }
  }

  /** Stop execution entirely. */
  stop(): void {
    this._stopped = true;
    // Also resume if paused, so the loop can exit
    this.resume();
  }

  // ─── Test picker (headed mode) ─────────────────────
  private _selectedScenarios: string[] | null = null;
  private _runResolve: ((ids: string[]) => void) | null = null;

  private _backResolve: (() => void) | null = null;

  /** Signal from the browser that user wants to go back to the picker. */
  goBack(): void {
    if (this._backResolve) {
      this._backResolve();
      this._backResolve = null;
    }
  }

  /** Show a "Back to Tests" button and wait for the user to click it. */
  async showBackButtonAndWait(): Promise<void> {
    if (!this.enabled || !this.panelPage) return;
    const apiBase = `http://127.0.0.1:${this.serverPort}`;
    // Remove controls bar, add "Back to Tests" button
    await this.eval(`
      var c=document.getElementById('bta-controls');if(c)c.remove();
      var existing=document.getElementById('bta-back-bar');if(existing)existing.remove();
      var bar=document.createElement('div');bar.id='bta-back-bar';
      bar.style.cssText='padding:10px 14px;background:#0a0a0a;border-bottom:1px solid #333;';
      bar.innerHTML='<button class="bta-btn bta-btn-blue" onclick="fetch(\\'${apiBase}/api/back\\')"><span class="bta-btn-icon">\\u2190</span> Back to Tests</button>';
      document.getElementById('bta-hdr').after(bar);
    `);
    return new Promise<void>((resolve) => {
      this._backResolve = resolve;
    });
  }

  /** Signal from the browser that user selected tests to run. */
  selectAndRun(scenarioIds: string[]): void {
    this._selectedScenarios = scenarioIds;
    if (this._runResolve) {
      this._runResolve(scenarioIds);
      this._runResolve = null;
    }
  }

  /**
   * Show the test picker and wait for the user to select and click "Run".
   * Returns the IDs of selected scenarios.
   */
  async showPickerAndWait(
    suites: Array<{
      name: string;
      filePath: string;
      tests: Array<{ id: string; name: string; tags: string[] }>;
    }>,
  ): Promise<string[]> {
    if (!this.enabled || !this.panelPage) {
      return suites.flatMap((s) => s.tests.map((t) => t.id));
    }

    // Clean up from previous run
    await this.eval(`
      var bb=document.getElementById('bta-back-bar');if(bb)bb.remove();
      var cc=document.getElementById('bta-controls');if(cc)cc.remove();
      document.getElementById('bta-sc').innerHTML='';
    `);

    const apiBase = `http://127.0.0.1:${this.serverPort}`;

    // Build picker HTML
    let pickerHtml = '';
    for (let si = 0; si < suites.length; si++) {
      const suite = suites[si]!;
      const suiteClass = `bta-suite-${si}`;
      // Play button for the whole feature: checks all its scenarios and runs
      const playFeatureOnclick = `document.querySelectorAll('.${suiteClass} input').forEach(function(c){c.checked=true}); var ids=[]; document.querySelectorAll('.bta-picker input:checked').forEach(function(c){ids.push(c.value)}); fetch('${apiBase}/api/run-selected', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:ids})})`;
      pickerHtml += `<div class="bta-picker-suite ${suiteClass}">`;
      pickerHtml += `<div class="bta-picker-suite-header">`;
      pickerHtml += `<div><div class="bta-picker-suite-name">${esc(suite.name)}</div>`;
      pickerHtml += `<div class="bta-picker-file">${esc(suite.filePath)}</div></div>`;
      pickerHtml += `<button class="bta-btn bta-btn-green bta-btn-sm" onclick="${esc(playFeatureOnclick)}" title="Run all scenarios in this feature"><span class="bta-btn-icon">\u25B6</span></button>`;
      pickerHtml += `</div>`;
      for (const test of suite.tests) {
        const escapedId = esc(test.id);
        const tags =
          test.tags.length > 0
            ? ` <span class="bta-picker-tags">${test.tags.map((t) => esc(t)).join(' ')}</span>`
            : '';
        pickerHtml += `<label class="bta-picker-item"><input type="checkbox" value="${escapedId}" /><span>${esc(test.name)}</span>${tags}</label>`;
      }
      pickerHtml += `</div>`;
    }

    // Build action buttons
    const runBtnOnclick = `var ids=[]; document.querySelectorAll('.bta-picker input:checked').forEach(function(c){ids.push(c.value)}); if(ids.length===0){alert('Select at least one scenario');return}; fetch('${apiBase}/api/run-selected', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:ids})}); this.disabled=true; this.textContent='Starting...'`;
    const selectAllOnclick = `document.querySelectorAll('.bta-picker input').forEach(function(c){c.checked=true})`;
    const selectNoneOnclick = `document.querySelectorAll('.bta-picker input').forEach(function(c){c.checked=false})`;

    const fullPickerHtml =
      '<div class="bta-picker">' +
      '<div class="bta-picker-actions">' +
      `<button class="bta-btn bta-btn-green bta-picker-run" onclick="${esc(runBtnOnclick)}"><span class="bta-btn-icon">\u25B6</span> Run Selected</button>` +
      `<button class="bta-btn bta-btn-blue" onclick="${esc(selectAllOnclick)}">Select All</button>` +
      `<button class="bta-btn bta-btn-blue" onclick="${esc(selectNoneOnclick)}">Select None</button>` +
      '</div>' +
      pickerHtml +
      '</div>';

    await this.panelPage.evaluate(`
      document.getElementById('bta-sn').textContent = 'Select tests to run';
      document.getElementById('bta-sc').innerHTML = ${JSON.stringify(fullPickerHtml)};
    `);

    // Wait for user to click "Run Selected"
    return new Promise<string[]>((resolve) => {
      this._runResolve = resolve;
    });
  }

  /** Queue a step for replay. */
  queueReplay(scenarioId: string, stepIdx: number): void {
    this._replayQueue.push({ scenarioId, stepIdx });
    // If paused, resume so the runner picks up the replay
    this.resume();
  }

  /** Pop the next replay request, or undefined. */
  popReplay(): { scenarioId: string; stepIdx: number } | undefined {
    return this._replayQueue.shift();
  }

  /**
   * Wait here if paused. Call this before each step in the runner.
   * Returns immediately if not paused. Resolves when resume() is called.
   */
  async waitIfPaused(): Promise<void> {
    if (!this._paused) return;
    await new Promise<void>((resolve) => {
      this._pauseResolve = resolve;
    });
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

    const panel = new PanelState(page, true, server, port, appBaseUrl);
    activePanelRef = panel;
    return { panel, appFrame, page };
  }

  async destroy(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  // ─── Optimized panel updates (batched, minimal round-trips) ──────

  /** Set suite name + add all scenarios in ONE evaluate call. */
  async initSuite(name: string, scenarios: Array<{ id: string; name: string }>): Promise<void> {
    this.suiteName = name;
    for (const s of scenarios) {
      this.scenarios.push({ id: s.id, name: s.name, status: 'pending', durationMs: 0, steps: [] });
    }
    let html = '';
    for (const s of scenarios) {
      html += `<div class="bsc" id="bsc-${esc(s.id)}"><div class="bsh pending" onclick="this.parentElement.classList.toggle('collapsed')"><span class="bi">\u25CB</span><span>${esc(s.name)}</span><span class="bd"></span></div><div class="bst" id="bst-${esc(s.id)}"></div></div>`;
    }
    await this.eval(`
      document.getElementById('bta-sn').textContent=${JSON.stringify(name)};
      document.getElementById('bta-sc').insertAdjacentHTML('beforeend',${JSON.stringify(html)});
    `);
  }

  async scenarioRunning(id: string): Promise<void> {
    const sc = this.scenarios.find((s) => s.id === id);
    if (sc) sc.status = 'running';
    await this.eval(
      `var el=document.querySelector('#bsc-${esc(id)} .bsh');if(el){el.className='bsh running';el.querySelector('.bi').textContent='\\u25B6'}`,
    );
  }

  /** Mark scenario done + update stats in one call. */
  async scenarioDone(
    id: string,
    status: 'passed' | 'failed',
    durationMs: number,
    passed: number,
    failed: number,
    total: number,
    totalDurationMs: number,
  ): Promise<void> {
    const sc = this.scenarios.find((s) => s.id === id);
    if (sc) {
      sc.status = status;
      sc.durationMs = durationMs;
    }
    this.stats = { passed, failed, total, durationMs: totalDurationMs };
    const icon = status === 'passed' ? '\\u2713' : '\\u2717';
    const collapse =
      status === 'passed'
        ? `var p=document.getElementById('bsc-${esc(id)}');if(p)p.classList.add('collapsed');`
        : '';
    await this.eval(`
      var el=document.querySelector('#bsc-${esc(id)} .bsh');
      if(el){el.className='bsh ${status}';el.querySelector('.bi').textContent='${icon}';el.querySelector('.bd').textContent='${Math.round(durationMs)}ms'}
      ${collapse}
      var s=function(i,v){var e=document.getElementById(i);if(e)e.textContent=v};
      s('bta-p','${passed}');s('bta-f','${failed}');s('bta-t','${total}');s('bta-d','${Math.round(totalDurationMs)}ms');
    `);
  }

  /** Add step as running + immediately show it — one call. */
  async addStep(scenarioId: string, description: string): Promise<void> {
    const sc = this.scenarios.find((s) => s.id === scenarioId);
    const stepIdx = sc ? sc.steps.length : 0;
    if (sc) sc.steps.push({ description, status: 'running', durationMs: 0 });
    const stepId = `bs-${esc(scenarioId)}-${stepIdx}`;
    const html = `<div class="bs running" id="${stepId}" style="display:flex;align-items:center"><span style="flex:1">${esc(description)}</span></div>`;
    await this.eval(
      `var c=document.getElementById('bst-${esc(scenarioId)}');if(c){c.insertAdjacentHTML('beforeend',${JSON.stringify(html)})};var sc=document.getElementById('bta-sc');if(sc)sc.scrollTop=sc.scrollHeight`,
    );
  }

  /** Mark step passed — snapshot captured in parallel with eval. */
  async stepPassed(
    scenarioId: string,
    stepIdx: number,
    durationMs: number,
    frame?: Frame,
  ): Promise<void> {
    const step = this.scenarios.find((s) => s.id === scenarioId)?.steps[stepIdx];
    if (step) {
      step.status = 'passed';
      step.durationMs = durationMs;
      if (frame) {
        step.snapshotId = `${scenarioId}-${stepIdx}`;
        // Capture snapshot in parallel with DOM update — don't block
        this.captureSnapshot(step.snapshotId, frame);
      }
    }
    const stepId = `bs-${esc(scenarioId)}-${stepIdx}`;
    const snapshotClick = step?.snapshotId
      ? ` onclick="document.getElementById('bta-app').src='http://127.0.0.1:${this.serverPort}/snapshot/${encodeURIComponent(step.snapshotId)}';document.getElementById('bta-resume-btn').style.display=''"`
      : '';
    const replayUrl = `http://127.0.0.1:${this.serverPort}/api/replay?scenario=${encodeURIComponent(scenarioId)}&step=${stepIdx}`;
    const innerHtml = `<span style="flex:1" class="clickable"${snapshotClick}><span class="si">\u2713 </span>${esc(step?.description ?? '')} <span class="bm">${Math.round(durationMs)}ms</span></span><span class="bta-replay" onclick="event.stopPropagation();fetch('${replayUrl}')" title="Replay">\u21BB</span>`;
    await this.eval(
      `var el=document.getElementById('${stepId}');if(el){el.className='bs passed clickable';el.style.display='flex';el.style.alignItems='center';el.innerHTML=${JSON.stringify(innerHtml)}}`,
    );
  }

  async stepFailed(
    scenarioId: string,
    stepIdx: number,
    errorMsg: string,
    frame?: Frame,
  ): Promise<void> {
    const step = this.scenarios.find((s) => s.id === scenarioId)?.steps[stepIdx];
    if (step) {
      step.status = 'failed';
      step.error = errorMsg;
      if (frame) {
        step.snapshotId = `${scenarioId}-${stepIdx}`;
        this.captureSnapshot(step.snapshotId, frame);
      }
    }
    const stepId = `bs-${esc(scenarioId)}-${stepIdx}`;
    const replayUrl = `http://127.0.0.1:${this.serverPort}/api/replay?scenario=${encodeURIComponent(scenarioId)}&step=${stepIdx}`;
    const innerHtml = `<span style="flex:1"><span class="si">\u2717 </span>${esc(step?.description ?? '')}</span><span class="bta-replay" onclick="event.stopPropagation();fetch('${replayUrl}')" title="Replay">\u21BB</span>`;
    const errHtml = `<div class="be">${esc(errorMsg)}</div>`;
    await this.eval(
      `var el=document.getElementById('${stepId}');if(el){el.className='bs failed';el.style.display='flex';el.style.alignItems='center';el.innerHTML=${JSON.stringify(innerHtml)};el.insertAdjacentHTML('afterend',${JSON.stringify(errHtml)})}`,
    );
  }

  /** Capture the current DOM from the iframe frame. */
  private async captureSnapshot(id: string, frame: Frame): Promise<void> {
    try {
      const html = await frame.content();
      this.snapshots.set(id, html);
    } catch {
      /* frame might be navigating */
    }
  }

  /** Get a stored snapshot by ID (used by the server). */
  getSnapshot(id: string): string | undefined {
    return this.snapshots.get(id);
  }

  async stepSkipped(scenarioId: string, stepIdx: number): Promise<void> {
    const step = this.scenarios.find((s) => s.id === scenarioId)?.steps[stepIdx];
    if (step) step.status = 'skipped';
    const stepId = `bs-${esc(scenarioId)}-${stepIdx}`;
    await this.eval(`
      var el=document.getElementById('${stepId}');
      if(el){el.className='bs skipped';el.innerHTML='<span class="si">\\u2013 </span>${esc(step?.description ?? '')}'}
    `);
  }

  async updateStats(
    passed: number,
    failed: number,
    total: number,
    durationMs: number,
  ): Promise<void> {
    this.stats = { passed, failed, total, durationMs };
    await this.eval(`
      var s=function(id,v){var e=document.getElementById(id);if(e)e.textContent=v};
      s('bta-p','${passed}');s('bta-f','${failed}');s('bta-t','${total}');s('bta-d','${Math.round(durationMs)}ms');
    `);
  }

  /** Reset state for a new run (preserves previous results in panel). */
  resetForNewRun(): void {
    this.scenarios = [];
    this.stats = { passed: 0, failed: 0, total: 0, durationMs: 0 };
    this._paused = false;
    this._stopped = false;
    this._replayQueue = [];
  }

  /** Small helper to evaluate JS in the panel page. */
  private async eval(js: string): Promise<void> {
    if (!this.enabled || !this.panelPage) return;
    try {
      await this.panelPage.evaluate(js);
    } catch {
      /* panel closed */
    }
  }

  /** Set up the controls bar (called once at start of run). */
  async setupControls(): Promise<void> {
    const apiBase = `http://127.0.0.1:${this.serverPort}`;
    const resumeUrl = this.appBaseUrl || 'about:blank';
    // Clear the scenarios area for the new run
    await this.eval(`document.getElementById('bta-sc').innerHTML=''`);
    // Inject controls if not present
    await this.eval(`
      if(!document.getElementById('bta-controls')){
        var bar=document.createElement('div');bar.id='bta-controls';
        document.getElementById('bta-hdr').after(bar);
        bar.innerHTML='<button id="bta-pause-btn" class="bta-btn bta-btn-blue" onclick="fetch(\\'${apiBase}/api/pause\\')"><span class="bta-btn-icon">\\u23F8</span> Pause</button><button id="bta-resume-btn" class="bta-btn bta-btn-green" style="display:none" onclick="fetch(\\'${apiBase}/api/resume\\');document.getElementById(\\'bta-app\\').src=\\'${resumeUrl}\\'"><span class="bta-btn-icon">\\u25B6</span> Resume</button><button id="bta-stop-btn" class="bta-btn bta-btn-red" onclick="fetch(\\'${apiBase}/api/stop\\')"><span class="bta-btn-icon">\\u25A0</span> Stop</button><span id="bta-status" class="bta-status"></span>';
      }
    `);
  }

  /** Update the pause/resume button state. */
  async updatePauseState(): Promise<void> {
    const isPaused = this._paused;
    await this.eval(`
      var pb=document.getElementById('bta-pause-btn'),rb=document.getElementById('bta-resume-btn'),st=document.getElementById('bta-status');
      if(pb&&rb&&st){
        if(${isPaused}){pb.classList.add('disabled');rb.style.display='';st.textContent='\\u23F8 PAUSED';st.className='bta-status paused'}
        else{pb.classList.remove('disabled');rb.style.display='none';st.textContent='';st.className='bta-status'}
      }
    `);
  }
}

// ─── Helpers ──────────────────────────────────────────────

/** HTML-escape a string (runs in Node.js, not browser). */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Reference to the active panel, so the server can access snapshots. */
let activePanelRef: PanelState | null = null;

async function startPanelServer(html: string): Promise<{ port: number; server: Server }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST',
      };

      // API: pause
      if (url.pathname === '/api/pause') {
        activePanelRef?.pause();
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
        return;
      }

      // API: resume
      if (url.pathname === '/api/resume') {
        activePanelRef?.resume();
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
        return;
      }

      // API: stop
      if (url.pathname === '/api/stop') {
        activePanelRef?.stop();
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
        return;
      }

      // API: replay a step
      if (url.pathname === '/api/replay') {
        const scenarioId = url.searchParams.get('scenario') ?? '';
        const stepIdx = Number(url.searchParams.get('step') ?? '0');
        activePanelRef?.queueReplay(scenarioId, stepIdx);
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
        return;
      }

      // API: run selected tests (from picker)
      if (url.pathname === '/api/run-selected' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const { ids } = JSON.parse(body) as { ids: string[] };
            activePanelRef?.selectAndRun(ids);
          } catch {}
          res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        });
        return;
      }

      // API: back to picker
      if (url.pathname === '/api/back') {
        activePanelRef?.goBack();
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
        return;
      }

      // API: status
      if (url.pathname === '/api/status') {
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            paused: activePanelRef?.isPaused(),
            stopped: activePanelRef?.isStopped(),
          }),
        );
        return;
      }

      // Serve a DOM snapshot
      if (url.pathname.startsWith('/snapshot/')) {
        const id = decodeURIComponent(url.pathname.slice('/snapshot/'.length));
        const snapshot = activePanelRef?.getSnapshot(id);
        if (snapshot) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(snapshot);
        } else {
          res.writeHead(404);
          res.end('Snapshot not found');
        }
        return;
      }

      // Default: serve the panel shell
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
    const appFrame = frames.find(
      (f) => f !== page.mainFrame() && f.url() !== 'about:blank' && f.url() !== '',
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
.bs.clickable{cursor:pointer;transition:background .1s}
.bs.clickable:hover{background:rgba(96,165,250,.08);border-left-color:#60a5fa}
.bs.clickable:active{background:rgba(96,165,250,.15)}
.bta-replay{cursor:pointer;opacity:0.3;font-size:13px;padding:2px 6px;border-radius:4px;margin-left:4px;flex-shrink:0;transition:all .15s}
.bta-replay:hover{opacity:1;background:rgba(96,165,250,.2);color:#60a5fa;transform:rotate(60deg)}
.bta-replay:active{transform:rotate(360deg);transition:transform .4s}
.bta-picker{padding:8px 14px}
.bta-picker-actions{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.bta-picker-suite{margin-bottom:14px}
.bta-picker-suite-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.bta-picker-suite-name{font-size:12px;font-weight:700;color:#e0e0e0;margin-bottom:2px}
.bta-picker-file{font-size:9px;color:#555;font-family:'SF Mono',monospace}
.bta-btn-sm{padding:4px 8px;font-size:9px}
.bta-picker-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:5px;cursor:pointer;font-size:11px;color:#aaa;transition:background .1s}
.bta-picker-item:hover{background:rgba(255,255,255,.05)}
.bta-picker-item input{accent-color:#4ade80;width:14px;height:14px;cursor:pointer}
.bta-picker-tags{font-size:9px;color:#60a5fa;margin-left:auto}
#bta-controls{padding:8px 14px;background:#0a0a0a;border-bottom:1px solid #333;display:flex;gap:8px;align-items:center}
.bta-btn{padding:6px 12px;border:none;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;transition:all .15s;text-transform:uppercase;letter-spacing:.03em;display:inline-flex;align-items:center;gap:4px}
.bta-btn:hover{filter:brightness(1.15);transform:translateY(-1px)}
.bta-btn:active{filter:brightness(0.9);transform:translateY(0)}
.bta-btn.clicked{transform:scale(0.95);filter:brightness(0.85)}
.bta-btn.disabled{opacity:0.4;cursor:default;pointer-events:none}
.bta-btn-blue{background:#60a5fa;color:#0a0a0a}
.bta-btn-green{background:#4ade80;color:#0a0a0a}
.bta-btn-red{background:#f87171;color:#fff}
.bta-btn-icon{font-size:12px}
.bta-status{font-size:10px;font-weight:700;letter-spacing:.05em;margin-left:auto}
.bta-status.paused{color:#fbbf24;animation:bta-pulse 1.5s infinite}
@keyframes bta-pulse{0%,100%{opacity:1}50%{opacity:0.4}}
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
