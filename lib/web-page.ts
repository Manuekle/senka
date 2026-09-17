import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { assertPublicHttpsUrl } from "./http-guard";
import { stripMarkup, tidy } from "./rag";

// One public web page, read the way an SEO or a copywriter reads it.
//
// The agent's `web_fetch` is built on this. The framework default was switched
// off because it fetched anything from the app runtime, and ten operator
// skills kept telling the model to "web_fetch the site" anyway — so a request
// like "revisá el SEO de mi sitio" had no tool behind it and the model
// improvised: ask for an email to be invited to Search Console, offer a CSV
// upload. This puts a narrow, guarded fetch back.
//
// ## What makes it safe enough to hand a model
//
// - HTTPS, public host names only (lib/http-guard.ts), re-checked on every
//   redirect hop rather than once at the start — a public URL that 302s to
//   169.254.169.254 is the oldest SSRF there is.
// - The host name is resolved before the request and refused when any address
//   is loopback, private or link-local. A name is not an address: a public
//   domain can point at 10.0.0.1 and the name check alone would wave it through.
// - GET only, no cookies, no credentials, bounded bytes and time.
//
// The agent tool adds the last gate: it only runs in the owner's console.

const TIMEOUT_MS = 12_000;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const DEFAULT_TEXT_CHARS = 6_000;
const MAX_HEADINGS = 20;

export type WebPageReading = {
  readonly ok: true;
  readonly status: number;
  readonly url: string;
  readonly finalUrl: string;
  readonly redirects: readonly string[];
  readonly contentType: string;
  readonly elapsedMs: number;
  readonly bytes: number;
  /** Present for HTML. */
  readonly seo?: PageSeo;
  /** Readable text: the stripped page for HTML, the body itself for text
   *  (robots.txt, sitemap.xml, JSON). Clipped to `maxChars`. */
  readonly text: string;
  readonly truncated: boolean;
};

export type WebPageFailure = {
  readonly ok: false;
  readonly url: string;
  readonly status?: number;
  readonly error: string;
};

export type PageSeo = {
  readonly title?: string;
  readonly titleLength: number;
  readonly metaDescription?: string;
  readonly metaDescriptionLength: number;
  readonly canonical?: string;
  readonly robots?: string;
  readonly lang?: string;
  readonly viewport: boolean;
  readonly h1: readonly string[];
  readonly h2: readonly string[];
  readonly openGraph: { readonly title?: string; readonly description?: string; readonly image?: string };
  readonly structuredDataTypes: readonly string[];
  readonly hreflang: readonly string[];
  readonly links: { readonly internal: number; readonly external: number; readonly nofollow: number };
  readonly images: { readonly total: number; readonly missingAlt: number };
  readonly wordCount: number;
};

// ── Address checks ─────────────────────────────────────────────────

/** Loopback, private, link-local, CGNAT and the other ranges a fetch driven by
 *  a model must never land on, for both families. */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a = 0, b = 0] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isPrivateAddress(mapped[1]);
    return (
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe8") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb") ||
      lower.startsWith("ff")
    );
  }
  return true;
}

async function assertPublicDestination(raw: string): Promise<URL> {
  const url = assertPublicHttpsUrl(raw);
  const addresses = await lookup(url.hostname, { all: true, verbatim: true }).catch(() => {
    throw new Error(`Could not resolve ${url.hostname}.`);
  });
  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error(`${url.hostname} resolves to a private address.`);
  }
  return url;
}

// ── Fetch ──────────────────────────────────────────────────────────

export async function readWebPage(
  rawUrl: string,
  options: { readonly maxChars?: number } = {},
): Promise<WebPageReading | WebPageFailure> {
  const started = Date.now();
  const redirects: string[] = [];
  let current = rawUrl.trim();
  if (!/^https?:\/\//i.test(current)) current = `https://${current}`;

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const url = await assertPublicDestination(current);
      const response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; SenkaSiteReader/1.0; +https://senka.ai)",
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9,application/xml;q=0.8,*/*;q=0.5",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          return { ok: false, url: rawUrl, status: response.status, error: "Redirect without a Location header." };
        }
        current = new URL(location, url).toString();
        redirects.push(current);
        continue;
      }

      const contentType = response.headers.get("content-type") ?? "";
      const { body, bytes, clipped } = await readBounded(response);
      const isHtml = /html|xhtml/i.test(contentType) || /^\s*<(!doctype html|html)/i.test(body.slice(0, 200));
      const maxChars = options.maxChars ?? DEFAULT_TEXT_CHARS;

      if (!isHtml && !/text|json|xml|javascript/i.test(contentType)) {
        return {
          ok: false,
          url: rawUrl,
          status: response.status,
          error: `Unsupported content type ${contentType || "(none)"}; only web pages and text files are read.`,
        };
      }

      const fullText = isHtml ? tidy(stripMarkup(withoutHead(body))) : body.trim();
      return {
        ok: true,
        status: response.status,
        url: rawUrl,
        finalUrl: url.toString(),
        redirects,
        contentType,
        elapsedMs: Date.now() - started,
        bytes,
        ...(isHtml ? { seo: extractSeo(body, url) } : {}),
        text: fullText.slice(0, maxChars),
        truncated: clipped || fullText.length > maxChars,
      };
    }
    return { ok: false, url: rawUrl, error: `More than ${MAX_REDIRECTS} redirects.` };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === "TimeoutError"
          ? `Timed out after ${TIMEOUT_MS / 1000}s.`
          : error.message
        : "Could not read that URL.";
    return { ok: false, url: rawUrl, error: message };
  }
}

async function readBounded(response: Response): Promise<{ body: string; bytes: number; clipped: boolean }> {
  if (!response.body) return { body: "", bytes: 0, clipped: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let clipped = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    bytes += value.byteLength;
    if (bytes >= MAX_BYTES) {
      clipped = true;
      await reader.cancel().catch(() => {});
      break;
    }
  }
  const merged = new Uint8Array(Math.min(bytes, MAX_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    const room = merged.byteLength - offset;
    if (room <= 0) break;
    merged.set(chunk.subarray(0, room), offset);
    offset += Math.min(chunk.byteLength, room);
  }
  return { body: new TextDecoder("utf-8").decode(merged), bytes, clipped };
}

// ── HTML reading ───────────────────────────────────────────────────

function withoutHead(html: string): string {
  return html.replace(/<head[\s\S]*?<\/head>/i, " ").replace(/<(nav|footer|noscript|svg)[\s\S]*?<\/\1>/gi, " ");
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function textOf(fragment: string): string {
  return decodeEntities(fragment.replace(/<[^>]+>/g, " "));
}

/** The attributes of every `<tag …>` opening tag, lower-cased names. */
function tags(html: string, name: string): Record<string, string>[] {
  const found: Record<string, string>[] = [];
  const pattern = new RegExp(`<${name}\\b([^>]*)>`, "gi");
  for (const match of html.matchAll(pattern)) {
    const attributes: Record<string, string> = {};
    for (const attribute of (match[1] ?? "").matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
      const key = attribute[1]?.toLowerCase();
      if (!key) continue;
      attributes[key] = decodeEntities(attribute[3] ?? attribute[4] ?? attribute[5] ?? "");
    }
    found.push(attributes);
  }
  return found;
}

function headings(html: string, level: 1 | 2): string[] {
  const pattern = new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)<\\/h${level}>`, "gi");
  return [...html.matchAll(pattern)]
    .map((match) => textOf(match[1] ?? ""))
    .filter(Boolean)
    .slice(0, MAX_HEADINGS);
}

function meta(metas: readonly Record<string, string>[], key: string): string | undefined {
  const lower = key.toLowerCase();
  const found = metas.find(
    (entry) => entry.name?.toLowerCase() === lower || entry.property?.toLowerCase() === lower,
  );
  return found?.content || undefined;
}

export function extractSeo(html: string, pageUrl: URL): PageSeo {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? textOf(titleMatch[1] ?? "") || undefined : undefined;
  const metas = tags(html, "meta");
  const linkTags = tags(html, "link");
  const metaDescription = meta(metas, "description");

  let internal = 0;
  let external = 0;
  let nofollow = 0;
  for (const anchor of tags(html, "a")) {
    const href = anchor.href;
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;
    if (anchor.rel?.toLowerCase().includes("nofollow")) nofollow += 1;
    try {
      if (new URL(href, pageUrl).hostname === pageUrl.hostname) internal += 1;
      else external += 1;
    } catch {
      // An unparseable href is neither — it is a broken link, not a count.
    }
  }

  const images = tags(html, "img");
  const structuredDataTypes = new Set<string>();
  for (const match of html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const type of (match[1] ?? "").matchAll(/"@type"\s*:\s*"([^"]+)"/g)) {
      if (type[1]) structuredDataTypes.add(type[1]);
    }
  }

  const bodyText = tidy(stripMarkup(withoutHead(html)));
  const htmlTag = tags(html, "html")[0];
  const canonical = linkTags.find((entry) => entry.rel?.toLowerCase() === "canonical")?.href;
  const robots = meta(metas, "robots");

  return {
    ...(title ? { title } : {}),
    titleLength: title?.length ?? 0,
    ...(metaDescription ? { metaDescription } : {}),
    metaDescriptionLength: metaDescription?.length ?? 0,
    ...(canonical ? { canonical } : {}),
    ...(robots ? { robots } : {}),
    ...(htmlTag?.lang ? { lang: htmlTag.lang } : {}),
    viewport: Boolean(meta(metas, "viewport")),
    h1: headings(html, 1),
    h2: headings(html, 2),
    openGraph: {
      ...(meta(metas, "og:title") ? { title: meta(metas, "og:title") } : {}),
      ...(meta(metas, "og:description") ? { description: meta(metas, "og:description") } : {}),
      ...(meta(metas, "og:image") ? { image: meta(metas, "og:image") } : {}),
    },
    structuredDataTypes: [...structuredDataTypes],
    hreflang: linkTags
      .filter((entry) => entry.rel?.toLowerCase() === "alternate" && entry.hreflang)
      .map((entry) => entry.hreflang as string),
    links: { internal, external, nofollow },
    images: { total: images.length, missingAlt: images.filter((image) => !("alt" in image)).length },
    wordCount: bodyText ? bodyText.split(/\s+/).length : 0,
  };
}
