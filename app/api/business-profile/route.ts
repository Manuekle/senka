import { NextResponse, type NextRequest } from "next/server";
import { analyzeBusiness } from "@/lib/business-analysis";
import {
  clearBusinessProfile,
  getBusinessIdentity,
  getBusinessProfile,
  saveBusinessProfile,
  updateBusinessProfile,
  type BusinessProfile,
} from "@/lib/business-profile-store";
import { getProviderReport } from "@/lib/provider-catalog";
import { apiError, withApiErrors } from "@/lib/api-error";
import { guardAiRoute } from "@/lib/ai-route-guard";

// GET    /api/business-profile — the hand-entered identity + the last generated profile
// POST   /api/business-profile — { websiteUrl?, mapsUrl?, notes? } analyze and save
// PATCH  /api/business-profile — hand-correct fields of the generated profile
// DELETE /api/business-profile — clear the generated profile (identity is kept)

// Fetching two external pages plus a model call comfortably exceeds the
// default duration for a static route.
export const maxDuration = 90;

export const GET = withApiErrors(async function GET() {
  const [record, identity] = await Promise.all([getBusinessProfile(), getBusinessIdentity()]);
  return NextResponse.json({ record, identity });
});

export const POST = withApiErrors(async function POST(request: NextRequest) {
  const refused = await guardAiRoute(request, "business-profile");
  if (refused) return refused;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }
  if (!body || typeof body !== "object") {
    return apiError("invalid_body");
  }

  const input = body as { websiteUrl?: unknown; mapsUrl?: unknown; notes?: unknown };
  const websiteUrl = typeof input.websiteUrl === "string" ? input.websiteUrl : undefined;
  const mapsUrl = typeof input.mapsUrl === "string" ? input.mapsUrl : undefined;
  const notes = typeof input.notes === "string" ? input.notes : undefined;

  const health = await getProviderReport();
  if (health.status === "missing" || health.status === "invalid") {
    return apiError("no_credentials");
  }

  const outcome = await analyzeBusiness({ websiteUrl, mapsUrl, notes });
  if (!outcome.ok) {
    if (outcome.reason === "no_sources") {
      return apiError("missing_field", {
        field: "websiteUrl",
        message: "Add a website, a Maps link, notes, or upload a document first.",
      });
    }
    return apiError("generation_failed", { detail: outcome.detail });
  }

  await saveBusinessProfile(outcome.record);
  return NextResponse.json({ record: outcome.record });
});

/** Free-text fields the owner can correct by hand. `faqs` is deliberately not
 *  among them — a Q&A pair belongs in the knowledge base, where the agent can
 *  actually retrieve it, not in a background summary. */
const TEXT_FIELDS = ["name", "industry", "description", "tone"] as const;
const NULLABLE_TEXT_FIELDS = ["location", "hours"] as const;
const LIST_FIELDS = ["services", "highlights"] as const;

function readPatch(input: Record<string, unknown>): Partial<BusinessProfile> {
  const patch: Record<string, unknown> = {};

  for (const field of TEXT_FIELDS) {
    if (typeof input[field] === "string") patch[field] = (input[field] as string).trim();
  }
  for (const field of NULLABLE_TEXT_FIELDS) {
    const value = input[field];
    if (value === null) patch[field] = null;
    else if (typeof value === "string") patch[field] = value.trim() || null;
  }
  for (const field of LIST_FIELDS) {
    const value = input[field];
    if (Array.isArray(value)) {
      patch[field] = value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }

  return patch as Partial<BusinessProfile>;
}

export const PATCH = withApiErrors(async function PATCH(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }
  if (!body || typeof body !== "object") return apiError("invalid_body");

  const patch = readPatch(body as Record<string, unknown>);
  if (Object.keys(patch).length === 0) return apiError("nothing_to_update");
  if (patch.name !== undefined && !patch.name) {
    return apiError("invalid_field", { field: "name", message: "name can't be empty." });
  }

  const record = await updateBusinessProfile(patch);
  if (!record) return apiError("not_found", { message: "There is no generated profile to edit yet." });
  return NextResponse.json({ record });
});

export const DELETE = withApiErrors(async function DELETE() {
  await clearBusinessProfile();
  return NextResponse.json({ ok: true });
});
