// GENERATED EQUIVALENT — this file is now a thin wrapper over the ported
// bloub generator (lib/bloub), which builds the same SVGs live:
//
//   expressionIcon('<expression>', { shape: 'nuage', color: 'encre', id: ... })
//
// Same invariants as before, now enforced by the generator itself and locked
// by tests/pet-icons.test.ts + tests/bloub-svg.test.ts:
//
// - Each SVG is self-animated (SMIL): blink and drift loop without a library.
// - Dark mode is EMBEDDED per instance (scoped to #<id>-root) and keyed on
//   the app's dark/light classes over <html> (see the html.dark / html.light
//   rules inside each SVG's <style>; a prefers-color-scheme fallback serves
//   the bare document / <img>).
// - Each mood carries its OWN namespace (mask botm-<mood>, root
//   botm-<mood>-root, gradients botm-<mood>-ag…), not the shared "botm": the
//   canonical set coexists, and the live feed (BloubLive, one engine per
//   event) namespaces per mount the same way.

import { BLOUB_SHAPES } from "@/components/pet/bloub-avatar";
import { COLORS, expressionIcon, type ColorId, type ExpressionId, type IconOptions, type ShapeId } from "@/lib/bloub";

export type PetMood = "somnolent" | "curieux" | "attentif" | "heureux" | "triste";

const MOODS: readonly PetMood[] = ["somnolent", "curieux", "attentif", "heureux", "triste"];

/** Feed pet settings: nuage shape and encre ink (the identity). */
const SETTINGS: IconOptions = { shape: "nuage", color: "encre" };

/**
 * SVG for one mood with its own namespace. The default `id` (`botm-<mood>`)
 * tells moods apart, but NOT mounts of the same mood (history lists several
 * `completed` events — several `heureux` — at once). React callers pass their
 * own per-mount suffix (useId); at ~2 ms, generation is live, no cache.
 */
export function petIconSvg(mood: PetMood, id?: string): string {
  return expressionIcon(mood, { ...SETTINGS, id: id ?? `botm-${mood}` });
}

export const PET_MOODS: Record<PetMood, string> = Object.fromEntries(
  MOODS.map((mood) => [mood, petIconSvg(mood)]),
) as Record<PetMood, string>;

/**
 * Agent tone (team-feed `TONES` key) to pet body ink. The pet keeps the
 * agent's color everywhere, so a reply stays attributable at a glance after
 * renames — the same contract the old initial tiles had.
 */
const TONE_PET_COLORS = {
  blue: "bleu",
  violet: "violet",
  amber: "ambre",
  emerald: "vert",
  sky: "bleu",
  rose: "rose",
  orange: "orange",
  pink: "rose",
  teal: "turquoise",
} as const satisfies Record<string, ColorId>;

function hashId(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

export type PetIdentity = { readonly shape: ShapeId; readonly color: ColorId; readonly expression: ExpressionId };

/**
 * Faces an agent can wear at rest. Reserved out: `attentif` (whoever holds
 * the floor), `somnolent` (queued rounds), `triste` (failed rounds) — those
 * are states, not personalities.
 */
const PERSONALITY_EXPRESSIONS = [
  "neutre",
  "curieux",
  "fier",
  "timide",
  "surpris",
  "heureux",
  "mefiant",
  "blase",
] as const satisfies readonly ExpressionId[];

/**
 * One stable pet per agent: the SHAPE is hashed from the agent id (distinct
 * pets across members), the COLOR follows the agent's tone (attribution
 * survives renames). Unknown tones fall back to a hashed palette color, so
 * the result is still stable and distinct.
 */
export function petIdentity(agentId: string, tone: string): PetIdentity {
  const hash = hashId(agentId);
  const color: ColorId =
    (TONE_PET_COLORS as Record<string, ColorId>)[tone] ?? COLORS[hash % COLORS.length]!.id;
  return {
    shape: BLOUB_SHAPES[hash % BLOUB_SHAPES.length]!,
    color,
    expression: PERSONALITY_EXPRESSIONS[hash % PERSONALITY_EXPRESSIONS.length]!,
  };
}


