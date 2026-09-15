import { NextResponse } from "next/server";
import { apiError, missingField, withApiErrors } from "@/lib/api-error";
import { deleteCalendarEvent, parseEventInput, updateCalendarEvent } from "@/lib/calendar";
import { calendarFailure } from "@/lib/calendar-http";

// PATCH  /api/calendar/events/:id — change an event from the Calendar page.
//        Same body as the create; the answer is the event as Google now has it.
// DELETE /api/calendar/events/:id — remove it. One that is already gone
//        answers ok: the calendar ends up the way the person asked either way.

type Context = { params: Promise<{ id: string }> };

export const PATCH = withApiErrors(async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  if (!id) return missingField("id");

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
    const event = await updateCalendarEvent(id, parsed.input);
    if (event === null) return apiError("not_configured");
    return NextResponse.json({ event });
  } catch (error) {
    return calendarFailure(error);
  }
});

export const DELETE = withApiErrors(async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!id) return missingField("id");

  try {
    const deleted = await deleteCalendarEvent(id);
    if (deleted === null) return apiError("not_configured");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return calendarFailure(error);
  }
});
