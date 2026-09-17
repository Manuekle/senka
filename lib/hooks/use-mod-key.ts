"use client";

import { useEffect, useState } from "react";

/**
 * The modifier a shortcut hint should *say*, per the user's actual platform:
 * ⌘ on Apple keyboards, Ctrl everywhere else.
 *
 * The listener side of any shortcut must still accept both modifiers
 * (`metaKey || ctrlKey`, as in the command palette and the template editor's
 * ⌘S) — this hook is only about what the UI labels, so a Windows or Linux
 * user is never shown a key their keyboard does not have.
 *
 * SSR renders "Ctrl" and the effect corrects to "⌘" after mount — the same
 * hydrate-then-correct pattern as `use-hover-capable`, so there is no
 * hydration mismatch.
 */
export function useModKey(): "⌘" | "Ctrl" {
  const [mod, setMod] = useState<"⌘" | "Ctrl">("Ctrl");

  useEffect(() => {
    const update = () => {
      // iPadOS 13+ reports "MacIntel" in desktop mode, where ⌘ is also correct.
      const platform = `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;
      setMod(/Mac|iPhone|iPad|iPod/.test(platform) ? "⌘" : "Ctrl");
    };
    update();
  }, []);

  return mod;
}
