import { apiError } from "./api-error";
import { CalendarApiError } from "./calendar";

/**
 * A failed Google Calendar call, as the Calendar routes answer it.
 *
 * Google's status decides the code — a missing event is `not_found` so the
 * page can drop it, a refused token is `forbidden` so it can say to reconnect
 * — and anything that isn't a Google answer at all is rethrown for
 * `withApiErrors` to report as the server failure it is.
 */
export function calendarFailure(error: unknown): Response {
  if (!(error instanceof CalendarApiError)) throw error;
  console.error("[calendar]", error.message);
  if (error.status === 404 || error.status === 410) return apiError("not_found");
  if (error.status === 401 || error.status === 403) return apiError("forbidden");
  if (error.status === 400) return apiError("invalid_field");
  return apiError("upstream_failed");
}
