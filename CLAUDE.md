# Better Test Automation

Next-generation test automation platform. Not just browser automation — a **test intelligence platform** that understands intent, not just DOM interactions.

## Architecture

**Monorepo**: Cargo workspace (Rust) + pnpm workspace (TypeScript/Svelte)

### Rust Crates (`crates/`)
- `bettertest-core` — Browser protocol (WebDriver BiDi + CDP fallback), semantic selector engine, execution graph, self-healing engine
- `bettertest-cli` — CLI/TUI interface (Ratatui)
- `bettertest-napi` — Node.js native bindings via NAPI-RS

### TypeScript Packages (`packages/`)
- `@bettertest/runner` — Test runner orchestration
- `@bettertest/bdd` — First-class Gherkin/BDD engine (custom parser, not Cucumber-JS)
- `@bettertest/ai` — AI layer (local LLM via Ollama + optional cloud)
- `@bettertest/reporter` — Reporting (HTML, JSON, JUnit) + Flakey integration
- `@bettertest/selectors` — Semantic selector TypeScript API

### Apps (`apps/`)
- `dashboard` — Svelte reporting/analytics dashboard

## Key Technical Decisions
- **Runtime**: Node.js + Rust hybrid (TS for authoring, Rust for performance-critical paths)
- **Browser Protocol**: WebDriver BiDi (W3C standard) with CDP fallback
- **No Chromium bundling** — uses system browser or connects via protocol
- **BDD is first-class** — native Gherkin parser, not a plugin
- **Semantic selectors** — select by intent ("click the submit button") not DOM structure
- **Self-healing** — broken selectors are auto-detected and fix-proposed via DOM diffing
- **AI is local-first** — Ollama/llama.cpp for privacy, optional cloud for power users

## Dev Commands

```bash
# Install dependencies
pnpm install

# Build Rust crates
cargo build

# Build all TS packages
pnpm build

# Run Rust tests
cargo test

# Run TS tests
pnpm test

# Lint
cargo clippy -- -D warnings
pnpm lint

# Format
cargo fmt
pnpm format

# Build CLI release
cargo build --release -p bettertest-cli

# Run CLI in dev
cargo run -p bettertest-cli -- --help
```

## Conventions
- **Rust**: Follow standard Rust idioms. Use `thiserror` for library errors, `anyhow` for CLI errors. Prefer `Result<T>` over panics.
- **TypeScript**: Strict mode. No `any`. Use Vitest for testing. ESM-only.
- **Git**: Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
- **Naming**: Rust = snake_case. TypeScript = camelCase. Package scoping = `@bettertest/`.
- **Testing**: Every module gets unit tests. Integration tests go in `tests/` at crate/package root.
- **Error handling**: Typed errors with context. No swallowed errors. No `unwrap()` in library code.

## Deep-Dive Docs
When working on a specific area, read the relevant doc for full context:
- `docs/architecture.md` — system layers, data flow, resolution pipeline diagrams
- `docs/semantic-selectors.md` — how the selector engine works, confidence scoring, healing connection
- `docs/roadmap.md` — phased milestones with checklists (check what's done vs TODO)
- `docs/competitor-grid.md` — feature comparison vs Cypress/Playwright/WebdriverIO/Selenium
- `docs/local-testing.md` — build/test/run commands, Ollama setup, troubleshooting

## Competitive Moats (Keep These Central)
1. **Flakiness intelligence** — root cause analysis, not just retry
2. **Semantic selectors** — intent-based, not DOM-structural
3. **Self-healing** — automatic selector repair with git-diff review
4. **Native BDD** — Gherkin without plugins
5. **Local AI** — codebase-aware without cloud privacy concerns
6. **Execution graph** — dependency-based parallelism, not sequential steps
