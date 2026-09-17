import { apiError } from "./api-error";
import { SESSION_COOKIE, getSessionAccountEmail } from "./auth/store";
import { warmOwnerEmail } from "./owner-email";
import { isOwnerEmail } from "./owner-email";
import { SESSION_ACCOUNT_HEADER } from "./session-header";

/**
 * The gate for the routes that can read or replace the installation's secrets:
 * settings export and import, and the team settings that decide which agents
 * act on the shared inbox.
 *
 * A session cookie proves the caller signed in — on a multi-account install
 * that is no longer the same as being the owner, and the export hands over
 * every API key in plaintext. The account email comes from the header the
 * middleware fills in after verifying the cookie itself (with the cookie read
 * as a fallback for callers that reach a route without it, where the store is
 * the only authority). The owner's own export and import keep working exactly
 * as before: this widens nothing and narrows only the non-owner sessions.
 */
export async function requireOwner(request: Request): Promise<Response | null> {
  warmOwnerEmail();
  const headerEmail = request.headers.get(SESSION_ACCOUNT_HEADER)?.trim();
  const email =
    headerEmail && headerEmail.includes("@")
      ? headerEmail
      : await getSessionAccountEmail(
          request.headers.get("cookie")?.split(";").find((part) => part.trim().startsWith(`${SESSION_COOKIE}=`))?.trim().slice(SESSION_COOKIE.length + 1),
        );
  if (email && isOwnerEmail(email)) return null;
  return apiError("forbidden", {
    status: 403,
    message: "Only the installation owner can export, import or change team settings.",
  });
}