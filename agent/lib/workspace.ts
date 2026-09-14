import { defineState, type SessionContext } from "eve/context";
import { homedir } from "node:os";
import { join } from "node:path";
import { createDocumentStore } from "../../lib/doc-store";
import { activeBusinessId, listBusinesses } from "../../lib/business-scope";
import { registerRuntimeWorkspace } from "../../lib/workspace-context";

const workspace = defineState<string | null>("senka.workspace", () => null);
const bindings = createDocumentStore<{ sessions: Record<string, string> }>({
  id: "session-workspaces", file: join(homedir(), ".senka", "session-workspaces.json"),
  empty: () => ({ sessions: {} }), normalize: (raw) => ({ sessions: raw.sessions ?? {} }),
});

registerRuntimeWorkspace(() => {
  try { return workspace.get() ?? undefined; } catch { return undefined; }
});

export async function bindSessionWorkspace(ctx: SessionContext): Promise<void> {
  let id = workspace.get();
  if (!id) {
    const existing = await bindings.read();
    const parent = ctx.session.parent?.rootSessionId;
    const attribute = ctx.session.auth.initiator?.attributes?.workspaceId;
    id = existing.sessions[ctx.session.id] ?? (parent ? existing.sessions[parent] : undefined) ??
      (typeof attribute === "string" ? attribute : await activeBusinessId());
    const { businesses } = await listBusinesses();
    if (!businesses.some((business) => business.id === id && business.access !== "suspended")) throw new Error("Workspace access is unavailable");
    const selected = id;
    await bindings.update((store) => { store.sessions[ctx.session.id] = selected; });
    workspace.update(() => selected);
  }
  const { businesses } = await listBusinesses();
  if (!businesses.some((business) => business.id === id && business.access !== "suspended")) throw new Error("Workspace access is unavailable");
}
