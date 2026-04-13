/**
 * Postinstall script for @bettertest/cli
 *
 * Downloads the correct pre-built binary for the user's platform
 * from the latest GitHub release.
 */

import { createWriteStream, chmodSync, existsSync, mkdirSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_DIR = join(__dirname, '..', 'bin');
const REPO = 'jaredhoward/better-test-automation';

const PLATFORM_MAP = {
  'darwin-x64': 'bettertest-darwin-x64',
  'darwin-arm64': 'bettertest-darwin-arm64',
  'linux-x64': 'bettertest-linux-x64',
  'linux-arm64': 'bettertest-linux-arm64',
  'win32-x64': 'bettertest-windows-x64.exe',
};

async function main() {
  const platform = `${process.platform}-${process.arch}`;
  const artifact = PLATFORM_MAP[platform];

  if (!artifact) {
    console.error(
      `[bettertest] Unsupported platform: ${platform}\n` +
      `Supported: ${Object.keys(PLATFORM_MAP).join(', ')}\n` +
      'You can build from source with: cargo build --release -p bettertest-cli',
    );
    process.exit(1);
  }

  const binName = process.platform === 'win32' ? 'bettertest.exe' : 'bettertest';
  const binPath = join(BIN_DIR, binName);

  // Skip if binary already exists (e.g., CI cache)
  if (existsSync(binPath)) {
    console.log('[bettertest] Binary already exists, skipping download.');
    return;
  }

  // Get the version from package.json
  const pkg = JSON.parse(
    (await import('node:fs')).readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'),
  );
  const version = pkg.version;

  const url = `https://github.com/${REPO}/releases/download/v${version}/${artifact}`;
  console.log(`[bettertest] Downloading ${artifact} for ${platform}...`);
  console.log(`[bettertest] URL: ${url}`);

  try {
    const response = await fetch(url, { redirect: 'follow' });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (!existsSync(BIN_DIR)) {
      mkdirSync(BIN_DIR, { recursive: true });
    }

    const fileStream = createWriteStream(binPath);
    await pipeline(response.body, fileStream);

    // Make executable on Unix
    if (process.platform !== 'win32') {
      chmodSync(binPath, 0o755);
    }

    console.log(`[bettertest] Installed to ${binPath}`);
  } catch (error) {
    console.error(
      `[bettertest] Failed to download binary: ${error.message}\n` +
      '\n' +
      'This can happen if:\n' +
      `  - Version v${version} has not been released yet\n` +
      `  - Your platform (${platform}) is not supported\n` +
      '  - You are behind a corporate proxy\n' +
      '\n' +
      'Alternative install methods:\n' +
      '  curl -fsSL https://raw.githubusercontent.com/jaredhoward/better-test-automation/main/scripts/install.sh | sh\n' +
      '  cargo install bettertest-cli\n',
    );
    // Don't fail the install — the user can still use the TS packages
    process.exit(0);
  }
}

main();
