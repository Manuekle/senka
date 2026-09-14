import { type NextRequest, NextResponse } from "next/server";
import { apiError, withApiErrors } from "@/lib/api-error";
import { getPlatformWebhookSecret, verifyStripeWebhookSignature } from "@/lib/stripe";
import { readBillingState, updateBillingState, nextPeriodEnd } from "@/lib/billing-store";
import { isPlanId } from "@/lib/plans";
import { expireWorkspaceCheckout, listWorkspacePurchases, subscriptionIdFrom, syncWorkspaceSubscription } from "@/lib/workspace-billing";

// POST /api/billing/webhook — Stripe calls this, not a browser. Public in
// middleware.ts (a webhook can't carry a session cookie); the signature
// check is what stands in for auth here.
//
// This installation is mono-tenant (see docs/commercial-licensing.md), so
// there is no customer/subscription lookup table to consult: any event that
// verifies against our own STRIPE_PLATFORM_WEBHOOK_SECRET is necessarily about this
// installation's one billing relationship, and the events below write
// straight into the single billing-store file.
//
// Idempotency: Stripe retries on a non-2xx response and can redeliver the
// same event more than once even on success (at-least-once delivery). Every
// write below is naturally idempotent — setting the same plan twice, or
// `paymentPastDue: true` twice, leaves the same state either way — so this
// does not track processed event ids. That would matter for a charge (see
// lib/ai-usage.ts, which does track one), not for a status mirror like this.

type StripeCheckoutSession = {
  readonly mode?: string;
  readonly customer?: string;
  readonly subscription?: string;
  readonly metadata?: Record<string, string>;
};

type StripeEvent = {
  readonly id: string;
  readonly type: string;
  readonly data: { readonly object: Record<string, unknown> };
};

export const POST = withApiErrors(async function POST(request: NextRequest) {
  // Read the raw body before anything touches it — the signature is over
  // these exact bytes, not over a re-serialized JSON.parse/JSON.stringify
  // round trip.
  const rawBody = await request.text();

  // The vendor's webhook secret, from the environment. The operator's own
  // Stripe key on Settings signs nothing here — see lib/stripe.ts.
  const webhookSecret = getPlatformWebhookSecret();
  if (!webhookSecret) {
    return apiError("not_configured", {
      message:
        "STRIPE_PLATFORM_WEBHOOK_SECRET is not set — subscription billing is not enabled on this installation.",
    });
  }

  const verified = verifyStripeWebhookSignature({
    rawBody,
    signatureHeader: request.headers.get("stripe-signature"),
    webhookSecret,
  });
  if (!verified) {
    return apiError("unauthorized", { message: "Invalid Stripe signature." });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return apiError("invalid_json");
  }

  const object = event.data.object;
  const metadata = object.metadata as Record<string, string> | undefined;
  const subscriptionId = event.type.startsWith("customer.subscription.") && typeof object.id === "string"
    ? object.id : subscriptionIdFrom(object);
  const workspaceEvent = metadata?.kind === "workspace" || (subscriptionId &&
    (await listWorkspacePurchases()).some((purchase) => purchase.subscriptionId === subscriptionId));
  if (workspaceEvent) {
    if (event.type === "checkout.session.expired" && metadata?.purchaseId && typeof object.id === "string") await expireWorkspaceCheckout(metadata.purchaseId, object.id);
    if (subscriptionId) await syncWorkspaceSubscription(subscriptionId);
    return NextResponse.json({ received: true });
  }
  // A workspace invoice can arrive before its checkout event. Never mirror an
  // unrelated subscription onto the base plan, even if events arrive out of order.
  if (event.type.startsWith("invoice.") || event.type.startsWith("customer.subscription.")) {
    const billing = await readBillingState();
    if (!subscriptionId || subscriptionId !== billing.stripeSubscriptionId) {
      if (subscriptionId && process.env.WORKFLOW_POSTGRES_URL) await syncWorkspaceSubscription(subscriptionId);
      return NextResponse.json({ received: true });
    }
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as StripeCheckoutSession;
      const customerId = typeof session.customer === "string" ? session.customer : undefined;
      const planValue = session.metadata?.plan;

      if (session.mode === "subscription" && isPlanId(planValue)) {
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : undefined;
        await updateBillingState((state) => ({
          ...state,
          plan: planValue,
          periodEnd: state.periodEnd ?? nextPeriodEnd(),
          pendingChange: null,
          hasPaymentMethod: true,
          paymentPastDue: false,
          stripeCustomerId: customerId ?? state.stripeCustomerId,
          stripeSubscriptionId: subscriptionId ?? state.stripeSubscriptionId,
        }));
      } else if (session.mode === "setup") {
        await updateBillingState((state) => ({
          ...state,
          hasPaymentMethod: true,
          stripeCustomerId: customerId ?? state.stripeCustomerId,
        }));
      }
      break;
    }

    // The subscription actually ending (cancelled, or payment retries
    // exhausted) — distinct from one failed invoice, which alone doesn't
    // mean the subscription is gone.
    case "customer.subscription.deleted": {
      await updateBillingState((state) => ({
        ...state,
        plan: "none",
        periodEnd: null,
        pendingChange: null,
        stripeSubscriptionId: null,
      }));
      break;
    }

    case "invoice.payment_failed": {
      await updateBillingState((state) => ({ ...state, paymentPastDue: true }));
      break;
    }

    case "invoice.paid": {
      await updateBillingState((state) => ({ ...state, paymentPastDue: false }));
      break;
    }

    default:
      // Every other event type is either irrelevant to billing state or not
      // subscribed to on the Stripe dashboard — either way, 200 it so Stripe
      // doesn't retry something this endpoint was never going to act on.
      break;
  }

  return NextResponse.json({ received: true });
});
