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
 * Find system Chrome and launch via puppeteer.launch().
 *
 * Uses puppeteer's built-in process management which properly isolates
 * from any existing Chrome instances on macOS.
 */
export async function launchBrowser(config: BrowserConfig): Promise<LaunchResult> {
  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error(
      'Chrome not found. Install Google Chrome or set CHROME_PATH environment variable.',
    );
  }

  // Use a fresh temp profile each time to avoid session restore issues
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const userDataDir = await mkdtemp(join(tmpdir(), 'bettertest-chrome-'));

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: config.headless,
    userDataDir,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-popup-blocking',
      '--disable-session-crashed-bubble',
      '--disable-infobars',
      '--noerrdialogs',
      '--restore-last-session=false',
      '--hide-crash-restore-bubble',
      `--window-size=${config.viewport.width},${config.viewport.height}`,
      ...(!config.headless ? ['--start-maximized'] : []),
    ],
    ignoreDefaultArgs: ['--enable-automation'], // removes "controlled by automated software" bar
    defaultViewport: config.headless
      ? { width: config.viewport.width, height: config.viewport.height }
      : null, // null = viewport matches window size (headed mode)
  });

  // Get the default page or create one
  const pages = await browser.pages();
  const page = pages[0] ?? (await browser.newPage());

  // Bring window to front so user can see it in headed mode
  if (!config.headless) {
    await page.bringToFront();
  }

  return {
    browser,
    page,
    async close() {
      await browser.close();
      // Clean up temp profile
      const { rm } = await import('node:fs/promises');
      await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
    },
  };
}

function findChrome(): string | null {
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
