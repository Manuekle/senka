import { after } from "next/server";
import { NextResponse } from "next/server";
import { apiError, missingField, withApiErrors } from "@/lib/api-error";
import { clampMaxPages, normalizeAuditUrl, runSeoAudit } from "@/lib/seo-audit";
import {
  createSeoAudit,
  deleteSeoAudit,
  getRunningSeoAudit,
  listSeoAudits,
} from "@/lib/seo-audit-store";

export const dynamic = "force-dynamic";

// POST   /api/seo/audit               — start a crawl ({ url, maxPages, includeLighthouse })
// GET    /api/seo/audit               — the audit history, newest first
// DELETE /api/seo/audit?id=<audit_id> — drop an audit from the history

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const POST = withApiErrors(async function POST(request: Request) {
  const body = await readJson(request);
  if (!body) return apiError("invalid_json");

  if (typeof body.url !== "string" || !body.url.trim()) return missingField("url");
  // The same SSRF rules as a webhook URL: https, public host, no IP literals.
  // A normalized `null` is a sentence about the URL, not a code.
  const start = normalizeAuditUrl(body.url);
  if (!start) {
    return apiError("invalid_field", {
      field: "url",
      message: "Enter a public https URL.",
    });
  }

  const maxPages = clampMaxPages(body.maxPages ?? 50);
  if (maxPages === null) {
    return apiError("invalid_field", {
      field: "maxPages",
      message: "maxPages must be a whole number from 10 to 50.",
    });
  }

  if (typeof body.includeLighthouse !== "boolean" && body.includeLighthouse !== undefined) {
    return apiError("invalid_field", { field: "includeLighthouse", message: "includeLighthouse must be true or false." });
  }
  const includeLighthouse = body.includeLighthouse === true;

  // One crawl at a time per business. A second would double the load on the
  // site for the same answers, and the two runs would race the same store.
  if (await getRunningSeoAudit()) {
    return apiError("conflict", { message: "An audit is already running." });
  }

  const audit = await createSeoAudit({
    url: start.toString(),
    maxPages,
    includeLighthouse,
  });

  // The crawl runs past the response, kept alive by `after()` where the host
  // supports it and by this process's own lifetime where it does not. The
  // store is the only channel this run reports through: the table polls.
  after(async () => {
    await runSeoAudit(audit.id);
  });

  return NextResponse.json({ audit }, { status: 201 });
});

export const GET = withApiErrors(async function GET() {
  return NextResponse.json({ audits: await listSeoAudits() });
});

export const DELETE = withApiErrors(async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return missingField("id");
  if (!(await deleteSeoAudit(id))) return apiError("not_found");
  return NextResponse.json({ ok: true });
});
