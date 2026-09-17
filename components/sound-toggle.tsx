"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { VolumeHighIcon, VolumeOffIcon } from "@hugeicons/core-free-icons";
import { useSound } from "./sound-provider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/** Mute switch for the interaction sounds, sitting with the other preferences. */
export function SoundToggle({
  className,
  showLabel = true,
}: {
  readonly className?: string;
  readonly showLabel?: boolean;
}) {
  const { enabled, setEnabled } = useSound();
  const t = useT();
  const labelKey = enabled ? "sound.turnOff" : "sound.turnOn";

  // No `title`: the native tooltip and this one would both open, one over the
  // other, on the same hover.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setEnabled(!enabled)}
          // The only control that opts out of the default press: unmuting
          // already answers with `success`, and muting should be the one click
          // in the app that is allowed to make no noise at all.
          data-cuelume-silent
          aria-pressed={enabled}
          aria-label={t(labelKey)}
          className={cn(
            "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground",
            "transition duration-150 hover:bg-accent hover:text-foreground",
            !showLabel && "px-1.5 py-1",
            className,
          )}
        >
          <span className="t-icon-swap shrink-0" data-state={enabled ? "b" : "a"}>
            <span className="t-icon" data-icon="a">
              <HugeiconsIcon icon={VolumeOffIcon} size={14} strokeWidth={1.75} />
            </span>
            <span className="t-icon" data-icon="b">
              <HugeiconsIcon icon={VolumeHighIcon} size={14} strokeWidth={1.75} />
            </span>
          </span>
          {showLabel ? <span>{t(enabled ? "sound.on" : "sound.off")}</span> : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{t(labelKey)}</TooltipContent>
    </Tooltip>
  );
}
