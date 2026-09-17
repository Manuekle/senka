"use client";

import { useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { Cancel01Icon, File01Icon, Image01Icon } from "@hugeicons/core-free-icons";

export type PendingAttachment = {
  readonly id: string;
  readonly file: File;
  readonly previewUrl?: string;
  readonly isImage: boolean;
};

export function ChatAttachmentsPreview({
  attachments,
  onRemove,
}: {
  readonly attachments: readonly PendingAttachment[];
  readonly onRemove: (id: string) => void;
}) {
  const reducedMotion = useReducedMotion();
  // Keep the row (and its padding) mounted while the last chips finish their
  // exit animation, then let it collapse via onExitComplete. Uses React's
  // "adjust state when a prop changes" pattern instead of an effect.
  const [mounted, setMounted] = useState(attachments.length > 0);
  const [prevCount, setPrevCount] = useState(attachments.length);
  if (attachments.length !== prevCount) {
    setPrevCount(attachments.length);
    if (attachments.length > 0) setMounted(true);
  }

  if (!mounted) return null;

  return (
    // The chips sit inside the composer's outer frame but outside the inner
    // panel — the muted gap between the two borders, like a docked strip.
    // They pop in (badge-style, bouncy ease) and blur-fade out on removal,
    // so nothing ever appears "de repente".
    <div className="flex flex-wrap items-center gap-2 px-1 pb-2 pt-1.5">
      <AnimatePresence
        onExitComplete={() => {
          if (attachments.length === 0) setMounted(false);
        }}
      >
        {attachments.map((item) => (
          <motion.div
            key={item.id}
            layout={!reducedMotion}
            initial={
              reducedMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.92, y: -4, filter: "blur(4px)" }
            }
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            exit={
              reducedMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    scale: 0.92,
                    y: -4,
                    filter: "blur(4px)",
                    transition: { duration: 0.15, ease: [0.4, 0, 1, 1] },
                  }
            }
            // Enter: quick, with the motion-token bounce for a badge pop.
            transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.34, 1.36, 0.64, 1] }}
            className="flex origin-top-left items-center gap-2 rounded-2xl border border-border/60 bg-card py-1 pr-1.5 pl-1"
          >
            {item.isImage && item.previewUrl ? (
              <Image
                src={item.previewUrl}
                alt={item.file.name}
                width={48}
                height={48}
                className="size-6 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <HugeiconsIcon
                  icon={item.isImage ? Image01Icon : File01Icon}
                  size={12}
                  strokeWidth={1.75}
                />
              </div>
            )}
            <span className="max-w-[140px] truncate text-xs font-medium text-foreground">
              {item.file.name}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.id);
              }}
              className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Quitar archivo"
              aria-label={`Quitar ${item.file.name}`}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
