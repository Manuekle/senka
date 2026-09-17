/**
 * The vocabulary of a site audit's findings, shared by the crawler that
 * produces them and the panel that lists them.
 *
 * This module imports nothing on purpose: the detail view is a client
 * component, and anything it imports ships to the browser. The crawler
 * (`lib/seo-audit.ts`) pulls in the store, the store pulls in `pg`, and
 * `pg` pulls in `dns` — none of which exists in a browser. Keep this file
 * dependency-free and the boundary holds.
 */

export type AuditIssueType =
  | "missing_title"
  | "long_title"
  | "missing_description"
  | "long_description"
  | "missing_h1"
  | "multiple_h1"
  | "img_alt"
  | "missing_canonical"
  | "noindex"
  | "broken_page";

export type AuditIssue = {
  /** The page's path, short enough to scan a list of. */
  readonly page: string;
  readonly type: AuditIssueType;
  /** The count or the offending length, when the issue has one. */
  readonly detail?: string;
};

/**
 * Issues grouped by kind, biggest pile first — the fix with the most pages
 * behind it reads first. What the audit's detail view lists, and the shape
 * under test.
 */
export function groupAuditIssues(
  issues: readonly AuditIssue[],
): { readonly type: AuditIssueType; readonly pages: readonly string[] }[] {
  const byType = new Map<AuditIssueType, string[]>();
  for (const issue of issues) {
    byType.set(issue.type, [...(byType.get(issue.type) ?? []), issue.page]);
  }
  return [...byType.entries()]
    .map(([type, pages]) => ({ type, pages }))
    .sort((a, b) => b.pages.length - a.pages.length);
}

export type AuditImpact = "critical" | "high" | "medium" | "low";

/** Fix-first weight per kind: invisibility and breakage outrank polish. */
export const AUDIT_IMPACT: Record<AuditIssueType, AuditImpact> = {
  noindex: "critical",
  broken_page: "high",
  missing_title: "high",
  long_title: "high",
  img_alt: "high",
  missing_description: "medium",
  long_description: "medium",
  missing_h1: "medium",
  missing_canonical: "medium",
  multiple_h1: "low",
};

const IMPACT_RANK: Record<AuditImpact, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Groups ordered the way fixes should happen: worst impact first, then
 * biggest pile. What the detail view lists.
 */
export function rankAuditGroups(
  groups: ReadonlyArray<{ readonly type: AuditIssueType; readonly pages: readonly string[] }>,
): { readonly type: AuditIssueType; readonly pages: readonly string[] }[] {
  return [...groups].sort(
    (a, b) =>
      IMPACT_RANK[AUDIT_IMPACT[a.type]] - IMPACT_RANK[AUDIT_IMPACT[b.type]] ||
      b.pages.length - a.pages.length,
  );
}

/**
 * One 0–100 number for the audit: the mean Lighthouse score when there is
 * one, else the share of crawled pages with no issue at all. Rough by
 * design — it is a headline, and the rings beside it carry the detail.
 */
export function auditHealthScore(input: {
  readonly issues: readonly AuditIssue[];
  readonly maxPages: number;
  readonly lighthouse?: {
    readonly performance: number;
    readonly accessibility: number;
    readonly bestPractices: number;
    readonly seo: number;
  } | null;
}): number {
  if (input.lighthouse) {
    const { performance, accessibility, bestPractices, seo } = input.lighthouse;
    return Math.round((performance + accessibility + bestPractices + seo) / 4);
  }
  const affected = new Set(input.issues.map((issue) => issue.page)).size;
  const total = Math.max(input.maxPages, 1);
  return Math.round(100 * (1 - Math.min(affected, total) / total));
}
