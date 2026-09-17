/**
 * Iconos de la mascota: un SVG animado POR EXPRESIÓN o POR ESTADO, autónomo,
 * con modo oscuro embebido, generado en vivo (port de `src/ui/agent.ts` de
 * bloub, con tres cambios documentados abajo).
 *
 * La animación es SMIL (`<animate>` / `<animateTransform>`) y la elección no es
 * de gusto: una animación CSS de `d` no existe en WebKit (Safari solo renderiza
 * el primer keyframe), mientras que SMIL interpola `d`, `transform` y `opacity`
 * en todos los motores, incluido dentro de una `<img>`. El modo oscuro viaja
 * en un `<style>` dentro del propio SVG (ver `themeStyle`, más abajo).
 *
 * El dibujo sale de `BotFrame`, la salida del motor (`./engine`) — el motor es
 * la única fuente de verdad; el feed de `/runtime` y el catálogo de
 * `/dev/components` son dos renderizaciones de la misma imagen.
 *
 * Todo es puro: cadena hacia cadena, sin DOM. Las imágenes clave salen de
 * `engine.sample(t)`, función pura del tiempo, así que la generación es
 * determinista y no necesita nada del navegador (por eso los tests corren en
 * el entorno node por defecto).
 *
 * Cambios respecto al original de bloub:
 * 1. `id` en los ajustes: la máscara lleva id propio por llamada
 *    (`<id>`) porque los SVG se montan INLINE en el DOM de la app, y un
 *    id repetido haría que todos los `url(#...)` resuelvan a la primera
 *    máscara del documento (mismo bug que ya tuvo el crossfade del feed).
 *    Los gradientes (`ag`) y la raíz del SVG también se prefijan con ese
 *    `id`: sin ello dos estados con arcos (play/orbit/comet) montados a la
 *    vez resuelven `url(#ag0)` al primero del documento.
 * 2. El tema va scoped por INSTANCIA (`#<id>-root`), no a `:root` ni a
 *    `.bloub-root` compartido: los `<style>` de los SVG inline son CSS de la
 *    PÁGINA, y con varias tintas en pantalla (catálogo) las reglas
 *    compartidas pelearían entre sí — ganaría la última del orden del
 *    documento y todas las mascotas irían con esa tinta. El scope por id
 *    aísla cada SVG; sigue funcionando como `<img>` porque ahí el `#id`
 *    vive dentro del documento imagen aislado.
 * 3. API en inglés y comentarios en español, con los nombres del repo.
 */

import { NOTIF_BLUE } from './decor'
import { BotEngine, type BotFrame } from './engine'
import { RAYON, DEMI_VIEWBOX } from './repere'
import {
  COLOR_BY_ID,
  DEFAULT_COLOR,
  DEFAULT_SHAPE,
  SHAPE_BY_ID,
  mixHex
} from './skins'
import { STATE_BY_ID, type StateId } from './states'
import { EXPRESSION_BY_ID, type BotExpression, type ExpressionId } from './expressions'

/* ------------------------------------------------------------------ settings */

/**
 * El set por defecto: TODAS las expresiones de reposo. Para un estatus de
 * agente, lo que cambia de una situación a otra es la cara — el cuerpo queda
 * de bola al reposo y son los ojos los que cuentan el estado.
 */
export const RESTING_EXPRESSIONS: ExpressionId[] = [
  'neutre',
  'attentif',
  'surpris',
  'excite',
  'heureux',
  'hilare',
  'colere',
  'triste',
  'effraye',
  'mefiant',
  'confus',
  'curieux',
  'fier',
  'timide',
  'blase',
  'somnolent'
]

/** Ventana capturada por expresion. El primer clignement cae a 1,4 s
 * (`BLINKS`, face.ts) y los siguientes cada 1,9 a 4,6 s : tres segundos
 * contienen siempre al menos uno. */
export const EXPRESSION_SECONDS = 3

/** Imagenes clave por segundo del SVG animado. Ver `export.ts` para el porque. */
const KEYS_PER_SEC = 12

/**
 * La vista del icono es la de la PANTALLA, no el cuadro apretado del export
 * fijo : esa marge es la que logea los anillos, y el cuadro apretado los
 * roñaria. Uniforme entre estados, para que los iconos pesen igual en la app.
 */
const VIEW = DEMI_VIEWBOX

/** Cota del atributo width/height del SVG entregado. */
const SIZE = 256

/** Fondo del sitio y de los ojos : el mismo que el del export fijo. */
export const PAPER_LIGHT = '#f9f9f9'
/** Oscuro elegido, no relevado : un vecino neutro de los fondos oscuros comunes. */
export const PAPER_DARK = '#14161d'

/**
 * Cuales colores de cuerpo no leen sobre un fondo oscuro : los muy oscuros se
 * aclaran, los otros quedan. La luz relativa vale como criba ; `mixHex` es el
 * mismo mezclador del personalizador.
 */
function lightenForDark(hex: string): string {
  const v = parseInt(hex.slice(1), 16)
  const l =
    (0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255
  return l < 0.28 ? mixHex(hex, '#ffffff', 0.78) : hex
}

/* -------------------------------------------------------- keyframes */

/**
 * Cuantiza las cifras de un path al paso dado. La vida al reposo mueve el
 * cuerpo ~1,2 unidades sobre un radio de 100 ; cuantizar no deduplica esa
 * deriva (es un desplazamiento continuo), pero aprieta las cadenas
 * intermedias y es lo que permite medir el cuerpo estatico (ver abajo).
 */
function quantizePath(d: string, paso: number): string {
  return d.replace(/-?\d*\.?\d+/g, (m) => String(Math.round(parseFloat(m) / paso) * paso))
}

/** Cuantiza una matriz ya en formato SVG : escala/rotacion a 2 decimales, translation a medio punto. */
function quantizeMatrixStr(m: string): string {
  const t = m
    .replace('matrix(', '')
    .replace(')', '')
    .split(',')
    .map(Number)
  const q2 = (v: number) => Math.round(v * 100) / 100
  return `matrix(${q2(t[0]!)},${q2(t[1]!)},${q2(t[2]!)},${q2(t[3]!)},${Math.round(t[4]! * 2) / 2},${Math.round(t[5]! * 2) / 2})`
}

/** Un paso conservado : indice en la lista completa (0..total) y valor ya cuantizado. */
interface KeyStep {
  i: number
  v: string
}

/**
 * Escribe un `<animate>` SMIL, o `<animateTransform>` si `type`. La lista
 * completa es ida y vuelta (`f0..fN..f0`), lo que da el bucle sin costura que
 * `anime.ts` consigue con `animation-direction: alternate` — aqui el truco es
 * la lista de valores misma : vuelve por donde vino y cierra exactamente sobre
 * su primer cuadro, sea cual sea la no periodicidad de la deriva.
 */
function smil(name: string, steps: KeyStep[], total: number, dur: string, type?: string): string {
  const times = steps.map((p) => (p.i / total).toFixed(4)).join(';')
  const values = steps.map((p) => p.v).join(';')
  if (type) {
    return (
      `<animateTransform type="${type}" attributeName="${name}" ` +
      `calcMode="linear" dur="${dur}" repeatCount="indefinite" ` +
      `keyTimes="${times}" values="${values}"/>`
    )
  }
  return (
    `<animate attributeName="${name}" calcMode="linear" dur="${dur}" ` +
    `repeatCount="indefinite" keyTimes="${times}" values="${values}"/>`
  )
}

/* ---------------------------------------------------------- frame helpers */

const q2 = (v: number) => Math.round(v * 100) / 100

/** Atributo XML : numero redondeado a 2 decimales, cadena tal cual. */
const attr = (name: string, value: string | number) =>
  `${name}="${typeof value === 'number' ? q2(value) : value}"`

/**
 * El relleno de un punto, en variables de tema. La bruma de profundidad se
 * mezcla en CSS (`color-mix`) y no en hex, porque el fondo cambia con el modo
 * oscuro : cocinar la mezcla en el archivo la clavaria a un solo tema.
 */
export function dotFill(dot: BotFrame['dots'][number]): string {
  if (dot.color) return dot.color
  if (dot.depth !== undefined) {
    const pct = Math.round(dot.depth * 20) * 5
    return `color-mix(in srgb, var(--bot-ink) ${pct}%, var(--bot-paper))`
  }
  return 'var(--bot-ink)'
}

/**
 * Firma de estructura de un path : SMIL no interpola formas distintas, y la
 * traza de un arco cambia de estructura a lo largo del giro (el corte
 * frente/behind se desplaza con la fase).
 */
const pathSignature = (d: string) =>
  `${(d.match(/M/g) ?? []).length}M${(d.match(/L/g) ?? []).length}L${(d.match(/C/g) ?? []).length}C`

/** Elemento con sus atributos estaticos y sus `<animate>` como hijos. */
const animatedEl = (tag: string, attrs: string[], animations: string[]) =>
  animations.length
    ? `<${tag} ${attrs.join(' ')}>${animations.join('')}</${tag}>`
    : `<${tag} ${attrs.join(' ')}/>`

/** Matriz del `transform` de un punto con forma : translate + rotate + scale(R). */
function dotMatrix(d: BotFrame['dots'][number]): string {
  const a = ((d.rot ?? 0) * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return quantizeMatrixStr(`matrix(${c * RAYON},${s * RAYON},${-s * RAYON},${c * RAYON},${d.x},${d.y})`)
}

/** Mayor indice segun un peso : sirve para elegir la referencia de un grupo. */
function pickRef(frames: BotFrame[], score: (f: BotFrame) => number): number {
  let best = 0
  let top = -1
  for (let i = 0; i < frames.length; i++) {
    const p = score(frames[i]!)
    if (p > top) {
      top = p
      best = i
    }
  }
  return best
}

/* --------------------------------------------------------------- assembler */

export interface IconOptions {
  shape?: string
  color?: string
  /** cota width/height ; el icono escala por si mismo */
  size?: number
  /**
   * Identidad de la instancia: el espacio de nombres de sus ids (`url(#...)`
   * resuelve a nivel de documento). De él salen la máscara (`<id>`), la raíz
   * (`<id>-root`, scope del tema) y los gradientes (`<id>-ag0...`). Los SVG se
   * montan inline y a veces VARIOS A LA VEZ (crossfade del feed, rejillas del
   * catálogo): un id repetido hace que cada `url(#...)` resuelva a la primera
   * coincidencia — ojos o arcos de otra mascota. El caller compone su espacio
   * (el feed usa `botm-<mood>`, el catálogo `bloub-<uid>`); el defecto es el
   * `botm` genérico de la generación original. Se sanean los caracteres
   * inseguros para `url(#...)`.
   */
  id?: string
}

/**
 * Construye el SVG animado de UNA captura: un estado, o una expresión de
 * reposo sobre la bola. En bucle ida y vuelta, sobre un SVG autónomo que
 * cambia de tema solo.
 */
function buildIcon(
  state: StateId,
  expr: BotExpression | null,
  dur: number,
  options: IconOptions
): string {
  const def = STATE_BY_ID.get(state)
  if (!def) throw new Error(`unknown state: ${state}`)

  const radii = SHAPE_BY_ID.get(options.shape ?? DEFAULT_SHAPE)?.radii ?? null
  const ink = COLOR_BY_ID.get(options.color ?? DEFAULT_COLOR)?.hex ?? '#0a0a0c'
  const size = options.size ?? SIZE
  /** La identidad de la instancia: id de máscara propio por llamada. */
  const instanceId = (options.id ?? 'botm').replace(/[^a-zA-Z0-9_-]/g, '') || 'botm'
  /** Raíz del SVG: el scope del tema. Distinto de la máscara (un id, un elemento). */
  const rootId = `${instanceId}-root`
  /** Prefijo de los gradientes: `url(#...)` resuelve a nivel de documento. */
  const gradId = (s: number) => `${instanceId}-ag${s}`

  // La expresion viene impuesta : la cara es exactamente lo que se vino a
  // capturar, el motor la morfa desde el primer cuadro sin transicion.
  const engine = new BotEngine(RAYON, state, radii, expr)

  const N = Math.max(2, Math.round(dur * KEYS_PER_SEC))
  const total = 2 * N
  // SMIL exige la unidad en el reloj : `dur="4.8"` no vale nada, `4.8s` si.
  const durLabel = (2 * dur).toFixed(3) + 's'

  // imagenes clave : ida (0..N) y vuelta (N..0) comparten los mismos frames
  const frames: BotFrame[] = []
  for (let i = 0; i <= N; i++) frames.push(engine.sample((i / N) * dur))
  /** Valor en el indice completo k (0..2N) : ida hasta N, vuelta despues. */
  const frameAt = (k: number): BotFrame => frames[k <= N ? k : total - k]!

  /** Serie de un atributo leido cada `cada` indices, deduplicada. Un paso
   * grueso (2) aligera los atributos pesados (paths del cuerpo y de los
   * arcos) : el movimiento que queda entre dos claves se interpola lineal, y
   * a cadencia de icono la diferencia no se lee. */
  const track = (read: (k: number) => string, every = 1): KeyStep[] | null => {
    const idx: number[] = []
    for (let k = 0; k < total; k += every) idx.push(k)
    idx.push(total)
    const out: KeyStep[] = [{ i: 0, v: read(0) }]
    for (let j = 1; j < idx.length; j++) {
      const v = read(idx[j]!)
      if (v !== out[out.length - 1]!.v) out.push({ i: idx[j]!, v })
    }
    // un solo valor distinto en toda la vuelta : atributo constante, no se anima
    if (out.length === 1) return null
    // la lista debe cerrar exactamente en el indice total, con el valor final
    if (out[out.length - 1]!.i !== total) out.push({ i: total, v: out[out.length - 1]!.v })
    return out
  }

  /* -------------------------------------------------------------------- body */

  /**
   * El cuerpo se anima SOLO si su silueta se mueve de verdad en el estado.
   * Comparar tres cuadros (inicio, mitad, fin) coordenada por coordenada : si
   * el maximo delta pasa el umbral, la animacion viene de la pose del estado y
   * hay que capturarla ; si no, es deriva de vida al reposo y se queda fuera —
   * ~1,2 unidades sobre un radio de 100, un pixel y medio a tamano de export,
   * lo que no se ve. El export fijo hace lo mismo por la misma razon.
   */
  const toNums = (d: string) => (d.match(/-?\d*\.?\d+/g) ?? []).map(Number)
  const startNums = toNums(frames[0]!.bodyPath)
  const midNums = toNums(frames[Math.floor(N / 2)]!.bodyPath)
  const endNums = toNums(frames[N]!.bodyPath)
  const bodyDelta = Math.max(
    0,
    ...startNums.map((v, i) => Math.max(Math.abs(v - (midNums[i] ?? v)), Math.abs(v - (endNums[i] ?? v))))
  )
  const bodyAnimated = bodyDelta >= 2

  const bodyTrack = bodyAnimated ? track((k) => quantizePath(frameAt(k).bodyPath, 0.5), 2) : null
  const alphaTrack = track((k) => `${q2(frameAt(k).bodyAlpha)}`)

  /**
   * Cuerpo circular : cuando la silueta del estado es un circulo puro (bola al
   * reposo, punto de la reflexion), todo el cuerpo cabe en `cx/cy/r` — tres
   * series de numeros en lugar de un path de ~2,5 kB por clave, y el pulso del
   * punto se conserva porque viene de los radios de la pose. La deriva y la
   * respiracion quedan fuera, como en el cuerpo estatico. La forma del
   * personalizador entra en el calculo : solo los estados `baseBody` la
   * aceptan, y una forma no circular descarta el atajo.
   */
  const silhouetteAt = (t: number) => {
    const pose = def.pose(t)
    const sil = def.baseBody && radii ? { ...pose.sil, radii } : pose.sil
    return { sil, offX: pose.offX, offY: pose.offY }
  }
  const poseSamples = Array.from({ length: N + 1 }, (_, i) => silhouetteAt((i / N) * dur))
  const isCircle = poseSamples.every(
    (s) =>
      Math.max(...s.sil.radii) - Math.min(...s.sil.radii) < 0.005 &&
      s.sil.sx === 1 &&
      s.sil.sy === 1 &&
      s.sil.rot === 0
  )
  const circleTracks = isCircle
    ? (['cx', 'cy', 'r'] as const).map((side) =>
        track((k) => {
          const t = ((k <= N ? k : total - k) / N) * dur
          const { sil, offX, offY } = silhouetteAt(t)
          const value =
            side === 'r' ? sil.radii[0]! : side === 'cx' ? sil.cx + offX : sil.cy + offY
          return `${q2(value * RAYON)}`
        })
      )
    : null
  const isCircleBody = circleTracks !== null

  /* -------------------------------------------------------------------- eyes */

  const eyeRef = pickRef(frames, (f) => f.eyes.length)
  const eyeCount = frames[eyeRef]!.eyes.length
  const eyeMask: string[] = []
  for (let s = 0; s < eyeCount; s++) {
    const base = frames[eyeRef]!.eyes[s]!
    /** La matriz se retiene donde falta el ojo : el slot se apaga por opacidad. */
    let held: string | null = null
    const matrixTracks = track((k) => {
      const eye = frameAt(k).eyes[s]
      if (eye) held = quantizeMatrixStr(eye.matrix)
      return held ?? quantizeMatrixStr(base.matrix)
    })
    const opacityTracks = track((k) => `${q2(frameAt(k).eyes[s]?.alpha ?? 0)}`)
    eyeMask.push(
      animatedEl(
        'path',
        [
          attr('d', base.d),
          'fill="#000"',
          // transform estatico de repliegue : los rasterizadores estaticos
          // (vistazo de un archivo, previsualizaciones de chat) no corren
          // SMIL, y sin este atributo el ojo cae al origen
          attr('transform', quantizeMatrixStr(base.matrix)),
          attr('opacity', base.alpha)
        ],
        [
          matrixTracks ? smil('transform', matrixTracks, total, durLabel, 'matrix') : '',
          opacityTracks ? smil('opacity', opacityTracks, total, durLabel) : ''
        ]
      )
    )
  }

  /* ------------------------------------------------------- notif dot and notch */

  const notifRef = frames.findIndex((f) => f.notif !== null)
  const hasNotif = notifRef >= 0

  let notchSvg = ''
  if (hasNotif) {
    const base = frames[notifRef]!.notch!
    const coordTracks = (['x', 'y', 'r'] as const).map((side) =>
      track((k) => `${q2(frameAt(k).notch ? frameAt(k).notch![side] : base[side])}`)
    )
    const animations = coordTracks
      .map((p, i) => (p ? smil(['cx', 'cy', 'r'][i]!, p, total, durLabel) : ''))
      .join('')
    notchSvg = animatedEl(
      'circle',
      [attr('cx', base.x), attr('cy', base.y), attr('r', base.r), 'fill="#000"'],
      [animations]
    )
  }

  /* -------------------------------------------------------------------- arcs */

  const arcRef = pickRef(frames, (f) => f.arcs.length)
  const arcCount = frames[arcRef]!.arcs.length
  const gradients: string[] = []
  const backArcs: string[] = []
  const frontArcs: string[] = []
  for (let s = 0; s < arcCount; s++) {
    const base = frames[arcRef]!.arcs[s]!
    gradients.push(
      `<linearGradient ${attr('id', gradId(s))} gradientUnits="userSpaceOnUse" ` +
        `${attr('x1', base.grad.x1)} ${attr('y1', base.grad.y1)} ` +
        `${attr('x2', base.grad.x2)} ${attr('y2', base.grad.y2)}>` +
        base.grad.stops
          .map((c, i) => `<stop ${attr('offset', i / (base.grad.stops.length - 1))} ${attr('stop-color', c)}/>`)
          .join('') +
        '</linearGradient>'
    )
    /** Solo se anima el trazo cuando la firma de estructura es estable entre
     * claves ; si no, el path queda en su pose de referencia y solo respira
     * por su opacidad — degradacion asumida del SMIL. */
    const traceTrack = (side: 'front' | 'back'): KeyStep[] | null => {
      const p = track((k) => quantizePath(frameAt(k).arcs[s]?.[side] ?? base[side], 0.5), 2)
      if (!p) return null
      const f0 = pathSignature(p[0]!.v)
      return p.every((x) => pathSignature(x.v) === f0) ? p : null
    }
    const front = traceTrack('front')
    const back = traceTrack('back')
    const opacityTracks = track((k) => `${q2(frameAt(k).arcs[s]?.opacity ?? 0)}`)
    const stroke = `stroke="url(#${gradId(s)})"`
    backArcs.push(
      animatedEl(
        'path',
        [attr('d', base.back), stroke, attr('stroke-width', base.width), attr('opacity', base.opacity), 'fill="none"'],
        [back ? smil('d', back, total, durLabel) : '', opacityTracks ? smil('opacity', opacityTracks, total, durLabel) : '']
      )
    )
    frontArcs.push(
      animatedEl(
        'path',
        [attr('d', base.front), stroke, attr('stroke-width', base.width), attr('opacity', base.opacity), 'fill="none"'],
        [front ? smil('d', front, total, durLabel) : '', opacityTracks ? smil('opacity', opacityTracks, total, durLabel) : '']
      )
    )
  }

  /* ------------------------------------------------------------------- dots */

  const dotGroup = (behind: boolean): string => {
    const dotRef = pickRef(frames, (f) => (f.dotsBehind === behind ? f.dots.length : 0))
    const slotCount =
      frames[dotRef]!.dotsBehind === behind ? frames[dotRef]!.dots.length : 0
    if (!slotCount) return ''
    const refDots = frames[dotRef]!.dots
    const out: string[] = []
    for (let s = 0; s < slotCount; s++) {
      const base = refDots[s]!
      const dotAt = (k: number) => (frameAt(k).dotsBehind === behind ? frameAt(k).dots[s] : undefined)
      const animations: string[] = []
      const attrs: string[] = []
      if (base.d) {
        // punto con forma (la gota del « ! » penche) : d estatico, matriz animada
        attrs.push(attr('d', base.d), attr('transform', dotMatrix(base)))
        let heldMatrix: string | null = null
        const geoTracks = track((k) => {
          const d = dotAt(k)
          if (d) heldMatrix = dotMatrix(d)
          return heldMatrix ?? dotMatrix(base)
        })
        if (geoTracks) animations.push(smil('transform', geoTracks, total, durLabel, 'matrix'))
      } else {
        const heldValues: Array<number | null> = [null, null, null]
        ;(['x', 'y', 'r'] as const).forEach((side, i) => {
          const geoTracks = track((k) => {
            const d = dotAt(k)
            if (d) heldValues[i] = d[side]
            return `${q2(heldValues[i] ?? base[side])}`
          })
          if (geoTracks) animations.push(smil(['cx', 'cy', 'r'][i]!, geoTracks, total, durLabel))
        })
        attrs.push(attr('cx', base.x), attr('cy', base.y), attr('r', base.r))
      }
      attrs.push(attr('fill', dotFill(base)))
      const fillTracks = track((k) => {
        const d = dotAt(k)
        return d ? dotFill(d) : dotFill(base)
      })
      if (fillTracks) animations.push(smil('fill', fillTracks, total, durLabel))
      const opacityTracks = track((k) => `${q2(dotAt(k)?.opacity ?? 0)}`)
      if (opacityTracks) animations.push(smil('opacity', opacityTracks, total, durLabel))
      out.push(animatedEl(base.d ? 'path' : 'circle', attrs, animations))
    }
    return `<g>${out.join('')}</g>`
  }

  const backDots = dotGroup(true)
  const frontDots = dotGroup(false)

  let notifSvg = ''
  if (hasNotif) {
    const base = frames[notifRef]!.notif!
    const coordTracks = (['x', 'y', 'r'] as const).map((side) =>
      track((k) => `${q2(frameAt(k).notif ? frameAt(k).notif![side] : base[side])}`)
    )
    const animations = coordTracks
      .map((p, i) => (p ? smil(['cx', 'cy', 'r'][i]!, p, total, durLabel) : ''))
      .join('')
    notifSvg = animatedEl(
      'circle',
      [attr('cx', base.x), attr('cy', base.y), attr('r', base.r), attr('fill', NOTIF_BLUE)],
      [animations]
    )
  }

  /* ----------------------------------------------------------------- assembly */

  const bodyD = frames[eyeRef]!.bodyPath

  /** El cuerpo, como elemento (path o circle) con sus animaciones. */
  const bodyEl = (fill: string, isMask: boolean): string => {
    const animations: string[] = []
    const attrs: string[] = [isMask ? 'fill="#fff"' : attr('fill', fill)]
    if (isCircleBody) {
      // los atributos estaticos salen del primer cuadro (t = 0), que es tambien
      // el primero de cada serie ; las series nulas (atributo constante) solo
      // fijan el atributo
      const baseSilhouette = silhouetteAt(0)
      attrs.push(
        attr('cx', (baseSilhouette.sil.cx + baseSilhouette.offX) * RAYON),
        attr('cy', (baseSilhouette.sil.cy + baseSilhouette.offY) * RAYON),
        attr('r', baseSilhouette.sil.radii[0]! * RAYON)
      )
      circleTracks!.forEach((p, i) => {
        if (p) animations.push(smil(['cx', 'cy', 'r'][i]!, p, total, durLabel))
      })
      return animatedEl('circle', attrs, animations)
    }
    if (bodyTrack) animations.push(smil('d', bodyTrack, total, durLabel))
    attrs.push(attr('d', bodyD))
    return animatedEl('path', attrs, animations)
  }

  const mask =
    `<mask ${attr('id', instanceId)} maskUnits="userSpaceOnUse" ` +
    `${attr('x', -VIEW)} ${attr('y', -VIEW)} ${attr('width', VIEW * 2)} ${attr('height', VIEW * 2)}>` +
    bodyEl('#fff', true) +
    eyeMask.join('') +
    notchSvg +
    '</mask>'

  /**
   * El tema viaja en el propio archivo, scoped por instancia a `#<id>-root` —
   * el id de la raíz del SVG, no de la página. Tres vías, y cada una para un
   * huésped distinto: la media query sigue al SISTEMA y sirve al SVG como
   * `<img>` (un documento imagen no ve el CSS de la página) y al documento
   * suelto sin clases; las reglas de clase siguen al huésped INLINE, donde
   * el SVG vive dentro del DOM de la app y su tema va por clase (`.dark` /
   * `.light` en <html>, pintadas AMBAS por el theme-provider). El override
   * de clase gana por especificidad (`html.dark #id` > `#id`) al de media
   * query, así que una app que fuerza el tema no pelea con el sistema — y el
   * `html.light #id` posterior devuelve a claro al inline forzado aunque el
   * SO esté en oscuro. Y el scope por id aísla cada instancia: los `<style>`
   * inline son CSS de la PÁGINA, y con varias tintas en pantalla (rejilla del
   * catálogo) las reglas compartidas (`:root`, `.bloub-root`) pelearían entre
   * sí — ganaría la última del documento y todas las mascotas irían con esa
   * tinta.
   */
  const styleTag = themeStyle(ink, rootId)

  const bodyGroup =
    `<g ${attr('opacity', frames[eyeRef]!.bodyAlpha)}>` +
    (alphaTrack ? smil('opacity', alphaTrack, total, durLabel) : '') +
    bodyEl('#fff', false) +
    `<g mask="url(#${instanceId})"><rect ${attr('x', -VIEW)} ${attr('y', -VIEW)} ${attr('width', VIEW * 2)} ${attr('height', VIEW * 2)} fill="var(--bot-ink)"/></g>` +
    '</g>'

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ${attr('id', rootId)} class="bloub-root" ${attr('width', size)} ${attr('height', size)} ` +
    `viewBox="${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}">` +
    `<defs>${mask}${gradients.join('')}</defs>` +
    `<g fill="none" stroke-linecap="round">${backArcs.join('')}</g>` +
    backDots +
    bodyGroup +
    frontDots +
    notifSvg +
    `<g fill="none" stroke-linecap="round">${frontArcs.join('')}</g>` +
    styleTag +
    '</svg>'
  )
}

/**
 * El `<style>` de un icono, en función de las dos tintas (clara y oscurecida)
 * y de la raíz propia (`#<id>-root`). Scope por id: cada instancia pinta solo
 * su SVG aunque docenas compartan documento.
 */
/**
 * CSS interior del `<style>` por instancia (sin la etiqueta), para el
 * componente vivo (`BloubLive`), que pinta el `<style>` en React en lugar de
 * en cadena. Misma regla que `themeStyle`: scope `#<id>-root`, media del
 * sistema para el documento suelto / `<img>`, clases de la app para inline.
 */
export function themeCss(rootId: string, ink: string): string {
  const darkInk = lightenForDark(ink)
  const scope = `#${rootId}`
  return (
    `${scope}{--bot-ink:${ink};--bot-paper:${PAPER_LIGHT}}` +
    `@media (prefers-color-scheme:dark){${scope}{--bot-ink:${darkInk};--bot-paper:${PAPER_DARK}}}` +
    `html.dark ${scope}{--bot-ink:${darkInk};--bot-paper:${PAPER_DARK}}` +
    `html.light ${scope}{--bot-ink:${ink};--bot-paper:${PAPER_LIGHT}}`
  )
}

function themeStyle(ink: string, rootId: string): string {
  return `<style>${themeCss(rootId, ink)}</style>`
}

export function stateIcon(state: StateId, options: IconOptions = {}): string {
  const def = STATE_BY_ID.get(state)
  if (!def) throw new Error(`unknown state: ${state}`)
  return buildIcon(state, null, def.duration, options)
}

/**
 * El icono de UNA expresión: la bola al reposo con esa cara, su propio
 * parpadeo y deriva en bucle. Es la moneda de la vista Agent.
 */
export function expressionIcon(id: ExpressionId, options: IconOptions = {}): string {
  const expr = EXPRESSION_BY_ID.get(id)
  if (!expr) throw new Error(`unknown expression: ${id}`)
  return buildIcon('idle', expr, EXPRESSION_SECONDS, options)
}
