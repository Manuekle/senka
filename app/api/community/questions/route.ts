import { type NextRequest, NextResponse } from "next/server";
import { apiError, withApiErrors } from "@/lib/api-error";
import { parseQuestionInput } from "@/lib/community";
import { feedbackDestinations, forwardToTeam } from "@/lib/community-forward";
import {
  afterResponse,
  communityViewer,
  parseFailure,
  readJsonObject,
  submissionAllowed,
} from "@/lib/community-http";
import { createQuestion, listQuestions } from "@/lib/community-store";

export const dynamic = "force-dynamic";

// GET  /api/community/questions — the questions this account has sent
// POST /api/community/questions — ask one the FAQ did not answer ({ subject, body })

export const GET = withApiErrors(async function GET(request: NextRequest) {
  const viewer = await communityViewer(request);
  if ("response" in viewer) return viewer.response;
  const { webhook, email } = feedbackDestinations();
  return NextResponse.json({
    questions: await listQuestions(viewer.email),
    // Whether a question actually reaches someone. The page says so up front
    // rather than letting a question sit in a list nobody else reads.
    delivered: Boolean(webhook || email),
  });
});

export const POST = withApiErrors(async function POST(request: NextRequest) {
  const viewer = await communityViewer(request);
  if ("response" in viewer) return viewer.response;
  const body = await readJsonObject(request);
  if (!body) return apiError("invalid_json");
  const parsed = parseQuestionInput(body);
  if (!parsed.ok) return parseFailure(parsed);
  if (!submissionAllowed(viewer.email)) return apiError("rate_limited");

  const question = await createQuestion(viewer.email, parsed.value);
  const locale = typeof body.locale === "string" ? body.locale : undefined;
  afterResponse(() =>
    forwardToTeam({ kind: "question", ...parsed.value }, { account: viewer.email, locale }),
  );
  return NextResponse.json({ question });
});
