// MCP naming and URL rules, with no server imports.
//
// Split out of lib/mcp-store.ts for the same reason lib/phone-format.ts was
// split out of the number store: that module reaches `doc-store` →
// `postgres-pool` → `pg`, and a client component importing one pure function
// from it drags the Postgres driver into the browser bundle.
//
// The connect form needs both of these while you type — the slug to preview
// the tool name, the URL rule to refuse a plaintext endpoint before the round
// trip — and it needs to say so in the reader's own language, which is why the
// failure comes back as a dictionary key rather than a sentence.

/** A slug that can be half of a tool name. The model calls `mcp_<slug>`, and a
 *  tool name with a dash or an accent in it is one some providers refuse. */
export function slugifyServer(name: string): string {
  const folded = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const slug = folded
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return slug || "server";
}

/** Why a URL was refused. A key, not a sentence: this runs on the server (at
 *  the API boundary) and in the browser (as you type), and only one of those
 *  two knows what language the reader is in. */
export type McpUrlError = "mcp.urlInvalid" | "mcp.urlInsecure" | "mcp.urlScheme";

export type McpUrlResult = { readonly url: string } | { readonly error: McpUrlError };

/** Hostnames that must not be reached even over HTTPS. Loopback and the
 *  private ranges; a URL like `https://169.254.169.254` used to pass because
 *  only `http:` was checked. Kept string-based (no node imports) because this
 *  module also runs in the browser; the connection itself re-checks the
 *  resolved addresses in lib/mcp-client.ts. */
const PRIVATE_HOST = /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i;

function isPrivateMcpHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower.includes(":")) {
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return PRIVATE_HOST.test(mapped[1]);
    // Any other v6 literal: the universe of addresses too wide to enumerate,
    // and every reachable-private spelling starts with :: or f.
    return true;
  }
  if (PRIVATE_HOST.test(lower)) return true;
  // Every-numeric hosts are refused outright — `https://2130706433` is
  // 127.0.0.1 and `https://0x7f.1` is 127.0.0.1, and the URL parser keeps
  // the spelling as written. Public servers are reached by name, which is
  // also what lets lib/mcp-client.ts re-check the resolved addresses before
  // the socket opens.
  const labels = lower.split(".");
  if (labels.length <= 4 && labels.every((label) => /^(0[xX][0-9a-fA-F]+|[0-9]+)$/.test(label))) {
    return true;
  }
  return false;
}

/**
 * A server URL we are willing to talk to.
 *
 * `http:` is allowed only for loopback. Everything else has to be TLS on a
 * public host: an MCP connection carries a bearer token on every request, and
 * sending one over plaintext — or to the cloud metadata address — hands it to
 * whoever is between.
 */
export function validateMcpUrl(raw: string): McpUrlResult {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { error: "mcp.urlInvalid" };
  }
  if (parsed.protocol === "https:") {
    if (isPrivateMcpHost(parsed.hostname)) return { error: "mcp.urlInsecure" };
    return { url: parsed.toString() };
  }
  if (parsed.protocol === "http:") {
    const host = parsed.hostname;
    const local = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
    if (local) return { url: parsed.toString() };
    return { error: "mcp.urlInsecure" };
  }
  return { error: "mcp.urlScheme" };
}
