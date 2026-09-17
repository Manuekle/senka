import { after, type NextRequest } from "next/server";
import { apiError } from "./api-error";
import { getSessionAccountEmail, SESSION_COOKIE } from "./auth/store";
import { rateLimit } from "./rate-limit";
import type { Parsed } from "./community";

// What the three Help & Community routes share: who is asking, a JSON body,
// a submission budget, and turning a failed parse into the app's error shape.

/** The signed-in account, or the 401 to return. Middleware already refused
 *  anyone without a session; this is the identity a vote is counted against. */
export async function communityViewer(
  request: NextRequest,
): Promise<{ email: string } | { response: Response }> {
  const email = await getSessionAccountEmail(request.cookies.get(SESSION_COOKIE)?.value);
  return email ? { email } : { response: apiError("unauthorized") };
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Twenty submissions in ten minutes per account, across ideas, questions and
 *  reviews together — far past what a person writes, well short of a loop. */
export function submissionAllowed(email: string): boolean {
  return rateLimit("community-submit", email.toLowerCase(), { max: 20, windowMs: 10 * 60_000 })
    .allowed;
}

export function parseFailure(parsed: Extract<Parsed<unknown>, { ok: false }>): Response {
  return parsed.reason === "missing"
    ? apiError("missing_field", { field: parsed.field, message: `${parsed.field} is required.` })
    : apiError("invalid_field", { field: parsed.field });
}

/**
 * Runs `task` after the response is sent. Outside a request — a route handler
 * called straight from a test — there is no response to wait for, so it just
 * runs.
 */
export function afterResponse(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}
