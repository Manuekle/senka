import { join } from "node:path";
import { homedir } from "node:os";
import { nanoid } from "nanoid";
import { createDocumentStore } from "./doc-store";
import type { AuditIssue, AuditIssueType, LighthouseErrorCode, LighthouseScores } from "./seo-audit";

// The audit history of the SEO panel: every crawl this business has run, with
// the state it finished in.
//
// Search Console says what happened after the fact; an audit says what the
// site looks like right now. The record kept here is deliberately the part a
// table needs — date, URL, status, pages, Lighthouse — plus the issues the
// crawl found, so a future detail view has something to read. The full page
// inventory is not kept: a 10.000-page crawl that stored every page would
// be megabytes nobody opens, and the issue list is the part that gets read.
//
// Scoped to the business, like the change log: two shops on one install have
// two sites and two audit histories.

const STORE_FILE = join(homedir(), ".senka", "seo-audits.json");

/** How many audits stay in the list. Enough to compare a before and after
 *  across months; few enough that the document stays kilobytes. */
const KEEP = 20;

/** The crawl writes progress to this store as it goes, which is what lets the
 *  table's polling show a live page count. If those writes stop arriving for
 *  this long, the run is dead — a restarted server, a frozen serverless
 *  instance — and the list says so instead of showing "running" forever. */
const STALE_MS = 10 * 60 * 1000;

export type SeoAuditStatus = "running" | "done" | "failed";

export type SeoAudit = {
  readonly id: string;
  /** The URL exactly as the operator entered it, normalized to https. */
  readonly url: string;
  readonly status: SeoAuditStatus;
  readonly createdAt: string;
  readonly finishedAt?: string;
  /** The page cap asked for — 10 to 50. What "Pages" reports is what the
   *  crawl actually reached, which can be fewer. */
  readonly maxPages: number;
  /** Pages fetched so far. Moves while `status` is "running". */
  readonly pagesCrawled: number;
  readonly includeLighthouse: boolean;
  /** `null` when Lighthouse was asked for and could not run; absent when it
   *  was never asked for. */
  readonly lighthouseScores?: LighthouseScores | null;
  /** Why Lighthouse could not run, as a code the UI translates. One of
   *  "quota" (PageSpeed's anonymous quota is exhausted), "timeout" or
   *  "unavailable". Absent when scores exist or it was never asked for. */
  readonly lighthouseError?: LighthouseErrorCode;
  /** Issue totals by kind, the fastest read of how bad the site is. */
  readonly issueCounts?: Readonly<Record<string, number>>;
  /** The issues themselves, capped. The first pages crawled are the ones the
   *  operator can fix first. */
  readonly issues?: readonly AuditIssue[];
  /** Why a run failed, in a sentence. Not translated: it is the crawler's
   *  own diagnosis, shown as-is. */
  readonly error?: string;
  /** Last progress write. Age is what the staleness guard reads. */
  readonly heartbeatAt: string;
};

type SeoAuditStore = {
  audits: SeoAudit[];
};

function empty(): SeoAuditStore {
  return { audits: [] };
}

function normalize(parsed: Partial<SeoAuditStore>): SeoAuditStore {
  return {
    audits: Array.isArray(parsed.audits) ? parsed.audits : [],
  };
}

const auditStore = createDocumentStore<SeoAuditStore>({
  id: "seo-audit",
  file: STORE_FILE,
  empty,
  normalize,
  scoped: true,
});

// ── Reads ──────────────────────────────────────────────────────────

/** The audit by id, or `null` once it has been deleted. */
export async function getSeoAudit(id: string): Promise<SeoAudit | null> {
  const store = await auditStore.read();
  return store.audits.find((audit) => audit.id === id) ?? null;
}

/** The run in flight, if there is one. One per business: a second crawl of
 *  the same site would double the load on it for the same answers. */
export async function getRunningSeoAudit(): Promise<SeoAudit | undefined> {
  const store = await auditStore.read();
  return store.audits.find((audit) => audit.status === "running");
}

/**
 * The audit history, newest first.
 *
 * Before listing, any "running" audit whose progress writes stopped arriving
 * for `STALE_MS` is marked failed. The crawl runs in the background of a
 * response, so nothing else will ever move it out of "running" — not
 * gracefully. A row that claims to be crawling a week after the server
 * restarted is a lie the table tells with a straight face.
 */
export async function listSeoAudits(): Promise<SeoAudit[]> {
  const stale = Date.now() - STALE_MS;
  const store = await auditStore.read();
  const expired = store.audits.filter(
    (audit) => audit.status === "running" && Date.parse(audit.heartbeatAt) < stale,
  );

  for (const audit of expired) {
    await markFailed(audit.id, "The crawl stopped reporting progress — it may have been interrupted by a restart.");
  }

  const fresh = expired.length > 0 ? await auditStore.read() : store;
  return [...fresh.audits].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// ── Writes ─────────────────────────────────────────────────────────

export async function createSeoAudit(input: {
  readonly url: string;
  readonly maxPages: number;
  readonly includeLighthouse: boolean;
}): Promise<SeoAudit> {
  const now = new Date().toISOString();
  const audit: SeoAudit = {
    id: nanoid(10),
    url: input.url,
    status: "running",
    createdAt: now,
    maxPages: input.maxPages,
    pagesCrawled: 0,
    includeLighthouse: input.includeLighthouse,
    heartbeatAt: now,
  };

  await auditStore.update((store) => {
    store.audits.unshift(audit);
    // Keep the list at a length the document stays light at. The newest are
    // at the front, so this is a trim of the tail.
    store.audits = store.audits.slice(0, KEEP);
  });
  return audit;
}

/** Read-modify-write under the store's lock. `null` when the audit is gone —
 *  deleted mid-run — which is the caller's cue to stop working. */
export async function updateSeoAudit(
  id: string,
  fn: (audit: SeoAudit) => SeoAudit,
): Promise<SeoAudit | null> {
  return auditStore.update((store) => {
    const index = store.audits.findIndex((audit) => audit.id === id);
    if (index === -1) return null;
    const updated = fn(store.audits[index]!);
    store.audits[index] = updated;
    return updated;
  });
}

/** The crawl's progress write: pages so far, plus a heartbeat. */
export async function reportSeoAuditProgress(id: string, pagesCrawled: number): Promise<boolean> {
  const updated = await updateSeoAudit(id, (audit) => ({
    ...audit,
    pagesCrawled,
    heartbeatAt: new Date().toISOString(),
  }));
  return updated !== null;
}

export async function finishSeoAudit(
  id: string,
  result: {
    readonly issues: readonly AuditIssue[];
  },
): Promise<void> {
  const issueCounts: Record<string, number> = {};
  for (const issue of result.issues) {
    issueCounts[issue.type] = (issueCounts[issue.type] ?? 0) + 1;
  }
  await updateSeoAudit(id, (audit) => ({
    ...audit,
    status: "done",
    finishedAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
    issueCounts,
    issues: result.issues.slice(0, 500),
  }));
}

export async function failSeoAudit(id: string, reason: string): Promise<void> {
  await markFailed(id, reason);
}

export async function setSeoAuditLighthouse(
  id: string,
  result: { readonly scores: LighthouseScores } | { readonly error: LighthouseErrorCode },
): Promise<void> {
  await updateSeoAudit(id, (audit) =>
    "scores" in result
      ? { ...audit, lighthouseScores: result.scores }
      : { ...audit, lighthouseScores: null, lighthouseError: result.error },
  );
}

export async function deleteSeoAudit(id: string): Promise<boolean> {
  return auditStore.update((store) => {
    const before = store.audits.length;
    store.audits = store.audits.filter((audit) => audit.id !== id);
    return store.audits.length < before;
  });
}

async function markFailed(id: string, reason: string): Promise<void> {
  await updateSeoAudit(id, (audit) => ({
    ...audit,
    status: "failed",
    finishedAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
    error: reason,
  }));
}

/** The count of a single issue kind, for callers that ask "how bad was it". */
export function issueCount(audit: SeoAudit, type: AuditIssueType): number {
  return audit.issueCounts?.[type] ?? 0;
}
