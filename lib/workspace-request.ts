import { activeBusinessId, listBusinesses } from "./business-scope";
import { currentWorkspace, withWorkspace, WORKSPACE_COOKIE } from "./workspace-context";

/** Resolve the browser selection once. Public callbacks cannot select a business by cookie. */
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
  const id = cookie ?? await activeBusinessId();
  const { businesses } = await listBusinesses();
  const selected = businesses.find((business) => business.id === id);
  // Account/billing/business registry stay reachable to recover access or switch out.
  const recovery = /^\/api\/(businesses|billing|auth)(\/|$)/.test(path);
  if (!selected || selected.access === "suspended") {
    if (recovery || !request) return withWorkspace("default", run);
    return Response.json({ code: "workspace_unavailable", error: "Workspace access is unavailable" }, { status: 403 });
  }
  return withWorkspace(id, run);
}
