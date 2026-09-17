import { sendAppEmail } from "./email-send";
import { getInstallationId } from "./license/installation";

// Getting an idea, a question or a review from this installation to the team
// that builds the product.
//
// The installation is mono-tenant, so what a customer writes in Help &
// Community is stored where only their own accounts can see it. The team
// hears about it only if this installation is told where to send it:
//
//   STEVE_FEEDBACK_WEBHOOK_URL  — a JSON POST per submission, for a collector
//                                 (a sheet, a Linear intake, a Slack workflow).
//                                 STEVE_FEEDBACK_WEBHOOK_SECRET, when set, goes
//                                 out as a bearer token.
//   STEVE_FEEDBACK_EMAIL        — an email per submission, sent through
//                                 whatever provider the app already uses, with
//                                 reply-to set to the customer.
//
// Neither is required. Unset, a submission is stored and nothing leaves the
// install, which is the right default for a self-hosted deployment that never
// agreed to phone home. Delivery is best effort and never fails the request:
// the customer's submission is already saved by the time this runs.

export type CommunitySubmission =
  | {
      readonly kind: "idea";
      readonly title: string;
      readonly body: string;
      readonly category: string;
    }
  | { readonly kind: "question"; readonly subject: string; readonly body: string }
  | { readonly kind: "review"; readonly rating: number; readonly text: string };

const TIMEOUT_MS = 5_000;

export function feedbackDestinations(env: NodeJS.ProcessEnv = process.env): {
  readonly webhook: string | null;
  readonly email: string | null;
} {
  const webhook = env.STEVE_FEEDBACK_WEBHOOK_URL?.trim();
  const email = env.STEVE_FEEDBACK_EMAIL?.trim();
  return {
    webhook: webhook && /^https?:\/\//i.test(webhook) ? webhook : null,
    email: email || null,
  };
}

function subjectFor(submission: CommunitySubmission): string {
  switch (submission.kind) {
    case "idea":
      return `[Idea] ${submission.title}`;
    case "question":
      return `[Question] ${submission.subject}`;
    case "review":
      return `[Review] ${"★".repeat(submission.rating)}${"☆".repeat(5 - submission.rating)}`;
  }
}

function textFor(submission: CommunitySubmission): string {
  switch (submission.kind) {
    case "idea":
      return [`Category: ${submission.category}`, "", submission.body || "(no description)"].join("\n");
    case "question":
      return submission.body;
    case "review":
      return [`Rating: ${submission.rating}/5`, "", submission.text].join("\n");
  }
}

/** Whether at least one destination accepted it. */
export async function forwardToTeam(
  submission: CommunitySubmission,
  context: { readonly account: string; readonly locale?: string },
): Promise<boolean> {
  const { webhook, email } = feedbackDestinations();
  if (!webhook && !email) return false;

  const installation = await getInstallationId().catch(() => "unknown");
  const at = new Date().toISOString();
  const deliveries: Promise<boolean>[] = [];

  if (webhook) {
    const secret = process.env.STEVE_FEEDBACK_WEBHOOK_SECRET?.trim();
    deliveries.push(
      fetch(webhook, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(secret ? { authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify({ ...submission, account: context.account, locale: context.locale, installation, at }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
        .then((response) => {
          if (!response.ok) console.warn(`community: feedback webhook answered ${response.status}`);
          return response.ok;
        })
        .catch((error: unknown) => {
          console.warn("community: feedback webhook failed:", error);
          return false;
        }),
    );
  }

  if (email) {
    deliveries.push(
      sendAppEmail({
        to: email,
        replyTo: context.account,
        subject: subjectFor(submission),
        text: [textFor(submission), "", "—", `Account: ${context.account}`, `Installation: ${installation}`, `Sent: ${at}`].join("\n"),
      })
        .then((result) => {
          if (!result.success) console.warn("community: feedback email failed:", result.error);
          return result.success;
        })
        .catch((error: unknown) => {
          console.warn("community: feedback email failed:", error);
          return false;
        }),
    );
  }

  const results = await Promise.all(deliveries);
  return results.some(Boolean);
}
