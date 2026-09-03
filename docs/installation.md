# Installation

Four ways to install Better Test Automation, depending on your workflow.

---

## 1. npm / pnpm (Recommended)

The easiest way. Installs the CLI and all TypeScript packages.

```bash
# Global install — gives you the `bettertest` command
npm install -g @bettertest/cli

# Or with pnpm
pnpm add -g @bettertest/cli

# Verify
bettertest --version
```

The `bta` alias also works:

```bash
bta run
bta flaky
```

### As a project dependency

For teams that want to pin the version in their repo:

```bash
# Add to devDependencies
pnpm add -D @bettertest/cli @bettertest/runner @bettertest/bdd @bettertest/selectors

# Run via npx or pnpm exec
npx bettertest run
pnpm exec bettertest run
```

Add to your `package.json` scripts:

```json
{
  "scripts": {
    "test:e2e": "bettertest run",
    "test:e2e:smoke": "bettertest run --tag @smoke",
    "test:flaky": "bettertest flaky --runs 50"
  }
}
```

### Packages available on npm

| Package                 | Description                                     |
| ----------------------- | ----------------------------------------------- |
| `@bettertest/cli`       | CLI binary (the `bettertest` command)           |
| `@bettertest/runner`    | Test runner, config, orchestration              |
| `@bettertest/bdd`       | Gherkin parser + step definitions               |
| `@bettertest/selectors` | Semantic selector API                           |
| `@bettertest/ai`        | AI layer (Ollama + cloud)                       |
| `@bettertest/reporter`  | Built-in reporters (HTML, JSON, JUnit, console) |

---

## 2. Shell script (Linux / macOS)

One-line install — downloads the pre-built binary directly:

```bash
curl -fsSL https://raw.githubusercontent.com/jaredhoward/better-test-automation/main/scripts/install.sh | sh
```

Options via environment variables:

```bash
# Install a specific version
VERSION=0.2.0 curl -fsSL .../install.sh | sh

# Custom install directory (default: /usr/local/bin)
INSTALL_DIR=~/.local/bin curl -fsSL .../install.sh | sh
```

Supports:

- Linux x64 / arm64
- macOS x64 (Intel) / arm64 (Apple Silicon)

---

## 3. Cargo (Rust)

If you have Rust installed, build from source:

```bash
cargo install bettertest-cli
```

This compiles the CLI from crates.io. It takes a few minutes but gives you the latest version with full optimization.

Requires Rust 1.85+ (edition 2024).

---

## 4. Manual download

Download the binary for your platform from the [Releases page](https://github.com/jaredhoward/better-test-automation/releases):

| Platform                    | Binary                       |
| --------------------------- | ---------------------------- |
| Linux x64                   | `bettertest-linux-x64`       |
| Linux ARM64                 | `bettertest-linux-arm64`     |
| macOS x64 (Intel)           | `bettertest-darwin-x64`      |
| macOS ARM64 (Apple Silicon) | `bettertest-darwin-arm64`    |
| Windows x64                 | `bettertest-windows-x64.exe` |

Then move it to your PATH:

```bash
# macOS / Linux
chmod +x bettertest-darwin-arm64
sudo mv bettertest-darwin-arm64 /usr/local/bin/bettertest

# Verify
bettertest --version
```

---

## Quick start after install

```bash
# Initialize a new project
bettertest init --template bdd

# This creates:
#   bettertest.config.ts
#   e2e/
#     example.feature
#     steps/
#       example.steps.ts

# Run tests
bettertest run

# Run only smoke tests
bettertest run --tag @smoke

# Analyze flakiness
bettertest flaky

# Open the TUI
bettertest ui
```

---

## CI/CD installation

### GitHub Actions

```yaml
- name: Install Better Test Automation
  run: npm install -g @bettertest/cli

- name: Run tests
  run: bettertest run --reporters json --output test-results/
```

Or use the direct download for faster CI (no Node.js required for the binary):

```yaml
- name: Install Better Test Automation
  run: |
    curl -fsSL https://github.com/jaredhoward/better-test-automation/releases/download/v0.1.0/bettertest-linux-x64 -o /usr/local/bin/bettertest
    chmod +x /usr/local/bin/bettertest
```

### GitLab CI

```yaml
test:
  image: node:22
  before_script:
    - npm install -g @bettertest/cli
  script:
    - bettertest run
```

### Docker

```dockerfile
# Multi-stage: install binary
FROM node:22-slim AS base
RUN npm install -g @bettertest/cli

# Or direct binary
FROM ubuntu:24.04 AS base
RUN curl -fsSL https://github.com/jaredhoward/better-test-automation/releases/download/v0.1.0/bettertest-linux-x64 \
    -o /usr/local/bin/bettertest && chmod +x /usr/local/bin/bettertest
```

---

## Updating

```bash
# npm
npm update -g @bettertest/cli

# pnpm
pnpm update -g @bettertest/cli

# Cargo
cargo install bettertest-cli --force

# Shell script (reinstalls latest)
curl -fsSL .../install.sh | sh
```

---

## Uninstalling

```bash
# npm
npm uninstall -g @bettertest/cli

# Manual binary
rm /usr/local/bin/bettertest

# Cargo
cargo uninstall bettertest-cli
```
