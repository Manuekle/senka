import { AsyncLocalStorage } from "node:async_hooks";

const context = new AsyncLocalStorage<string>();
let runtimeWorkspace: (() => string | undefined) | undefined;
export const WORKSPACE_COOKIE = "senka-workspace";

export function currentWorkspace(): string | undefined {
  if (context.getStore()) return context.getStore();
  return runtimeWorkspace?.();
}

/** Eve installs a durable-state accessor; Next never imports Eve's runtime. */
export function registerRuntimeWorkspace(resolve: () => string | undefined): void {
  runtimeWorkspace = resolve;
}

/** Pin an already authorized workspace for the whole asynchronous operation. */
export function withWorkspace<T>(id: string, run: () => T): T {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error("Invalid workspace ID");
  return context.run(id, run);
}
