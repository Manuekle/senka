"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/provider";
import type { ReviewStatus } from "@/lib/community";
import { ReviewDialog } from "./review-dialog";

// Asks for a review when one is due.
//
// The server owns the cadence (lib/community.ts): a week after an account is
// first seen, then every quarter, with "later" holding for two weeks. This
// only decides the moment, and it tries hard not to be rude about it:
//
//   - Not on arrival. A dialog over the page someone just opened, before they
//     have done anything, is in the way of whatever they came for.
//   - Not mid-sentence. If focus is in a field, it waits and looks again.
//   - Once per browser session at most, whatever the answer was.
//
// Closing it any way other than sending a review counts as "later", so the
// question does not come straight back on the next page load.

const FIRST_CHECK_MS = 45_000;
const RETRY_WHILE_TYPING_MS = 20_000;
const SESSION_KEY = "senka:review-prompted";

function isTyping(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  if (active instanceof HTMLElement && active.isContentEditable) return true;
  return active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT";
}

function alreadyPrompted(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markPrompted(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // Best-effort: without storage it can at worst ask once per page load,
    // and the server-side snooze still keeps that from repeating.
  }
}

export function ReviewPrompt() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (alreadyPrompted()) return;
    let cancelled = false;

    const check = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible" || isTyping()) {
        timer.current = setTimeout(() => void check(), RETRY_WHILE_TYPING_MS);
        return;
      }
      try {
        const response = await fetch("/api/community/reviews?view=status");
        if (!response.ok) return;
        const data = (await response.json()) as { status?: ReviewStatus };
        if (cancelled || !data.status?.due || alreadyPrompted()) return;
        markPrompted();
        setOpening((count) => count + 1);
        setOpen(true);
      } catch {
        // Asking for a review is never worth an error on screen.
      }
    };

    timer.current = setTimeout(() => void check(), FIRST_CHECK_MS);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (opening === 0) return null;

  return (
    <ReviewDialog
      key={opening}
      open={open}
      onOpenChange={setOpen}
      dismissLabel={t("review.later")}
      onDismiss={() => {
        void fetch("/api/community/reviews", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "snooze" }),
        }).catch(() => undefined);
      }}
    />
  );
}
