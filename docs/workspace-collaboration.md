# Workspace collaboration and monthly extras

Approved direction: one workspace included; every newly purchased workspace has
its own monthly subscription. Existing workspaces remain available without a
retroactive charge. Enterprise's existing perpetual license remains unchanged;
new extras use the same explicitly purchased monthly product.

## Execution

Each background collaboration run and API request pins its business context.
Browser selection uses a cookie; changing it does not move running jobs. Existing
inbound channels retain the installation's configured business until channel
routing is explicitly configured; a browser selection is not channel routing.

Changes to contacts, deals and agent definitions are captured in the business
document transaction. An Eve schedule drains those events with a deterministic
coordinator. Participating agents speak once per event, receive previous
messages, actions and saved team memory, and return a bounded structured
response: a message, a memory handoff and up to three internal CRM actions
(contact status, note or attribute; deal stage or note). Actions touch only the
records in that round, never move anything to paid, won or lost, and run in the
reply's transaction outside change capture, so a round never triggers itself.
A refused action is kept as skipped with its reason. The team sends no
messages, payments or bookings.

A workspace nobody has configured is automatic: every active agent (up to six)
participates and the team switches on once two exist. Choosing participants or
pausing makes it manual. The owner only watches the feed. Pause stops new
calls; an already running call can finish.

PostgreSQL is required for autonomous processing and paid workspace provisioning:
both features require cross-process transaction locks and must fail closed when
the configured database is unavailable. No file fallback for these operations.
Runs have expiring leases, persisted checkpoints, bounded retries, a daily call
budget and output limits. Model usage is attributed to the business and agent.

## Purchases

The server reads a configured Stripe monthly Price, shows its actual amount and
currency, then opens Checkout after the user chooses to pay. A pending purchase
has a stable ID, reused on retries. Only a verified webhook plus a fetched Stripe
subscription with paid invoice can activate it. A browser redirect never grants
access. Subscription cancellation and payment state affect only that workspace.
Cancel at period end preserves paid access; archived workspaces keep their data.
Existing base-plan webhooks must ignore workspace subscription events.

Workspace provisioning, access and purchase state commit in one PostgreSQL
transaction using one connection. Duplicate webhook deliveries are serialized
per subscription, including when the connection pool has only one slot.

## Activation

1. Configure `WORKFLOW_POSTGRES_URL` and a model provider in Settings.
2. Configure the platform Stripe key and `STRIPE_PLATFORM_WEBHOOK_SECRET`.
   Set `STRIPE_WORKSPACE_PRICE_ID` to a fixed, licensed monthly Price. The
   selected Price determines the extra workspace's amount and currency.
3. Point Stripe webhooks at `/api/billing/webhook`, subscribing to
   `checkout.session.completed`, `checkout.session.expired`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.paid` and `invoice.payment_failed`.
4. Nothing to switch on: with two active agents the team starts itself (Runtime
   → Team shows it). Turn off Automatic there only to pick participants by hand.
   Changes captured after the team is on appear in the spectator feed.
5. Build and run Eve with `pnpm build:eve` and `pnpm start:eve` so its schedule
   runs automatically. `STEVE_CRON_TEAM` overrides the default minute cadence
   at build time. `eve dev` does not run cron; under `pnpm dev` the root
   `instrumentation.ts` runs the same coordinator every minute instead
   (`STEVE_DEV_TEAM_TICK=0` disables it, since ticks can spend AI credits).

Development dispatch can consume model credits. Billing integration tests mock
Stripe; they do not create subscriptions or verify a live payment.

## Verification

Cover concurrent business contexts, atomic change capture, no-op writes,
cross-worker leases and stale results, restart checkpoints, budget exhaustion,
duplicate/forged/unpaid purchase events and cancellation. Run TypeScript, focused
Vitest suites, ESLint on changed files and the Eve build.

Run `pnpm test` and `pnpm typecheck`. For database integration, set
`SENKA_TEST_DATABASE_URL` to a disposable PostgreSQL database whose name ends
in `_test`, then run `pnpm exec vitest run lib/team-postgres.test.ts`.
This suite exercises real transactions with a one-connection pool, concurrent
workers, duplicate provisioning and workspace suspension. Provider calls and
Stripe responses remain mocked. Invalid structured model responses with
reported usage are metered even when the coordinator retries them.
