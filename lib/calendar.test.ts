import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./google-auth", () => ({ getGoogleToken: vi.fn(async () => "token-123") }));
vi.mock("./credentials", () => ({ getCredential: vi.fn(async () => null) }));

import {
  CalendarApiError,
  createCalendarEvent,
  deleteCalendarEvent,
  mapGoogleEvent,
  parseEventInput,
  toGoogleEventBody,
  updateCalendarEvent,
  type EventInput,
} from "./calendar";

/**
 * The write half of the Calendar page: what the routes accept, and what
 * actually goes to Google. Google itself is a stubbed `fetch` — the point is
 * the request this code builds, not Google's reply to it.
 */

const timed: EventInput = {
  summary: "Demo con cliente",
  allDay: false,
  start: "2026-09-15T13:00:00.000Z",
  end: "2026-09-15T14:00:00.000Z",
  timeZone: "America/Argentina/Buenos_Aires",
};

function reply(status: number, body: unknown) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseEventInput", () => {
  it("accepts a timed event and trims its text", () => {
    const result = parseEventInput({ ...timed, summary: "  Demo  ", location: " Oficina ", extra: 1 });
    expect(result).toEqual({
      ok: true,
      input: {
        ...timed,
        summary: "Demo",
        location: "Oficina",
        description: undefined,
        colorId: undefined,
        withMeet: false,
      },
    });
  });

  it("wants a summary, a start and an end", () => {
    expect(parseEventInput({ start: timed.start, end: timed.end })).toMatchObject({
      ok: false,
      code: "missing_field",
      field: "summary",
    });
    expect(parseEventInput({ summary: "x", end: timed.end })).toMatchObject({ field: "start" });
  });

  it("refuses an end at or before the start", () => {
    expect(parseEventInput({ ...timed, end: timed.start })).toMatchObject({
      ok: false,
      code: "invalid_field",
      field: "end",
    });
  });

  it("refuses a datetime with no zone, since the server's zone is nobody's", () => {
    expect(parseEventInput({ ...timed, start: "2026-09-15T10:00" })).toMatchObject({ field: "start" });
  });

  it("takes bare dates for an all-day event, and only those", () => {
    expect(
      parseEventInput({ summary: "Feriado", allDay: true, start: "2026-09-15", end: "2026-09-16" }),
    ).toMatchObject({ ok: true });
    expect(parseEventInput({ ...timed, allDay: true })).toMatchObject({ ok: false, field: "start" });
  });

  it("only takes Google's own colour ids", () => {
    expect(parseEventInput({ ...timed, colorId: "11" })).toMatchObject({ ok: true });
    expect(parseEventInput({ ...timed, colorId: "" })).toMatchObject({ ok: true });
    expect(parseEventInput({ ...timed, colorId: "12" })).toMatchObject({ ok: false, field: "colorId" });
  });

  it("refuses a time zone Intl has never heard of", () => {
    expect(parseEventInput({ ...timed, timeZone: "Mars/Olympus" })).toMatchObject({ field: "timeZone" });
  });
});

describe("toGoogleEventBody", () => {
  it("builds a create with a Meet request only when asked", () => {
    const body = toGoogleEventBody({ ...timed, withMeet: true, colorId: "7" });
    expect(body).toMatchObject({
      summary: "Demo con cliente",
      start: { dateTime: timed.start, timeZone: timed.timeZone },
      end: { dateTime: timed.end, timeZone: timed.timeZone },
      colorId: "7",
      conferenceData: { createRequest: { conferenceSolutionKey: { type: "hangoutsMeet" } } },
    });
    expect(toGoogleEventBody(timed)).not.toHaveProperty("conferenceData");
  });

  it("clears the unused half of start and end on a patch", () => {
    const body = toGoogleEventBody(
      { summary: "Feriado", allDay: true, start: "2026-09-15", end: "2026-09-16", colorId: "" },
      { patch: true },
    );
    expect(body).toEqual({
      summary: "Feriado",
      start: { date: "2026-09-15", dateTime: null, timeZone: null },
      end: { date: "2026-09-16", dateTime: null, timeZone: null },
      colorId: null,
    });
  });
});

describe("mapGoogleEvent", () => {
  it("keeps what the page edits and drops cancelled events", () => {
    expect(
      mapGoogleEvent({
        id: "e1",
        summary: "Visita",
        description: "Llevar muestras",
        location: "Palermo",
        colorId: "4",
        start: { date: "2026-09-15" },
        end: { date: "2026-09-16" },
      }),
    ).toMatchObject({
      id: "e1",
      allDay: true,
      description: "Llevar muestras",
      location: "Palermo",
      colorId: "4",
      attendees: [],
    });
    expect(mapGoogleEvent({ id: "e2", status: "cancelled", start: { date: "2026-09-15" } })).toBeNull();
  });
});

describe("calendar writes", () => {
  it("creates on the primary calendar and asks for conference data with Meet", async () => {
    const fetchMock = vi.fn(async () =>
      reply(200, { id: "new-1", summary: "Demo con cliente", start: { dateTime: timed.start }, end: { dateTime: timed.end } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const event = await createCalendarEvent({ ...timed, withMeet: true });

    expect(event).toMatchObject({ id: "new-1", allDay: false });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ authorization: "Bearer token-123" });
  });

  it("reports a vanished event as a 404 CalendarApiError on update", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(404, { error: "not found" })));
    const failure = await updateCalendarEvent("gone", timed).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CalendarApiError);
    expect((failure as CalendarApiError).status).toBe(404);
  });

  it("treats deleting an already-deleted event as done", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(410, null)));
    await expect(deleteCalendarEvent("gone")).resolves.toBe(true);
  });
});
