import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, withApiErrors } from "@/lib/api-error";
import { checkoutWorkspace, workspacePrice, listWorkspacePurchases, cancelWorkspacePurchase, workspacePaymentPortal } from "@/lib/workspace-billing";
import { rateLimit } from "@/lib/rate-limit";

export const GET = withApiErrors(async (request: NextRequest) => {
  const [price, purchases] = await Promise.all([request.nextUrl.searchParams.has("quote") ? workspacePrice() : null, listWorkspacePurchases()]);
  return NextResponse.json({ price, purchases: purchases.map(({ id, workspaceId, name, status, cancelAtPeriodEnd, periodEnd }) => ({ id, workspaceId, name, status, cancelAtPeriodEnd, periodEnd })) });
});

const checkoutSchema = z.object({ requestId: z.uuid(), name: z.string().trim().min(1).max(100), priceId: z.string().min(1).max(100) });
export const POST = withApiErrors(async (request: NextRequest) => {
  if (!rateLimit("workspace-checkout", request, { max: 10, windowMs: 60_000 }).allowed) return apiError("rate_limited");
  const body = await request.json().catch(() => null);
  const portal = z.object({ action: z.literal("payment_method"), id: z.uuid() }).safeParse(body);
  if (portal.success) return NextResponse.json({ url: await workspacePaymentPortal(portal.data.id, request.nextUrl.origin) });
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) return apiError("invalid_body");
  if (!(await workspacePrice())) return apiError("not_configured", { status: 503 });
  const url = await checkoutWorkspace({ ...parsed.data, origin: request.nextUrl.origin });
  return NextResponse.json({ url });
});

export const DELETE = withApiErrors(async (request: NextRequest) => {
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !z.uuid().safeParse(id).success) return apiError("invalid_field", { field: "id" });
  await cancelWorkspacePurchase(id);
  return NextResponse.json({ cancelledAtPeriodEnd: true });
});
