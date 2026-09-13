"use client";

import { type RefObject, useEffect, useState } from "react";

/** Visibility gating is shared with ordinary sections; it must not import
 * the demo cursor's GSAP runtime into the initial marketing bundle. */
export function useStageLive(ref: RefObject<HTMLElement | null>): boolean {
  const [live, setLive] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let onScreen = typeof IntersectionObserver === "undefined";
    const sync = () => setLive(onScreen && !motion.matches && document.visibilityState === "visible");
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        sync();
      },
      { rootMargin: "0px" },
    );
    observer?.observe(node);
    motion.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pageshow", sync);
    sync();

    return () => {
      observer?.disconnect();
      motion.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pageshow", sync);
    };
  }, [ref]);

  return live;
}
