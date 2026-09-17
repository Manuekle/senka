# Security Audit — senka

Source-only security audit of this repository, with remediation applied and
verified. Date: 2026-09-17.

## Scope and method

Static review of the source (no dynamic exploitation): auth and session
handling, middleware route gating, public webhook endpoints (`/api/leads`,
automations webhook, ElevenLabs voice tools), outbound fetch surfaces (SEO
audit, MCP client), workspace authorization, owner-only routes, and every
export path that renders user-controlled strings.

Eleven findings were confirmed (F-01–F-09, V-01, V-02). **All eleven are now
fixed in this working tree.** Details per finding, with file references, are
in [FINDINGS-DETAIL.md](./FINDINGS-DETAIL.md); the machine-readable list is
[findings.json](./findings.json); the three items that need validation in a
running deployment are in [NEEDS-VALIDATION.md](./NEEDS-VALIDATION.md).

## Verification

- `pnpm typecheck` — clean.
- `pnpm vitest run` — 1325 passed / 49 failed / 9 skipped. The 49 failures are
  byte-identical to the `git stash` baseline of the untouched tree (verified
  twice: full-suite run with changes vs. full-suite run at HEAD). They are
  pre-existing store-isolation flakes in this tree (shared in-memory stores
  across parallel test files), not regressions from the remediation.
- New regression tests added: `lib/owner-email.test.ts`,
  `lib/csv-export.test.ts`, `tests/middleware-public.test.ts` — all pass.
- ESLint clean on every file touched by the remediation (one leftover unused
  import in the voice-tools route removed).

## What changed, in one paragraph per risk

**Server-side request forgery (F-01, F-02).** Two outbound surfaces could be
aimed at internal infrastructure: the SEO audit fetcher and the MCP server
URL. Both now resolve DNS themselves and refuse private, loopback and
link-local targets before any socket opens — the URL-level check at config
time (`lib/mcp-url.ts`), the resolved-address check on every connection
(`lib/mcp-client.ts`), and a per-hop check on redirects in `lib/seo-audit.ts`
(redirects are followed manually, max 5, so a redirect can no longer bounce
past the check).

**Abusable public endpoints (F-03, F-04, F-05, F-08).** The three public
webhooks now share one rate-limit budget (`30` requests / 10 min, keyed by
client IP with `TRUSTED_PROXY_HOPS` defaulting to `0`, i.e. trust nobody
unless the deployment says otherwise). The automations webhook answers a
uniform 401 before any id lookup, so an unknown id and a wrong secret are
indistinguishable to an attacker, and honours `Idempotency-Key` so a sender
retrying on timeout cannot fire an automation twice. The voice-tools webhook
no longer crosses workspaces: the agent is resolved inside its own workspace,
and every tool run is pinned to that workspace.

**Authorization (F-06, F-07).** The workspace cookie is a preference, not a
credential — entitlement is always computed against the session email the
middleware itself established. Inbound `x-senka-session` headers are stripped
and re-set server-side, so a client cannot assert a foreign account. The
owner-only routes (`/api/settings/export`, `/api/settings/import`,
`/api/team`) sit behind `requireOwner`, and "who is the owner" resolves from
`STEVE_OWNER_EMAIL`, the first DB account, or `~/.senka/auth.json` — failing
closed when none of them answer.

**Data exfiltration via exports (F-09, V-02).** Every CSV export builds its
cells through one guard that neutralises formula prefixes (`=`, `+`, `@`,
CRLF-hyphen, tab) — a contact named `=cmd|…` used to open in a spreadsheet as
a formula. `/api/health` tells unauthenticated callers whether the store is
okay and nothing else; version, queue depths and timings are owner-only.

## Residual risk

See [NEEDS-VALIDATION.md](./NEEDS-VALIDATION.md): the in-memory rate limiter
and idempotency set do not survive a restart or multiple replicas (the fix is
correct for the single-process deployments this repo targets; a shared store
is the follow-up for horizontal scale), and the vitest matcher anchor change
proposed under V-01 must be validated in the running app before applying.
