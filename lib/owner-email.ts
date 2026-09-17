import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { sharedPool } from "./postgres-pool";

/**
 * Who the installation's owner is — the one question the owner-only routes
 * hinge on.
 *
 * Auth is intentionally account-shaped, not role-shaped: an account is an
 * account, and the install is single-owner, so "the owner" has exactly one
 * meaning — the email the installation was claimed with. Three sources, in
 * the order the deployment shapes offer them:
 *
 *   `STEVE_OWNER_EMAIL` — the explicit answer. Set it and the file and the
 *     database are never consulted, which is also what makes the answer
 *     testable without either.
 *
 *   the auth database's first account row — what a Postgres deploy has; its
 *     insert order is the takeover order, because the first accepted signup
 *     is the claim (see lib/auth/signup-policy.ts).
 *
 *   the first account in ~/.senka/auth.json — what a single-host install
 *     has; same takeover order, and the legacy pre-multi-account `owner`
 *     block counts as first by definition.
 *
 * Everything fails closed: no source answers, or the file is unreadable, and
 * `false` comes back — the owner-only routes stay closed until the question
 * can actually be answered.
 */
export function isOwnerEmail(email: string | undefined | null): boolean {
  const normalised = email?.trim().toLowerCase();
  if (!normalised) return false;

  const explicit = process.env.STEVE_OWNER_EMAIL?.trim().toLowerCase();
  if (explicit) return explicit === normalised;

  if (process.env.WORKFLOW_POSTGRES_URL?.trim()) {
    // Synchronous judgement, asynchronous answer is impossible — so the
    // first account email is kept here once a connection has fetched it,
    // and refusals before that are refusals, not guesses.
    return ownerEmailCache === normalised;
  }

  try {
    const parsed = JSON.parse(readFileSync(join(homedir(), ".senka", "auth.json"), "utf-8")) as {
      owner?: { readonly email?: unknown };
      accounts?: ReadonlyArray<{ readonly email?: unknown }>;
    };
    const first = parsed.accounts?.[0]?.email ?? parsed.owner?.email;
    return typeof first === "string" && first.trim().toLowerCase() === normalised;
  } catch {
    return false;
  }
}

/** The first account email the database reported, if it ever has. */
let ownerEmailCache: string | undefined;
let ownerEmailQuery: Promise<void> | undefined;

/**
 * Fills the synchronous cache from the auth database. Call it where the
 * request path is already asynchronous (route handlers, middleware); until it
 * resolves, `isOwnerEmail` declines DB-mode answers rather than guessing.
 */
export function warmOwnerEmail(): void {
  if (!process.env.WORKFLOW_POSTGRES_URL?.trim() || ownerEmailQuery) return;
  ownerEmailQuery = (async () => {
    try {
      const result = await sharedPool().query<{ email: string }>(
        "SELECT email FROM senka.accounts ORDER BY created_at ASC, id ASC LIMIT 1",
      );
      const email = result.rows[0]?.email;
      ownerEmailCache = typeof email === "string" ? email.trim().toLowerCase() : undefined;
    } catch {
      // Unreachable database: the cache stays unset and the gate stays shut.
    }
  })();
}