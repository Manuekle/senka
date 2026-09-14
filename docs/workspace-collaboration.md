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
coordinator. Selected active agents speak once per event, receive previous
messages and saved team memory, and return a bounded structured response.
The first release shares analysis and next steps; it does not invent execution
of external actions. The operator configures the team once and watches its feed.
Pause stops new calls; an already running call can finish.

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

## Verification

Cover concurrent business contexts, atomic change capture, no-op writes,
cross-worker leases and stale results, restart checkpoints, budget exhaustion,
duplicate/forged/unpaid purchase events and cancellation. Run TypeScript, focused
Vitest suites, ESLint on changed files and the Eve build.
