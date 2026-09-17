import { type NextRequest, NextResponse } from "next/server";
import { apiError, missingField, withApiErrors } from "@/lib/api-error";
import { parseIdeaInput, sortIdeas, type IdeaSort } from "@/lib/community";
import { forwardToTeam } from "@/lib/community-forward";
import {
  afterResponse,
  communityViewer,
  parseFailure,
  readJsonObject,
  submissionAllowed,
} from "@/lib/community-http";
import { createIdea, deleteIdea, listIdeas, setIdeaVote } from "@/lib/community-store";

export const dynamic = "force-dynamic";

// GET    /api/community/ideas?sort=top|new  — the board, most wanted first by default
// POST   /api/community/ideas               — suggest one ({ title, body?, category? })
// PATCH  /api/community/ideas               — like or unlike ({ id, voted })
// DELETE /api/community/ideas?id=<id>       — take down your own

export const GET = withApiErrors(async function GET(request: NextRequest) {
  const viewer = await communityViewer(request);
  if ("response" in viewer) return viewer.response;
  const sort: IdeaSort = request.nextUrl.searchParams.get("sort") === "new" ? "new" : "top";
  return NextResponse.json({ ideas: sortIdeas(await listIdeas(viewer.email), sort) });
});

export const POST = withApiErrors(async function POST(request: NextRequest) {
  const viewer = await communityViewer(request);
  if ("response" in viewer) return viewer.response;
  const body = await readJsonObject(request);
  if (!body) return apiError("invalid_json");
  const parsed = parseIdeaInput(body);
  if (!parsed.ok) return parseFailure(parsed);
  if (!submissionAllowed(viewer.email)) return apiError("rate_limited");

  const idea = await createIdea(viewer.email, parsed.value);
  const locale = typeof body.locale === "string" ? body.locale : undefined;
  afterResponse(() =>
    forwardToTeam({ kind: "idea", ...parsed.value }, { account: viewer.email, locale }),
  );
  return NextResponse.json({ idea });
});

export const PATCH = withApiErrors(async function PATCH(request: NextRequest) {
  const viewer = await communityViewer(request);
  if ("response" in viewer) return viewer.response;
  const body = await readJsonObject(request);
  if (!body) return apiError("invalid_json");
  if (typeof body.id !== "string" || !body.id) return missingField("id");
  if (typeof body.voted !== "boolean") return apiError("invalid_field", { field: "voted" });

  const idea = await setIdeaVote(viewer.email, body.id, body.voted);
  if (!idea) return apiError("not_found");
  return NextResponse.json({ idea });
});

export const DELETE = withApiErrors(async function DELETE(request: NextRequest) {
  const viewer = await communityViewer(request);
  if ("response" in viewer) return viewer.response;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return missingField("id");

  const result = await deleteIdea(viewer.email, id);
  if (result === "not_found") return apiError("not_found");
  if (result === "forbidden") return apiError("forbidden");
  return NextResponse.json({ ok: true });
});
