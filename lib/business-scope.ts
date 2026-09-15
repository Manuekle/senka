import { join } from "node:path";
import { homedir } from "node:os";
import { basename, dirname } from "node:path";
import { createDocumentStore } from "./doc-store";
import { currentWorkspace } from "./workspace-context";

// More than one business on one installation.
//
// Everything in this app used to belong to "the business", singular: one
// business.json, one knowledge base, one set of agents. That is right for an
// owner with one shop and wrong for the ones this is actually sold to, who run
// two or three and were opening two or three installs to keep them apart.
//
// The model is deliberately small:
//
//   - A registry with a legacy default for inbound channels. API requests,
//     durable Eve sessions and background teams pin an explicit workspace.
//     Browser switching sets a cookie, not the legacy default.
//   - Every business-owned store is keyed by the active business. The first
//     business keeps the unsuffixed keys and the original file paths, so an
//     install that has been running since before any of this keeps its data
//     exactly where it was, with no migration step.
//
// Legacy inbound integrations without an explicit business binding still use
// registry.activeId. That routing is independent of the browser's selection.
//
// What is NOT per business, on purpose: the account and its password, the
// provider keys, the connected accounts, the base plan and its credits. Those are
// the installation's, and asking someone to connect the same OpenAI key twice
// because they opened a second shop would be user-hostile.

export const DEFAULT_BUSINESS_ID = "default";

export type BusinessEntry = {
  readonly id: string;
  /** What the switcher shows. Empty on the pre-existing business until it is
   *  backfilled from the business profile — see the /api/businesses route. */
  readonly name: string;
  readonly createdAt: string;
  readonly purchaseId?: string;
  readonly access?: "active" | "suspended";
};

type Registry = {
  businesses: BusinessEntry[];
  activeId: string;
};

function empty(): Registry {
  return {
    businesses: [{ id: DEFAULT_BUSINESS_ID, name: "", createdAt: new Date().toISOString() }],
    activeId: DEFAULT_BUSINESS_ID,
  };
}

const registryStore = createDocumentStore<Registry>({
  id: "businesses",
  file: join(homedir(), ".senka", "businesses.json"),
  empty,
  normalize: (parsed) => {
    const businesses =
      Array.isArray(parsed.businesses) && parsed.businesses.length > 0
        ? parsed.businesses.filter(
            (entry): entry is BusinessEntry =>
              Boolean(entry) && typeof entry === "object" && typeof entry.id === "string",
          )
        : empty().businesses;
    // An active id pointing at a business that is gone would scope every
    // store to a business nobody can see or switch away from.
    const activeId = businesses.some((entry) => entry.id === parsed.activeId)
      ? (parsed.activeId as string)
      : (businesses[0]?.id ?? DEFAULT_BUSINESS_ID);
    return { businesses, activeId };
  },
});

/**
 * The active business, cached for a second.
 *
 * Every scoped read and write asks this, so it cannot be a database round trip
 * each time. A second is short enough that the other process — the Eve runtime
 * answering WhatsApp — follows a switch made in the browser almost
 * immediately, and long enough that a page load does not fan out into fifty
 * identical queries. Switching clears the cache in-process, so the request
 * that switches never sees the old value.
 */
let cached: { id: string; at: number } | null = null;
const CACHE_MS = 1_000;

export async function activeBusinessId(): Promise<string> {
  const pinned = currentWorkspace();
  if (pinned) return pinned;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.id;
  try {
    const registry = await registryStore.read();
    cached = { id: registry.activeId, at: Date.now() };
    return registry.activeId;
  } catch {
    // An unreachable registry must not silently move every store to a
    // different business: keep the last known answer, and fall back to the
    // original, unsuffixed one only when there has never been an answer.
    return cached?.id ?? DEFAULT_BUSINESS_ID;
  }
}

export function invalidateActiveBusiness(): void {
  cached = null;
}

export async function listBusinesses(): Promise<{
  readonly businesses: readonly BusinessEntry[];
  readonly activeId: string;
}> {
  const registry = await registryStore.read();
  return { businesses: registry.businesses, activeId: currentWorkspace() ?? registry.activeId };
}

export async function createBusiness(name: string): Promise<BusinessEntry> {
  const entry: BusinessEntry = {
    id: `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
  await registryStore.update((registry) => {
    registry.businesses = [...registry.businesses, entry];
    // Creating a business and then having to go and switch to it is one step
    // too many: the point of creating it is to work on it.
    registry.activeId = entry.id;
  });
  invalidateActiveBusiness();
  return entry;
}

export async function requireBusinessDatabase(): Promise<void> {
  if (!(await registryStore.usingDatabase())) throw new Error("PostgreSQL is required for workspace billing");
}

export async function renameBusiness(id: string, name: string): Promise<boolean> {
  return registryStore.update((registry) => {
    const entry = registry.businesses.find((business) => business.id === id);
    if (!entry) return false;
    registry.businesses = registry.businesses.map((business) =>
      business.id === id ? { ...business, name: name.trim() } : business,
    );
    return true;
  });
}

export async function setActiveBusiness(id: string): Promise<boolean> {
  const ok = await registryStore.update((registry) => {
    if (!registry.businesses.some((business) => business.id === id && business.access !== "suspended")) return false;
    registry.activeId = id;
    return true;
  });
  if (ok) invalidateActiveBusiness();
  return ok;
}

/**
 * Forget a business.
 *
 * Only the registry entry goes. Its documents stay exactly where they are,
 * under their suffixed keys — deleting a business's contacts, conversations
 * and agents from a menu item is not a thing this should be able to do by
 * accident, and an entry re-added with the same id would find its data again.
 * The last business cannot be removed, and neither can the active one.
 */
export async function forgetBusiness(id: string): Promise<boolean> {
  const ok = await registryStore.update((registry) => {
    if (registry.businesses.length <= 1) return false;
    if (registry.activeId === id) return false;
    // Paid workspaces are cancelled through billing; hiding one must not keep charging.
    if (registry.businesses.find((entry) => entry.id === id)?.purchaseId) return false;
    const before = registry.businesses.length;
    registry.businesses = registry.businesses.filter((business) => business.id !== id);
    return registry.businesses.length < before;
  });
  if (ok) invalidateActiveBusiness();
  return ok;
}

// ── Scoping ───────────────────────────────────────────────────────
//
// Three namespaces to keep apart, and the first business owns the unsuffixed
// half of each so nothing has to move.

/** `business` → `business`, or `business::b-abc` on a second business. */
export async function scopedDocumentId(id: string): Promise<string> {
  const businessId = await activeBusinessId();
  return businessId === DEFAULT_BUSINESS_ID ? id : `${id}::${businessId}`;
}

/** `~/.senka/business.json` → `~/.senka/businesses/b-abc/business.json`. */
export async function scopedFile(file: string): Promise<string> {
  const businessId = await activeBusinessId();
  if (businessId === DEFAULT_BUSINESS_ID) return file;
  return join(dirname(file), "businesses", businessId, basename(file));
}

/**
 * What a blob's name is prefixed with inside its area.
 *
 * Media and logos are addressed as `<area>/<name>` — exactly two segments,
 * which lib/blob-store.ts enforces — so the business goes in the name rather
 * than as a third path segment. It has to go somewhere: business-profile-store
 * prunes old logos by listing `profile/logo-`, and on a shared namespace that
 * list would return, and then delete, the other business's logo.
 */
export async function blobPrefix(): Promise<string> {
  const businessId = await activeBusinessId();
  return businessId === DEFAULT_BUSINESS_ID ? "" : `${businessId}__`;
}
