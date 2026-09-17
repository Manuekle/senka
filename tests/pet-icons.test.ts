import { describe, expect, it } from "vitest";
import { PET_MOODS, petIconSvg, petIdentity, type PetMood } from "@/app/(app)/runtime/_components/pet-icons";

// The canonical static markups (one SMIL loop per mood). PetProgress mounts
// the live BloubLive instead, but these lock the generator's invariants —
// namespace per instance and class-keyed dark mode — so a regeneration of
// pet-icons.ts cannot silently break either consumer:
//
// 1. One namespace per mood (mask, root and gradients). When two SVGs share
//    a document, a repeated id makes every `url(#...)` resolve to the first
//    one, so a mood would draw with another mood's eyes or arcs.
// 2. Per-instance scoped dark mode keyed to the app classes. The app paints
//    `dark` and `light` on <html> (layout.tsx inline script, theme-provider),
//    so the class rules decide the theme. The prefers-color-scheme fallback
//    stays for the bare document / <img>.

const MOODS = Object.keys(PET_MOODS) as PetMood[];

const EXPECTED: readonly PetMood[] = ["somnolent", "curieux", "attentif", "heureux", "triste"];

describe("PET_MOODS", () => {
  it("covers exactly the moods of the PetMood union", () => {
    expect([...MOODS].sort()).toEqual([...EXPECTED].sort());
  });

  it("each mood is one self-animated SVG", () => {
    for (const mood of MOODS) {
      const svg = PET_MOODS[mood];
      expect(svg.startsWith("<svg"), `${mood} opens`).toBe(true);
      expect(svg.endsWith("</svg>"), `${mood} closes`).toBe(true);
      // Self-animated: the blink/drift loop is SMIL, no library drives it.
      expect(svg, `${mood} animates itself`).toMatch(/<(animate|animateTransform)\b/);
    }
  });

  it("declares one mask id per mood, and every reference resolves to it", () => {
    const ids: string[] = [];
    for (const mood of MOODS) {
      const svg = PET_MOODS[mood];
      const id = svg.match(/<mask\b[^>]*\bid="([^"]+)"/)?.[1];
      expect(id, `${mood} declares a mask id`).toBeTruthy();
      ids.push(id!);
      // Raíz propia: el scope del tema. Sin ella, varias tintas pelean.
      expect(svg, `${mood} declares its root`).toContain(`id="${id}-root"`);
      const refs = [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
      expect(refs.length, `${mood} references its mask`).toBeGreaterThan(0);
      for (const ref of refs) {
        // Máscara o gradiente del mismo namespace; nada genérico compartido.
        const ok = ref === id || ref.startsWith(`${id}-ag`);
        expect(ok, `${mood} ref ${ref} is namespaced`).toBe(true);
      }
      expect(svg, `${mood} has no shared gradient id`).not.toMatch(/id="ag\d+"/);
    }
    // The shared "botm" id of the first generation is exactly the bug this
    // guards: two moods mounted at once, one mask for both.
    expect(new Set(ids).size, "mask ids are unique").toBe(MOODS.length);
  });

  it("embeds dark mode keyed off the app's html.dark / html.light classes", () => {
    for (const mood of MOODS) {
      const svg = PET_MOODS[mood];
      const style = svg.match(/<style>([^<]*)<\/style>/)?.[1];
      expect(style, `${mood} embeds a <style>`).toBeTruthy();

      const maskMatch = svg.match(/<mask\b[^>]*\bid="([^"]+)"/);
      expect(maskMatch?.[1], `${mood} declares a mask id`).toBeTruthy();
      const maskId = maskMatch?.[1] ?? `${mood}-fallback`;
      const scope = `#${maskId}-root`;
      const dark = style!.match(new RegExp(`html\\.dark ${scope.replace(/[#.]/g, "\\$&")}\\{([^}]*)\\}`))?.[1];
      const light = style!.match(new RegExp(`html\\.light ${scope.replace(/[#.]/g, "\\$&")}\\{([^}]*)\\}`))?.[1];
      expect(dark, `${mood} dark class rule`).toBeTruthy();
      expect(light, `${mood} light class rule`).toBeTruthy();
      for (const rule of [dark!, light!]) {
        expect(rule).toContain("--bot-ink:");
        expect(rule).toContain("--bot-paper:");
      }
      expect(dark, `${mood} themes actually differ`).not.toBe(light);

      // El fallback por SO existe para el documento suelto / <img>, scoped a
      // la instancia; las reglas de clase (más específicas) mandan en inline.
      expect(style).toContain(`@media (prefers-color-scheme:dark){${scope}{`);
      expect(style, "no shared root-level dark override").not.toMatch(/:root\{[^}]*#c9c9ca/);
      expect(style, "no shared class-level dark override").not.toMatch(/\.bloub-root\{[^}]*--bot-ink/);
    }
  });

  it("uses the embedded variables in the drawing, so the theming is live", () => {
    for (const mood of MOODS) {
      const svg = PET_MOODS[mood];
      expect(svg, `${mood} ink is themed`).toContain("var(--bot-ink)");
      // Paper lives in the per-instance <style> (and in particle fills when
      // the state has dots); the eye backing itself is fixed white.
      const style = svg.match(/<style>([^<]*)<\/style>/)?.[1] ?? "";
      expect(style, `${mood} paper is themed`).toContain("--bot-paper:");
    }
  });

  it("generates a unique namespace per mount — repeated moods coexist", () => {
    // History lists several events with the same mood at once: the live feed
    // (BloubLive) namespaces per mount with the same rule as here.
    const a = petIconSvg("heureux", "botm-heureux-aaa");
    const b = petIconSvg("heureux", "botm-heureux-bbb");
    expect(a).toContain('<mask id="botm-heureux-aaa"');
    expect(a).toContain('id="botm-heureux-aaa-root"');
    expect(b).toContain('<mask id="botm-heureux-bbb"');
    expect(b).toContain('id="botm-heureux-bbb-root"');
    expect(b).not.toContain("botm-heureux-aaa");
    expect(a).not.toContain("botm-heureux-bbb");
  });

  it("assigns one stable pet per agent — tone color, hashed shape, own face", () => {
    // Same agent twice: identical pet. Attribution must survive renames and
    // polls, so the identity derives from id + tone only.
    expect(petIdentity("ag-recepcion", "violet")).toEqual(petIdentity("ag-recepcion", "violet"));
    // Color follows the tone, never the hash.
    expect(petIdentity("ag-recepcion", "violet").color).toBe("violet");
    expect(petIdentity("ag-recepcion", "emerald").color).toBe("vert");
    expect(petIdentity("ag-recepcion", "teal").color).toBe("turquoise");
    // Unknown tones still resolve to a stable palette color.
    const fallback = petIdentity("ag-recepcion", "nope");
    expect(fallback.color).toBeTruthy();
    expect(fallback).toEqual(petIdentity("ag-recepcion", "nope"));
    // Shapes spread across members: 8 silhouettes over a sample roster.
    const shapes = new Set(
      ["ag-recepcion", "ag-calificador", "ag-seguimiento", "ag-analista", "ag-extra-1", "ag-extra-2"].map(
        (id) => petIdentity(id, "blue").shape,
      ),
    );
    expect(shapes.size).toBeGreaterThan(1);
    // Faces differ per member too — never the shared "neutre" for everyone —
    // and stay stable per agent.
    const faces = new Set(
      ["ag-recepcion", "ag-calificador", "ag-seguimiento", "ag-analista"].map(
        (id) => petIdentity(id, "blue").expression,
      ),
    );
    expect(faces.size).toBeGreaterThan(1);
    expect(petIdentity("ag-recepcion", "blue").expression).toBe(
      petIdentity("ag-recepcion", "blue").expression,
    );
  });
});
