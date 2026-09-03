# Contributing

Thanks for considering a contribution. This file describes how to work in this repo.

## Before you start

- Open an issue (or comment on an existing one) describing what you want to change. For non-trivial changes, get rough agreement on the approach before opening a PR — it's easier to redirect a sentence than a 500-line diff.
- Look at recent commits in the area you're touching for style cues.
- Dev setup is in `docs/installation.md`; `docs/local-testing.md` covers running the suite end to end against the demo app.

## Branching

Work on a feature branch off `main`:

```
git checkout -b feat/<short-slug>      # for features
git checkout -b fix/<short-slug>       # for bug fixes
git checkout -b chore/<short-slug>     # for tooling / housekeeping
git checkout -b docs/<short-slug>      # for docs only
```

Keep branches short-lived. If you're working on something that'll take more than a couple of days, rebase onto `main` regularly to avoid drift.

## Commits

Use conventional-commit-style messages:

```
feat(scope): add the thing
fix(scope): stop the crash on Y
chore(scope): bump dependency Z
docs(scope): clarify the setup steps for X
```

Scope is the area you're touching (e.g. `core`, `runner`, `bdd`, `selectors`, `reporter`, `cli`, `panel`, `dashboard`, `ci`). Keep the subject line under 70 characters; put rationale in the body if the change isn't self-evident.

## Tests + docs are part of the change

Per the rule in `CLAUDE.md`: every PR that touches code also touches tests and docs in the same diff. If a change is genuinely untestable (config, pure styling, a one-line constant), say so in the PR description — don't skip silently.

## Running the checks locally

These are exactly what the `CI gate` runs, so a clean pass here means a clean PR.

```
pnpm install --frozen-lockfile          # bootstrap
pnpm format:check                       # prettier
pnpm build                              # required before test — see below
pnpm test                               # unit / integration tests

cargo fmt -- --check                    # rustfmt
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace

pre-commit run --all-files              # gitleaks + the other hygiene hooks
```

`pnpm build` before `pnpm test` is not optional: workspace packages expose
`exports` pointing at `dist/`, so any test that imports across packages (for
example `runner` -> `reporter`) fails to resolve until they are built.

## Opening a PR

- Title: same conventional-commit format as commits.
- Description: fill in the `pull_request_template.md`. The "Money / data safety checklist" is there for a reason — even ticking the boxes is a useful prompt to think through each item.
- Mark as **Draft** while CI is still running; flip to ready when checks are green.
- Don't squash on merge unless you're cleaning up a noisy WIP series — preserving meaningful commits in `main` makes `git blame` more useful.

## Reviewing a PR

- Pull the branch locally, run the test suite, exercise the change manually if it's user-visible.
- Check the labels the `labeler` workflow applied — they tell you at a glance whether a PR touches the Rust core, the published packages, or just docs.

## Security findings

If you discover a vulnerability, **do not** open a public issue or PR. Use GitHub's private vulnerability reporting — `SECURITY.md` has the link, the threat-model notes, and the response SLA.
