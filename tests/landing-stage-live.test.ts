import { afterEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  effect: undefined as (() => void | (() => void)) | undefined,
  setLive: vi.fn(),
}));
vi.mock("react", () => ({
  useState: () => [false, hooks.setLive],
  useEffect: (effect: () => void | (() => void)) => { hooks.effect = effect; },
}));
import { useStageLive } from "@/app/landing/_components/use-stage-live";

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("landing animation visibility", () => {
  it("pauses offscreen, in background tabs and for reduced motion, and cleans up listeners", () => {
    const query = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const doc = { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const win = { matchMedia: () => query, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    let intersect!: (entries: { isIntersecting: boolean }[]) => void;
    const disconnect = vi.fn();
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", doc);
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: typeof intersect) { intersect = callback; }
      observe() {}
      disconnect = disconnect;
    });

    useStageLive({ current: {} as HTMLElement });
    const cleanup = hooks.effect?.();
    expect(hooks.setLive).toHaveBeenLastCalledWith(false);
    intersect([{ isIntersecting: true }]);
    expect(hooks.setLive).toHaveBeenLastCalledWith(true);
    const sync = doc.addEventListener.mock.calls[0][1] as () => void;
    doc.visibilityState = "hidden";
    sync();
    expect(hooks.setLive).toHaveBeenLastCalledWith(false);
    doc.visibilityState = "visible";
    query.matches = true;
    sync();
    expect(hooks.setLive).toHaveBeenLastCalledWith(false);
    query.matches = false;
    sync();
    expect(hooks.setLive).toHaveBeenLastCalledWith(true);
    intersect([{ isIntersecting: false }]);
    expect(hooks.setLive).toHaveBeenLastCalledWith(false);
    if (typeof cleanup === "function") cleanup();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(doc.removeEventListener).toHaveBeenCalledWith("visibilitychange", sync);
    expect(win.removeEventListener).toHaveBeenCalledWith("pageshow", sync);
    expect(query.removeEventListener).toHaveBeenCalledWith("change", sync);
  });
});
