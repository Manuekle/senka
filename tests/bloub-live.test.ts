// BloubLive: the engine sampled at 60 fps with rAF (BloubBot.vue port).
// SSR renders only the first frame — the loop lives in useEffect — but the
// namespace (mask + root + theme) must already be complete and SMIL-free:
// live frames carry no <animate>, the engine animates them (morph included).
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BloubLive } from "@/components/pet/bloub-live";

describe("BloubLive", () => {
  it("renders the first frame with its own namespace and no SMIL", () => {
    const html = renderToStaticMarkup(
      h(BloubLive, {
        expression: "curieux",
        shape: "nuage",
        color: "encre",
        size: 128,
        ariaLabel: "curieux pet",
      }),
    );
    expect(html).toContain("<svg");
    const maskId = html.match(/<mask\b[^>]*\bid="([^"]+)"/)?.[1];
    expect(maskId).toMatch(/^bloub-live-/);
    expect(html).toContain(`id="${maskId}-root"`);
    expect(html).toContain(`url(#${maskId})`);
    expect(html).toContain(`#${maskId}-root{`);
    expect(html, "live frames carry no SMIL").not.toContain("<animate");
    expect(html).toContain('role="img"');
    expect(html).toContain("curieux pet");
  });

  it("morphs between expressions instead of cutting", async () => {
    const { BotEngine } = await import("@/lib/bloub/engine");
    const { EXPRESSION_BY_ID } = await import("@/lib/bloub/expressions");
    const { RAYON } = await import("@/lib/bloub/repere");
    const engine = new BotEngine(RAYON, "idle", null, EXPRESSION_BY_ID.get("neutre") ?? null);
    const before = engine.sample(10).eyes[0]?.matrix;
    engine.setExpression(EXPRESSION_BY_ID.get("colere") ?? null, 10);
    const midMorph = engine.sample(10.2).eyes[0]?.matrix;
    const after = engine.sample(11).eyes[0]?.matrix;
    // Mid-morph (0.45 s) the pose sits between both; by the end it arrives.
    expect(midMorph).not.toBe(before);
    expect(midMorph).not.toBe(after);
  });
});
