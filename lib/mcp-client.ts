import { lookup } from "node:dns/promises";
import { isPrivateAddress } from "./web-page";
import { validateMcpUrl } from "./mcp-url";
import type { McpServer } from "./types";

// A small MCP client, spoken over Streamable HTTP.
//
// Why this exists next to Eve's own `defineMcpClientConnection`: that one is
// declared in a file under agent/connections/ and fixed at build time, which
// is the right shape for the vendors a release ships with and the wrong shape
// for a server whose URL somebody pastes into Settings on a Tuesday. Eve has
// no dynamic-connection form (only model, tools, skills and instructions
// resolve per session — see the dynamic-capabilities guide), so a
// user-configured server reaches the model as a *tool* instead, and this is
// the transport under that tool. See agent/tools/mcp.ts.
//
// Deliberately partial. Three methods — initialize, tools/list, tools/call —
// because those are the three a tool proxy needs. No resources, no prompts,
// no server-initiated requests, no long-lived stream: each call is one POST
// that ends. If this ever needs sampling or elicitation, that is the point to
// reach for the official SDK rather than to grow this file.

/** Protocol revision we negotiate. Servers that speak a newer one answer with
 *  their own version and we keep talking; the handshake is advisory. */
const PROTOCOL_VERSION = "2025-06-18";

/** Nothing here should hang a turn. A remote MCP server that stops answering
 *  has to fail as a tool result the model can read, not as a request that
 *  sits open until the platform kills the function. */
const DEFAULT_TIMEOUT_MS = 20_000;

export type McpToolInfo = {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: Record<string, unknown>;
};

export class McpError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "McpError";
  }
}

type JsonRpcResponse = {
  readonly jsonrpc?: string;
  readonly id?: number | string;
  readonly result?: unknown;
  readonly error?: { readonly code?: number; readonly message?: string };
};

/** The auth and content headers one server wants. The secret never leaves
 *  this module — it is read from the store here and dropped into a header,
 *  and no caller ever holds it. */
function headersFor(server: McpServerConfig, sessionId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    // Streamable HTTP lets a server answer either way for the same request,
    // so a client that only accepts JSON gets a 406 from half of them.
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": PROTOCOL_VERSION,
  };
  if (server.authKind === "bearer" && server.secret) {
    headers.authorization = `Bearer ${server.secret}`;
  }
  if (server.authKind === "header" && server.secret && server.headerName) {
    headers[server.headerName.toLowerCase()] = server.secret;
  }
  if (sessionId) headers["mcp-session-id"] = sessionId;
  return headers;
}

/**
 * The response body, whichever of the two shapes it arrived in.
 *
 * A Streamable HTTP server may answer a POST with a plain JSON body or with
 * an SSE stream carrying one `data:` frame per message. Both are legal for
 * the same request, so the transport has to read both — a client that assumes
 * JSON works against half the servers in the wild and fails opaquely against
 * the other half.
 */
async function readBody(response: Response): Promise<JsonRpcResponse | null> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (!text.trim()) return null;

  if (!contentType.includes("text/event-stream")) {
    return JSON.parse(text) as JsonRpcResponse;
  }

  // Take the last `data:` frame that parses as a response with a result or an
  // error. Servers interleave notifications and progress frames ahead of it.
  let found: JsonRpcResponse | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const parsed = JSON.parse(payload) as JsonRpcResponse;
      if ("result" in parsed || "error" in parsed) found = parsed;
    } catch {
      // A frame that is not JSON is not ours. Keep reading.
    }
  }
  return found;
}

/** The fields of a stored server this client actually needs. Taking a
 *  structural type rather than `McpServer` lets a probe run against a form the
 *  operator has not saved yet. */
export type McpServerConfig = Pick<
  McpServer,
  "url" | "authKind" | "secret" | "headerName" | "allow" | "block"
>;

type Rpc = {
  readonly call: <T>(method: string, params?: Record<string, unknown>) => Promise<T>;
  readonly notify: (method: string, params?: Record<string, unknown>) => Promise<void>;
  readonly sessionId: () => string | undefined;
};

/**
 * Where this server's requests may actually go, checked per call.
 *
 * validateMcpUrl rules the URL in by host *name*; this resolves the name and
 * refuses when it answers with a private or loopback address, so a public
 * domain pointed at 10.0.0.1 does not slip through — and because it runs per
 * call, a DNS answer that changes between calls is caught too. The plaintext
 * loopback case skips the address check by agreement: localhost was the
 * operator's explicit choice when they typed it.
 */
async function assertAllowedDestination(url: string): Promise<void> {
  const validated = validateMcpUrl(url);
  if ("error" in validated) throw new McpError("La URL del servidor MCP ya no es válida.");
  const target = new URL(validated.url);
  if (target.protocol === "http:") return; // loopback-only by validateMcpUrl
  const addresses = await lookup(target.hostname, { all: true, verbatim: true }).catch(() => {
    throw new McpError(`No pude resolver ${target.hostname}.`);
  });
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new McpError(`${target.hostname} apunta a una dirección privada.`);
  }
}

function rpcFor(server: McpServerConfig, timeoutMs: number): Rpc {
  let nextId = 1;
  let sessionId: string | undefined;

  async function post(body: unknown): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await assertAllowedDestination(server.url);
      return await fetch(server.url, {
        method: "POST",
        headers: headersFor(server, sessionId),
        body: JSON.stringify(body),
        signal: controller.signal,
        // Never chase a redirect blindly: each hop would have to pass the
        // same destination checks, and fetch would follow it on its own.
        redirect: "error",
      });
    } catch (error) {
      if ((error as Error)?.name === "AbortError") {
        throw new McpError(`El servidor no respondió en ${Math.round(timeoutMs / 1000)}s.`);
      }
      throw new McpError(`No pude conectarme: ${(error as Error)?.message ?? "error de red"}`);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    sessionId: () => sessionId,
    async call<T>(method: string, params?: Record<string, unknown>): Promise<T> {
      const response = await post({ jsonrpc: "2.0", id: nextId++, method, params: params ?? {} });
      // The server assigns the session on the initialize response and expects
      // it echoed on every later request; losing it makes the second call look
      // like a new, uninitialized client.
      const assigned = response.headers.get("mcp-session-id");
      if (assigned) sessionId = assigned;

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        throw new McpError(
          `HTTP ${response.status}${detail ? ` — ${detail}` : ""}`,
          response.status,
        );
      }
      const body = await readBody(response);
      if (!body) throw new McpError("Respuesta vacía del servidor.");
      if (body.error) throw new McpError(body.error.message ?? "Error del servidor MCP.", body.error.code);
      return body.result as T;
    },
    async notify(method: string, params?: Record<string, unknown>): Promise<void> {
      // A notification has no id and takes no answer; a non-2xx here is worth
      // ignoring rather than failing the session over.
      await post({ jsonrpc: "2.0", method, params: params ?? {} }).catch(() => undefined);
    },
  };
}

/** Open a session: `initialize`, then the `initialized` notification the spec
 *  requires before any other request. */
async function handshake(rpc: Rpc): Promise<{ readonly serverName?: string }> {
  const result = await rpc.call<{ serverInfo?: { name?: string } }>("initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "senka", version: "1.0.0" },
  });
  await rpc.notify("notifications/initialized");
  return { serverName: result?.serverInfo?.name };
}

/** Whether a remote tool survives the server's allow/block lists. `allow` is
 *  authoritative when set; `block` then removes from whatever is left. */
export function toolAllowed(server: Pick<McpServerConfig, "allow" | "block">, name: string): boolean {
  if (server.allow.length > 0 && !server.allow.includes(name)) return false;
  return !server.block.includes(name);
}

export type McpProbe = {
  readonly ok: boolean;
  readonly serverName?: string;
  readonly tools: readonly McpToolInfo[];
  readonly error?: string;
};

/**
 * Connect, list the tools, hang up. What the Test button runs, and what the
 * dynamic tool factory calls once per session to learn the remote surface.
 */
export async function probeMcpServer(
  server: McpServerConfig,
  options?: { readonly timeoutMs?: number },
): Promise<McpProbe> {
  const rpc = rpcFor(server, options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const { serverName } = await handshake(rpc);
    const listed = await rpc.call<{ tools?: McpToolInfo[] }>("tools/list");
    const tools = (listed?.tools ?? []).filter((tool) => toolAllowed(server, tool.name));
    return { ok: true, serverName, tools };
  } catch (error) {
    return {
      ok: false,
      tools: [],
      error: error instanceof Error ? error.message : "Error desconocido.",
    };
  }
}

export type McpCallResult = {
  readonly ok: boolean;
  /** The tool's output, flattened to text. MCP content blocks are a list of
   *  typed parts; a tool result the model reads is one string. */
  readonly text: string;
  readonly isError?: boolean;
  readonly error?: string;
};

function flattenContent(result: unknown): string {
  const content = (result as { content?: unknown })?.content;
  if (!Array.isArray(content)) {
    return typeof result === "string" ? result : JSON.stringify(result ?? null);
  }
  const parts: string[] = [];
  for (const block of content) {
    const type = (block as { type?: unknown })?.type;
    if (type === "text") parts.push(String((block as { text?: unknown }).text ?? ""));
    else if (type === "resource") {
      const resource = (block as { resource?: { text?: unknown; uri?: unknown } }).resource;
      parts.push(String(resource?.text ?? resource?.uri ?? ""));
    } else parts.push(JSON.stringify(block));
  }
  return parts.join("\n").trim();
}

/** Call one remote tool. Blocked names never reach the network — the filter is
 *  a boundary, not a UI hint, so it is enforced here as well as at listing. */
export async function callMcpTool(
  server: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
  options?: { readonly timeoutMs?: number },
): Promise<McpCallResult> {
  if (!toolAllowed(server, toolName)) {
    return { ok: false, text: "", error: `La herramienta ${toolName} no está habilitada.` };
  }
  const rpc = rpcFor(server, options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    await handshake(rpc);
    const result = await rpc.call<{ isError?: boolean }>("tools/call", {
      name: toolName,
      arguments: args,
    });
    return { ok: true, text: flattenContent(result), isError: result?.isError === true };
  } catch (error) {
    return {
      ok: false,
      text: "",
      error: error instanceof Error ? error.message : "Error desconocido.",
    };
  }
}
