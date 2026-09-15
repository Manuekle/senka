import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, withApiErrors } from "@/lib/api-error";
import { importContacts } from "@/lib/business-store";
import { CSV_MAX_ROWS, EMAIL_PATTERN, PHONE_PATTERN } from "@/lib/csv-import";

// The browser parses and maps the file (lib/csv-import.ts); this route trusts
// none of it. Every row is re-validated and the whole batch is one write.

const row = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().toLowerCase().max(254).regex(EMAIL_PATTERN).optional(),
  phone: z.string().regex(PHONE_PATTERN).optional(),
  status: z.enum(["open", "waiting_human", "followup_due", "closed"]).optional(),
  notes: z.string().max(2000).optional(),
  attributes: z.record(z.string().min(1).max(60), z.string().max(500))
    .refine((value) => Object.keys(value).length <= 30)
    .default({}),
}).refine((contact) => Boolean(contact.email || contact.phone));

const body = z.object({ contacts: z.array(row).min(1).max(CSV_MAX_ROWS) });

export const POST = withApiErrors(async (request: NextRequest) => {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("invalid_body");
  const { created, updated } = await importContacts(parsed.data.contacts);
  return NextResponse.json({ created, updated, total: parsed.data.contacts.length });
});
