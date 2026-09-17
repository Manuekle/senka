"use client";

import { useEffect, useState } from "react";

import { TextShimmer } from "@/components/motion/text-shimmer";
import { useT } from "@/lib/i18n/provider";

/**
 * The screen between clicking a conversation and reading it.
 *
 * It used to be a spinner and the words "Cargando agente…" on a flat page,
 * then a lit room — a cone thrown from a fixture above the screen, the pool
 * it made where it landed, a vignette, grain in the light. The room was the
 * mistake. A stage rig bolted onto a working screen reads as theatre, the
 * grain cost a blend pass over the viewport on the screen people hit most
 * often while waiting, and all of it was decoration standing between the
 * person and the conversation they asked for.
 *
 * So: the chat's own ground, borrowed exactly. The grid pattern the
 * conversation itself sits on, faded at the edges the same way, and above
 * it only type and one small ring. It is the same room arriving, minus the
 * theatre.
 *
 * ## What makes it informative rather than decorative
 *
 * - The label names the actual work. Restoring a conversation and connecting
 *   to the agent take different amounts of time, and a person who knows which
 *   one they are waiting on waits differently.
 * - The ring is the only thing claiming the app is still working, and it is
 *   the smallest thing on screen. It does not fill: a spinner that pretends
 *   to measure progress lies about how much is left.
 * - After a few seconds a second line admits it is slow. A wait with no
 *   acknowledgement reads as a hang, and the next thing somebody does is
 *   reload — which, on this screen, throws away the replay in progress.
 * - `role="status"` with a live region, so the same two facts reach a screen
 *   reader instead of only the sighted.
 *
 * The scene is drawn in `app/globals.css` (`.chat-loading`), not in utility
 * classes: the pattern overlay and the ring are a mask and a gradient that
 * only make sense read together.
 */

/** When the wait stops being normal and starts needing an explanation. */
const SLOW_AFTER_MS = 2_500;

export type AgentLoadingMode = "connecting" | "restoring";

export function AgentLoading({ mode = "connecting" }: { readonly mode?: AgentLoadingMode }) {
  const t = useT();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="chat-loading" data-loading-mode={mode}>
      {/* The chat's own grid, already on screen by the time the conversation
          arrives — see `.chat-loading__pattern` in globals.css. */}
      <span aria-hidden className="chat-loading__pattern" />

      <div className="chat-loading__stage">
        {/* Decoration, not a second live region: the label below already
            announces what is loading, and a ring that also called itself
            "Loading" would make this screen say it twice. */}
        <span aria-hidden className="chat-loading__spinner" />

        {/* Only the browser knows whether there is a conversation in
            storage to replay, so the server renders the other label and
            React is told that is expected rather than a bug. */}
        <p
          aria-live="polite"
          className="chat-loading__label"
          role="status"
          suppressHydrationWarning
        >
          <TextShimmer duration={2.6}>
            {t(mode === "restoring" ? "chat.loadingRestoring" : "chat.loadingConnecting")}
          </TextShimmer>
        </p>

        {/* Kept mounted so its arrival does not move the spinner and label. */}
        <p className="chat-loading__hint" data-visible={slow ? "true" : undefined}>
          {t("chat.loadingSlow")}
        </p>
      </div>
    </div>
  );
}
