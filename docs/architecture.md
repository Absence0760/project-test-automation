# Architecture

How Better Test Automation is built and why each layer exists.

---

## Design Principle

Cypress and Playwright are browser-automation libraries dressed up as test frameworks. Better Test Automation is a **test intelligence platform** — it understands *intent*, not just DOM interactions.

This distinction drives every architectural decision.

---

## System Layers

```
┌─────────────────────────────────────────────────────────┐
│                    User Authoring Layer                  │
│  .feature files  |  .test.ts files  |  natural language  │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│                   TypeScript Packages                    │
│                                                         │
│  @bettertest/runner    — orchestration, config, discovery│
│  @bettertest/bdd       — Gherkin parser, step registry  │
│  @bettertest/selectors — semantic selector API          │
│  @bettertest/ai        — local/cloud LLM integration    │
│  @bettertest/reporter  — console, HTML, JSON, JUnit     │
└───────────────────────────┬─────────────────────────────┘
                            │ NAPI-RS bridge
┌───────────────────────────▼─────────────────────────────┐
│                      Rust Core Engine                    │
│                                                         │
│  bettertest-core                                        │
│  ├── protocol/   — WebDriver BiDi + CDP fallback        │
│  ├── selector/   — multi-strategy semantic resolution   │
│  ├── executor/   — DAG-based parallel execution         │
│  └── healing/    — self-healing via DOM diffing          │
└───────────────────────────┬─────────────────────────────┘
                            │ WebDriver BiDi / CDP
┌───────────────────────────▼─────────────────────────────┐
│                     System Browser                       │
│          Chromium  |  Firefox  |  WebKit                 │
│          (no bundled browser — uses what's installed)    │
└─────────────────────────────────────────────────────────┘
```

---

## Why Rust + TypeScript?

| Layer | Language | Reason |
|-------|----------|--------|
| Test authoring | TypeScript | Familiarity — this is what the target audience writes daily |
| Gherkin/BDD | TypeScript | Step definitions are user code, must be JS-ecosystem native |
| AI integration | TypeScript | HTTP calls to Ollama, prompt building — no perf criticality |
| Browser protocol | Rust | WebSocket message parsing at high throughput, memory safety |
| Selector engine | Rust | DOM tree traversal, scoring, caching — hot path, must be fast |
| Execution graph | Rust | DAG scheduling, parallel coordination — concurrency is Rust's strength |
| Self-healing | Rust | DOM diffing across large trees — compute-intensive |
| CLI/TUI | Rust | Single binary distribution, fast startup, Ratatui for terminal UI |

The NAPI-RS bridge connects Rust ↔ Node.js with zero-copy where possible. TypeScript calls into Rust for performance-critical operations; Rust calls back into TypeScript for user-defined step handlers.

---

## Browser Protocol Strategy

```
Better Test Automation
        │
        ├── WebDriver BiDi (preferred)
        │   └── W3C standard, event-driven, bidirectional
        │       Works: Chrome 125+, Firefox 121+, Edge 125+
        │
        └── CDP fallback
            └── Chrome DevTools Protocol
                For browsers with incomplete BiDi support
```

**Why not bundle Chromium?**

Playwright bundles ~400MB of browsers. This creates:
- Huge `node_modules`
- Version lock-in (your tests run against Playwright's Chromium, not the browser your users have)
- CI cache bloat

Better Test Automation connects to the system browser via protocol. Your tests run against the same browser your users see.

---

## Semantic Selector Resolution Pipeline

```
"the submit button in the login form"
        │
        ▼
┌─ 1. Cache Check ──────────────────────┐
│  Have we resolved this before?         │
│  Is the cached element still valid?    │
│  YES → return cached  |  NO → continue │
└────────────────────────┬───────────────┘
                         ▼
┌─ 2. Accessibility Tree ───────────────┐
│  Parse intent → role + name + scope   │
│  Walk ARIA tree for matches           │
│  Score by: exact name > partial name  │
│  Confidence: 0.0 – 1.0               │
│  HIGH → return  |  LOW → continue     │
└────────────────────────┬───────────────┘
                         ▼
┌─ 3. Visual Heuristics ────────────────┐
│  Analyze layout: position, proximity  │
│  "Button at bottom of form group"     │
│  "Input next to 'Email' label"        │
│  Confidence: 0.0 – 1.0               │
│  HIGH → return  |  LOW → continue     │
└────────────────────────┬───────────────┘
                         ▼
┌─ 4. NLP Text Matching ────────────────┐
│  Match against: textContent,          │
│  placeholder, aria-label, tooltip     │
│  "Submit" = "Log in" = "Continue"     │
│  in submit-button context             │
│  Confidence: 0.0 – 1.0               │
└────────────────────────┬───────────────┘
                         ▼
         Best match above threshold?
         YES → cache + return
         NO  → ResolutionError
```

---

## Execution Graph

Traditional runners execute tests sequentially or with naive parallelism (split files across workers). Better Test Automation builds a **dependency graph**:

```
    ┌──────────┐
    │  login   │  ← no dependencies, runs first
    └────┬─────┘
         │
    ┌────▼─────┐     ┌──────────┐
    │ dashboard │     │ settings │  ← independent, run in parallel
    └────┬─────┘     └────┬─────┘
         │                │
    ┌────▼────────────────▼──┐
    │     checkout flow      │  ← depends on both, runs last
    └────────────────────────┘
```

The scheduler:
1. Builds a DAG from test dependency declarations
2. Detects cycles (error) and independent subgraphs
3. Sorts by failure probability (fail-fast: run most-likely-to-fail first)
4. Runs all ready nodes in parallel up to worker count
5. When a node completes, unlocks its dependents

---

## Self-Healing Flow

```
Test run N: selector resolves → PASS
        │
        │  (developer changes the UI)
        │
Test run N+1: cached selector fails
        │
        ▼
┌─ Healing Engine ──────────────────────┐
│  1. Load last-passing DOM snapshot    │
│  2. Load current DOM                  │
│  3. Compute DOM diff                  │
│  4. Find element matching fingerprint │
│     (tag, text, ARIA, position)       │
│  5. Generate new selector             │
│  6. Score confidence                  │
└────────────────────────┬──────────────┘
                         ▼
              Confidence > threshold?
             /                      \
           YES                       NO
            │                         │
   Apply fix automatically     Report as broken
   (with git diff for review)  (human must fix)
```

---

## Data Flow

```
bettertest run
     │
     ├── 1. Load config (bettertest.config.ts)
     ├── 2. Discover test files (glob patterns)
     ├── 3. Parse .feature files → AST
     ├── 4. Match steps to step definitions
     ├── 5. Build execution graph
     ├── 6. Launch browser via BiDi/CDP
     │
     │   ┌── Worker 1 ──┐  ┌── Worker 2 ──┐  ┌── Worker N ──┐
     ├── │  Run test A   │  │  Run test B   │  │  Run test C   │
     │   │  ├ navigate    │  │  ├ navigate    │  │  ├ navigate    │
     │   │  ├ resolve sel │  │  ├ resolve sel │  │  ├ resolve sel │
     │   │  ├ act         │  │  ├ act         │  │  ├ act         │
     │   │  ├ assert      │  │  ├ assert      │  │  ├ assert      │
     │   │  └ report      │  │  └ report      │  │  └ report      │
     │   └────────────────┘  └────────────────┘  └────────────────┘
     │
     ├── 7. Collect results
     ├── 8. Classify flakiness (if retries triggered)
     ├── 9. Propose healing (if selectors broke)
     ├── 10. Generate reports (console, HTML, JSON, JUnit)
     └── 11. Exit with code 0 (pass) or 1 (fail)
```

---

## Package Dependency Graph

```
@bettertest/runner
  ├── @bettertest/bdd         (parse .feature files)
  ├── @bettertest/selectors   (semantic selector API)
  └── @bettertest/reporter    (output results)

@bettertest/ai                (standalone — optional)

@bettertest/dashboard
  └── @bettertest/reporter    (shared types)

bettertest-cli (Rust)
  └── bettertest-core (Rust)

bettertest-napi (Rust)
  └── bettertest-core (Rust)
```

The runner is the main orchestrator. AI is intentionally decoupled — it enhances but is not required.
