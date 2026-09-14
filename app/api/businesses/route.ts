import { NextResponse, type NextRequest } from "next/server";
import { apiError, missingField, withApiErrors } from "@/lib/api-error";
import {
  forgetBusiness,
  listBusinesses,
  renameBusiness,
  DEFAULT_BUSINESS_ID,
  type BusinessEntry,
} from "@/lib/business-scope";
import { getBusinessIdentityById, getBusinessProfile } from "@/lib/business-profile-store";
import { WORKSPACE_COOKIE } from "@/lib/workspace-context";

// GET    /api/businesses — every business on this installation, and the active one
// POST   /api/businesses — refuses free creation; use /api/billing/workspaces
// PUT    /api/businesses — { id, name? , active? } rename and/or switch
// DELETE /api/businesses?id= — forget one (its documents are kept)
//
// Browser selection is a cookie, pinned by withApiErrors for this request.
// It never changes the installation's legacy inbound-channel destination.

export const dynamic = "force-dynamic";

/** The name to show. The pre-existing business has no name of its own — it
 *  predates the registry — so it borrows the one from its business profile
 *  until somebody renames it. Now reads identity for any business, not just
 *  the active one. */
async function displayName(entry: BusinessEntry, isActive: boolean): Promise<string> {
  if (entry.name.trim()) return entry.name.trim();
  const identity = await getBusinessIdentityById(entry.id);
  if (identity.name.trim()) return identity.name.trim();
  if (!isActive) return "";
  const record = await getBusinessProfile();
  return record?.profile.name?.trim() || "";
}

export const GET = withApiErrors(async function GET() {
  const { businesses, activeId } = await listBusinesses();
  const named = await Promise.all(
    businesses.map(async (entry) => {
      const isActive = entry.id === activeId;
      const identity = await getBusinessIdentityById(entry.id);
      return {
        id: entry.id,
        name: await displayName(entry, isActive),
        createdAt: entry.createdAt,
        active: isActive,
        /** The original business keeps every unsuffixed key and file, which is
         *  worth saying out loud in the one place that could offer to delete it. */
        primary: entry.id === DEFAULT_BUSINESS_ID,
        purchaseId: entry.purchaseId,
        access: entry.access ?? "active",
        logoUpdatedAt: identity.logo?.updatedAt ?? null,
      };
    }),
  );
  return NextResponse.json({ businesses: named, activeId });
});

export const POST = withApiErrors(async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }
  const input = body as { name?: unknown } | null;
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (!name) return missingField("name");

  return apiError("workspace_payment_required");
});

export const PUT = withApiErrors(async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }
  const input = body as { id?: unknown; name?: unknown; active?: unknown } | null;
  const id = typeof input?.id === "string" ? input.id : "";
  if (!id) return missingField("id");

  if (typeof input?.name === "string") {
    const renamed = await renameBusiness(id, input.name);
    if (!renamed) return apiError("not_found");
  }
  if (input?.active === true) {
    const { businesses } = await listBusinesses();
    const selected = businesses.find((business) => business.id === id);
    if (!selected) return apiError("not_found");
    if (selected.access === "suspended") return apiError("workspace_unavailable");
    const response = NextResponse.json({ businesses, activeId: id });
    response.cookies.set(WORKSPACE_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 365 * 86400 });
    return response;
  }

  const { businesses, activeId } = await listBusinesses();
  return NextResponse.json({ businesses, activeId });
});

export const DELETE = withApiErrors(async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return missingField("id");
  const forgotten = await forgetBusiness(id);
  if (!forgotten) {
    // The two refusals that are not "no such business": the last one, and the
    // one currently being looked at.
    return apiError("invalid_body", {
      detail: "Switch to another business first, and keep at least one.",
    });
  }
  const { businesses, activeId } = await listBusinesses();
  return NextResponse.json({ businesses, activeId });
});
