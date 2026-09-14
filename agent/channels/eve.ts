import { eveChannel } from "eve/channels/eve";
import { type AuthFn, httpBasic, localDev, placeholderAuth } from "eve/channels/auth";
import { SESSION_COOKIE, getSessionAccountEmail } from "@/lib/auth/store";
import { activeBusinessId, listBusinesses } from "../../lib/business-scope";
import { WORKSPACE_COOKIE } from "../../lib/workspace-context";

const username = process.env.ROUTE_AUTH_BASIC_USER?.trim();
const password = process.env.ROUTE_AUTH_BASIC_PASSWORD;

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Someone already signed in to the Senka web app (email/password or Google —
 * see lib/auth/store.ts) shouldn't have to type a second, separate password
 * just to open the chat. Checked ahead of Basic auth, per eve's own guidance
 * for a browser app with its own session: "the route-auth entry for the eve
 * channel should verify your app session and return a user principal."
 *
 * Skips, not rejects, when there's no session — Basic auth (or a raw shared
 * link) still has to work for whoever isn't a Senka account holder.
 */
function appSession(): AuthFn<Request> {
  return async (request) => {
    const email = await getSessionAccountEmail(readCookie(request, SESSION_COOKIE));
    if (!email) return null;
    const workspaceId = readCookie(request, WORKSPACE_COOKIE) ?? await activeBusinessId();
    const { businesses } = await listBusinesses();
    if (!businesses.some((business) => business.id === workspaceId && business.access !== "suspended")) return null;
    return {
      authenticator: "app",
      principalId: email,
      principalType: "user",
      attributes: { email, workspaceId },
    };
  };
}

// Local loopback requests remain frictionless. Every non-loopback request must
// authenticate, and a missing production credential fails closed with Eve's
// setup-focused 401 response.
const configuredAuth =
  username && password ? httpBasic({ username, password }) : placeholderAuth();
const productionAuth: AuthFn<Request> = (request) => {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (new URL(request.url).protocol !== "https:" && forwardedProtocol !== "https") {
    return null;
  }
  return configuredAuth(request);
};

export default eveChannel({
  auth:
    process.env.NODE_ENV === "production"
      ? [appSession(), productionAuth]
      : [appSession(), localDev(), productionAuth],
});
