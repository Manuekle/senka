"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { Logout01Icon } from "@hugeicons/core-free-icons";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Ends the session, in the row of controls the sidebar already has.
 *
 * `router.replace` rather than a link: the sign-out is a POST, and the cookie
 * has to be gone before anything navigates or the middleware waves the old one
 * through one last time. `refresh` throws away the cached server render of the
 * pages this account could see.
 */
export function SignOutButton({
  className,
  showLabel = true,
}: {
  readonly className?: string;
  readonly showLabel?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/");
    router.refresh();
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={t("auth.signOut")}
          className={cn(
            "flex items-center gap-2 rounded-md px-2.5 py-1.5 font-medium text-destructive text-xs transition duration-150 hover:bg-destructive/10 hover:text-destructive",
            !showLabel && "px-1.5 py-1",
            className,
          )}
          // A departure, not a switch: `droplet` is the cue that glides down
          // and away, which is what leaving the app sounds like.
          data-cuelume-toggle="droplet"
          disabled={busy}
          onClick={signOut}
          type="button"
        >
          <HugeiconsIcon className="shrink-0" icon={Logout01Icon} size={14} strokeWidth={1.75} />
          {showLabel ? <span>{t("auth.signOut")}</span> : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{t("auth.signOut")}</TooltipContent>
    </Tooltip>
  );
}
