import { join } from "node:path";
import { homedir } from "node:os";
import { createDocumentStore } from "./doc-store";
import { requireBusinessDatabase, type BusinessEntry } from "./business-scope";
import { getInstallationId } from "./license/installation";
import { getPlatformStripeKey } from "./stripe";
import { readBillingState } from "./billing-store";
import { sharedPool } from "./postgres-pool";
import type { PoolClient } from "pg";

export type WorkspacePurchase = {
  id: string;
  workspaceId: string;
  name: string;
  priceId: string;
  createdAt: string;
  checkoutId?: string;
  url?: string;
  subscriptionId?: string;
  customerId?: string;
  status: "pending" | "active" | "past_due" | "cancelled";
  cancelAtPeriodEnd?: boolean;
  periodEnd?: number;
};

const purchases = createDocumentStore<{ purchases: WorkspacePurchase[] }>({
  id: "workspace-purchases", file: join(homedir(), ".senka", "workspace-purchases.json"),
  empty: () => ({ purchases: [] }), normalize: (raw) => ({ purchases: raw.purchases ?? [] }),
  requireDatabase: true,
});

type StripePrice = {
  id: string; active: boolean; unit_amount: number | null; currency: string;
  billing_scheme: string;
  recurring?: { interval: string; interval_count: number; usage_type: string };
};
type StripeSubscription = {
  id: string; customer: string; status: string; metadata: Record<string, string>;
  cancel_at_period_end: boolean;
  items: { data: { price: { id: string }; quantity: number; current_period_end?: number }[] };
  current_period_end?: number;
  latest_invoice?: { status: string; paid?: boolean } | string | null;
};

async function stripe<T>(path: string, body?: URLSearchParams, key?: string): Promise<T> {
  const secret = getPlatformStripeKey();
  if (!secret) throw new Error("Workspace billing is not configured");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${secret}`,
      ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    }, body, signal: AbortSignal.timeout(15_000), cache: "no-store",
  });
  if (!response.ok) throw new Error(`Stripe request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export async function workspacePrice() {
  const id = process.env.STRIPE_WORKSPACE_PRICE_ID?.trim();
  if (!id || !getPlatformStripeKey() || !process.env.WORKFLOW_POSTGRES_URL) return null;
  const price = await stripe<StripePrice>(`prices/${encodeURIComponent(id)}`);
  if (!price.active || !Number.isSafeInteger(price.unit_amount) || price.unit_amount! <= 0 ||
      price.billing_scheme !== "per_unit" || price.recurring?.interval !== "month" ||
      price.recurring.interval_count !== 1 || price.recurring.usage_type !== "licensed") {
    throw new Error("Workspace price must be an active, fixed monthly price");
  }
  const decimals = new Intl.NumberFormat("en", { style: "currency", currency: price.currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return { id: price.id, amount: price.unit_amount! / 10 ** decimals, currency: price.currency.toUpperCase() };
}

export async function listWorkspacePurchases(): Promise<WorkspacePurchase[]> {
  if (!process.env.WORKFLOW_POSTGRES_URL) return [];
  return (await purchases.read()).purchases;
}

export async function checkoutWorkspace(input: { requestId: string; name: string; priceId: string; origin: string }): Promise<string> {
  await requireBusinessDatabase();
  const price = await workspacePrice();
  if (!price || price.id !== input.priceId) throw new Error("Workspace price changed; review it before paying");
  const purchase = await purchases.update((store) => {
    const existing = store.purchases.find((p) => p.id === input.requestId);
    if (existing) {
      if (existing.name !== input.name || existing.priceId !== price.id || existing.status !== "pending") throw new Error("Purchase request already used");
      return structuredClone(existing);
    }
    if (store.purchases.filter((p) => p.status === "pending" && Date.parse(p.createdAt) > Date.now() - 86_400_000).length >= 20) throw new Error("Too many pending workspace purchases");
    const next: WorkspacePurchase = {
      id: input.requestId, workspaceId: `b-${input.requestId}`, name: input.name,
      priceId: price.id, createdAt: new Date().toISOString(), status: "pending",
    };
    store.purchases.push(next);
    return structuredClone(next);
  });
  // Stripe idempotency keys expire; never reuse an old local purchase to charge again.
  if (Date.now() - Date.parse(purchase.createdAt) > 23 * 60 * 60_000) throw new Error("Purchase expired; start a new checkout");
  if (purchase.url) return purchase.url;
  const installationId = await getInstallationId();
  const billing = await readBillingState();
  const body = new URLSearchParams({
    mode: "subscription", "line_items[0][price]": price.id, "line_items[0][quantity]": "1",
    success_url: `${input.origin}/account?workspacePurchase=${encodeURIComponent(purchase.id)}`,
    cancel_url: `${input.origin}/account?workspaceCheckout=cancelled`,
    "metadata[kind]": "workspace", "metadata[purchaseId]": purchase.id,
    "metadata[installationId]": installationId,
    "subscription_data[metadata][kind]": "workspace",
    "subscription_data[metadata][purchaseId]": purchase.id,
    "subscription_data[metadata][installationId]": installationId,
  });
  if (billing.stripeCustomerId) body.set("customer", billing.stripeCustomerId);
  const session = await stripe<{ id: string; url: string }>("checkout/sessions", body, `workspace:${installationId}:${purchase.id}`);
  if (!session.url || !session.id) throw new Error("Stripe did not return a checkout URL");
  await purchases.update((store) => {
    const entry = store.purchases.find((p) => p.id === purchase.id)!;
    entry.checkoutId = session.id; entry.url = session.url;
  });
  return session.url;
}

export function subscriptionIdFrom(object: Record<string, unknown>): string | undefined {
  if (typeof object.subscription === "string") return object.subscription;
  const parent = object.parent as { subscription_details?: { subscription?: unknown } } | undefined;
  const id = parent?.subscription_details?.subscription;
  return typeof id === "string" ? id : undefined;
}

/** Read current Stripe state: redelivery and out-of-order webhooks cannot rewind access. */
export async function syncWorkspaceSubscription(subscriptionId: string): Promise<boolean> {
  if (!process.env.WORKFLOW_POSTGRES_URL) throw new Error("PostgreSQL is required for workspace billing");
  // Warm schema and installation metadata before taking a connection. The
  // transaction below uses only that one connection, even with a pool of one.
  await purchases.read();
  const installationId = await getInstallationId();
  const client = await sharedPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`workspace-subscription:${subscriptionId}`]);
    const result = await syncSubscription(client, subscriptionId, installationId);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

async function syncSubscription(client: PoolClient, subscriptionId: string, installationId: string): Promise<boolean> {
  const subscription = await stripe<StripeSubscription>(`subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=latest_invoice`);
  if (subscription.metadata?.kind !== "workspace") return false;
  if (subscription.metadata.installationId !== installationId) return true;
  const locked = await client.query<{ data: { purchases: WorkspacePurchase[] } }>(
    "SELECT data FROM senka.documents WHERE id = $1 FOR UPDATE", ["workspace-purchases"],
  );
  const store = locked.rows[0]?.data;
  const purchase = store?.purchases.find((p) => p.id === subscription.metadata.purchaseId);
  if (!purchase) return true;
  if (purchase.subscriptionId && purchase.subscriptionId !== subscription.id) throw new Error("Workspace subscription mismatch");
  if (subscription.items.data.length !== 1 || subscription.items.data[0].price.id !== purchase.priceId || subscription.items.data[0].quantity !== 1) throw new Error("Workspace subscription price mismatch");
  const invoice = subscription.latest_invoice;
  const paid = typeof invoice === "object" && invoice !== null && invoice.status === "paid";
  const active = subscription.status === "active" && paid;
  const cancelled = ["canceled", "unpaid", "incomplete_expired", "paused"].includes(subscription.status);
  const status = active ? "active" : cancelled ? "cancelled" : purchase.subscriptionId ? "past_due" : "pending";
  // Provision and entitlement commit together. Retries never create a second
  // workspace and a partial database failure never grants unpaid access.
  if (active || purchase.subscriptionId) {
    const initial = { businesses: [{ id: "default", name: "", createdAt: new Date().toISOString() }], activeId: "default" };
    await client.query("INSERT INTO senka.documents (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING", ["businesses", JSON.stringify(initial)]);
    const row = await client.query<{ data: { businesses: BusinessEntry[]; activeId: string } }>("SELECT data FROM senka.documents WHERE id = $1 FOR UPDATE", ["businesses"]);
    const registry = row.rows[0].data;
    if (active && !registry.businesses.some((entry) => entry.id === purchase.workspaceId)) {
      registry.businesses.push({ id: purchase.workspaceId, purchaseId: purchase.id, name: purchase.name, createdAt: new Date().toISOString(), access: "active" });
    }
    registry.businesses = registry.businesses.map((entry) => entry.id === purchase.workspaceId ? { ...entry, access: active ? "active" : "suspended" } : entry);
    await client.query("UPDATE senka.documents SET data = $2::jsonb, updated_at = now() WHERE id = $1", ["businesses", JSON.stringify(registry)]);
  }
  Object.assign(purchase, {
    subscriptionId: subscription.id, customerId: subscription.customer, status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    periodEnd: subscription.items.data[0].current_period_end ?? subscription.current_period_end,
  });
  await client.query("UPDATE senka.documents SET data = $2::jsonb, updated_at = now() WHERE id = $1", ["workspace-purchases", JSON.stringify(store)]);
  return true;
}

export async function cancelWorkspacePurchase(id: string): Promise<void> {
  const purchase = (await purchases.read()).purchases.find((p) => p.id === id);
  if (!purchase?.subscriptionId || purchase.status === "cancelled") throw new Error("Workspace subscription not found");
  await stripe(`subscriptions/${encodeURIComponent(purchase.subscriptionId)}`, new URLSearchParams({ cancel_at_period_end: "true" }));
  await syncWorkspaceSubscription(purchase.subscriptionId);
}

export async function workspacePaymentPortal(id: string, origin: string): Promise<string> {
  const purchase = (await purchases.read()).purchases.find((entry) => entry.id === id);
  if (!purchase?.customerId) throw new Error("Workspace billing customer not found");
  const session = await stripe<{ url: string }>("billing_portal/sessions", new URLSearchParams({
    customer: purchase.customerId, return_url: `${origin}/account`,
    "flow_data[type]": "payment_method_update",
  }));
  if (!session.url) throw new Error("Stripe did not return a billing portal URL");
  return session.url;
}

export async function expireWorkspaceCheckout(purchaseId: string, sessionId: string): Promise<void> {
  await purchases.update((store) => {
    const purchase = store.purchases.find((entry) => entry.id === purchaseId);
    if (purchase?.status === "pending" && !purchase.subscriptionId && purchase.checkoutId === sessionId) purchase.status = "cancelled";
  });
}
