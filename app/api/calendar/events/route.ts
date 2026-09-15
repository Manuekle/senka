import { NextResponse } from "next/server";
import { apiError, missingField, withApiErrors } from "@/lib/api-error";
import { createCalendarEvent, listUpcomingEvents, parseEventInput } from "@/lib/calendar";
import { calendarFailure } from "@/lib/calendar-http";

// GET /api/calendar/events?start=<ISO>&end=<ISO> — what the Calendar page
// draws for the range it currently has open. Both params are optional;
// without them this defaults to "next 30 days", the same window a caller
// hitting this route directly (curl, a script) would expect from its name.
//
// POST /api/calendar/events — create an event from the Calendar page. The
// body is an `EventInput` (see lib/calendar.ts); the answer is the event as
// Google stored it, so the page can draw it without a refetch.

const DEFAULT_WINDOW_DAYS = 30;
const MAX_RESULTS = 250;

export const GET = withApiErrors(async function GET(request: Request) {
  const url = new URL(request.url);
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");

  const now = new Date();
  const start = startParam && !Number.isNaN(Date.parse(startParam)) ? new Date(startParam) : now;
  const end =
    endParam && !Number.isNaN(Date.parse(endParam))
      ? new Date(endParam)
      : new Date(now.getTime() + DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const events = await listUpcomingEvents({
    start: start.toISOString(),
    end: end.toISOString(),
    maxResults: MAX_RESULTS,
  });

  // No Google identity configured at all — a state of the install, not a
  // failed request, so the page gets its "connect Google" panel instead of
  // an error banner. See lib/api-error.ts's `not_configured`.
  if (events === null) {
    return apiError("not_configured");
  }

  return NextResponse.json({ events });
});

export const POST = withApiErrors(async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }

  const parsed = parseEventInput(body);
  if (!parsed.ok) {
    return parsed.code === "missing_field" ? missingField(parsed.field) : apiError("invalid_field");
  }

  try {
    const event = await createCalendarEvent(parsed.input);
    if (event === null) return apiError("not_configured");
    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    return calendarFailure(error);
  }
});
