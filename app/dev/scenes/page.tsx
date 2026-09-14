"use client";

import { CAPABILITY_ART } from "@/app/landing/_components/capability-art";

/**
 * Every card scene, side by side, at the widths they actually run at.
 *
 * The landing renders these twelve drawings 8000px down a page with a smooth
 * scroll driver and three reveal observers on top of them —
 * which is the right place for them and the wrong place to work on them. This
 * is the contact sheet: no shell, no reveals, no motion, every scene in the
 * same light at the same moment, so a change to the shared kit can be judged
 * on all twelve at once rather than one card at a time.
 *
 * Dev only, like everything under /dev — the layout 404s this in production.
 */

const NARROW = "w-[331px]";
const WIDE = "w-[693px]";

function Card({
  className = "",
  label,
  scene,
}: {
  readonly className?: string;
  readonly label: string;
  readonly scene: React.ReactNode;
}) {
  return (
    <div className={className}>
      <p className="lp-eyebrow mb-2">{label}</p>
      <div className="lp-line group flex-col py-6">{scene}</div>
    </div>
  );
}

export default function ScenesPage() {
  return (
    <div className="lp dark min-h-dvh bg-background px-8 py-10 text-foreground">
      <h1 className="font-medium text-lg tracking-tight">Card scenes</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Fig 04 capabilities, at card width.
      </p>

      <div className="mt-8 flex flex-wrap gap-x-8 gap-y-10">
        {Object.entries(CAPABILITY_ART).map(([id, Art]) => (
          <Card
            className={id === "knowledge" || id === "leads" || id === "payments" || id === "api" ? WIDE : NARROW}
            key={id}
            label={id}
            scene={<Art />}
          />
        ))}
      </div>
    </div>
  );
}
