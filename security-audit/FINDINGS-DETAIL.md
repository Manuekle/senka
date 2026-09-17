# Findings — detail and remediation

Severity: **critical** = internal network or cross-tenant data reachable,
**high** = attacker-visible state change or data leak, **medium** = bounded
abuse, **low** = hardening. Status reflects this working tree.

---

## F-01 — SSRF in SEO audit fetches — critical — FIXED

The SEO audit fetched whatever URL a scan targeted with node's `fetch` and
followed redirects transparently, so a scan of `http://internal-host/` (or a
public URL that 302'd to one) read internal services and returned their
bodies into the audit report.

**Remediation** (`lib/seo-audit.ts`): `guardedFetch` resolves the hostname
before connecting and refuses loopback, private (RFC 1918), link-local
(169.254.169.254 included — cloud metadata) and unique-local targets. It
follows redirects itself with `redirect: "manual"`, max 5 hops, re-resolving
and re-checking at every hop — a redirect can no longer carry the request
past the check. Used by both `fetchPage` and `fetchRobots`.

## F-02 — SSRF via MCP server URL and client — critical — FIXED

The MCP server URL was accepted over plain `http:`, accepted IP literals, and
the client connected without re-checking what the name resolved to.

**Remediation** (`lib/mcp-url.ts`, `lib/mcp-client.ts`): URL validation
rejects non-https, `localhost`, the private ranges, IPv6 literals (the space
is too wide to enumerate spellings) and every-numeric hosts —
`https://2130706433` is 127.0.0.1. The client's `assertAllowedDestination`
runs on **every** connection: re-resolves DNS and checks every resolved
address before the socket opens, with `redirect: "error"` on the underlying
fetch. Public MCP servers are reached by name, which is exactly what the
client-side check needs.

## F-03 — Public webhooks without rate limiting — high — FIXED

`/api/leads`, the automations webhook and the voice-tools webhook were open
ended: no budget per address, so a leaked URL could be hammered (and, for the
voice tools, used to burn paid ElevenLabs/tool quotas).

**Remediation**: all three now take from the shared `public-webhook` bucket
in `lib/rate-limit.ts` — 30 requests / 10 min per client address.

## F-04 — Automations webhook: existence oracle + replay — high — FIXED

Two defects in one route: an unknown id answered 404 and a known id with a
bad secret answered 401, so probing ids mapped the automation space; and a
sender retrying on timeout fired the automation twice (steps message people).

**Remediation** (`app/api/automations/[id]/webhook/route.ts`): the rate
budget is consumed **before** any lookup; auth answers a uniform 401 whatever
the id is; `Idempotency-Key` (validated: ASCII printable, ≤ 200 chars) is
deduped for 10 minutes in memory — a replay answers `{ok: true, replayed:
true}` and runs nothing.

## F-05 — Voice webhook crossed workspaces — high — FIXED

The route resolved agents across every workspace, so an agent id from
workspace A could be driven from a webhook whose trust came from workspace B.

**Remediation** (`app/api/webhooks/elevenlabs/tools/[agentId]/[tool]/route.ts`):
`workspaceCandidates()` (default workspace + registry businesses) is the only
place workspaces come from; the agent is looked up per-workspace through
`withWorkspace`; each tool run is pinned to the agent's own workspace
(`runTool(request, specName, agentName)` carries it through). An agent simply
does not exist outside its workspace now.

## F-06 — Workspace cookie treated as authorization — high — FIXED

`lib/workspace-request.ts` computed entitlement from the workspace cookie —
client-controlled state — so a member could switch into any business id.

**Remediation**: the cookie is a preference only. Entitlement is computed
against the trusted session email (the header the middleware itself sets),
with `/api/team` added to the recovery paths that may establish it.

## F-07 — Owner-only routes without an owner check — high — FIXED

`/api/settings/export` (full config download), `/api/settings/import`
(arbitrary config write) and `/api/team` (membership) answered any
authenticated session, and the middleware forwarded a client-supplied
`x-senka-session` header as if it were its own finding.

**Remediation**: the middleware strips any inbound `x-senka-session` and sets
it from the resolved session account (`lib/session-header.ts`);
`requireOwner` (`lib/owner-gate.ts`) gates all three routes; the owner
resolves from `STEVE_OWNER_EMAIL`, the first DB account (via synchronous
cache + `warmOwnerEmail()`) or the first account of `~/.senka/auth.json`,
failing closed whenever none answer (`lib/owner-email.ts`,
`lib/owner-email.test.ts` pins it). `BusinessEntry.ownerEmail` is stamped at
`createBusiness` from the session.

## F-08 — Client IP spoofable behind a proxy — medium — FIXED

`TRUSTED_PROXY_HOPS` defaulted to `1`, so a direct connection (no proxy) took
its client address from a spoofable header — and the rate limiter keyed on
that address.

**Remediation**: default is `0` (client = socket peer, headers ignored); the
enterprise deploy template sets `TRUSTED_PROXY_HOPS=1` explicitly, where a
reverse proxy is guaranteed by the topology. `lib/rate-limit.test.ts` pins
the new default.

## F-09 — CSV formula injection in exports — medium — FIXED

The inbox (and, by shared code, pipeline and CRM) exports wrote contact-
controlled strings into CSV unguarded: a contact named `=cmd|' /C calc'!A0`
or `+15000` opened in Excel as a formula.

**Remediation** (`lib/csv-export.ts`): one `csvCell()` for every export —
quotes, doubles embedded quotes, and prefixes the characters spreadsheets
evaluate (`=`, `+`, `@`, leading tab, `-` after a CRLF/CR/LF) with an
apostrophe, the marker both Excel and Google Sheets skip on open; `csvFile()`
adds the UTF-8 BOM and CRLF endings. `lib/csv-export.test.ts` pins the guard
against the real payload shapes.

## V-01 — Middleware `isPublic` matching ambiguity — low — FIXED (semantics pinned)

The public-path list was vulnerable to a prefix-matching reading
(`pathname.startsWith(entry)`), which would publish `/api/authorize` because
`/api/auth` is public. The implemented semantics are segment-anchored: an
entry matches when it equals the pathname or the pathname opens with
`entry + "/"`.

**Remediation**: semantics documented in `middleware.ts` and pinned by
`tests/middleware-public.test.ts` (`/api/auth` vs `/api/authorize`,
`/api/health` vs `/api/healthcheck`, `/api/billing/webhook` vs
`/api/billing/webhook-replay`, …). The separately-proposed vitest `matcher`
anchor change is **not** applied — see NEEDS-VALIDATION.md.

## V-02 — `/api/health` discloses internals — low — FIXED

The health endpoint returned version, queue depths and timings to anyone.

**Remediation** (`app/api/health/route.ts`): unauthenticated callers get
`{ok: storeOk}` — enough for a load balancer; the full body is owner-gated
through the F-07 owner gate.

