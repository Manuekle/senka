"use client";

// El avatar de la mascota, para el catálogo: un SVG SMIL generado EN VIVO por
// el motor portado de bloub (lib/bloub). El feed de /runtime monta BloubLive
// con forma nuage y color+cara según estado (fallido rojo/enojado, completo
// verde/feliz);
// este componente es la forma general — 16 expresiones × 8 formas × 12 colores,
// ~2 ms por icono, así que la generación en vivo no necesita caché más allá
// del useMemo.
//
// Dos invariantes que el generador pide y el caller debe respetar:
// - namespace ÚNICO por instancia montada (máscara, raíz y gradientes: los
//   `url(#...)` resuelven a nivel de documento; aquí sale de useId).
// - El tema lo decide el <style> embebido con scope a la raíz propia contra
//   html.dark/html.light: no se toca el color desde fuera, se cambia el tema
//   de la página.

import { useId, useMemo } from "react";
import {
  stateIcon,
  expressionIcon,
  type ColorId,
  type ExpressionId,
  SEQUENCE,
  type ShapeId,
  type StateId,
} from "@/lib/bloub";
import { cn } from "@/lib/utils";

export const BLOUB_EXPRESSIONS: readonly ExpressionId[] = [
  "neutre",
  "attentif",
  "surpris",
  "excite",
  "heureux",
  "hilare",
  "colere",
  "triste",
  "effraye",
  "mefiant",
  "confus",
  "curieux",
  "fier",
  "timide",
  "blase",
  "somnolent",
];

export const BLOUB_SHAPES: readonly ShapeId[] = [
  "cercle",
  "galet",
  "squircle",
  "capsule",
  "triangle",
  "hexagone",
  "nuage",
  "goutte",
];

export const BLOUB_COLORS: readonly ColorId[] = [
  "encre",
  "brun",
  "rouge",
  "orange",
  "ambre",
  "vert",
  "turquoise",
  "bleu",
  "violet",
  "rose",
  "gris",
  "creme",
];

/** Los 14 estados de la secuencia de bloub: los que SÍ transforman la silueta. */
export const BLOUB_STATES: readonly StateId[] = SEQUENCE;

export function BloubAvatar({
  expression = "neutre",
  shape = "nuage",
  color = "encre",
  size = 96,
  className,
  ariaLabel,
}: {
  readonly expression?: ExpressionId;
  readonly shape?: ShapeId;
  readonly color?: ColorId;
  /** Cota width/height; el SVG escala por sí mismo. */
  readonly size?: number;
  readonly className?: string;
  /** Puesto, el SVG es una imagen para el lector de pantalla; sin él es decorativo. */
  readonly ariaLabel?: string;
}) {
  // useId trae dos puntos (":r1:"), inválidos en un funciri — solo quedan los
  // caracteres seguros para `url(#...)` y para el atributo id.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const svg = useMemo(
    () => expressionIcon(expression, { shape, color, size, id: `bloub-${uid}` }),
    [expression, shape, color, size, uid],
  );

  return (
    <span
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      className={cn("inline-block leading-none", className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * Un ESTADO de la secuencia de bloub: los que transforman la silueta (el huevo,
 * el hexágono, el «!», la explosión, el cometa...). `stateIcon` no acepta
 * shape — en los estados que dibujan su propia forma, esa forma ES la
 * animación; la tinta y el tamaño sí se respetan.
 */
export function BloubState({
  state,
  color = "encre",
  size = 96,
  className,
  ariaLabel,
}: {
  readonly state: StateId;
  readonly color?: ColorId;
  /** Cota width/height; el SVG escala por sí mismo. */
  readonly size?: number;
  readonly className?: string;
  readonly ariaLabel?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const svg = useMemo(
    () => stateIcon(state, { color, size, id: `bloub-${uid}` }),
    [state, color, size, uid],
  );

  return (
    <span
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      className={cn("inline-block leading-none", className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
