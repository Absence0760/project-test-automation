# Local Testing Guide

How to set up, build, and test Better Test Automation on your machine.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | >= 22 | [nodejs.org](https://nodejs.org) or `brew install node` |
| **pnpm** | >= 10 | `npm install -g pnpm` or `brew install pnpm` |
| **Rust** | >= 1.85 (edition 2024) | See [Installing Rust](#installing-rust) below |
| **Ollama** (optional) | latest | [ollama.com](https://ollama.com) — only needed for AI features |

Verify your setup:

```bash
node --version    # v22.x+
pnpm --version    # 10.x+
rustc --version   # 1.85.0+
cargo --version   # 1.85.0+
```

### Installing Rust

Install via the official [rustup](https://rustup.rs) installer:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

After the install finishes, load it into your current shell:

```bash
. "$HOME/.cargo/env"
```

Then make sure it persists across new terminals. Check if rustup already added it to your shell config:

```bash
grep cargo ~/.zshrc   # macOS (zsh)
grep cargo ~/.bashrc  # Linux (bash)
```

If nothing shows up, add it manually:

```bash
# macOS (zsh)
echo '. "$HOME/.cargo/env"' >> ~/.zshrc

# Linux (bash)
echo '. "$HOME/.cargo/env"' >> ~/.bashrc
```

Verify:

```bash
rustc --version   # should be >= 1.85.0
cargo --version
```

---

## Initial Setup

```bash
# Clone the repo
git clone https://github.com/jaredhoward/better-test-automation.git
cd better-test-automation

# Install TypeScript dependencies
pnpm install

# Build Rust crates (first build downloads + compiles dependencies, ~2-3 min)
cargo build
```

---

## Building

### Rust crates

```bash
# Debug build (fast compile, slow runtime)
cargo build

# Release build (slow compile, fast runtime)
cargo build --release

# Build a specific crate
cargo build -p bettertest-core
cargo build -p bettertest-cli
cargo build -p bettertest-napi
```

### TypeScript packages

```bash
# Build all packages
pnpm build

# Build a specific package
pnpm --filter @bettertest/runner build
pnpm --filter @bettertest/bdd build
pnpm --filter @bettertest/ai build
pnpm --filter @bettertest/reporter build
pnpm --filter @bettertest/selectors build
```

### Dashboard

```bash
# Dev server with hot reload
pnpm --filter @bettertest/dashboard dev

# Production build
pnpm --filter @bettertest/dashboard build

# Preview production build
pnpm --filter @bettertest/dashboard preview
```

---

## Running Tests

### Rust unit tests

```bash
# Run all Rust tests
cargo test

# Run tests for a specific crate
cargo test -p bettertest-core

# Run a specific test by name
cargo test -p bettertest-core -- selector::accessibility::tests::parse_button_intent

# Run tests with output visible
cargo test -- --nocapture

# Run only the execution graph tests
cargo test -p bettertest-core -- executor::graph::tests
```

### TypeScript unit tests

```bash
# Run all TS tests across packages
pnpm test

# Run tests for a specific package
pnpm --filter @bettertest/runner test
pnpm --filter @bettertest/bdd test

# Watch mode (re-run on file changes)
pnpm --filter @bettertest/runner test:watch

# Run with coverage
pnpm --filter @bettertest/runner test -- --coverage
```

### Type checking

```bash
# Check all packages
pnpm typecheck

# Check a specific package
pnpm --filter @bettertest/runner typecheck
```

---

## Running the CLI

```bash
# Run in dev mode (compiles + runs)
cargo run -p bettertest-cli -- --help
cargo run -p bettertest-cli -- run
cargo run -p bettertest-cli -- run --tag @smoke
cargo run -p bettertest-cli -- flaky --runs 50
cargo run -p bettertest-cli -- init --template bdd

# With verbose logging
cargo run -p bettertest-cli -- -v run

# After building release, run the binary directly
cargo build --release -p bettertest-cli
./target/release/bettertest run
```

---

## Linting & Formatting

### Rust

```bash
# Lint with Clippy (treats warnings as errors)
cargo clippy -- -D warnings

# Auto-format
cargo fmt

# Check formatting without applying
cargo fmt -- --check
```

### TypeScript

```bash
# Lint all packages
pnpm lint

# Format all files
pnpm format

# Check formatting without applying
pnpm format:check
```

---

## Running Tests Against the Demo App

The demo app (`apps/demo/`) is a simple login/dashboard web app that matches the `examples/login.feature` scenarios. This is the fastest way to see the full pipeline in action with a real browser.

**Prerequisites:** Google Chrome must be installed on your system.

### Start the demo app

```bash
pnpm demo                    # http://localhost:3000
# or on a different port
PORT=3001 pnpm demo
```

Pages:
- `/login` — Login form (email + password, error states, account lockout)
- `/dashboard` — Dashboard with welcome message

Valid credentials: `user@example.com` / `correct-password`

### Run tests against it

```bash
# Headless (default) — Chrome runs invisibly
pnpm exec tsx packages/runner/src/cli.ts \
  --testDir examples \
  --base-url http://localhost:3000 \
  --verbose

# Headed — watch Chrome execute the tests in real time
pnpm exec tsx packages/runner/src/cli.ts \
  --testDir examples \
  --base-url http://localhost:3000 \
  --headed --slow 3000 --keep-open \
  --verbose

# Headed without slow-motion (runs fast, browser stays open)
pnpm exec tsx packages/runner/src/cli.ts \
  --testDir examples \
  --base-url http://localhost:3000 \
  --headed --keep-open \
  --verbose

# Dry-run — no browser, just log what would happen
pnpm exec tsx packages/runner/src/cli.ts \
  --testDir examples \
  --dry-run \
  --verbose

# With retries (marks tests as flaky if they pass on retry)
pnpm exec tsx packages/runner/src/cli.ts \
  --testDir examples \
  --base-url http://localhost:3000 \
  --retries 2 \
  --verbose
```

### CLI flags

| Flag | Description |
|------|-------------|
| `--testDir <path>` | Directory containing `.feature` and `.steps.ts` files |
| `--base-url <url>` | Base URL of the app under test |
| `--headed` | Run with a visible Chrome window (maximized, brought to front) |
| `--headless` | Run Chrome invisibly (default) |
| `--slow <ms>` | Pause between steps so you can watch (e.g., `--slow 3000` for 3s) |
| `--keep-open` | Keep the browser open after tests finish (press Ctrl+C to close) |
| `--dry-run` | No browser — log actions only |
| `--retries <n>` | Retry failed tests up to N times (marks as `flaky` if pass on retry) |
| `--tags <tags>` | Comma-separated tag filter (e.g., `@smoke,@auth`) |
| `--failFast` | Stop on first failure |
| `-v, --verbose` | Show each action the context performs |
| `-c, --config <path>` | Path to config file |
| `-h, --help` | Show help |

### What the 4 scenarios test

| Scenario | What happens in the browser |
|----------|---------------------------|
| Successful login | Navigate → fill email + password → click Sign in → assert dashboard heading + welcome message |
| Invalid password | Fill wrong password → click → assert "Invalid email or password" error |
| Account lockout | 5 failed logins → assert "Account locked" message |
| Accessible form | Assert email/password labels exist and are visible |

### How semantic selectors resolve

The test steps use plain English selectors like `"the submit button"` and `"the email input"`. The `BrowserContext` resolves these against the live DOM using:

1. ARIA labels (`aria-label="Email address"`)
2. Label text (`<label>Email address</label>` → follows `for` to the input)
3. Button/heading text content
4. Role attributes (`role="alert"`) — prefers visible elements
5. Placeholder text
6. ID heuristics

If an element isn't found immediately, it retries 5 times with 200ms intervals (handles async DOM updates).

---

## Testing the Gherkin Parser

The BDD parser can be tested directly without a browser. This is a good starting point for development:

```typescript
// Quick test — paste into a scratch file and run with tsx
import { GherkinParser } from '@bettertest/bdd';

const parser = new GherkinParser();

const feature = parser.parse(`
@smoke
Feature: User Login
  As a user I want to log in

  Scenario: Successful login
    Given the user is on the login page
    When they enter valid credentials
    And they click the submit button
    Then they should see the dashboard
`, 'login.feature');

console.log(JSON.stringify(feature, null, 2));
```

Run it:

```bash
# After building
npx tsx test-parser.ts

# Or run the existing example
npx tsx examples/login.steps.ts
```

---

## Testing Semantic Selectors (Without a Browser)

The selector resolution logic can be unit-tested with mock DOM/accessibility trees:

```bash
# Run the Rust selector tests
cargo test -p bettertest-core -- selector

# These tests cover:
# - Intent parsing ("the submit button" -> role: button, name: "submit")
# - Accessibility-first resolution
# - Multi-strategy fallback
# - Confidence scoring
```

To test against a real browser using the demo app:

```bash
# Terminal 1: Start the demo app
pnpm demo

# Terminal 2: Run tests against it (headless)
pnpm exec tsx packages/runner/src/cli.ts --testDir examples --base-url http://localhost:3000 --verbose

# Or headed — watch Chrome execute the tests
pnpm exec tsx packages/runner/src/cli.ts --testDir examples --base-url http://localhost:3000 --headed --verbose
```

---

## Testing the NAPI Bridge

The NAPI bindings connect Rust → Node.js. After building:

```bash
# Build the native module
cargo build -p bettertest-napi

# The .node file will be in target/debug/
# Test it from Node.js:
node -e "
  const napi = require('./target/debug/libbettertest_napi.node');
  console.log(napi.createSelector('the submit button', null));
  console.log(napi.parseAccessibilityIntent('the email input field'));
"
```

---

## Testing the Dashboard

```bash
# Start the dev server
pnpm --filter @bettertest/dashboard dev
# Opens at http://localhost:5173

# Run dashboard tests
pnpm --filter @bettertest/dashboard test

# Type check the Svelte components
pnpm --filter @bettertest/dashboard typecheck
```

---

## Setting Up Ollama (AI Features)

The AI layer uses Ollama for local LLM inference. This is optional — the test runner works without it.

```bash
# Install Ollama
brew install ollama    # macOS
# or download from https://ollama.com

# Start the server
ollama serve

# Pull a model (llama3 is the default in bettertest.config.ts)
ollama pull llama3

# Verify it's running
curl http://localhost:11434/api/tags
```

Configure in `bettertest.config.ts`:

```typescript
export default defineConfig({
  ai: {
    provider: 'local',
    model: 'llama3',        // or any Ollama model
    endpoint: 'http://localhost:11434',
  },
});
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BETTERTEST_LOG` | `info` | Log level: `trace`, `debug`, `info`, `warn`, `error` |
| `CHROME_PATH` | (auto-detect) | Path to Chrome binary (overrides auto-detection) |
| `BETTERTEST_BROWSER` | `chromium` | Default browser |
| `BETTERTEST_HEADLESS` | `true` | Run browser headless |
| `BETTERTEST_BASE_URL` | — | Override config `baseUrl` |
| `BETTERTEST_WORKERS` | `auto` | Override worker count |
| `PORT` | `3000` | Port for the demo app |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama endpoint |

---

## Project Structure Quick Reference

```
better-test-automation/
├── crates/
│   ├── core/          # Rust core — protocol, selectors, executor, healing
│   ├── cli/           # CLI binary (bettertest command)
│   └── napi/          # Node.js native bindings
├── packages/
│   ├── runner/        # @bettertest/runner — test orchestration
│   ├── bdd/           # @bettertest/bdd — Gherkin parser + steps
│   ├── ai/            # @bettertest/ai — local/cloud AI
│   ├── reporter/      # @bettertest/reporter — HTML, JSON, JUnit
│   └── selectors/     # @bettertest/selectors — semantic selector API
├── apps/
│   ├── dashboard/     # Svelte reporting dashboard
│   └── demo/          # Demo login/dashboard app for testing
├── examples/          # Example tests, features, and config
└── docs/              # Documentation
```

---

## Troubleshooting

### `cargo build` fails with "edition 2024 is unsupported"

Your Rust toolchain is too old. Update:

```bash
rustup update stable
rustc --version   # should be >= 1.85.0
```

### `pnpm install` fails with workspace resolution errors

Make sure you're running pnpm v10+:

```bash
pnpm --version
npm install -g pnpm@latest
```

### NAPI build fails

The NAPI crate requires Node.js headers. Ensure Node.js >= 22 is installed and in your PATH.

### Dashboard `typecheck` fails on first run

SvelteKit generates its tsconfig on first build. Run the build first:

```bash
pnpm --filter @bettertest/dashboard build
# or
cd apps/dashboard && npx svelte-kit sync
```

### Chrome not found

The browser launcher auto-detects Chrome on macOS, Linux, and Windows. If it can't find it:

```bash
# Set the path explicitly
CHROME_PATH="/path/to/chrome" pnpm exec tsx packages/runner/src/cli.ts --testDir examples --base-url http://localhost:3000
```

Common paths:
- **macOS**: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- **Linux**: `/usr/bin/google-chrome` or `/usr/bin/chromium`
- **Windows**: `C:\Program Files\Google\Chrome\Application\chrome.exe`

### Chrome "SingletonLock" error

If Chrome crashes or gets killed, it can leave a lock file:

```bash
rm -f .bettertest/chrome-profile/SingletonLock
```

The launcher cleans this up automatically on next run, but if you see the error immediately after a crash, delete it manually.

### Port 3000 already in use

```bash
# Use a different port for the demo app
PORT=3001 pnpm demo

# Then point tests at it
pnpm exec tsx packages/runner/src/cli.ts --testDir examples --base-url http://localhost:3001
```

### Ollama connection refused

Make sure the Ollama server is running:

```bash
ollama serve
# In another terminal:
curl http://localhost:11434/api/tags
```
