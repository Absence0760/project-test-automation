# Security policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Use GitHub's [private vulnerability reporting](../../security/advisories/new) —
it opens a private advisory visible only to the maintainers, and it works
without exposing a contact address publicly. Enable it once under
**Settings → Code security → Private vulnerability reporting** if the link 404s.

Include:

- A description of the vulnerability and its impact
- Steps to reproduce (PoC if possible)
- The commit SHA or released version where you observed it

You can expect an acknowledgement within 72 hours and a triage decision within
7 days.

## Threat model notes

This project executes tests against a browser and ships a CLI plus a set of npm
packages. The two areas worth the most scrutiny:

- **The published artifacts.** `release.yml` publishes `@bettertest/*` to npm and
  uploads CLI binaries to the GitHub release. A compromise of `NPM_TOKEN` or of
  the release workflow is the highest-impact failure mode in the repo.
  Publishing is gated on the released commit being on `main` with a green
  `CI gate`, tarballs carry npm provenance, and binaries ship with SHA-256
  checksums.
- **Test-file execution.** The runner loads and executes user-supplied step
  definitions and config (`bettertest.config.ts`). That is by design — the same
  trust model as any test runner — but it means running someone else's test
  suite is equivalent to running their code.

## Defensive scaffolding in this repo

- **Secret scanning** — `.github/workflows/gitleaks.yml` scans every push, every
  PR, and the full history weekly. `.pre-commit-config.yaml` runs the same scan
  locally before commit.
- **Dependency review** — `.github/workflows/audit.yml` runs `pnpm audit` and
  `cargo audit` weekly and opens a tracking issue on findings.
- **Static analysis** — `.github/workflows/security.yml` runs CodeQL over
  TypeScript, Rust, and the Actions workflows on every PR and weekly.
- **Supply-chain scoring** — `.github/workflows/scorecard.yml` runs OpenSSF
  Scorecard weekly; results flow to the Security tab and to scorecard.dev.
- **Automated updates** — `.github/dependabot.yml` opens grouped weekly PRs for
  npm, cargo, and GitHub Actions.

## Out of scope

- Issues in dependencies — please report upstream, then optionally let us know.
- Issues that require a malicious maintainer or a compromised developer machine.
- Anything requiring the attacker to already control the test files being run
  (see "Test-file execution" above).
