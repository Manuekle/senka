import { randomUUID } from "node:crypto";
import { getCredential } from "./credentials";
import { getGoogleToken } from "./google-auth";

// Google Calendar: availability and booking for the agent's `calendar` tool,
// and reading and writing events for the Calendar page.

export type CalendarSlot = {
  readonly start: string;
  readonly end: string;
};

export type CalendarEvent = {
  readonly event_id: string;
  readonly link: string;
  /** Set when the event got a Google Meet conference — see `bookCalendarEvent`. */
  readonly meetLink?: string;
};

export type UpcomingEvent = {
  readonly id: string;
  readonly summary: string;
  /** ISO datetime, or just a date for an all-day event. */
  readonly start: string;
  /** ISO datetime, or for an all-day event the day *after* the last one —
   *  Google's ends are exclusive, and so are these. */
  readonly end: string;
  readonly allDay: boolean;
  readonly link?: string;
  readonly meetLink?: string;
  readonly attendees: readonly string[];
  readonly description?: string;
  readonly location?: string;
  /** Google's event palette id, "1"–"11". Absent means the calendar's own colour. */
  readonly colorId?: string;
};

/** What the Calendar page sends to create or change an event. */
export type EventInput = {
  readonly summary: string;
  readonly allDay: boolean;
  /** `YYYY-MM-DD` when all-day, a zoned ISO datetime otherwise. */
  readonly start: string;
  /** Same shape as `start`. An all-day end is exclusive, like Google's. */
  readonly end: string;
  /** IANA zone the person picked the times in, so Google shows them there. */
  readonly timeZone?: string;
  readonly description?: string;
  readonly location?: string;
  /** "" puts the event back on the calendar's own colour. */
  readonly colorId?: string;
  /** Only honoured on create: a conference can't be requested by a patch. */
  readonly withMeet?: boolean;
};

/** A Google Calendar call that came back with an error status. The status is
 *  kept so a route can tell "that event is gone" from "Google is down". */
export class CalendarApiError extends Error {
  readonly status: number;

  constructor(status: number, body: string) {
    super(`Calendar API ${status}: ${body}`);
    this.name = "CalendarApiError";
    this.status = status;
  }
}

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const REQUEST_TIMEOUT_MS = 10_000;

/** `null` means neither a connected Google account nor a service account is
 *  configured — the caller decides whether that's a thrown error (the agent
 *  tool) or a "connect Google" empty state (the Calendar page). */
async function getCalendarTokenOrNull(): Promise<{ token: string; calendarId: string } | null> {
  const token = await getGoogleToken(CALENDAR_SCOPE);
  if (!token) return null;
  // A service account has no calendar of its own, so that setup has to name
  // one. A connected account does: "primary" is the person's own calendar,
  // which is what they meant by connecting it.
  const calendarId = (await getCredential("GOOGLE_CALENDAR_ID")) ?? "primary";
  return { token, calendarId };
}

async function getCalendarToken(): Promise<{ token: string; calendarId: string }> {
  const result = await getCalendarTokenOrNull();
  if (!result) {
    throw new Error("Connect a Google account, or set GOOGLE_SERVICE_ACCOUNT_JSON.");
  }
  return result;
}

function eventsUrl(calendarId: string): string {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
}

/**
 * Check available time slots in a date range.
 * Returns gaps between existing events that are at least `durationMin` minutes long.
 */
export async function checkCalendarSlots(opts: {
  readonly start: string;
  readonly end: string;
  readonly durationMin: number;
}): Promise<CalendarSlot[]> {
  const { token, calendarId } = await getCalendarToken();

  // Fetch existing events in the range
  const timeMin = encodeURIComponent(opts.start);
  const timeMax = encodeURIComponent(opts.end);
  const url = `${eventsUrl(calendarId)}?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;

  const response = await fetch(url, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new CalendarApiError(response.status, await response.text());
  }

  const data = (await response.json()) as {
    items?: Array<{ start?: { dateTime?: string }; end?: { dateTime?: string } }>;
  };

  const events = data.items ?? [];
  const slots: CalendarSlot[] = [];
  const rangeStart = new Date(opts.start).getTime();
  const rangeEnd = new Date(opts.end).getTime();
  const durationMs = opts.durationMin * 60 * 1000;

  // Sort events by start time
  const sorted = events
    .filter((e) => e.start?.dateTime && e.end?.dateTime)
    .sort((a, b) => new Date(a.start!.dateTime!).getTime() - new Date(b.start!.dateTime!).getTime());

  // Find gaps between events
  let current = rangeStart;

  for (const event of sorted) {
    const eventStart = new Date(event.start!.dateTime!).getTime();
    const eventEnd = new Date(event.end!.dateTime!).getTime();

    // Gap before this event
    if (eventStart - current >= durationMs) {
      slots.push({
        start: new Date(current).toISOString(),
        end: new Date(eventStart).toISOString(),
      });
    }

    current = Math.max(current, eventEnd);
  }

  // Gap after last event
  if (rangeEnd - current >= durationMs) {
    slots.push({
      start: new Date(current).toISOString(),
      end: new Date(rangeEnd).toISOString(),
    });
  }

  return slots;
}

/**
 * Book a calendar event.
 * Creates a new event in the specified calendar, with a Google Meet
 * conference by default — `conferenceDataVersion=1` is what makes the API
 * honor `conferenceData` at all; without it Google silently drops the
 * request and the event books with no meeting link.
 */
export async function bookCalendarEvent(opts: {
  readonly start: string;
  readonly end: string;
  readonly summary: string;
  readonly description?: string;
  readonly contactEmail?: string;
  readonly withMeet?: boolean;
}): Promise<CalendarEvent> {
  const { token, calendarId } = await getCalendarToken();

  const event: Record<string, unknown> = {
    summary: opts.summary,
    start: { dateTime: opts.start },
    end: { dateTime: opts.end },
  };

  if (opts.description) {
    event.description = opts.description;
  }

  if (opts.contactEmail) {
    event.attendees = [{ email: opts.contactEmail }];
  }

  const withMeet = opts.withMeet ?? true;
  if (withMeet) {
    event.conferenceData = meetRequest();
  }

  const url = `${eventsUrl(calendarId)}${withMeet ? "?conferenceDataVersion=1" : ""}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new CalendarApiError(response.status, await response.text());
  }

  const created = (await response.json()) as { id?: string; htmlLink?: string; hangoutLink?: string };

  return {
    event_id: created.id ?? "",
    link: created.htmlLink ?? "",
    meetLink: created.hangoutLink,
  };
}

function meetRequest() {
  return {
    createRequest: {
      requestId: randomUUID(),
      conferenceSolutionKey: { type: "hangoutsMeet" },
    },
  };
}

type GoogleEvent = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  colorId?: string;
  htmlLink?: string;
  hangoutLink?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string }>;
};

/** One Google event as the Calendar page draws it, or `null` for one it
 *  shouldn't draw at all (cancelled, or with no start to place it by). */
export function mapGoogleEvent(event: GoogleEvent): UpcomingEvent | null {
  const start = event.start?.dateTime ?? event.start?.date;
  if (event.status === "cancelled" || !start) return null;
  return {
    id: event.id ?? "",
    // Empty, not a placeholder sentence: the page picks the "(untitled)"
    // wording in whatever language is active.
    summary: event.summary ?? "",
    start,
    end: event.end?.dateTime ?? event.end?.date ?? start,
    allDay: Boolean(event.start?.date && !event.start?.dateTime),
    link: event.htmlLink,
    meetLink: event.hangoutLink,
    attendees: (event.attendees ?? []).map((a) => a.email).filter((email): email is string => Boolean(email)),
    description: event.description || undefined,
    location: event.location || undefined,
    colorId: event.colorId || undefined,
  };
}

/**
 * Events on the calendar between `start` and `end`, for the Calendar page —
 * whatever `calendar`'s `book_event` action, the page itself, or anyone
 * booking straight in Google Calendar has put there. `null` means no Google
 * identity is configured at all; an empty array means the calendar is just
 * clear for that range.
 */
export async function listUpcomingEvents(opts: {
  readonly start: string;
  readonly end: string;
  readonly maxResults?: number;
}): Promise<UpcomingEvent[] | null> {
  const auth = await getCalendarTokenOrNull();
  if (!auth) return null;
  const { token, calendarId } = auth;

  const params = new URLSearchParams({
    timeMin: opts.start,
    timeMax: opts.end,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(opts.maxResults ?? 50),
  });

  const response = await fetch(`${eventsUrl(calendarId)}?${params}`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new CalendarApiError(response.status, await response.text());
  }

  const data = (await response.json()) as { items?: GoogleEvent[] };
  return (data.items ?? [])
    .map(mapGoogleEvent)
    .filter((event): event is UpcomingEvent => event !== null);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
/** A datetime that says which instant it is. A bare `10:00` would be read in
 *  the server's zone, which is nobody's. */
const ZONED_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const COLOR_ID = /^(?:[1-9]|1[01])$/;
const MAX_SUMMARY = 1024;
const MAX_TEXT = 8192;

export type EventInputResult =
  | { readonly ok: true; readonly input: EventInput }
  | { readonly ok: false; readonly code: "missing_field" | "invalid_field"; readonly field: string };

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The body of a create or update, checked field by field before any of it
 *  reaches Google — whose own errors name the problem far less usefully. */
export function parseEventInput(body: unknown): EventInputResult {
  const missing = (field: string) => ({ ok: false, code: "missing_field", field }) as const;
  const invalid = (field: string) => ({ ok: false, code: "invalid_field", field }) as const;

  if (!body || typeof body !== "object" || Array.isArray(body)) return invalid("body");
  const raw = body as Record<string, unknown>;

  if (typeof raw.summary !== "string") return missing("summary");
  const summary = raw.summary.trim();
  if (summary.length > MAX_SUMMARY) return invalid("summary");

  if (raw.allDay !== undefined && typeof raw.allDay !== "boolean") return invalid("allDay");
  const allDay = raw.allDay === true;

  if (typeof raw.start !== "string" || !raw.start) return missing("start");
  if (typeof raw.end !== "string" || !raw.end) return missing("end");
  const start = raw.start;
  const end = raw.end;
  const shape = allDay ? DATE_ONLY : ZONED_DATETIME;
  if (!shape.test(start) || Number.isNaN(Date.parse(start))) return invalid("start");
  if (!shape.test(end) || Number.isNaN(Date.parse(end))) return invalid("end");
  if (Date.parse(end) <= Date.parse(start)) return invalid("end");

  const { timeZone, description, location, colorId, withMeet } = raw;
  if (timeZone !== undefined && (typeof timeZone !== "string" || !isTimeZone(timeZone))) {
    return invalid("timeZone");
  }
  if (description !== undefined && (typeof description !== "string" || description.length > MAX_TEXT)) {
    return invalid("description");
  }
  if (location !== undefined && (typeof location !== "string" || location.length > MAX_TEXT)) {
    return invalid("location");
  }
  if (colorId !== undefined && (typeof colorId !== "string" || (colorId !== "" && !COLOR_ID.test(colorId)))) {
    return invalid("colorId");
  }
  if (withMeet !== undefined && typeof withMeet !== "boolean") return invalid("withMeet");

  return {
    ok: true,
    input: {
      summary,
      allDay,
      start,
      end,
      timeZone: typeof timeZone === "string" ? timeZone : undefined,
      description: typeof description === "string" ? description.trim() : undefined,
      location: typeof location === "string" ? location.trim() : undefined,
      colorId: typeof colorId === "string" ? colorId : undefined,
      withMeet: withMeet === true,
    },
  };
}

/**
 * The Google event resource for an `EventInput`.
 *
 * A patch spells out `null` for the half of `start`/`end` it isn't using:
 * Google merges a patch into the stored event, so turning a timed event into
 * an all-day one without clearing `dateTime` leaves both and fails.
 */
export function toGoogleEventBody(
  input: EventInput,
  options: { readonly patch?: boolean } = {},
): Record<string, unknown> {
  const patch = options.patch === true;
  const when = (value: string) =>
    input.allDay
      ? { date: value, ...(patch ? { dateTime: null, timeZone: null } : {}) }
      : {
          dateTime: value,
          ...(input.timeZone ? { timeZone: input.timeZone } : {}),
          ...(patch ? { date: null } : {}),
        };

  const body: Record<string, unknown> = {
    summary: input.summary,
    start: when(input.start),
    end: when(input.end),
  };

  if (patch) {
    if (input.description !== undefined) body.description = input.description;
    if (input.location !== undefined) body.location = input.location;
    if (input.colorId !== undefined) body.colorId = input.colorId || null;
    return body;
  }

  if (input.description) body.description = input.description;
  if (input.location) body.location = input.location;
  if (input.colorId) body.colorId = input.colorId;
  if (input.withMeet) body.conferenceData = meetRequest();
  return body;
}

async function sendEvent(
  method: "POST" | "PATCH",
  url: string,
  token: string,
  body: Record<string, unknown>,
): Promise<UpcomingEvent> {
  const response = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new CalendarApiError(response.status, await response.text());
  }
  const event = mapGoogleEvent((await response.json()) as GoogleEvent);
  if (!event) throw new CalendarApiError(502, "Google answered with a cancelled event.");
  return event;
}

/** Create an event from the Calendar page. `null` means no Google identity. */
export async function createCalendarEvent(input: EventInput): Promise<UpcomingEvent | null> {
  const auth = await getCalendarTokenOrNull();
  if (!auth) return null;
  const url = `${eventsUrl(auth.calendarId)}${input.withMeet ? "?conferenceDataVersion=1" : ""}`;
  return sendEvent("POST", url, auth.token, toGoogleEventBody(input));
}

/** Change an event. Throws `CalendarApiError` 404/410 when it no longer exists. */
export async function updateCalendarEvent(id: string, input: EventInput): Promise<UpcomingEvent | null> {
  const auth = await getCalendarTokenOrNull();
  if (!auth) return null;
  const url = `${eventsUrl(auth.calendarId)}/${encodeURIComponent(id)}`;
  return sendEvent("PATCH", url, auth.token, toGoogleEventBody(input, { patch: true }));
}

/** Delete an event. An event that is already gone counts as deleted: the
 *  calendar ends up the way the person asked either way. */
export async function deleteCalendarEvent(id: string): Promise<boolean | null> {
  const auth = await getCalendarTokenOrNull();
  if (!auth) return null;
  const response = await fetch(`${eventsUrl(auth.calendarId)}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${auth.token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.ok || response.status === 404 || response.status === 410) return true;
  throw new CalendarApiError(response.status, await response.text());
}
