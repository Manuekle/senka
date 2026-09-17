import { describe, expect, it } from "vitest";
import {
  analyzePage,
  clampMaxPages,
  eligibleLinks,
  extractLinks,
  normalizeAuditUrl,
  normalizeUrlKey,
  parseLighthouseScores,
  parseRobots,
  psiFailureKind,
} from "./seo-audit";
import { AUDIT_IMPACT, auditHealthScore, groupAuditIssues, rankAuditGroups, type AuditIssue } from "./seo-audit-findings";

// The crawler's pure half. Nothing here fetches: the helpers take strings
// and HTML the way the crawl hands them over, so the guarantees the API
// relies on — SSRF refusal, the page window, robots, the dedupe — are the
// things under test.

describe("normalizeAuditUrl", () => {
  it("keeps a public https URL and strips its fragment", () => {
    const url = normalizeAuditUrl("https://example.com/precios#top");
    expect(url?.toString()).toBe("https://example.com/precios");
  });

  it("refuses localhost, private ranges and raw IPs", () => {
    expect(normalizeAuditUrl("https://localhost/admin")).toBeNull();
    expect(normalizeAuditUrl("https://192.168.1.10/panel")).toBeNull();
    expect(normalizeAuditUrl("http://127.0.0.1:3000/")).toBeNull();
  });

  it("refuses http, other schemes and anything the URL parser rejects", () => {
    expect(normalizeAuditUrl("http://example.com/")).toBeNull();
    expect(normalizeAuditUrl("ftp://example.com/")).toBeNull();
    expect(normalizeAuditUrl("not a url")).toBeNull();
    expect(normalizeAuditUrl("")).toBeNull();
  });
});

describe("clampMaxPages", () => {
  it("accepts a whole number in the free window", () => {
    expect(clampMaxPages(10)).toBe(10);
    expect(clampMaxPages(50)).toBe(50);
    expect(clampMaxPages("27")).toBe(27);
  });

  it("refuses anything outside 10–50, fractional or not a number", () => {
    expect(clampMaxPages(9)).toBeNull();
    expect(clampMaxPages(51)).toBeNull();
    expect(clampMaxPages(10000)).toBeNull();
    expect(clampMaxPages(30.5)).toBeNull();
    expect(clampMaxPages("many")).toBeNull();
    expect(clampMaxPages(null)).toBeNull();
  });
});

describe("parseRobots", () => {
  it("blocks the paths the star group disallows, as prefixes", () => {
    const allowed = parseRobots("User-agent: *\nDisallow: /admin\nDisallow: /cart\n");
    expect(allowed("/")).toBe(true);
    expect(allowed("/admin")).toBe(false);
    expect(allowed("/admin/settings")).toBe(false);
    expect(allowed("/cart")).toBe(false);
    // Prefix matching, the way the real crawlers do it.
    expect(allowed("/about")).toBe(true);
  });

  it("treats an empty Disallow as allow-all, the spec's way of writing it", () => {
    expect(parseRobots("User-agent: *\nDisallow:\n")("/anything")).toBe(true);
  });

  it("ignores groups meant for other agents", () => {
    const allowed = parseRobots("User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: \n");
    expect(allowed("/")).toBe(true);
  });

  it("allows everything when nothing matches", () => {
    expect(parseRobots("no groups here")("/")).toBe(true);
  });
});

const PAGE = "https://example.com/blog/post";

describe("extractLinks", () => {
  it("resolves relative and absolute hrefs against the page", () => {
    const html = `<a href="/about">About</a><a href="https://other.com/x">Other</a>`;
    expect(extractLinks(html, PAGE)).toEqual(["https://example.com/about", "https://other.com/x"]);
  });

  it("deduplicates and drops non-navigational hrefs", () => {
    const html = [
      `<a href="/about">1</a>`,
      `<a href="/about">2</a>`,
      `<a href="mailto:hola@example.com">mail</a>`,
      `<a href="tel:+123">call</a>`,
      `<a href="#top">jump</a>`,
      `<a href="javascript:void(0)">fake</a>`,
    ].join("");
    expect(extractLinks(html, PAGE)).toEqual(["https://example.com/about"]);
  });

  it("strips fragments so /a#x and /a are one link", () => {
    const html = `<a href="/a#x">1</a><a href="/a">2</a>`;
    expect(extractLinks(html, PAGE)).toEqual(["https://example.com/a"]);
  });
});

describe("eligibleLinks", () => {
  const seen = new Set(["https://example.com/"]);

  it("keeps same-origin links the crawl has not seen", () => {
    expect(eligibleLinks(["https://example.com/about", "https://other.com/x"], "https://example.com", seen)).toEqual([
      "https://example.com/about",
    ]);
  });

  it("normalizes the trailing slash before checking, so /a and /a/ are one page", () => {
    expect(normalizeUrlKey(new URL("https://example.com/a/"))).toBe("https://example.com/a");
    expect(normalizeUrlKey(new URL("https://example.com/a"))).toBe("https://example.com/a");
    // The root keeps its slash — it is not the same page as nothing.
    expect(normalizeUrlKey(new URL("https://example.com/"))).toBe("https://example.com/");
    expect(
      eligibleLinks(["https://example.com/a", "https://example.com/a/"], "https://example.com", new Set(["https://example.com/a"])),
    ).toEqual([]);
  });
});

describe("analyzePage", () => {
  it("reports the checks a healthy page passes with nothing to say", () => {
    const html = [
      "<html><head>",
      "<title>Una tienda de ropa</title>",
      '<meta name="description" content="Ropa de entrenamiento para mujer.">',
      '<link rel="canonical" href="https://example.com/">',
      "</head><body>",
      "<h1>GymRat+</h1>",
      '<img src="logo.png" alt="Logo">',
      "</body></html>",
    ].join("");
    expect(analyzePage(html)).toEqual([]);
  });

  it("reports missing title, description, h1 and canonical in one pass", () => {
    const issues = analyzePage("<html><body><p>hello</p></body></html>").map(
      (issue) => issue.type,
    );
    expect(issues).toContain("missing_title");
    expect(issues).toContain("missing_description");
    expect(issues).toContain("missing_h1");
    expect(issues).toContain("missing_canonical");
  });

  it("flags a noindex page the moment it sees one — the whole audit's reason", () => {
    const html = '<html><head><meta name="robots" content="noindex, nofollow"></head></html>';
    expect(analyzePage(html).map((issue) => issue.type)).toContain("noindex");
  });

  it("counts unannotated images as one issue, not one per image", () => {
    const html = [
      '<html><head><title>t</title>',
      '<meta name="description" content="d">',
      '<link rel="canonical" href="https://example.com/">',
      "</head><body><h1>h</h1>",
      '<img src="a.png">',
      '<img src="b.png" alt="">',
      '<img src="c.png" alt="ok">',
      "</body></html>",
    ].join("");
    const issue = analyzePage(html).find((candidate) => candidate.type === "img_alt");
    expect(issue?.detail).toBe("2");
  });

  it("flags long titles and multiple h1s", () => {
    const html = [
      `<html><head><title>${"a".repeat(61)}</title>`,
      '<meta name="description" content="d">',
      '<link rel="canonical" href="https://example.com/">',
      "</head><body><h1>one</h1><h1>two</h1></body></html>",
    ].join("");
    const types = analyzePage(html).map((issue) => issue.type);
    expect(types).toContain("long_title");
    expect(types).toContain("multiple_h1");
  });
});

describe("psiFailureKind", () => {
  it("names the anonymous-quota refusal for what it is", () => {
    // No key means the shared quota, and the shared quota is always spent.
    expect(psiFailureKind(429, false)).toBe("quota");
  });

  it("calls an aborted fetch a timeout", () => {
    expect(psiFailureKind(null, true)).toBe("timeout");
  });

  it("lumps everything else into unavailable", () => {
    expect(psiFailureKind(500, false)).toBe("unavailable");
    expect(psiFailureKind(403, false)).toBe("unavailable");
    expect(psiFailureKind(null, false)).toBe("unavailable");
  });
});

describe("parseLighthouseScores", () => {
  const report = {
    lighthouseResult: {
      categories: {
        performance: { score: 0.9 },
        accessibility: { score: 1 },
        "best-practices": { score: 0.83 },
        seo: { score: 0.7 },
      },
    },
  };

  it("turns PSI's 0–1 fractions into whole scores", () => {
    expect(parseLighthouseScores(report)).toEqual({
      performance: 90,
      accessibility: 100,
      bestPractices: 83,
      seo: 70,
    });
  });

  it("refuses anything that is not a complete report", () => {
    expect(parseLighthouseScores({})).toBeNull();
    expect(parseLighthouseScores({ error: { message: "quota" } })).toBeNull();
    expect(
      parseLighthouseScores({
        lighthouseResult: { categories: { performance: { score: 0.9 } } },
      }),
    ).toBeNull();
    expect(
      parseLighthouseScores({
        lighthouseResult: { categories: { performance: { score: "n/a" } } },
      }),
    ).toBeNull();
  });
});

describe("groupAuditIssues", () => {
  it("groups pages by kind, biggest pile first", () => {
    const issues: AuditIssue[] = [
      { page: "/a", type: "img_alt", detail: "3" },
      { page: "/", type: "long_title", detail: "66" },
      { page: "/b", type: "long_title", detail: "71" },
      { page: "/", type: "long_description", detail: "194" },
    ];
    expect(groupAuditIssues(issues)).toEqual([
      { type: "long_title", pages: ["/", "/b"] },
      { type: "img_alt", pages: ["/a"] },
      { type: "long_description", pages: ["/"] },
    ]);
  });

  it("returns nothing for a clean crawl", () => {
    expect(groupAuditIssues([])).toEqual([]);
  });
});

describe("rankAuditGroups", () => {
  it("orders worst impact first, then biggest pile", () => {
    expect(
      rankAuditGroups([
        { type: "long_description", pages: ["/", "/b", "/c"] },
        { type: "multiple_h1", pages: ["/"] },
        { type: "noindex", pages: ["/hidden"] },
        { type: "img_alt", pages: ["/a"] },
      ]).map((group) => group.type),
    ).toEqual(["noindex", "img_alt", "long_description", "multiple_h1"]);
    expect(AUDIT_IMPACT.noindex).toBe("critical");
  });
});

describe("auditHealthScore", () => {
  it("means the Lighthouse scores when there are any", () => {
    expect(
      auditHealthScore({
        issues: [],
        maxPages: 50,
        lighthouse: { performance: 80, accessibility: 60, bestPractices: 100, seo: 80 },
      }),
    ).toBe(80);
  });

  it("falls back to the share of clean pages", () => {
    expect(
      auditHealthScore({
        issues: [
          { page: "/", type: "long_title" },
          { page: "/b", type: "long_title" },
        ],
        maxPages: 50,
      }),
    ).toBe(96);
    expect(auditHealthScore({ issues: [], maxPages: 50 })).toBe(100);
  });
});
