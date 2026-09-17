import { assertPublicHttpsUrl } from "./http-guard";
import type { AuditIssue } from "./seo-audit-findings";
import {
  failSeoAudit,
  finishSeoAudit,
  getSeoAudit,
  reportSeoAuditProgress,
  setSeoAuditLighthouse,
} from "./seo-audit-store";

// The site crawler behind the SEO panel's audit.
//
// Search Console reports what Google already saw; this goes and looks at the
// site itself. It walks the same links a visitor's browser walks, reads the
// HTML, and notes the handful of things that reliably cost positions: pages
// Google can't describe (no title, no meta description), pages it can't
// outline (no h1), images it can't read (no alt), and pages told not to
// appear at all (noindex).
//
// Deliberately not a headless browser. Everything here is one fetch per page
// and a handful of regular expressions, which keeps the audit light enough
// to run inside the app itself and slow enough, at four pages at a time, to
// stay polite to whatever is serving the site.
//
// The URL comes from a signed-in operator typing into a form, which is the
// same trust position as a webhook URL — so the same SSRF rules apply. An
// audit that pointed at the installation's own database was not a thought
// experiment.

/** The free crawl window. The upgrade path to 10.000 lives behind billing,
 *  and until it is wired the API refuses anything above this. */
export const MAX_PAGES_MIN = 10;
export const MAX_PAGES_MAX = 50;

/** One page at a time would crawl 50 pages in a minute of pure waiting; one
 *  socket per page would look like an attack. Four is a polite visitor. */
const CONCURRENCY = 4;

/** A page that takes longer than this is not worth waiting for, and the
 *  site's own visitors are not waiting for it either. */
const PAGE_TIMEOUT_MS = 15_000;

/** HTML larger than this is skipped rather than parsed — the audit is about
 *  pages a person can read, and a 5 MB payload is usually a broken one. */
const MAX_HTML_BYTES = 2_000_000;

/** How long to wait for PageSpeed Insights, which runs a real Lighthouse
 *  pass on its own machines and takes its time about it. */
const LIGHTHOUSE_TIMEOUT_MS = 90_000;

const USER_AGENT = "Mozilla/5.0 (compatible; SenkaAudit/1.0; +site-audit)";

// ── Types ──────────────────────────────────────────────────────────

/** Re-exported for the store and the route. `export type` erases at
 *  compile time, so this adds no runtime edge to the browser boundary —
 *  the finding vocabulary itself lives in `lib/seo-audit-findings.ts`. */
export type { AuditIssue, AuditIssueType } from "./seo-audit-findings";

/** Lighthouse category scores, 0–100, as PageSpeed Insights reports them. */
export type LighthouseScores = {
  readonly performance: number;
  readonly accessibility: number;
  readonly bestPractices: number;
  readonly seo: number;
};

/** Why a Lighthouse run produced no scores. A code rather than a sentence:
 *  the scores are numbers in every language, and so is the reason they are
 *  missing. */
export type LighthouseErrorCode = "quota" | "timeout" | "unavailable";

// ── Pure helpers ───────────────────────────────────────────────────
//
// Everything a test can call without a network lives above the crawl.

/** The operator's input, normalized: https only, public host, no fragment.
 *  `null` for anything the SSRF guard or the URL parser refuses. */
export function normalizeAuditUrl(raw: string): URL | null {
  try {
    const url = assertPublicHttpsUrl(raw.trim());
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

/** The crawl cap as the API accepts it: a whole number in the free window. */
export function clampMaxPages(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : value;
  if (typeof parsed !== "number" || !Number.isInteger(parsed)) return null;
  if (parsed < MAX_PAGES_MIN || parsed > MAX_PAGES_MAX) return null;
  return parsed;
}

/** A robots.txt's `User-agent: *` group, as a path predicate.
 *
 *  The full spec (allow/disallow precedence, specific agents, crawl-delay)
 *  needs a real parser; this reads the only group that matters here with
 *  the two rules that cover every real robots.txt: an empty `Disallow` line
 *  allows everything, and a path prefix blocks everything under it. */
export function parseRobots(text: string): (path: string) => boolean {
  const disallows: string[] = [];
  let inStarGroup = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      inStarGroup = value === "*";
    } else if (key === "disallow" && inStarGroup) {
      if (value === "") continue; // "Disallow:" with nothing — allow all.
      disallows.push(value.replace(/\*$/, ""));
    }
  }
  return (path: string) => !disallows.some((prefix) => path.startsWith(prefix));
}

/** Every `href` in the page, absolute, deduplicated — same-origin filtered
 *  by the caller, which is the decision that belongs to the crawl. */
export function extractLinks(html: string, baseUrl: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(["']?)([^"'>\s]+)\1[^>]*>/gi)) {
    const href = match[2];
    if (!href || /^(mailto:|tel:|javascript:|data:|#)/i.test(href)) continue;
    try {
      const url = new URL(href, baseUrl);
      url.hash = "";
      found.add(url.toString());
    } catch {
      // A href that doesn't resolve against the page is a typo, not a link.
    }
  }
  return [...found];
}

/** Same-origin, normalized, and deduplicated against `seen`. */
export function eligibleLinks(
  links: readonly string[],
  origin: string,
  seen: ReadonlySet<string>,
): string[] {
  const fresh: string[] = [];
  for (const link of links) {
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      continue;
    }
    if (url.origin !== origin) continue;
    const normalized = normalizeUrlKey(url);
    if (seen.has(normalized)) continue;
    fresh.push(normalized);
  }
  return fresh;
}

/** The key two pages are the same page under: same origin, no trailing
 *  slash, so /precios and /precios/ are crawled once. */
export function normalizeUrlKey(url: URL): string {
  const clone = new URL(url.toString());
  clone.hash = "";
  if (clone.pathname !== "/" && clone.pathname.endsWith("/")) {
    clone.pathname = clone.pathname.replace(/\/+$/, "");
  }
  return clone.toString();
}

function tagAttribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([^"']*)\\1`, "i"));
  return match?.[2];
}

function metaTag(html: string, name: string): string | undefined {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const isNamed =
      (tagAttribute(tag, "name")?.toLowerCase() === name ||
        tagAttribute(tag, "property")?.toLowerCase() === name);
    if (isNamed) return tagAttribute(tag, "content");
  }
  return undefined;
}

/** Title-length budget. Google truncates around 60 characters; a title
 *  longer than that is not wrong, but its end is unread. */
const TITLE_MAX = 60;
/** Meta description budget, same reasoning. */
const DESCRIPTION_MAX = 160;

/**
 * The on-page checks, from the HTML alone.
 *
 * One issue per page per kind, with the count in `detail` — a page with 30
 * unannotated images is one fix the owner makes once, not thirty rows in a
 * table. The numbers the audit reports are pages-with-problem, not
 * problems.
 */
export function analyzePage(html: string): AuditIssue[] {
  const issues: AuditIssue[] = [];

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.replace(/\s+/g, " ").trim();
  if (!title) {
    issues.push({ type: "missing_title", page: "" });
  } else if (title.length > TITLE_MAX) {
    issues.push({ type: "long_title", page: "", detail: String(title.length) });
  }

  const description = metaTag(html, "description")?.replace(/\s+/g, " ").trim();
  if (!description) {
    issues.push({ type: "missing_description", page: "" });
  } else if (description.length > DESCRIPTION_MAX) {
    issues.push({ type: "long_description", page: "", detail: String(description.length) });
  }

  const h1Count = [...html.matchAll(/<h1\b/gi)].length;
  if (h1Count === 0) {
    issues.push({ type: "missing_h1", page: "" });
  } else if (h1Count > 1) {
    issues.push({ type: "multiple_h1", page: "", detail: String(h1Count) });
  }

  const imagesWithoutAlt = [...html.matchAll(/<img\b[^>]*>/gi)].filter(([tag]) => {
    const alt = tagAttribute(tag, "alt");
    return alt === undefined || alt.trim() === "";
  }).length;
  if (imagesWithoutAlt > 0) {
    issues.push({ type: "img_alt", page: "", detail: String(imagesWithoutAlt) });
  }

  if (!/<link\b[^>]*\brel\s*=\s*["']?canonical\b/i.test(html)) {
    issues.push({ type: "missing_canonical", page: "" });
  }

  if (/\bnoindex\b/i.test(metaTag(html, "robots") ?? "")) {
    issues.push({ type: "noindex", page: "" });
  }

  return issues;
}

/** Lighthouse category scores out of a PageSpeed Insights response, or
 *  `null` for anything that is not a complete report. */
export function parseLighthouseScores(payload: unknown): LighthouseScores | null {
  const report = (payload as {
    lighthouseResult?: { categories?: Record<string, { score?: unknown }> };
  })?.lighthouseResult?.categories;
  if (!report) return null;

  const score = (key: string): number | null => {
    const raw = report[key]?.score;
    if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
    return Math.round(raw * 100);
  };

  const performance = score("performance");
  const accessibility = score("accessibility");
  const bestPractices = score("best-practices");
  const seo = score("seo");
  if (
    performance === null ||
    accessibility === null ||
    bestPractices === null ||
    seo === null
  ) {
    return null;
  }
  return { performance, accessibility, bestPractices, seo };
}

// ── The crawl ───────────────────────────────────────────────────────

type FetchedPage = {
  readonly url: string;
  readonly ok: boolean;
  readonly html?: string;
};

async function fetchPage(url: string): Promise<FetchedPage> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok) return { url, ok: false };
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("text/html")) return { url, ok: true };
    const length = Number.parseInt(response.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(length) && length > MAX_HTML_BYTES) return { url, ok: true };
    return { url, ok: true, html: (await response.text()).slice(0, MAX_HTML_BYTES) };
  } catch {
    // Timeout, DNS, refused connection — the page is as broken as a 404 to
    // this audit's purposes, and reporting it the same way keeps the table
    // to one "broken" vocabulary.
    return { url, ok: false };
  }
}

async function fetchRobots(origin: string): Promise<(path: string) => boolean> {
  try {
    const response = await fetch(new URL("/robots.txt", origin), {
      redirect: "follow",
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      headers: { "user-agent": USER_AGENT },
    });
    if (!response.ok) return () => true;
    return parseRobots(await response.text());
  } catch {
    // A robots.txt that cannot be fetched allows everything — the common
    // case is that there isn't one.
    return () => true;
  }
}

/**
 * Run one audit to completion, writing progress into the store as it goes.
 *
 * The route fires this in the background of its response; every failure
 * path ends in the store saying so, because the table's polling is the
 * only thing that will ever report how this went.
 */
export async function runSeoAudit(id: string): Promise<void> {
  const audit = await getSeoAudit(id);
  if (!audit || audit.status !== "running") return;

  const start = normalizeAuditUrl(audit.url);
  if (!start) {
    await failSeoAudit(id, "The URL is not a public https page.");
    return;
  }

  try {
    const robotsAllowed = await fetchRobots(start.origin);
    const startKey = normalizeUrlKey(start);
    const startPath = `${start.pathname}${start.search}`;
    if (!robotsAllowed(startPath)) {
      await failSeoAudit(id, "robots.txt disallows crawling this site.");
      return;
    }

    const origin = start.origin;
    const seen = new Set<string>([startKey]);
    const queue: string[] = [startKey];
    const issues: AuditIssue[] = [];
    let crawled = 0;

    while (queue.length > 0 && crawled < audit.maxPages) {
      const batch = queue.splice(0, Math.min(CONCURRENCY, audit.maxPages - crawled));
      if (batch.length === 0) break;

      const pages = await Promise.all(batch.map(fetchPage));
      for (const page of pages) {
        crawled += 1;
        const path = new URL(page.url).pathname + new URL(page.url).search;
        if (!page.ok) {
          issues.push({ page: path, type: "broken_page" });
          continue;
        }
        if (!page.html) continue;
        // The issue's page is filled in here rather than inside
        // `analyzePage`, which stays testable on HTML alone.
        issues.push(...analyzePage(page.html).map((issue) => ({ ...issue, page: path })));
        for (const link of eligibleLinks(extractLinks(page.html, page.url), origin, seen)) {
          seen.add(link);
          const target = new URL(link);
          // Never queued: links robots.txt blocks, and links beyond a queue
          // the crawl can never reach — it stops at `maxPages` pages.
          if (!robotsAllowed(`${target.pathname}${target.search}`)) continue;
          if (queue.length < audit.maxPages) queue.push(link);
        }
      }

      // Progress after every batch: the count the table shows, and the
      // heartbeat the staleness guard reads. A deleted audit answers
      // `false`, which is the stop sign for a run with nothing to write to.
      if (!(await reportSeoAuditProgress(id, crawled))) return;
    }

    if (audit.includeLighthouse) {
      // Lighthouse runs on the page the operator entered — the front door,
      // and the one page every visitor sees. Per-page Lighthouse on a
      // 50-page crawl would take the better part of an hour for numbers
      // that barely differ.
      await setSeoAuditLighthouse(id, await runLighthouse(startKey));
    }

    await finishSeoAudit(id, { issues });
  } catch (error) {
    await failSeoAudit(id, error instanceof Error ? error.message : "The crawl failed.");
  }
}

/**
 * Which failure a PageSpeed response or a thrown fetch is, from the outside.
 *
 * No API key means the shared anonymous quota, and a site audit that runs
 * Lighthouse on demand burns through a stranger's share of it — 429 is the
 * normal outcome, not an edge case, so it gets its own code and its own
 * sentence pointing at the key that fixes it.
 */
export function psiFailureKind(status: number | null, aborted: boolean): LighthouseErrorCode {
  if (aborted) return "timeout";
  if (status === 429) return "quota";
  return "unavailable";
}

/**
 * Lighthouse via the PageSpeed Insights API — the one way to run the real
 * thing without shipping Chrome in the container. A result either carries
 * scores or the reason there are none; the audit stays a success either
 * way, and the Lighthouse column tells its own story.
 */
async function runLighthouse(url: string): Promise<
  | { readonly scores: LighthouseScores }
  | { readonly error: LighthouseErrorCode }
> {
  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", "mobile");
  for (const category of ["performance", "accessibility", "best-practices", "seo"]) {
    endpoint.searchParams.append("category", category);
  }
  const key = process.env.PAGESPEED_API_KEY;
  if (key) endpoint.searchParams.set("key", key);

  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(LIGHTHOUSE_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!response.ok) return { error: psiFailureKind(response.status, false) };
    const scores = parseLighthouseScores(await response.json());
    return scores ? { scores } : { error: "unavailable" };
  } catch (error) {
    return {
      error: psiFailureKind(null, error instanceof DOMException && error.name === "TimeoutError"),
    };
  }
}
