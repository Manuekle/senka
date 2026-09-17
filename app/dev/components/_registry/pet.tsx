"use client";

// Mascota (bloub portado) — el generador vivo de la librería y su componente
// de catálogo. El motor vive en lib/bloub; aquí solo se enseña a usarlo.

import { useState } from "react";
import { COLORS } from "@/lib/bloub";
import type { ColorId, ExpressionId, ShapeId } from "@/lib/bloub";
import { ToggleChip } from "@/components/ui/toggle-chip";
import { ct } from "../_lib/catalog-i18n";
import type { Section } from "../_lib/types";
import { BLOUB_COLORS, BLOUB_EXPRESSIONS, BLOUB_SHAPES, BLOUB_STATES, BloubAvatar, BloubState } from "@/components/pet/bloub-avatar";
import { BloubLive } from "@/components/pet/bloub-live";

// ── Hosts con estado ────────────────────────────────────────────────

function PlaygroundDemo() {
  const [expression, setExpression] = useState<ExpressionId>("curieux");
  const [shape, setShape] = useState<ShapeId>("nuage");
  const [color, setColor] = useState<ColorId>("encre");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-36 items-center justify-center">
        <BloubLive expression={expression} shape={shape} color={color} size={128} ariaLabel={ct("pet.morph.aria", { id: expression })} />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">{ct("pet.expressions.title")}</p>
        <div className="flex flex-wrap gap-1.5">
          {BLOUB_EXPRESSIONS.map((id) => (
            <ToggleChip key={id} size="xs" selected={id === expression} onClick={() => setExpression(id)}>
              {id}
            </ToggleChip>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">{ct("pet.shapes.title")}</p>
        <div className="flex flex-wrap gap-1.5">
          {BLOUB_SHAPES.map((id) => (
            <ToggleChip key={id} size="xs" selected={id === shape} onClick={() => setShape(id)}>
              {id}
            </ToggleChip>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">{ct("pet.colors.title")}</p>
        <div className="flex flex-wrap gap-1.5">
          {BLOUB_COLORS.map((id) => {
            const hex = COLORS.find((c) => c.id === id)?.hex ?? "#000";
            return (
              <ToggleChip key={id} size="xs" selected={id === color} onClick={() => setColor(id)}>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2.5 rounded-full border border-border" style={{ backgroundColor: hex }} />
                  {id}
                </span>
              </ToggleChip>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Sección ─────────────────────────────────────────────────────────

export function petSection(_locale?: string): Section {
  return {
    id: "pet",
    title: ct("pet.title"),
    desc: ct("pet.desc"),
    entries: [
      {
        id: "bloub-avatar",
        name: "BloubAvatar",
        source: "components/pet/bloub-avatar.tsx",
        importLine: 'import { BloubAvatar } from "@/components/pet/bloub-avatar";',
        desc: ct("pet.avatar.desc"),
        exports: ["BloubAvatar", "BloubLive", "BLOUB_EXPRESSIONS", "BLOUB_SHAPES", "BLOUB_COLORS"],
        props: [
          { name: "expression", type: "ExpressionId", def: '"neutre"', desc: ct("pet.avatar.expression.desc") },
          { name: "shape", type: "ShapeId", def: '"nuage"', desc: ct("pet.avatar.shape.desc") },
          { name: "color", type: "ColorId", def: '"encre"', desc: ct("pet.avatar.color.desc") },
          { name: "size", type: "number", def: "96", desc: ct("pet.avatar.size.desc") },
          { name: "ariaLabel", type: "string", desc: ct("pet.avatar.ariaLabel.desc") },
        ],
        notes: [ct("pet.note.theme"), ct("pet.note.maskId"), ct("pet.note.feed"), ct("pet.note.smil")],
        demos: [
          {
            id: "pet-expressions",
            title: ct("pet.expressions.title"),
            desc: ct("pet.expressions.desc"),
            code: `// 16 expresiones de reposo: la cara cuenta, el cuerpo queda de bola.
<BloubAvatar expression="heureux" size={72} />`,
            render: (
              <div className="flex flex-wrap justify-center gap-4">
                {BLOUB_EXPRESSIONS.map((id) => (
                  <div key={id} className="flex w-24 flex-col items-center gap-1.5">
                    <BloubAvatar expression={id} shape="nuage" color="encre" size={72} ariaLabel={ct("pet.morph.aria", { id })} />
                    <code className="font-mono text-[10.5px] text-muted-foreground">{id}</code>
                  </div>
                ))}
              </div>
            ),
          },
          {
            id: "pet-shapes",
            title: ct("pet.shapes.title"),
            desc: ct("pet.shapes.desc"),
            code: `<BloubAvatar shape="goutte" expression="curieux" size={72} />`,
            render: (
              <div className="flex flex-wrap justify-center gap-4">
                {BLOUB_SHAPES.map((id) => (
                  <div key={id} className="flex w-24 flex-col items-center gap-1.5">
                    <BloubAvatar expression="curieux" shape={id} color="encre" size={72} ariaLabel={ct("pet.morph.aria", { id })} />
                    <code className="font-mono text-[10.5px] text-muted-foreground">{id}</code>
                  </div>
                ))}
              </div>
            ),
          },
          {
            id: "pet-colors",
            title: ct("pet.colors.title"),
            desc: ct("pet.colors.desc"),
            code: `<BloubAvatar color="rouge" expression="heureux" size={72} />`,
            render: (
              <div className="flex flex-wrap justify-center gap-4">
                {BLOUB_COLORS.map((id) => (
                  <div key={id} className="flex w-24 flex-col items-center gap-1.5">
                    <BloubAvatar expression="heureux" shape="nuage" color={id} size={72} ariaLabel={ct("pet.morph.aria", { id })} />
                    <code className="font-mono text-[10.5px] text-muted-foreground">{id}</code>
                  </div>
                ))}
              </div>
            ),
          },
          {
            id: "pet-sizes",
            title: ct("pet.sizes.title"),
            desc: ct("pet.sizes.desc"),
            code: `// La cota width/height: el dibujo escala, la animación no cambia.
<BloubAvatar size={128} />
<BloubAvatar size={40} />`,
            render: (
              <div className="flex flex-wrap items-end justify-center gap-6">
                {([128, 96, 64, 40, 24] as const).map((size) => (
                  <div key={size} className="flex flex-col items-center gap-1.5">
                    <BloubAvatar expression="attentif" shape="nuage" color="encre" size={size} ariaLabel={ct("pet.morph.aria", { id: `${size}px` })} />
                    <code className="font-mono text-[10.5px] text-muted-foreground">{size}px</code>
                  </div>
                ))}
              </div>
            ),
          },
          {
            id: "pet-morph",
            title: ct("pet.morph.title"),
            desc: ct("pet.morph.desc"),
            code: `// Los estados transforman la silueta: cada SVG lleva su ciclo SMIL entero.
// La forma elegida solo se respeta en los estados baseBody (idle, wink...).
<BloubState state="hexagon" size={72} />`,
            render: (
              <div className="flex flex-wrap justify-center gap-4">
                {BLOUB_STATES.map((id) => (
                  <div key={id} className="flex w-24 flex-col items-center gap-1.5">
                    <BloubState state={id} size={72} ariaLabel={ct("pet.morph.aria", { id })} />
                    <code className="font-mono text-[10.5px] text-muted-foreground">{id}</code>
                  </div>
                ))}
              </div>
            ),
          },
          {
            id: "pet-playground",
            title: ct("pet.playground.title"),
            desc: ct("pet.playground.desc"),
            code: `import { BloubLive } from "@/components/pet/bloub-live";

const [expression, setExpression] = useState<ExpressionId>("curieux");

// Motor vivo: el cambio MORFA (0,45 s), no corta. Solo una instancia:
// las rejillas usan BloubAvatar (SMIL, sin loops JS).
<BloubLive expression={expression} shape={shape} color={color} size={128} />`,
            render: <PlaygroundDemo />,
          },
        ],
      },
    ],
  };
}
