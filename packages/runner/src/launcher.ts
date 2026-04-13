import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import type { BrowserConfig } from './config.js';

const CHROME_PATHS: Record<string, string[]> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
};

export interface LaunchResult {
  browser: Browser;
  page: Page;
  close: () => Promise<void>;
}

/**
 * Find system Chrome, launch it with remote debugging, connect puppeteer.
 */
export async function launchBrowser(config: BrowserConfig): Promise<LaunchResult> {
  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error(
      'Chrome not found. Install Google Chrome or set CHROME_PATH environment variable.',
    );
  }

  // Create temp user data dir so we don't interfere with the user's profile
  const userDataDir = join(process.cwd(), '.bettertest', 'chrome-profile');
  await mkdir(userDataDir, { recursive: true });

  // Clean stale lock file from previous crashed runs
  const { unlink } = await import('node:fs/promises');
  await unlink(join(userDataDir, 'SingletonLock')).catch(() => {});

  const args = [
    `--user-data-dir=${userDataDir}`,
    '--remote-debugging-port=0', // auto-assign port
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-popup-blocking',
    `--window-size=${config.viewport.width},${config.viewport.height}`,
  ];

  if (config.headless) {
    args.push('--headless=new');
  }

  // Launch Chrome
  const chromeProcess = spawn(chromePath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false,
  });

  // Wait for the DevTools WebSocket URL from stderr
  const wsUrl = await waitForDebuggerUrl(chromeProcess);

  // Connect puppeteer
  const browser = await puppeteer.connect({ browserWSEndpoint: wsUrl });

  // Get or create a page
  const pages = await browser.pages();
  const page = pages[0] ?? (await browser.newPage());

  // Set viewport
  await page.setViewport({
    width: config.viewport.width,
    height: config.viewport.height,
  });

  return {
    browser,
    page,
    async close() {
      await browser.close();
      // Chrome process should exit when browser.close() is called,
      // but kill it to be safe
      if (!chromeProcess.killed) {
        chromeProcess.kill();
      }
    },
  };
}

function findChrome(): string | null {
  // Check env var first
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const platform = process.platform;
  const candidates = CHROME_PATHS[platform] ?? [];

  for (const path of candidates) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

function waitForDebuggerUrl(proc: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for Chrome DevTools URL'));
    }, 15_000);

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
      // Chrome prints: DevTools listening on ws://127.0.0.1:PORT/devtools/browser/UUID
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]!);
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to launch Chrome: ${err.message}`));
    });

    proc.on('exit', (code) => {
      clearTimeout(timeout);
      if (code !== null && code !== 0) {
        reject(new Error(`Chrome exited with code ${code}:\n${stderr}`));
      }
    });
  });
}
