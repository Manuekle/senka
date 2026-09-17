import { describe, expect, it } from "vitest";
import { EXPRESSIONS } from "@/lib/bloub/expressions";
import { COLORS, SHAPES } from "@/lib/bloub/skins";
import { EXPRESSION_SECONDS, stateIcon, expressionIcon } from "@/lib/bloub/svg";

// The generator ported from bloub (src/ui/agent.ts) builds one self-animated
// SMIL SVG per call — pure string in, string out, no DOM. pet-icons.ts
// re-exports a hand-picked subset of these for the runtime feed, and the
// catalog playground generates every combination live. The invariants here
// are the ones both consumers depend on.

describe("expressionIcon (ported bloub generator)", () => {
  // 1536 SVGs en un barrido: solo tarda ~3 s, pero con los workers paralelos
  // de vitest compitiendo por CPU puede pasar del default de 5 s.
  it(
    "builds every expression × shape × color combination",
    () => {
      for (const expr of EXPRESSIONS) {
        for (const shape of SHAPES) {
          for (const color of COLORS) {
            const svg = expressionIcon(expr.id, {
              shape: shape.id,
              color: color.id,
            });
            expect(svg.startsWith("<svg"), `${expr.id}/${shape.id}/${color.id} opens`).toBe(true);
            expect(svg.endsWith("</svg>"), `${expr.id}/${shape.id}/${color.id} closes`).toBe(true);
            expect(svg, `${expr.id}/${shape.id}/${color.id} is self-animated`).toMatch(
              /<(animate|animateTransform)\b/,
            );
          }
        }
      }
    },
    20_000,
  );

  it("generates deterministically — same inputs, same string", () => {
    const a = expressionIcon("curieux", { shape: "nuage", color: "encre" });
    const b = expressionIcon("curieux", { shape: "nuage", color: "encre" });
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(1000);
  });

  it("themes through the CSS variables the app styles key on", () => {
    const svg = expressionIcon("neutre", { color: "encre", id: "tema" });
    expect(svg).toContain("var(--bot-ink)");
    const style = svg.match(/<style>([^<]*)<\/style>/)?.[1];
    expect(style).toBeTruthy();
    // Both variables are declared per instance (paper feeds the depth mist
    // on particle dots; the eye backing itself is fixed white so eyes read
    // white in dark mode too).
    expect(style).toContain("--bot-ink:");
    expect(style).toContain("--bot-paper:");
    // Scope por instancia: cada SVG pinta solo su raíz aunque docenas
    // compartan documento. Sin scope, la última tinta ganaría para todas.
    expect(style).toContain("#tema-root{");
    expect(style).toContain("html.dark #tema-root{");
    expect(style).toContain("html.light #tema-root{");
    expect(style).toContain("@media (prefers-color-scheme:dark){#tema-root{");
    // Nada compartido: ni :root suelto ni .bloub-root genérico deciden tinta.
    expect(style).not.toMatch(/:root\{[^}]*--bot-ink/);
    expect(style).not.toMatch(/\.bloub-root\{[^}]*--bot-ink/);
  });

  it("keeps the eye backing white — eyes read white in dark mode too", () => {
    // The eyes are holes in the body mask; what shows through is the backing
    // shape. Fixed #fff (not theme paper) so dark mode keeps white eyes.
    for (const svg of [
      expressionIcon("neutre", { id: "ojos-1" }),
      stateIcon("orbit", { id: "ojos-2" }),
    ]) {
      const drawing = svg.split("</defs>")[1] ?? "";
      expect(drawing, "body backing outside defs").toContain('fill="#fff"');
    }
  });

  it("passes a unique mask id per call — url(#id) and <mask> agree", () => {
    // Two concurrent SVGs (catalog grids, AnimatePresence crossfades) must not
    // share a mask id: url(#...) resolves document-wide. The default id is
    // "botm" (the original single-icon convention); concurrent callers pass
    // distinct ones — pet-icons.ts does `botm-<mood>`.
    const defaultSvg = expressionIcon("neutre");
    expect(defaultSvg).toContain('<mask id="botm"');
    expect(defaultSvg).toContain('url(#botm)');
    expect(defaultSvg).toContain('id="botm-root"');

    const seen = new Set<string>();
    const combos = [
      { expr: "neutre", shape: "cercle", color: "encre", id: "uno" },
      { expr: "neutre", shape: "nuage", color: "encre", id: "dos" },
      { expr: "heureux", shape: "nuage", color: "encre", id: "tres" },
      { expr: "triste", shape: "pastilla", color: "encre", id: "cuatro" },
    ] as const;
    for (const { expr, shape, color, id } of combos) {
      const svg = expressionIcon(expr, { shape, color, id });
      const maskId = svg.match(/<mask\b[^>]*\bid="([^"]+)"/)?.[1];
      expect(maskId, `${expr}/${shape}/${color} declares its mask id`).toBe(id);
      expect(seen.has(maskId!), `mask id ${maskId} is unique across calls`).toBe(false);
      seen.add(maskId!);
      // La máscara resuelve a su id; los gradientes (si los hay) a los suyos.
      // Antes solo se miraba la máscara porque estos casos no tienen arcos.
      expect(svg, `${expr}/${shape} mask reference`).toContain(`url(#${maskId})`);
      expect(svg, `${expr}/${shape} root scope`).toContain(`id="${id}-root"`);
      const refs = [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
      for (const ref of refs) {
        const ok = ref === maskId || ref === `${id}-root` || ref.startsWith(`${id}-ag`);
        expect(ok, `${expr}/${shape} ref ${ref} is namespaced to ${id}`).toBe(true);
      }
    }
  });

  it("namespaces gradient ids per instance — concurrent arcs do not collide", () => {
    // play/orbit/comet llevan arcos con gradientes `url(#ag)`: sin prefijo,
    // dos SVG montados a la vez resuelven al primer gradiente del documento.
    const a = stateIcon("orbit", { id: "orb-a" });
    const b = stateIcon("orbit", { id: "orb-b" });
    expect(a).toContain('id="orb-a-ag0"');
    expect(a).toContain("url(#orb-a-ag0)");
    expect(a).not.toContain("orb-b-ag0");
    expect(b).toContain('id="orb-b-ag0"');
    expect(b).toContain("url(#orb-b-ag0)");
    expect(b).not.toContain("orb-a-ag0");
    // Ningún id genérico compartido sobrevive.
    for (const svg of [a, b]) {
      expect(svg).not.toMatch(/id="ag\d+"/);
      expect(svg).not.toContain("url(#ag");
    }
  });

  it("isolates theme per instance — two inks, two scopes", () => {
    const red = expressionIcon("heureux", { color: "rouge", id: "ink-red" });
    const green = expressionIcon("heureux", { color: "vert", id: "ink-green" });
    const styleOf = (svg: string) => svg.match(/<style>([^<]*)<\/style>/)?.[1] ?? "";
    const sr = styleOf(red);
    const sv = styleOf(green);
    expect(sr).toContain("#ink-red-root{--bot-ink:#e8483f");
    expect(sr).not.toContain("#ink-green-root");
    expect(sv).toContain("#ink-green-root{--bot-ink:#3ecf8e");
    expect(sv).not.toContain("#ink-red-root");
  });

  it("honors the requested body color on both theme branches", () => {
    const styleOf = (svg: string) => svg.match(/<style>([^<]*)<\/style>/)?.[1] ?? "";

    // A very dark ink is lightened on the dark branch (aclarar's 0.28 floor).
    const encre = styleOf(expressionIcon("neutre", { color: "encre", id: "encre-t" }));
    expect(encre).toContain("html.light #encre-t-root{--bot-ink:#0a0a0c");
    expect(encre).toContain("html.dark #encre-t-root{--bot-ink:#c9c9ca");

    // A mid-tone color is readable on both papers, so it stays as-is.
    const vert = styleOf(expressionIcon("neutre", { color: "vert", id: "vert-t" }));
    expect(vert).toContain("html.light #vert-t-root{--bot-ink:#3ecf8e");
    expect(vert).toContain("html.dark #vert-t-root{--bot-ink:#3ecf8e");

    // encre's two branches do differ — the theme is live, not decorative.
    const light = encre.match(/html\.light #encre-t-root\{([^}]*)\}/)?.[1];
    const dark = encre.match(/html\.dark #encre-t-root\{([^}]*)\}/)?.[1];
    expect(dark).not.toBe(light);
  });

  it("sizes the output and the loop from the options", () => {
    const svg = expressionIcon("neutre", { size: 96 });
    expect(svg).toContain('width="96"');
    expect(svg).toContain('height="96"');
    // The blink loop is ida-y-vuelta over the 3 s expression window.
    expect(svg).toMatch(/dur="6\.0*s"/);
    expect(EXPRESSION_SECONDS).toBe(3);
  });

  it("throws on unknown ids rather than drawing a wrong pet", () => {
    expect(() => expressionIcon("nope" as "neutre")).toThrow();
    expect(() => stateIcon("nope" as "idle")).toThrow();
  });
});
