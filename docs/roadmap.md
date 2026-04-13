# Roadmap

Better Test Automation — phased delivery plan from foundation to intelligence layer.

---

## Phase 1 — Foundation & Differentiation (Months 1-3)

The goal is a working test runner that can execute basic tests against a real browser, with the architecture in place for everything that follows.

### Milestone 1.1: Core Engine (Weeks 1-4)

- [ ] WebDriver BiDi session management (connect, send commands, receive events)
- [x] CDP fallback for browsers that don't fully support BiDi yet — using puppeteer-core via CDP
- [x] Browser launcher — detect system Chrome on macOS/Linux/Windows, launch with remote debugging
- [x] Basic element interaction: navigate, click, fill, read text — via BrowserContext
- [x] Screenshot capture on failure — saves to `test-results/screenshots/`
- [ ] NAPI bridge — call Rust core from TypeScript via `bettertest-napi`

### Milestone 1.2: Semantic Selector Engine (Weeks 3-6)

- [x] Accessibility tree extraction — `page.accessibility.snapshot()` on first attempt, DOM strategies on retry
- [x] Intent parser — "the submit button in the login form" -> role + name + scope (keyword extraction + role inference)
- [x] Accessibility-first resolution (ARIA labels, label text → linked input)
- [x] NLP text matching fallback (button text, placeholders, headings, role text)
- [x] Visual/spatial heuristic fallback (submit button at form bottom, message elements by text, inputs near labels)
- [x] Multi-strategy resolver with auto-retry (6 strategies, 5 retries with 200ms interval)
- [x] Resolution cache — `.bettertest/selector-cache.json`, tried first on subsequent runs

### Milestone 1.3: Test Runner MVP (Weeks 5-8)

- [x] Test file discovery (glob patterns for `.feature` and `.steps.ts`)
- [x] Sequential test execution with step-level reporting
- [x] `bettertest.config.ts` loader — `defineConfig()` with deep merge defaults
- [x] Console reporter with pass/fail/skip output + timing
- [x] Basic retry logic — `--retries N`, marks tests as `flaky` if they pass on retry
- [x] `bettertest-run` CLI command — end to end with `--dry-run`, `--headed`, `--verbose`, `--base-url`, `--tags`

### Milestone 1.4: Gherkin/BDD Engine (Weeks 7-10)

- [x] Feature file parser (scenarios, backgrounds, outlines, data tables, doc strings)
- [x] Step definition registry with pattern matching + parameter extraction (string `{param}` + regex, quoted string support)
- [x] Step context API (`ctx.click()`, `ctx.fill()`, `ctx.assertVisible()`) — DryRunContext + BrowserContext
- [x] Background step execution before each scenario
- [x] Scenario Outline with Examples table expansion — parser + runner expand `<placeholders>` per row
- [x] Tag filtering (`--tags @smoke,@auth`)

### Phase 1 Exit Criteria

> A developer can write a `.feature` file with step definitions using semantic selectors,
> run `bettertest run`, and see results in the terminal. No data-testid attributes required.

---

## Phase 2 — Killer Features (Months 3-6)

This phase builds the features that make switching from Cypress/Playwright worth it.

### Milestone 2.1: Self-Healing Tests (Weeks 10-14)

- [ ] Element fingerprinting (tag, text, ARIA, attributes, bounding box)
- [ ] DOM snapshot capture on each run (serialized tree)
- [ ] DOM diff engine — compare last-passing snapshot vs current
- [ ] Drift detection — identify when a cached selector no longer matches
- [ ] Healing candidate search — find the closest matching element post-change
- [ ] Healing proposal with confidence score and human-readable explanation
- [ ] Auto-patch mode — apply the fix to the test file with a git-reviewable diff
- [ ] `--heal` flag on `bettertest run`

### Milestone 2.2: Flakiness Intelligence (Weeks 12-16)

- [ ] Per-step timing collection across runs
- [ ] Network request logging correlated with test steps
- [ ] Flakiness classifier:
  - Race condition (app state not ready when test acts)
  - Animation timing (CSS transitions interfering with assertions)
  - Network timing (slow/variable API responses)
  - Data dependency (test assumes specific DB state)
  - Environment (works locally, fails in CI)
- [ ] Root cause explanation (not just "flaky" — *why* it's flaky)
- [ ] Suggested fix per classification
- [ ] `bettertest flaky` CLI command with historical analysis
- [ ] JSON output for Flakey dashboard integration

### Milestone 2.3: Execution Graph (Weeks 14-18)

- [ ] Test dependency declaration (`dependsOn: ['login']`)
- [ ] DAG construction with cycle detection
- [ ] Parallel worker pool (configurable count, default = CPU cores - 1)
- [ ] Ready-node scheduling — run independent tests concurrently
- [ ] Fail-fast with dependency awareness (skip dependents of failed tests)
- [ ] Smart test ordering — run most-likely-to-fail first (ML heuristics from historical data)
- [ ] `--workers N` flag

### Milestone 2.4: AI Step Inference (Weeks 16-20)

- [ ] Ollama integration for local LLM inference
- [ ] Step suggestion from partial Gherkin (autocomplete next steps)
- [ ] DOM-aware suggestions (feed current page state to the model)
- [ ] Flakiness explanation via LLM (augment the classifier with natural language)
- [ ] Selector fix suggestion via LLM (when self-healing confidence is low)
- [ ] Privacy-first — all inference runs locally by default, no data leaves the machine

### Phase 2 Exit Criteria

> Tests self-heal when the UI changes. Flaky tests get a root cause classification and
> fix suggestion. Independent tests run in parallel automatically. AI suggests next steps
> while writing Gherkin.

---

## Phase 3 — Ecosystem & DX (Months 6-9)

Polish the developer experience and build the ecosystem integrations.

### Milestone 3.1: CLI & TUI (Weeks 20-24)

- [ ] Interactive TUI dashboard (Ratatui) — live test status, timing, flakiness
- [ ] Watch mode — re-run affected tests on file change
- [ ] `bettertest init` — scaffold a new project (templates: minimal, bdd, full)
- [ ] `bettertest check` — lint/validate test files before running
- [ ] `bettertest generate` — generate tests from session recordings
- [ ] Colorized, grouped terminal output with progress bars
- [ ] `--ui` flag to open TUI instead of streaming output

### Milestone 3.2: Reporters & Dashboard (Weeks 22-26)

- [ ] HTML reporter — self-contained single-file report with interactive UI
- [ ] JSON reporter — structured output for CI pipelines
- [ ] JUnit XML reporter — Jenkins/GitHub Actions/GitLab CI compatible
- [ ] Pluggable reporter API — `implements Reporter` interface
- [ ] Screenshot + video diff integration (visual regression)
- [ ] Svelte dashboard — real-time results, flakiness trends, healing log
- [ ] Flakey integration — push results to Flakey's PostgreSQL backend

### Milestone 3.3: IDE & Editor Plugins (Weeks 24-30)

- [ ] VS Code extension:
  - Inline step validation (red squiggle on unmatched steps)
  - Autocomplete for step definitions
  - Run/debug individual scenarios from the editor
  - Inline failure previews (screenshot + error beside the failing line)
- [ ] Neovim LSP plugin (same feature set via Language Server Protocol)
- [ ] JetBrains plugin (IntelliJ, WebStorm)

### Milestone 3.4: CI/CD Integrations (Weeks 26-32)

- [ ] GitHub Actions — first-party action with intelligent caching
- [ ] GitLab CI template
- [ ] Bitbucket Pipelines template
- [ ] Artifact upload — screenshots, videos, reports as CI artifacts
- [ ] PR comment bot — post test summary + flakiness warnings on pull requests
- [ ] Merge gate — block merge if new flaky tests are detected

### Phase 3 Exit Criteria

> A team can adopt Better Test Automation in CI with one config file, get reports in their
> preferred format, and write tests with IDE autocomplete. The dashboard shows trends
> over time.

---

## Phase 4 — Intelligence Layer (Months 9-12)

The features that make this a *platform*, not just a runner.

### Milestone 4.1: Test Generation (Weeks 32-38)

- [ ] Session recording capture (browser extension or proxy-based)
- [ ] User flow → Gherkin feature file generator
- [ ] Natural language → test code ("test that a user can checkout with a credit card")
- [ ] Component graph analysis — identify untested interaction paths
- [ ] Coverage gap report — compare test suite vs app surface area

### Milestone 4.2: Regression Prediction (Weeks 36-42)

- [ ] Git diff analysis — which files/functions changed?
- [ ] Test↔code mapping — which tests exercise which code paths?
- [ ] Probability model — given this diff, which tests are most likely to fail?
- [ ] `bettertest run --smart` — run only predicted-to-fail tests first, then the rest
- [ ] CI optimization — reduce pipeline time by 50-80% on typical PRs

### Milestone 4.3: Cross-Browser Matrix (Weeks 38-44)

- [ ] Chromium (Chrome, Edge) — full BiDi support
- [ ] Firefox — BiDi + CDP fallback
- [ ] WebKit (Safari) — protocol adapter
- [ ] Mobile viewports (responsive testing)
- [ ] Browser version matrix in config
- [ ] Parallel cross-browser execution

### Milestone 4.4: Platform APIs (Weeks 40-48)

- [ ] REST API for the dashboard (query results, trends, flakiness)
- [ ] Webhook integrations (Slack, Teams, PagerDuty on failure)
- [ ] Plugin system — extend selectors, reporters, AI providers
- [ ] Config-as-code — version-controlled test infrastructure
- [ ] Multi-project support — single dashboard for multiple repos

### Phase 4 Exit Criteria

> Given a git diff, the system predicts which tests will fail and runs them first.
> Tests can be generated from plain English or user session recordings. The dashboard
> serves as a team-wide testing intelligence hub.

---

## Beyond v1.0

Future directions after the initial 12-month roadmap:

- **Distributed execution** — run tests across multiple machines
- **API testing** — extend beyond browser to REST/GraphQL/gRPC
- **Performance testing** — lighthouse-style metrics as test assertions
- **Accessibility auditing** — built-in a11y checks (not just selectors)
- **Mobile native** — Appium/XCTest integration for iOS/Android
- **SaaS offering** — hosted dashboard + cloud execution (monetization via Flakey)

---

## Tracking

Progress is tracked in this repo. Each milestone maps to a set of GitHub issues. Use labels:

- `phase:1` through `phase:4`
- `milestone:1.1` through `milestone:4.4`
- `priority:critical`, `priority:high`, `priority:medium`, `priority:low`
- `type:feature`, `type:infra`, `type:dx`, `type:docs`
