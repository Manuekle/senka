# Needs validation

Items that are implemented but cannot be fully verified from source alone —
they need a running deployment or an operator decision.

## 1. In-memory rate limiting and idempotency (F-03, F-04)

The `public-webhook` bucket and the `Idempotency-Key` dedupe live in the
process. Correct for the single-process deployments this repo targets, but:

- a restart forgets both (a retried delivery can run twice across a
  redeploy; the rate budget resets);
- multiple replicas each keep their own counters and sets.

**Validate before scaling out**: move both to a shared store (the DB store
already in the repo is enough) once more than one replica runs.

## 2. Vitest `matcher` anchor (V-01)

The proposed tightening of the middleware matcher anchor makes the middleware
run on Next's compiled `_next` internals. `isPublic` itself is
segment-anchored and pinned by `tests/middleware-public.test.ts`, but the
matcher change needs a smoke test in the running app (asset loading, RSC
payloads) before it is applied. **Deliberately not applied.**

## 3. Owner warm-up in the DB backend (F-07)

`isOwnerEmail` in DB mode answers from a synchronous cache that
`warmOwnerEmail()` fills. Until it is warmed, owner-gated routes fail closed
(decline). **Validate** that the production boot path calls
`warmOwnerEmail()` (or that the first session does) — otherwise the owner is
locked out of `/api/settings/*` and `/api/team` until something warms it.

## 4. Voice-tools workspace pinning under real traffic (F-05)

The pinning is verified by reading the code and by the suite as it exists,
but the five pre-existing failures in `tests/api/voice-tools-route.test.ts`
(masking store-isolation flakes) predate this work and limit what that file
can prove. **Validate** one live call per tool (book_appointment,
set_reminder, knowledge search) against a real workspace after deploy.

## 5. Pre-existing test failures (not this remediation)

49 tests fail identically at HEAD and with the remediation (verified by full
`vitest run` on both trees). They trace to shared in-memory stores across
parallel test files (`business-store`, `media-store`, `automations`,
`propose_automation`, …). Fixing that isolation is its own task and is a
prerequisite for trusting the suite as a regression net.
