// One shape for every error an API route returns.
//
// Routes used to answer with an ad-hoc English (sometimes Spanish) sentence,
// which left the UI with nothing to switch on and no way to say the same thing
// in the other language. Every failure now carries a stable `code`: the client
// translates it, and `error`/`message` stay as the readable English fallback
// for anything reading the response raw (curl, webhooks, logs).

import { NextResponse } from "next/server";

/** The full set of failures the app can report. Mirrored by the
 *  `apiError.<code>` entries in `lib/i18n/dictionaries.ts` — a new code needs
 *  its two dictionary lines or the UI falls back to the generic sentence. */
export type ApiErrorCode =
  | "invalid_json"
  | "invalid_body"
  | "missing_field"
  | "invalid_field"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "unprocessable"
  | "too_large"
  | "not_configured"
  | "rate_limited"
  | "upstream_failed"
  | "timeout"
  | "server_error"
  | "method_not_allowed"
  // Domain-specific failures that deserve their own wording rather than the
  // generic sentence for their status.
  | "no_credentials"
  | "model_unavailable"
  | "generation_failed"
  | "no_file"
  | "unsupported_format"
  | "nothing_to_update"
  | "no_recognized_keys"
  | "wrong_password"
  | "workspace_unavailable"
  | "workspace_payment_required";

type CodeSpec = { readonly status: number; readonly message: string };

/** Default HTTP status and English fallback wording per code. */
const CODES: Record<ApiErrorCode, CodeSpec> = {
  invalid_json: { status: 400, message: "The request body isn't valid JSON." },
  invalid_body: { status: 400, message: "The request body isn't in the expected shape." },
  missing_field: { status: 400, message: "A required field is missing." },
  invalid_field: { status: 400, message: "A field has a value this endpoint can't accept." },
  unauthorized: { status: 401, message: "This request isn't authorized." },
  forbidden: { status: 403, message: "This action isn't allowed." },
  not_found: { status: 404, message: "That item no longer exists." },
  conflict: { status: 409, message: "That item is in a state this action can't be applied to." },
  unprocessable: { status: 422, message: "The request was understood but can't be completed." },
  too_large: { status: 413, message: "The file is too large." },
  not_configured: { status: 200, message: "This integration isn't configured yet." },
  rate_limited: { status: 429, message: "Too many requests — wait a moment and retry." },
  upstream_failed: { status: 502, message: "An external service didn't answer correctly." },
  timeout: { status: 504, message: "The request took too long to answer." },
  server_error: { status: 500, message: "Something broke on our side." },
  method_not_allowed: { status: 405, message: "This endpoint doesn't accept that HTTP method." },
  no_credentials: { status: 400, message: "No usable model credential is configured." },
  model_unavailable: { status: 422, message: "That model isn't available on this account." },
  generation_failed: { status: 502, message: "The model couldn't produce a usable result." },
  no_file: { status: 400, message: "No file was received." },
  unsupported_format: { status: 400, message: "That file format isn't supported." },
  nothing_to_update: { status: 400, message: "The request didn't ask for any change." },
  no_recognized_keys: { status: 422, message: "The file held no credential this app knows." },
  wrong_password: { status: 401, message: "That current password is incorrect." },
  workspace_unavailable: { status: 403, message: "Workspace access is unavailable. Review billing or switch workspace." },
  workspace_payment_required: { status: 402, message: "Additional workspaces require a monthly subscription." },
};

export interface ApiErrorBody {
  /** Stable identifier the UI translates. */
  readonly code: ApiErrorCode;
  /** English fallback — kept under `error` because that is the key existing
   *  clients already read. */
  readonly error: string;
  readonly message: string;
  /** Which input caused it, when the code alone doesn't say. */
  readonly field?: string;
  /** Extra context for logs and support — never the only thing shown. */
  readonly detail?: string;
}

export interface ApiErrorOptions {
  /** Overrides the code's default status (e.g. a `not_found` returned as 409). */
  readonly status?: number;
  readonly field?: string;
  readonly detail?: string;
  /** Overrides the English fallback sentence. */
  readonly message?: string;
}

/** Builds the JSON body without sending it — useful inside streaming routes. */
export function apiErrorBody(code: ApiErrorCode, options: ApiErrorOptions = {}): ApiErrorBody {
  const message = options.message ?? CODES[code].message;
  return {
    code,
    error: message,
    message,
    ...(options.field ? { field: options.field } : {}),
    ...(options.detail ? { detail: options.detail } : {}),
  };
}

/** The one way an API route reports a failure. */
export function apiError(code: ApiErrorCode, options: ApiErrorOptions = {}): NextResponse {
  return NextResponse.json(apiErrorBody(code, options), {
    status: options.status ?? CODES[code].status,
  });
}

/** `missing_field` with the field name filled in — by far the most common case. */
export function missingField(field: string): NextResponse {
  return apiError("missing_field", { field, message: `${field} is required.` });
}

/**
 * Wraps an unexpected throw.
 *
 * `detail` used to carry the thrown message. The comment said "support and
 * logs", but `apiErrorBody` puts `detail` in the response, so it was going to
 * the caller: a `pg` failure naming the host and database, an `ENOENT` with
 * the server's home directory in it, an SDK message quoting the request it
 * built. In production the message is logged and the caller gets the code
 * alone; outside production it is passed through, because "something broke on
 * our side" with nothing after it is a bad afternoon for whoever is building
 * against this locally.
 */
export function apiFailure(
  error: unknown,
  code: Extract<ApiErrorCode, "server_error" | "upstream_failed" | "timeout"> = "server_error",
): NextResponse {
  const detail = error instanceof Error ? error.message : String(error);
  if (process.env.NODE_ENV === "production") {
    console.error(`[api] ${code}:`, detail);
    return apiError(code);
  }
  return apiError(code, { detail });
}

/**
 * Wraps a route handler so an unexpected throw becomes the same JSON envelope
 * as every deliberate failure. Without it Next answers an unhandled rejection
 * with an HTML error page, which the client cannot translate and the user
 * reads as a raw 500.
 */
export function withApiErrors<A extends unknown[], R extends Response>(
  handler: (...args: A) => Promise<R> | R,
): (...args: A) => Promise<Response> {
  return async (...args: A): Promise<Response> => {
    try {
      const request = args[0] instanceof Request ? args[0] : undefined;
      if (request && /^\/api\/(auth|health)(\/|$)/.test(new URL(request.url).pathname)) return await handler(...args);
      const { runWorkspaceRequest } = await import("./workspace-request");
      return await runWorkspaceRequest(request, async () => handler(...args));
    } catch (error) {
      console.error("[api] unhandled failure", error);
      return apiFailure(error);
    }
  };
}
