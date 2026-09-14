import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  document: { purchases: [] as import("./workspace-billing").WorkspacePurchase[] },
  fetch: vi.fn(), create: vi.fn(), access: vi.fn(), query: vi.fn(),
}));
vi.mock("./doc-store", () => ({ createDocumentStore: () => ({
  read: async () => structuredClone(state.document),
  update: async (fn: (store: typeof state.document) => unknown) => fn(state.document),
}) }));
vi.mock("./business-scope", () => ({ createBusiness: state.create, setBusinessAccess: state.access, requireBusinessDatabase: vi.fn() }));
vi.mock("./stripe", () => ({ getPlatformStripeKey: () => "sk_test_fixture" }));
vi.mock("./license/installation", () => ({ getInstallationId: async () => "installation-test" }));
vi.mock("./billing-store", () => ({ readBillingState: async () => ({ stripeCustomerId: "cus_test" }) }));
vi.mock("./postgres-pool", () => ({ sharedPool: () => ({ connect: async () => ({ query: state.query, release: vi.fn() }) }) }));

const { checkoutWorkspace, syncWorkspaceSubscription, workspacePrice, cancelWorkspacePurchase, subscriptionIdFrom } = await import("./workspace-billing");
const requestId = "7cb98e24-fd32-436b-ac3c-5200c6efa343";
const input = { requestId, name: "Second workspace", priceId: "price_test", origin: "https://app.example.test" };
const price = { id: "price_test", active: true, unit_amount: 1200, currency: "usd", billing_scheme: "per_unit", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } };

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_workspace", customer: "cus_test", status: "active",
    metadata: { kind: "workspace", purchaseId: requestId, installationId: "installation-test" },
    items: { data: [{ price: { id: "price_test" }, quantity: 1, current_period_end: 1800000000 }] },
    latest_invoice: { status: "paid" }, cancel_at_period_end: false, ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks(); state.document = { purchases: [] };
  state.query.mockResolvedValue({ rows: [] });
  vi.stubEnv("STRIPE_WORKSPACE_PRICE_ID", "price_test");
  vi.stubEnv("WORKFLOW_POSTGRES_URL", "postgres://test/never-connected");
  vi.stubGlobal("fetch", state.fetch);
  state.fetch.mockImplementation(async (url: string) => {
    if (url.includes("/prices/")) return Response.json(price);
    if (url.endsWith("/checkout/sessions")) return Response.json({ id: "cs_test", url: "https://checkout.stripe.com/test-session" });
    return Response.json(subscription());
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("monthly workspace checkout", () => {
  it("takes the displayed price from Stripe and refuses annual or metered prices", async () => {
    expect(await workspacePrice()).toEqual({ id: "price_test", amount: 12, currency: "USD" });
    state.fetch.mockResolvedValue(Response.json({ ...price, recurring: { ...price.recurring, interval: "year" } }));
    await expect(workspacePrice()).rejects.toThrow("fixed monthly price");
  });
  it("reserves one purchase, reuses checkout on retry and never provisions before payment", async () => {
    const url = await checkoutWorkspace(input);
    expect(await checkoutWorkspace(input)).toBe(url);
    expect(state.document.purchases).toHaveLength(1);
    const checkouts = state.fetch.mock.calls.filter(([url]) => url.endsWith("/checkout/sessions"));
    expect(checkouts).toHaveLength(1);
    expect(checkouts[0][1].headers["Idempotency-Key"]).toContain(requestId);
    expect(checkouts[0][1].body.get("line_items[0][quantity]")).toBe("1");
    expect(state.create).not.toHaveBeenCalled();
  });
  it("rejects client price tampering and reused request IDs with different names", async () => {
    await expect(checkoutWorkspace({ ...input, priceId: "price_cheaper" })).rejects.toThrow("price changed");
    await checkoutWorkspace(input);
    await expect(checkoutWorkspace({ ...input, name: "Other name" })).rejects.toThrow("already used");
  });
  it("does not reuse a purchase after Stripe's idempotency retention", async () => {
    await checkoutWorkspace(input);
    state.document.purchases[0].createdAt = new Date(Date.now() - 86_400_000).toISOString();
    await expect(checkoutWorkspace(input)).rejects.toThrow("expired");
  });
});

describe("payment entitlement", () => {
  beforeEach(async () => { await checkoutWorkspace(input); });
  it("activates a verified, paid subscription using a stable workspace ID", async () => {
    expect(await syncWorkspaceSubscription("sub_workspace")).toBe(true);
    expect(state.create).toHaveBeenCalledWith("Second workspace", { id: `b-${requestId}`, purchaseId: requestId });
    expect(state.document.purchases[0].status).toBe("active");
    await syncWorkspaceSubscription("sub_workspace");
    expect(state.document.purchases).toHaveLength(1);
    expect(state.create.mock.calls.every(([, input]) => input.id === `b-${requestId}`)).toBe(true);
  });
  it("never activates an unpaid checkout", async () => {
    state.fetch.mockResolvedValue(Response.json(subscription({ status: "incomplete", latest_invoice: { status: "open" } })));
    await syncWorkspaceSubscription("sub_workspace");
    expect(state.create).not.toHaveBeenCalled();
    expect(state.document.purchases[0].status).toBe("pending");
  });
  it("ignores subscriptions belonging to another installation", async () => {
    state.fetch.mockResolvedValue(Response.json(subscription({ metadata: { kind: "workspace", purchaseId: requestId, installationId: "other-install" } })));
    await syncWorkspaceSubscription("sub_workspace");
    expect(state.create).not.toHaveBeenCalled();
    expect(state.document.purchases[0].subscriptionId).toBeUndefined();
  });
  it("rejects another subscription or price being attached to a paid workspace", async () => {
    await syncWorkspaceSubscription("sub_workspace");
    state.fetch.mockResolvedValue(Response.json(subscription({ id: "sub_other" })));
    await expect(syncWorkspaceSubscription("sub_other")).rejects.toThrow("subscription mismatch");
    state.fetch.mockResolvedValue(Response.json(subscription({ items: { data: [{ price: { id: "price_other" }, quantity: 1 }] } })));
    await expect(syncWorkspaceSubscription("sub_workspace")).rejects.toThrow("price mismatch");
  });
  it("uses current subscription state even when an older webhook is delivered", async () => {
    await syncWorkspaceSubscription("sub_workspace");
    state.fetch.mockImplementation(async () => Response.json(subscription({ status: "canceled" })));
    await syncWorkspaceSubscription("sub_workspace");
    await syncWorkspaceSubscription("sub_workspace");
    expect(state.document.purchases[0].status).toBe("cancelled");
    expect(state.access).toHaveBeenLastCalledWith(`b-${requestId}`, "suspended");
  });
  it("schedules cancellation while preserving paid access", async () => {
    await syncWorkspaceSubscription("sub_workspace");
    state.fetch.mockImplementation(async () => Response.json(subscription({ cancel_at_period_end: true })));
    await cancelWorkspacePurchase(requestId);
    const post = state.fetch.mock.calls.find(([, options]) => options.method === "POST" && options.body?.get("cancel_at_period_end") === "true");
    expect(post).toBeDefined();
    expect(state.document.purchases[0]).toMatchObject({ status: "active", cancelAtPeriodEnd: true });
    expect(state.access).toHaveBeenLastCalledWith(`b-${requestId}`, "active");
  });
  it("supports legacy and current Stripe invoice subscription references", () => {
    expect(subscriptionIdFrom({ subscription: "sub_old" })).toBe("sub_old");
    expect(subscriptionIdFrom({ parent: { subscription_details: { subscription: "sub_new" } } })).toBe("sub_new");
  });
});
