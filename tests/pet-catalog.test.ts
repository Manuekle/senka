// The catalog "pet" section, fully rendered with react-dom/server: the same
// tree /dev/components mounts. Three invariants the compiler cannot see: all
// 6 demos mount (renders are real JSX), all 56 instances carry their own
// namespace (mask + root + gradients), and no i18n key is left unresolved
// (a raw `pet.xxx` in the HTML is a dictionary typo).
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getCatalog } from "@/app/dev/components/_registry";

describe("catalog pet section renders", () => {
  it("mounts all 6 demos with unique namespaces and resolved i18n", () => {
    const section = getCatalog().find((s) => s.id === "pet");
    expect(section).toBeTruthy();
    const entry = section!.entries[0]!;
    expect(entry.demos).toHaveLength(6);

    const html = renderToStaticMarkup(
      h(
        "div",
        null,
        h("h1", null, section!.title),
        h("p", null, section!.desc),
        h("p", null, entry.desc),
        entry.notes?.map((n) => h("p", { key: n.slice(0, 24) }, n)),
        entry.props?.map((p) => h("p", { key: p.name }, p.desc)),
        entry.demos.map((d) =>
          h("section", { key: d.id }, h("h4", null, d.title), h("p", null, d.desc), h("div", null, d.render)),
        ),
      ),
    );

    // 16 expressions + 8 shapes + 12 colors + 5 sizes + 14 states +
    // 1 playground = 56 mounted instances. Each carries its own namespace
    // (mask `<id>`, root `<id>-root`, gradients `<id>-ag…`, from the
    // bloub-prefixed useId) and every document url(#...) resolves to its own
    // instance.
    const masks = [...html.matchAll(/<mask\b[^>]*\bid="(bloub[^"]*)"/g)].map((m) => m[1]!);
    expect(masks.length).toBe(56);
    expect(new Set(masks).size).toBe(56);
    for (const id of masks) {
      expect(html, `url(#${id}) resolve`).toContain(`url(#${id})`);
      expect(html, `${id} root scope`).toContain(`id="${id}-root"`);
      expect(html, `${id} theme scope`).toContain(`#${id}-root{`);
    }
    // Namespaced gradients: no generic `ag0` survives, and every gradient
    // reference belongs to its own mask.
    expect(html).not.toMatch(/id="ag\d+"/);
    expect(html).not.toContain("url(#ag");
    const refs = [...html.matchAll(/url\(#(bloub[^)]+)\)/g)].map((m) => m[1]!);
    for (const ref of refs) {
      const base = ref.replace(/-root$/, "").replace(/-ag\d+$/, "");
      expect(masks, `ref ${ref} belongs to an instance`).toContain(base);
    }
    // Per-instance isolated theme: nothing shared decides ink.
    expect(html).not.toMatch(/:root\{[^}]*--bot-ink/);

    expect(html).not.toMatch(/"pet\.[a-z.]+"/);
    // Default locale is es.
    expect(html).toContain("Mascota");
    expect(html).toContain("Las 16 expresiones");
  });
});
