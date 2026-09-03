# The required `CI gate` check has exactly one emitter

The single required status check on `main` is a job **named** `CI gate`. Only
`ci.yml` may declare it.

This used to be done with two workflows: `ci.yml` skipped itself wholesale on a
docs-only diff via `paths-ignore`, which would have left the required context
pending forever, so a companion `ci-gate-docs.yml` triggered on the inverse
paths and reported an identically named check that passed trivially.

That pattern is unsafe, and the reason is not obvious: **GitHub does not require
every check sharing a name to pass.** A PR touching both code and docs triggers
both workflows, and the trivial one goes green in ~2 s while the real jobs are
still queued. On `project-running` PR #457 the result was
`mergeStateStatus = UNSTABLE` — mergeable — with `CI gate = success` and 40 real
checks pending. In a repo whose convention asks for a docs update alongside most
changes, that window is open on most PRs.

`ci-gate-docs.yml` was removed from `base` for that reason. The pattern that
replaces it, in `ci.yml` alone:

- Drop `paths-ignore` — the workflow **always** runs, so it always reports.
- Put the docs/code decision in a `changes` filter job, and gate the heavy jobs
  on its output (`if: needs.changes.outputs.code == 'true'`).
- Leave `ci-gate` as the aggregator over every job with `if: always()`. A
  _skipped_ job already counts as passing, which is GitHub's own required-check
  semantics — so a docs-only PR reports the gate green without a second
  workflow faking the context.

A docs-only PR then costs one trivial job instead of ~19, the required check is
always real, and there is only ever one thing publishing it.

**If your repo still has `ci-gate-docs.yml`:** it is carrying the #457 window.
Migrating means editing `ci.yml` (remove `paths-ignore`, add the `changes`
filter, gate the heavy jobs) and deleting the companion — do those in one
change, because deleting the companion while `paths-ignore` is still there
wedges docs-only PRs on a pending required check.

`project-running` guards the invariant in a test rather than by review, because
a second emitter fails _green_ and is invisible from the PR page — see its
`apps/web/src/lib/security_guards.test.ts` and ADR §700.
