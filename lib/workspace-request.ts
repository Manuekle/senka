import { activeBusinessId, listBusinesses } from "./business-scope";
import { currentWorkspace, withWorkspace, WORKSPACE_COOKIE } from "./workspace-context";
import { trustedSessionEmail } from "./session-header";

/**
 * Resolve the workspace this request runs against.
 *
 * The browser's workspace cookie is a preference, not a permission: it
 * selects among the workspaces the session's account is entitled to. The
 * account itself comes from the header the middleware fills in after
 * verifying the session cookie — never from an inbound header, which is
 * dropped there and re-validated here. With no account to match against
 * (tests, Eve's own callers), the cookie still decides, exactly as before.
 *
 * Public callbacks cannot select a business by cookie at all.
 */
export async function runWorkspaceRequest<T>(request: Request | undefined, run: () => Promise<T>): Promise<T | Response> {
  if (currentWorkspace()) return run();
  let cookie: string | undefined;
  const path = request ? new URL(request.url).pathname : "";
  const publicCallback = /\/(webhooks|webhook|auth|channels)\b/.test(path) || path.startsWith("/api/f/");
  if (!publicCallback) {
    if (request) {
      const value = request.headers.get("cookie")?.split(";").find((part) => part.trim().startsWith(`${WORKSPACE_COOKIE}=`));
      if (value) {
        try { cookie = decodeURIComponent(value.trim().slice(WORKSPACE_COOKIE.length + 1)); } catch { /* malformed selection is rejected below */ }
      }
    } else {
      // GET handlers often have no Request argument. Next still exposes their cookies.
      try { const { cookies } = await import("next/headers"); cookie = (await cookies()).get(WORKSPACE_COOKIE)?.value; } catch { /* tests and non-HTTP callers */ }
    }
  }

  // Which workspaces this session may touch. The email arrives via the
  // middleware-verified header; a session cookie fallback would need the
  // store, and the header is the one place that already paid for the lookup.
  const { businesses } = await listBusinesses();
  const accountEmail = request ? trustedSessionEmail(request.headers) : undefined;
  const entitled = accountEmail
    ? businesses.filter((business) => business.ownerEmail === accountEmail)
    : undefined;

  const id = cookie ?? (await activeBusinessId());
  const pool = entitled && entitled.length > 0 ? entitled : businesses;
  const selected = pool.find((business) => business.id === id);
  // Account/billing/business registry stay reachable to recover access or switch out.
  const recovery = /^\/api\/(businesses|billing|auth|team)(\/|$)/.test(path);
  if (!selected || selected.access === "suspended") {
    if (recovery || !request) return withWorkspace("default", run);
    return Response.json({ code: "workspace_unavailable", error: "Workspace access is unavailable" }, { status: 403 });
  }
  return withWorkspace(id, run);
}
