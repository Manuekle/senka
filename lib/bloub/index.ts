/**
 * bloub — el motor y el generador de la mascota, portados de
 * github.com/jeremy-prt/bloub (src/bot + src/ui/agent.ts).
 *
 * Los archivos son copia del upstream con dos cambios, documentados en la
 * cabecera de `svg.ts`: ids por instancia (máscara, raíz y gradientes) y
 * esquema de tema por instancia keyed a las clases de la app. Nada aquí toca el DOM: todo es cadena hacia cadena y los
 * tests corren en node.
 */
export { BotEngine, type BotFrame } from "./engine";
export { EXPRESSIONS, EXPRESSION_BY_ID, DEFAULT_EXPRESSION, blendExpression, type BotExpression, type ExpressionId } from "./expressions";
export { PROFILES, PROFILE_SAMPLES, type ProfileName } from "./profiles";
export { RAYON, DEMI_VIEWBOX } from "./repere";
export { SHAPES, SHAPE_BY_ID, COLORS, COLOR_BY_ID, DEFAULT_SHAPE, DEFAULT_COLOR, mixHex, type BotShape, type BotColor, type ShapeId, type ColorId } from "./skins";
export { SEQUENCE, STATES, STATE_BY_ID, type StateId } from "./states";
export {
  RESTING_EXPRESSIONS,
  EXPRESSION_SECONDS,
  PAPER_LIGHT,
  PAPER_DARK,
  themeCss,
  stateIcon,
  expressionIcon,
  dotFill,
  type IconOptions,
} from "./svg";
