"use client";

// Dedicated i18n for the component catalog.
// Two locales: es (default) and en.
// Registry files export translation keys — the catalog resolves them at render.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CatalogLocale = "es" | "en";

type Dictionary = Record<string, string>;

// ── Dictionaries ────────────────────────────────────────────────────

const es: Dictionary = {
  // Shell
  "shell.title": "Catálogo",
  "shell.badge": "solo dev",
  "shell.filterPlaceholder": "Filtrar…  /",
  "shell.filterLabel": "Filtrar componentes",
  "shell.clearFilter": "Limpiar filtro",
  "shell.clearFilterLabel": "Limpiar filtro",
  "shell.emptyMatch": "Nada coincide con «{query}».",
  "shell.showing": "{shown} de {total}",
  "shell.total": "{total} componentes",
  "shell.indexLabel": "Índice de componentes",
  "shell.code": "Código",
  "shell.hide": "Ocultar",
  "shell.props": "API",
  "shell.exports": "Exporta",
  "shell.copy": "Copiar",
  "shell.copied": "Copiado",
  "shell.required": "Requerido",

  // Foundations
  "foundations.title": "Fundamentos",
  "foundations.desc": "Los tokens de app/globals.css. Todo lo demás en esta página está hecho con estos: un componente que inventa su propio gris es un componente que se sale del sistema.",
  "foundations.color.name": "Color",
  "foundations.color.desc": "Escala monocroma en oklch, con destructive y billing como los dos únicos acentos. Cada token tiene par claro/oscuro; el bloque .dark los redefine, nunca los componentes.",
  "foundations.color.surfaces.title": "Superficies y semántica",
  "foundations.color.surfaces.desc": "Cambia el tema arriba a la derecha para ver el par oscuro.",
  "foundations.color.status.title": "Colores de estado",
  "foundations.color.status.desc": "Los siete pares que consume StatusBadge. Fondo pastel, texto del mismo tono.",
  "foundations.elevation.name": "Elevación y radio",
  "foundations.elevation.desc": "La profundidad se siente, no se ve: sombras cortas y de baja alfa, más un inset highlight arriba. El radio base es 12px y todo lo demás sale de ahí.",
  "foundations.elevation.shadows.title": "Sombras",
  "foundations.elevation.radius.title": "Radios",
  "foundations.typography.name": "Tipografía",
  "foundations.typography.desc": "Saans para titulares, Inter para todo lo demás, Geist Mono para código. Las tres son variables y se sirven desde /public/fonts salvo la mono.",
  "foundations.typography.families.title": "Familias",
  "foundations.typography.scale.title": "Escala de texto",

  // UI Controls
  "controls.title": "Controles",
  "controls.desc": "components/ui — botones, campos y pastillas. Es la capa que más se repite en la app, así que es la que menos debería reinventarse en una página nueva.",
  "controls.button.name": "Button",
  "controls.button.desc": "Seis variantes y ocho tamaños sobre una sola receta: mismo radio, misma tipografía, misma transición. La profundidad es un borde hairline más un inner highlight arriba y una sombra corta abajo. El foco es un `outline`, no un `ring`, porque el `box-shadow` ya está gastado en la superficie.",
  "controls.button.variant.desc": "Cuánto peso carga la acción. default es la principal de la pantalla.",
  "controls.button.size.desc": "Las variantes icon son cuadradas; el resto crece solo en alto y padding.",
  "controls.button.asChild.desc": "Renderiza el hijo en vez de un <button> — para un <Link> con pinta de botón.",
  "controls.button.disabled.desc": "Baja el contraste y corta pointer-events, no solo el cursor.",
  "controls.button.props.desc": "Todo lo nativo pasa tal cual: type, onClick, form, aria-*.",
  "controls.button.note1": "default, destructive, secondary y outline suenan al pulsarse (data-cuelume-press). ghost y link no: son la X de cerrar y el «ver más», y sonarlos es como se acaba silenciando la app entera.",
  "controls.button.note2": "El SVG dentro se dimensiona solo a 16px salvo que le pases una clase size-*.",
  "controls.button.variants.title": "Variantes",
  "controls.button.sizes.title": "Tamaños",
  "controls.button.icons.title": "Con icono y solo icono",
  "controls.button.icons.desc": "Un botón que es solo un icono necesita aria-label: el SVG va oculto al lector.",
  "controls.button.states.title": "Estados",

  "controls.suggestionChip.name": "SuggestionChip",
  "controls.suggestionChip.desc": "La pastilla de arranque de una conversación: el estado vacío del chat, los dos asistentes y las opciones de seguimiento de un turno. Es un Button outline con la superficie del chip encima, así que el radio, el foco y el disabled vienen del sistema.",
  "controls.suggestionChip.size.desc": "xs para las opciones dentro de un turno.",
  "controls.suggestionChip.extra.desc": "Todo lo del Button: disabled, onClick, asChild.",
  "controls.suggestionChip.demos.title": "Tamaños y disabled",

  "controls.toggleChip.name": "ToggleChip",
  "controls.toggleChip.desc": "La pastilla que está elegida o no: el idioma del brief, la plantilla al crear un agente, el filtro de opciones de un paso de formulario. `aria-pressed` sale de `selected`, no del que llama — las tres copias a mano que sustituye no lo ponían todas.",
  "controls.toggleChip.selected.desc": "Marca el estado y escribe aria-pressed.",
  "controls.toggleChip.demos.title": "Una sola elección",
  "controls.toggleChip.demos.desc": "Pulsa: solo una queda marcada.",

  "controls.badge.name": "Badge",
  "controls.badge.desc": "Pastilla de etiqueta, no de estado — para eso está StatusBadge. Monocroma salvo destructive, que es el único acento.",
  "controls.badge.variant.desc": "El peso visual de la etiqueta.",
  "controls.badge.asChild.desc": "Para renderizar la pastilla como <a>; los hovers [a&] se activan solos.",
  "controls.badge.variants.title": "Variantes",
  "controls.badge.icon.title": "Con icono",
  "controls.badge.icon.desc": "El SVG se dimensiona solo a 12px dentro de la pastilla.",

  "controls.statusBadge.name": "StatusBadge",
  "controls.statusBadge.desc": "La única pastilla de estado de la app: un pastel por estado, icono de línea y etiqueta. Las siete variantes de la especificación más siete alias propios del producto que reutilizan los mismos colores.",
  "controls.statusBadge.status.desc": "pending · in-progress · submitted · in-review · success · failed · expired, más connected · disconnected · active · paused · draft · error · warning.",
  "controls.statusBadge.label.desc": "Pisa la etiqueta del diccionario. Solo cuando una pantalla necesita otra palabra.",
  "controls.statusBadge.title.desc": "Texto de hover para el detalle que haría la pastilla ilegible de largo.",
  "controls.statusBadge.note": "Traduce con useT() contra las claves badge.<variant>, así que necesita el I18nProvider del layout raíz.",
  "controls.statusBadge.all.title": "Todas las variantes",
  "controls.statusBadge.custom.title": "Etiqueta propia",

  "controls.input.name": "Input",
  "controls.input.desc": "El <input> nativo con la receta de campo: fondo hundido, borde de 1px y foco por `outline`. En foco el fondo sube a --card, que es la señal de «esto está activo» sin gastar la sombra.",
  "controls.input.type.desc": "Nativo. file trae su propio estilo de botón.",
  "controls.input.ariaInvalid.desc": "Pinta el borde en destructive y añade la sombra de error.",
  "controls.input.props.desc": "Todo lo nativo pasa tal cual.",
  "controls.input.states.title": "Estados",

  "controls.textarea.name": "Textarea",
  "controls.textarea.desc": "Misma receta que Input, con field-sizing-content: crece con lo escrito en vez de quedarse en una caja fija con scroll.",
  "controls.textarea.props.desc": "Nativo. rows sigue funcionando si quieres fijar el alto.",
  "controls.textarea.title": "Autogrow",
  "controls.textarea.desc2": "Escribe varias líneas: la caja crece sola.",

  "controls.switch.name": "Switch",
  "controls.switch.desc": "Interruptor on/off. El recorrido del pulgar y el doble rebote viven en .t-toggle (globals.css); el componente pone la caja, los colores y el cableado accesible.",
  "controls.switch.checked.desc": "Controlado siempre — no hay estado interno.",
  "controls.switch.onCheckedChange.desc": "El nuevo valor, ya invertido.",
  "controls.switch.label.desc": "Nombre accesible: el control no tiene texto propio.",
  "controls.switch.disabled.desc": "Baja a 40 % y cambia el cursor.",
  "controls.switch.note": "La animación de apagado solo se arma tras el primer clic (.is-init): si no, cada switch de la página tiembla al hidratar.",
  "controls.switch.states.title": "Estados",

  "controls.liquidSlider.name": "LiquidSlider",
  "controls.liquidSlider.desc": "Slider cuyo pulgar es una gota: persigue al puntero, se estira con la velocidad y deja cola. Debajo hay un <input type=\"range\"> real e invisible, que es lo que mantiene teclado y lectores funcionando.",
  "controls.liquidSlider.value.desc": "Controlado.",
  "controls.liquidSlider.label.desc": "Nombre accesible: la pista no lleva texto.",
  "controls.liquidSlider.note": "Un salto de más de 40px re-siembra la superficie líquida, para que un clic en el otro extremo no muestre la gota cruzando la pista.",
  "controls.liquidSlider.title": "Arrástralo",

  "controls.buttonGroup.name": "ButtonGroup",
  "controls.buttonGroup.desc": "Cose varios botones en un solo bloque: quita los radios interiores y los bordes duplicados. Funciona con Button, Select y campos.",
  "controls.buttonGroup.orientation.desc": "Vertical apila y cose por arriba/abajo.",
  "controls.buttonGroup.horizontal.title": "Horizontal y vertical",
  "controls.buttonGroup.text.title": "Con texto y separador",

  "controls.inputGroup.name": "InputGroup",
  "controls.inputGroup.desc": "Un campo con cosas pegadas: icono delante, botón detrás, ayuda debajo. El anillo de foco lo pinta el grupo, no el control — el grupo es el que tiene el radio.",
  "controls.inputGroup.align.desc": "Dónde se pega el añadido. Los block-* apilan y convierten el grupo en columna.",
  "controls.inputGroup.size.desc": "El botón interior es un Button ghost recortado para caber en la fila.",
  "controls.inputGroup.icon.title": "Icono y botón",
  "controls.inputGroup.help.title": "Ayuda debajo",

  "controls.spinner.name": "Spinner",
  "controls.spinner.desc": "El icono Loading03 girando, con role=\"status\" y nombre accesible ya puestos.",
  "controls.spinner.size.desc": "En px.",
  "controls.spinner.className.desc": "Para el color: hereda currentColor por defecto.",
  "controls.spinner.title": "Tamaños y color",

  "controls.separator.name": "Separator",
  "controls.separator.desc": "Una línea de 1px en --border. Decorativa por defecto, así que no aparece en el árbol de accesibilidad.",
  "controls.separator.orientation.desc": "La vertical necesita un padre con altura.",
  "controls.separator.decorative.desc": "En false se anuncia como separador real.",
  "controls.separator.title": "Horizontal y vertical",

  // UI Overlays
  "overlays.title": "Capas y menús",
  "overlays.desc": "Diálogos, menús y avisos. La superficie es siempre --popover con --shadow-float; la animación de entrada vive en globals.css para que un menú nuevo no tenga que volver a inventarla.",
  "overlays.dialog.name": "Dialog",
  "overlays.dialog.desc": "Panel modal para editar algo. Radix pone el foco atrapado, el scroll lock y el Escape; el envoltorio pone la superficie, la ✕ y el cue de apertura.",
  "overlays.dialog.open.desc": "Controlado. Sin ellos el Trigger lo maneja solo.",
  "overlays.dialog.showClose.desc": "En DialogContent. Apágalo cuando el pie ya tenga un Cancelar.",
  "overlays.dialog.note1": "Un diálogo de edición necesita key={editing?.id ?? \"new\"} en el sitio de la llamada, o reabre con los datos del anterior.",
  "overlays.dialog.note2": "DialogTitle es obligatorio para Radix: si no lo quieres visible, ponlo en sr-only.",
  "overlays.dialog.title": "Editar algo",

  "overlays.alertDialog.name": "AlertDialog",
  "overlays.alertDialog.desc": "El Dialog para decisiones que no se deshacen. No se cierra al hacer clic fuera y siempre tiene exactamente dos salidas.",
  "overlays.alertDialog.note": "Para el borrado normal la app usa components/confirm-dialog.tsx, que ya envuelve esto con el texto y el botón destructivo puestos.",
  "overlays.alertDialog.title": "Confirmar un borrado",

  "overlays.dropdownMenu.name": "DropdownMenu",
  "overlays.dropdownMenu.desc": "El menú de los tres puntos. Incluye checkbox, radio y submenús.",
  "overlays.dropdownMenu.variant.desc": "destructive tiñe texto e icono, y el hover.",
  "overlays.dropdownMenu.inset.desc": "Sangra a la izquierda para alinear con items que llevan check.",
  "overlays.dropdownMenu.title": "Acciones de fila",

  "overlays.contextMenu.name": "ContextMenu",
  "overlays.contextMenu.desc": "El mismo menú, abierto con clic derecho sobre una zona.",
  "overlays.contextMenu.title": "Clic derecho en la zona",

  "overlays.select.name": "Select",
  "overlays.select.desc": "Desplegable de una sola opción. El disparador comparte la receta de campo con Input, así que un Select y un Input en la misma fila se alinean.",
  "overlays.select.size.desc": "h-9 y h-8 — los mismos altos que Button.",
  "overlays.select.value.desc": "Controlado; si no, defaultValue.",
  "overlays.select.title": "Con grupos",

  "overlays.command.name": "Command",
  "overlays.command.desc": "Lista filtrable sobre cmdk. Suelta es un buscador embebido; dentro de CommandDialog es la paleta de comandos (⌘K).",
  "overlays.command.note": "Al montarse, cmdk selecciona su primera fila y la lleva a la vista con scrollIntoView. Dentro de una página larga eso arrastra el scroll hasta la lista: por eso aquí el buscador embebido se monta a mano.",
  "overlays.command.dialog.title": "Como paleta",
  "overlays.command.dialog.desc": "La forma que usa la app: CommandDialog sobre el mismo Command.",
  "overlays.command.inline.title": "Embebido",
  "overlays.command.inline.desc": "Móntalo y escribe para filtrar.",

  "overlays.tooltip.name": "Tooltip",
  "overlays.tooltip.desc": "Etiqueta corta al pasar por encima. El TooltipProvider ya está montado en el layout raíz, así que no hace falta volver a envolver.",
  "overlays.tooltip.sideOffset.desc": "Separación del disparador, en px.",
  "overlays.tooltip.note": "Un tooltip no es un nombre accesible: un botón de solo icono necesita además su aria-label.",
  "overlays.tooltip.title": "Cuatro lados",

  "overlays.hoverCard.name": "HoverCard",
  "overlays.hoverCard.desc": "Como el tooltip, pero con sitio para contenido: una ficha de contacto, un resumen.",
  "overlays.hoverCard.title": "Ficha al pasar",

  "overlays.collapsible.name": "Collapsible",
  "overlays.collapsible.desc": "Abrir y cerrar un bloque. Es la base de Reasoning y de Tool.",
  "overlays.collapsible.title": "Abrir un detalle",

  "overlays.errorBanner.name": "ErrorBanner",
  "overlays.errorBanner.desc": "La única forma en que una pantalla dice «eso no funcionó». Traduce el error en el render, no al guardarlo, para que cambiar de idioma lo re-renderice en el nuevo. Suena solo cuando aparece, no cuando ya estaba.",
  "overlays.errorBanner.error.desc": "Lo que falló. Se traduce con uiErrorMessage.",
  "overlays.errorBanner.messageKey.desc": "Atajo de error={{ messageKey }} para fallos locales.",
  "overlays.errorBanner.message.desc": "Una frase ya final. Último recurso: no se re-traduce.",
  "overlays.errorBanner.detail.desc": "Contexto técnico, en pequeño y debajo.",
  "overlays.errorBanner.onRetry.desc": "Añade el botón de reintentar.",
  "overlays.errorBanner.onDismiss.desc": "Añade la ✕.",
  "overlays.errorBanner.title": "Con reintento y descarte",

  "overlays.orb.name": "Orb",
  "overlays.orb.desc": "La entrada única de la app a thinking-orbs: la esfera que dice qué verbo está haciendo el agente. Resuelve el tema sola, se congela bajo prefers-reduced-motion y se pausa fuera de pantalla.",
  "overlays.orb.state.desc": "working · searching · solving · listening · connecting · weaving · composing · breathing · shaping.",
  "overlays.orb.size.desc": "20 va en línea con el texto; 64 es para una pantalla vacía.",
  "overlays.orb.decorative.desc": "Oculto al lector de pantalla: al lado siempre hay una etiqueta que ya nombra el estado.",
  "overlays.orb.states.title": "Los nueve estados",
  "overlays.orb.large.title": "Tamaño 64",

  "overlays.beam.name": "Beam",
  "overlays.beam.desc": "El halo metálico alrededor de un control. Envuelve al hijo en un <div> propio, así que lo posicional va en `style`, no en `className` — el paquete inyecta su CSS después de Tailwind y gana por orden.",
  "overlays.beam.size.desc": "pulse-outside es la de la casa: florece por fuera en vez de trazar el borde.",
  "overlays.beam.color.desc": "Pisa el metal por tema. Normalmente no se toca.",
  "overlays.beam.strength.desc": "0–1. En botones va bajo para que sea un tinte, no un espectáculo.",
  "overlays.beam.active.desc": "Se desvanece en vez de desmontarse: el envoltorio carga el layout.",
  "overlays.beam.borderRadius.desc": "Solo si el hijo esconde su propio radio.",
  "overlays.beam.note": "Necesita un hijo opaco con su propio borde de 1px y sitio para desbordar: cualquier overflow:hidden por encima recorta el halo.",
  "overlays.beam.title": "Sobre un botón",

  // Motion
  "motion.title": "Movimiento",
  "motion.desc": "components/motion — controles con muelle, texto que entra y botones con estado. Nada de aquí anima bajo prefers-reduced-motion, y los efectos de hover se apagan solos en dispositivos sin puntero.",
  "motion.checkbox.name": "Checkbox",
  "motion.checkbox.desc": "Casilla con la marca dibujándose. El <input> real sigue debajo, así que el clic en la etiqueta y el teclado son los nativos.",
  "motion.checkbox.checked.desc": "Controlado.",
  "motion.checkbox.indeterminate.desc": "Dibuja el guion del estado parcial.",
  "motion.checkbox.label.desc": "Texto a la derecha; también es el destino del clic.",
  "motion.checkbox.aria.desc": "Asocia un mensaje externo, por ejemplo un error de formulario.",
  "motion.checkbox.title": "Marcado, parcial y bloqueado",

  "motion.radio.name": "RadioGroup",
  "motion.radio.desc": "Una sola opción de varias, con el punto interior escalando al elegir.",
  "motion.radio.value.desc": "Controlado o no.",
  "motion.radio.title": "Vertical",

  "motion.input.name": "Input (motion)",
  "motion.input.desc": "Campo con etiqueta flotante, iconos a los lados y sacudida al fallar. Es el de los formularios de la landing; dentro de la app el de components/ui/input es el que manda.",
  "motion.input.label.desc": "Etiqueta que sube al enfocar.",
  "motion.input.onChange.desc": "onChange recibe el valor, no el evento.",
  "motion.input.error.desc": "Truthy sacude y pinta en rojo; si es string, además lo muestra.",
  "motion.input.success.desc": "Dibuja el check a la derecha.",
  "motion.input.classNames.desc": "Escotillas por parte: root, label, field, input, errorMessage…",
  "motion.input.title": "Escribe algo sin arroba",

  "motion.actionSwap.name": "ActionSwapButton",
  "motion.actionSwap.desc": "Un botón cuya etiqueta cambia al pulsarlo, sin que la caja se mueva: un medidor oculto guarda el estado más largo y es quien fija el ancho.",
  "motion.actionSwap.items.desc": "{ id, label, icon?, ariaLabel? } por estado.",
  "motion.actionSwap.value.desc": "El id activo.",
  "motion.actionSwap.animation.desc": "cascade rueda letra a letra, de izquierda a derecha.",
  "motion.actionSwap.cycle.desc": "Cada clic avanza al siguiente item y vuelve al principio.",
  "motion.actionSwap.iconOnly.desc": "Oculta el texto y deja solo el icono.",
  "motion.actionSwap.title": "Tres animaciones",
  "motion.actionSwap.desc2": "Pulsa cada uno: blur funde, roll gira, cascade va letra por letra.",

  "motion.themeToggle.name": "ThemeToggle",
  "motion.themeToggle.desc": "Cambia el tema con una View Transition: el nuevo esquema se revela desde un punto en vez de parpadear. Suspende el cross-fade de :root mientras dura, que es lo que convertía el barrido en puré.",
  "motion.themeToggle.variant.desc": "La forma del barrido.",
  "motion.themeToggle.start.desc": "De dónde sale el revelado.",
  "motion.themeToggle.title": "Las cuatro variantes",
  "motion.themeToggle.desc2": "Cada una cambia el tema de verdad — pulsa dos veces para volver.",

  "motion.textReveal.name": "TextReveal",
  "motion.textReveal.desc": "Titular que entra por palabras o por letras, con desenfoque y muelle. Un único tokenizador para los dos modos, así que no se desalinean en qué cuenta como palabra.",
  "motion.textReveal.text.desc": "Un array son líneas: cada una entra detrás de la anterior.",
  "motion.textReveal.as.desc": "h1…h6, span, label, strong, em.",
  "motion.textReveal.split.desc": "Granularidad de la entrada.",
  "motion.textReveal.stagger.desc": "Segundos entre unidad y unidad.",
  "motion.textReveal.delay.desc": "Retraso antes de empezar.",
  "motion.textReveal.blur.desc": "Desenfoque de partida, en px.",
  "motion.textReveal.yOffset.desc": "Desde dónde sube.",
  "motion.textReveal.view.desc": "Dispara al entrar en pantalla, y solo una vez.",
  "motion.textReveal.title": "Por palabras y por letras",

  "motion.textShimmer.name": "TextShimmer",
  "motion.textShimmer.desc": "Un brillo recorriendo el texto — la señal de «esto sigue pasando».",
  "motion.textShimmer.duration.desc": "Segundos por pasada.",
  "motion.textShimmer.title": "En marcha",

  "motion.thinkingText.name": "ThinkingText",
  "motion.thinkingText.desc": "Cicla frases sin que la caja cambie de ancho: un medidor invisible sostiene la más larga, así que el botón de alrededor no salta a media frase.",
  "motion.thinkingText.states.desc": "Las frases, en orden.",
  "motion.thinkingText.hold.desc": "Milisegundos por frase.",
  "motion.thinkingText.title": "Ciclando",

  "motion.downloadAnimation.name": "DownloadAnimation",
  "motion.downloadAnimation.desc": "Un icono de archivo vuela desde el botón hacia la esquina superior derecha (la zona de descargas del navegador). Respeta prefers-reduced-motion.",
  "motion.downloadAnimation.fileType.desc": "Icono del archivo animado.",
  "motion.downloadAnimation.onDownload.desc": "Lógica real de descarga.",
  "motion.downloadAnimation.title": "Tres tipos de archivo",
  "motion.downloadAnimation.desc2": "Pulsa cada botón: el icono vuela hacia la esquina superior derecha.",

  "motion.toast.name": "Toast",
  "motion.toast.desc": "La superficie de aviso de la app, montada una sola vez en el layout raíz. El sonido se decide aquí por estado, no en cada llamada. Un toast de error no caduca solo: 4,2 s alcanzan para «Guardado» y no para leer qué falló y decidir qué hacer.",
  "motion.toast.status.desc": "Decide icono, color y sonido.",
  "motion.toast.action.desc": "Un botón dentro del toast.",
  "motion.toast.duration.desc": "ms. 0 = hasta que se descarte. Los error ya son 0.",
  "motion.toast.title": "Lánzalos",

  // Lighting
  "lighting.title": "Iluminación",
  "lighting.desc": "El equipo de luces del landing. Seis piezas y una regla: la página tiene una sola lámpara, colgada arriba, y cada componente es esa lámpara vista desde otra distancia. Ninguno se anima en bucle — una luz que late es una notificación, una luz quieta es una habitación. Todos leen tokens declarados en .lp, así que fuera del envoltorio de marketing no pintan nada.",

  "lighting.note.lpOnly": "Solo dentro de .lp. Los tokens --lp-beam-*, --lp-halo-ink y --lp-lumen-* viven en el envoltorio de marketing; fuera de él cada color resuelve a nada y la pieza dibuja una caja vacía.",

  "lighting.lightBar.desc": "Un tubo de luz colgado sobre algo: el filamento, el brillo que lo rodea y el cono que tira hacia abajo. Es la pieza que va sobre cada captura de la página.",
  "lighting.lightBar.prop.className": "Dónde cuelga y qué ancho tiene. La composición la decide quien llama, no el componente.",
  "lighting.lightBar.prop.drop": "Hasta dónde llega el cono antes de desaparecer.",
  "lighting.lightBar.prop.intensity": "Un solo dial para toda la luminaria. Por encima de ~1.4 el cono se lee como un panel gris en vez de como luz.",
  "lighting.lightBar.note.paintOrder": "Renderizalo antes de lo que ilumina y sin z-index: la superficie opaca se come la mitad del cono que si no lavaría la interfaz.",
  "lighting.lightBar.demo.title": "Sobre una card",
  "lighting.lightBar.demo.desc": "El tubo entra hacia adentro de los bordes de la card: una luminaria tan ancha como lo que ilumina es un panel retroiluminado, no una lámpara.",
  "lighting.lightBar.demo.body": "La luz llega desde arriba y las esquinas quedan en sombra. Eso es lo que separa una card iluminada de una card con borde.",

  "lighting.spotlight.desc": "La misma lámpara con la luminaria fuera de cuadro: un cono de lados rectos que se abre hacia abajo sobre un titular. Es un conic-gradient, no un clip-path — un haz tiene bordes blandos y un polígono tiene el borde más duro que dibuja CSS.",
  "lighting.spotlight.prop.className": "Dónde entra el haz y qué tan largo es.",
  "lighting.spotlight.prop.intensity": "Un dial para todo el cono.",
  "lighting.spotlight.note.apex": "El vértice va fuera de pantalla o detrás de algo. Un haz que arranca en el aire es un degradado disfrazado de lámpara.",
  "lighting.spotlight.demo.title": "Sobre un titular",
  "lighting.spotlight.demo.desc": "Centrado sobre texto centrado. Un haz apuntado a un costado de una columna centrada es la única disposición que se lee como error.",
  "lighting.spotlight.demo.body": "Que el próximo mensaje ya tenga respuesta",

  "lighting.halo.desc": "El charco que un objeto iluminado deja debajo de sí. Degradado, no una caja con blur: la forma ya la dibuja exacto un radial-gradient y el blur costaría una pasada entera sobre el área.",
  "lighting.halo.prop.className": "Tamaño y posición del charco.",
  "lighting.halo.note.gradient": "Anclado al 50%, no arriba: es la luz alrededor del objeto, no la que le pasa por al lado. Esa es la diferencia entre una card sobre un piso iluminado y una card con sombra.",
  "lighting.halo.demo.title": "Debajo de una card",
  "lighting.halo.demo.body": "Apoyada sobre algo",

  "lighting.glowMark.desc": "Un ícono que es la fuente, no una superficie iluminada: el glifo apilado en tres radios de blur sobre un radial que es solo aire. Cuatro capas porque eso es un bloom — un drop-shadow es solo la más externa de las cuatro.",
  "lighting.glowMark.prop.icon": "El glifo. Cuanto más dice su silueta, más rinde el efecto.",
  "lighting.glowMark.prop.size": "Tamaño del ícono en píxeles.",
  "lighting.glowMark.prop.strokeWidth": "Grosor del trazo, igual que en HugeiconsIcon.",
  "lighting.glowMark.prop.intensity": "Escala las tres capas juntas.",
  "lighting.glowMark.note.silhouette": "Vale la pena en una marca cuya silueta dice algo — un rayo, una llave, un escudo — y no vale nada en un círculo: el bloom tiene la forma del objeto cerca y es redondo lejos, y eso es todo lo que aporta sobre una sombra.",
  "lighting.glowMark.demo.title": "En una placa, a tres intensidades",
  "lighting.glowMark.demo.desc": "La placa es la misma lp-plate de siempre. Lo único que cambia es que el ícono está encendido.",

  "lighting.lumen.desc": "Tipografía fresada, no iluminada: una rampa metálica vertical a través de las letras, con una copia borrosa de la misma palabra por detrás. Clara arriba y oscura en la base, que es hacia donde apunta todo lo demás de la página.",
  "lighting.lumen.prop.text": "La palabra de la que se dibuja el bloom. Obligatoria incluso cuando children renderiza otra cosa: el bloom es attr(data-text) y no puede leer descendientes.",
  "lighting.lumen.prop.children": "Por defecto, text. Se pasa aparte solo cuando otra pieza ya está renderizando la palabra — el modo luminous de DigitPop, que envuelve carácter por carácter.",
  "lighting.lumen.prop.className": "Tipografía y tamaño. La rampa no toca ninguno de los dos.",
  "lighting.lumen.note.figuresOnly": "Para cifras y casi nada más. Una rampa a través de un titular es un párrafo entero de cromo; a través de $249 es el número por el que alguien entró a la sección.",
  "lighting.lumen.note.perGlyph": "Va sobre el glifo, nunca alrededor de una caja que lo contiene. Un fondo recortado lo pinta el elemento que lo declara y lo enmascara su propio texto, así que cualquier descendiente que componga aparte — opacidad menor a 1, un filter, un will-change que nombre alguno — queda fuera de esa operación y desaparece. Una cifra animada se envuelve carácter por carácter.",
  "lighting.lumen.demo.title": "Cifras",

  "lighting.brand.desc": "Una marca a todo color, encendida en su propio color. Es el único tono que se permite el equipo de luces, y no lo inventa: los logos de canal ya son la excepción que hace esta página. Eran los únicos objetos brillantes de una página iluminada que no tiraban luz propia, y eso los dejaba como calcos pegados encima.",
  "lighting.brand.prop.colour": "El valor de marca del logo. Se pasa a mano: un SVG con tres gradientes no tiene un solo color y elegir cuál es una decisión editorial.",
  "lighting.brand.prop.intensity": "Un dial encima del del tema, multiplicando. Sirve para alejar una marca, no para apagarla: la fila de canales es el argumento de la sección y va en 1, los conectores del pie van en un tercio.",
  "lighting.brand.note.dropShadow": "drop-shadow, no una copia borrosa. Esos logos tienen gradientes direccionados por id y se renderizan una sola vez por documento justamente porque una segunda copia se repintaría con los defs de la primera. drop-shadow toma el canal alfa del glifo, así que la luz sale exactamente con la forma del logo.",
  "lighting.brand.demo.title": "Los tres canales",
  "lighting.brand.demo.desc": "El de Instagram es la magenta del medio de su rampa, no el naranja del final: es el color que cualquiera nombraría.",

  // AI Elements
  "ai.title": "Elementos de agente",
  "ai.desc": "components/ai-elements — lo que dibuja la conversación: esperas, razonamiento, herramientas y la navegación de las listas largas.",
  "ai.slidingTabs.name": "SlidingTabs",
  "ai.slidingTabs.desc": "Pestañas con la píldora activa deslizándose entre ellas con un layout compartido.",
  "ai.slidingTabs.tabs.desc": "{ id, label }.",
  "ai.slidingTabs.value.desc": "El id activo.",
  "ai.slidingTabs.trailing.desc": "Contenido a la derecha, dentro de la barra.",
  "ai.slidingTabs.title": "Tres pestañas",

  "ai.pagination.name": "Pagination",
  "ai.pagination.desc": "Anterior/siguiente, número de página y, si se pide, tamaño de página.",
  "ai.pagination.page.desc": "Página actual, base 1.",
  "ai.pagination.pageCount.desc": "Total de páginas.",
  "ai.pagination.pageSize.desc": "Muestra el selector de tamaño.",
  "ai.pagination.pageSizeOptions.desc": "Opciones del selector.",
  "ai.pagination.title": "Con tamaño de página",

  "ai.skeleton.name": "Skeleton",
  "ai.skeleton.desc": "Cruza el esqueleto con el contenido real en vez de intercambiarlos: el hueco no salta cuando llegan los datos. Los esqueletos de página enteros también viven aquí.",
  "ai.skeleton.skeleton.desc": "El marcador de posición.",
  "ai.skeleton.children.desc": "El contenido real.",
  "ai.skeleton.width.desc": "Cualquier medida CSS.",
  "ai.skeleton.size.desc": "Clase de Tailwind, no un número.",
  "ai.skeleton.title": "Carga y disolución",

  "ai.successCheck.name": "SuccessCheck",
  "ai.successCheck.desc": "El check dibujándose de un trazo cuando algo sale bien.",
  "ai.successCheck.active.desc": "Pasar de false a true dispara el trazo.",
  "ai.successCheck.title": "Dispáralo",

  "ai.notificationBadge.name": "NotificationBadge",
  "ai.notificationBadge.desc": "El contador rojo del sidebar. Con 0 o sin valor no se dibuja.",
  "ai.notificationBadge.count.desc": "0 o undefined esconden la pastilla.",
  "ai.notificationBadge.title": "Con y sin cuenta",

  "ai.reasoning.name": "Reasoning",
  "ai.reasoning.desc": "El bloque de «pensó durante N s». Se abre solo mientras llega el flujo y se cierra un segundo después de terminar, salvo que lo hayan abierto a mano.",
  "ai.reasoning.isStreaming.desc": "Mientras es true cuenta el tiempo y mantiene abierto.",
  "ai.reasoning.open.desc": "defaultOpen={false} impide la apertura automática.",
  "ai.reasoning.duration.desc": "Segundos, si ya los tienes medidos.",
  "ai.reasoning.children.desc": "Markdown: lo renderiza Streamdown.",
  "ai.reasoning.title": "Cerrado, ábrelo",

  "ai.licenseCard.name": "LicenseCreditCard",
  "ai.licenseCard.desc": "La licencia Enterprise dibujada como la tarjeta que es. Se arrastra, se inclina siguiendo al puntero y gira para mostrar los dos ids del dorso.",
  "ai.licenseCard.info.desc": "Lo que devuelve GET /api/license. null se dibuja igual que status \"missing\".",
  "ai.licenseCard.installationId.desc": "Va en el dorso, con su botón de copiar.",
  "ai.licenseCard.note1": "Necesita el provider de i18n: los rótulos salen de license.card.* y settings.license.*.",
  "ai.licenseCard.note2": "La cara no lleva estado, contador ni fechas largas: eso es la línea de texto debajo, en LicenseCard. Una licencia activa y una con el mantenimiento vencido se dibujan igual acá.",
  "ai.licenseCard.note3": "Con prefers-reduced-motion se apagan el arrastre y la inclinación; el giro pasa a ser instantáneo.",
  "ai.licenseCard.note4": "El giro tiene su propio botón debajo de la tarjeta: la tarjeta no es un role=button, porque el botón de copiar del dorso quedaría anidado dentro de otro botón.",
  "ai.licenseCard.active.title": "Licencia activa",
  "ai.licenseCard.active.desc2": "Arrastrala. Clic para ver el dorso.",
  "ai.licenseCard.missing.title": "Sin licencia",
  "ai.licenseCard.missing.desc2": "La instalación corre igual: la tarjeta está en blanco, no bloqueada.",

  // App Shell
  "app.title": "Piezas de la app",
  "app.desc": "app/_components — la tarjeta, los tiles y las gráficas del panel. Dependen de tipos de lib/types.ts, así que no se sacan a una librería sin arrastrar el dominio con ellas.",
  "app.card.name": "Card",
  "app.card.desc": "La superficie elevada del panel. `interactive` añade el hover que sube la sombra — solo para las tarjetas que llevan a algún sitio.",
  "app.card.interactive.desc": "Hover elevado y cursor de puntero.",
  "app.card.style.desc": "Para el retardo de entrada escalonado.",
  "app.card.title": "Estática e interactiva",

  "app.kpiCard.name": "KpiCard",
  "app.kpiCard.desc": "El tile de una métrica: cifra, etiqueta, delta y su propio dibujo. Los tres dibujos comparten los roles de color con las gráficas, porque «warning» tiene que significar lo mismo en un tile y en un chart.",
  "app.kpiCard.value.desc": "Ya formateada si lleva unidad.",
  "app.kpiCard.delta.desc": "{ direction, value, label?, tone? }. Ocupa la línea de sub.",
  "app.kpiCard.sub.desc": "Contexto en prosa, cuando no hay delta.",
  "app.kpiCard.visual.desc": "KpiBars, KpiSparkline, KpiSplit o cualquier nodo.",
  "app.kpiCard.ratio.desc": "0–1, recortado.",
  "app.kpiCard.points.desc": "Mínimo dos; se escala a su propio rango.",
  "app.kpiCard.parts.desc": "Una barra dividida por tono.",
  "app.kpiCard.note": "Una latencia que baja es direction: \"down\" con tone: \"positive\" — sin el tono, el tile colorea por dirección, que es lo correcto para un contador pero no para un tiempo.",
  "app.kpiCard.title": "Los tres dibujos",

  "app.chart.name": "Gráficas",
  "app.chart.desc": "Dos gráficas hechas a mano, sin librería: barras ordenadas y una serie temporal. Cada columna de la serie es un botón real, así que los valores no viven solo en el hover.",
  "app.chart.bars.desc": "{ key, label, formatted, value, tone? }.",
  "app.chart.limit.desc": "A partir de ahí una lista ordenada deja de leerse.",
  "app.chart.data.desc": "{ key, label, value }.",
  "app.chart.formatValue.desc": "El cuerpo del tooltip de cada cubo.",
  "app.chart.height.desc": "",
  "app.chart.markers.desc": "Claves de cubos a señalar con un punto — el día que se tocó algo. Lo que dice el marcador va en el tooltip del cubo.",
  "app.chart.tone.desc": "Respaldo para las filas que no traen el suyo.",
  "app.chart.emptyLabel.desc": "Qué se dice cuando no hay filas.",
  "app.chart.series.desc": "Pasa el ratón o tabula por las columnas.",

  "app.channelBadge.name": "ChannelBadge",
  "app.channelBadge.desc": "Por dónde entró un contacto. WhatsApp e Instagram son productos y conservan su nombre en todos los idiomas; «formulario» y «voz» son nombres comunes y sí se traducen.",
  "app.channelBadge.channel.desc": "Un valor fuera de la unión cae al icono de globo en vez de romper la página.",
  "app.channelBadge.title": "Los cinco canales",
  "app.channelBadge.icon.title": "Solo el icono",

  "app.prospectBadge.name": "ProspectBadge",
  "app.prospectBadge.desc": "Dónde quedó comercialmente una conversación. Es un StatusBadge con el mapeo etapa → variante ya hecho, y el motivo en el title porque una frase no cabe en una pastilla.",
  "app.prospectBadge.prospect.desc": "Sin valoración pinta «sin valorar» en vez de nada.",
  "app.prospectBadge.title": "Etapas",

  "app.pageContainer.name": "PageContainer",
  "app.pageContainer.desc": "El envoltorio de toda página dentro de AppShell: ancho máximo, padding, patrón de fondo y la animación de entrada, en un solo sitio.",
  "app.pageContainer.maxWidth.desc": "Clase de Tailwind. Ajustes usa max-w-xl.",
  "app.pageContainer.pattern.desc": "El patrón fijo detrás del contenido, al 30 %.",
  "app.pageContainer.title": "Los cuatro patrones",
  "app.pageContainer.desc2": "Aquí recortados en una caja; en una página real ocupan el viewport entero.",

  "app.misc.name": "Otras piezas de la app",
  "app.misc.desc": "Componentes que solo se leen dentro de su pantalla: piden datos, una sesión o un negocio seleccionado, así que un demo suelto aquí mentiría sobre lo que hacen. Se listan para que se sepa que existen.",
  "app.misc.title": "Dónde mirarlos",
  "app.misc.desc2": "Cada uno se ve en su pantalla: el chat en /agents/[id], el selector de negocio en la barra lateral, CredentialField en /settings.",

  // Pet (bloub)
  "pet.title": "Mascota",
  "pet.desc": "El avatar animado de la app, generado en vivo por el motor de bloub (lib/bloub): 16 expresiones × 8 formas × 12 colores, animación SMIL autónoma y modo oscuro embebido en cada SVG.",
  "pet.avatar.desc": "Una mascota por expresión, forma y color. El SVG se genera en vivo (~2 ms) y se anima solo: parpadeo y deriva en bucle sin librería. El color del cuerpo viaja en dos variables embebidas que siguen al tema de la página.",
  "pet.avatar.expression.desc": "Cara al reposo: la boca, los ojos y las cejas del estado. El cuerpo queda de bola al reposo y es la cara la que cuenta.",
  "pet.avatar.shape.desc": "Silueta del cuerpo. Solo se acepta en los estados baseBody; cambia la silueta, no la cara.",
  "pet.avatar.color.desc": "Tinta del cuerpo. Va en las variables embebidas --bot-ink/--bot-paper, no en atributos: el modo oscuro las relee y aclara las tintas muy oscuras.",
  "pet.avatar.size.desc": "Cota width/height del SVG. El dibujo escala, la animación no cambia.",
  "pet.avatar.ariaLabel.desc": "Puesto, el SVG es una imagen (role=img) para el lector de pantalla; sin él es decorativo.",
  "pet.note.theme": "El modo oscuro va EMBEBIDO en el propio SVG y con scope por instancia (#<id>-root): lee html.dark/html.light de <html> (más un fallback por prefers-color-scheme para el documento suelto). No se estila desde fuera — se cambia el tema de la página.",
  "pet.note.maskId": "Cada instancia montada necesita namespace PROPIO (máscara <id>, raíz <id>-root, gradientes <id>-ag…): los url(#...) resuelven a nivel documento y un id repetido pintaría a todas con los ojos o arcos de la primera. El componente lo saca de useId.",
  "pet.note.feed": "El feed de /runtime monta BloubLive (@/components/pet/bloub-live) con forma nuage y color+cara según estado: fallido rojo/enojado, completo verde/feliz, en espera gris/dormido, corriendo azul con la cara de quien escribe. Todo cambio MORFA en el motor.",
  "pet.expressions.title": "Las 16 expresiones",
  "pet.expressions.desc": "La cara es la única diferencia entre estados de un agente: el cuerpo queda de bola al reposo y son los ojos los que cuentan.",
  "pet.shapes.title": "Las 8 formas",
  "pet.shapes.desc": "Siluetas del personalizador de bloub, medidas sobre el mismo radio de 100. Cualquier expresión va sobre cualquier forma.",
  "pet.colors.title": "Los 12 colores",
  "pet.colors.desc": "La paleta del personalizador. En modo oscuro las tintas muy oscuras se aclaran solas dentro del SVG.",
  "pet.sizes.title": "Tamaños",
  "pet.sizes.desc": "El atributo width/height es una cota: el viewBox es fijo y la animación no depende del tamaño.",
  "pet.playground.title": "Playground",
  "pet.playground.desc": "Elige expresión, forma y color: el motor vivo MORFA (0,45 s) en lugar de cortar, como el customizador de bloub. Solo una instancia a 60 fps; las rejillas usan el SMIL estático.",
  "pet.morph.title": "Los 14 estados",
  "pet.morph.aria": "mascota {id}",
  "pet.morph.desc": "Los que SÍ transforman la silueta: la bola se hace huevo, hexágono, «!», estalla, orbita o sale disparada como cometa. `BLOUB_STATES` los enumera; cada SVG lleva su ciclo entero embebido.",
};

const en: Dictionary = {
  // Shell
  "shell.title": "Catalog",
  "shell.badge": "dev only",
  "shell.filterPlaceholder": "Filter…  /",
  "shell.filterLabel": "Filter components",
  "shell.clearFilter": "Clear filter",
  "shell.clearFilterLabel": "Clear filter",
  "shell.emptyMatch": "Nothing matches «{query}».",
  "shell.showing": "{shown} of {total}",
  "shell.total": "{total} components",
  "shell.indexLabel": "Component index",
  "shell.code": "Code",
  "shell.hide": "Hide",
  "shell.props": "API",
  "shell.exports": "Exports",
  "shell.copy": "Copy",
  "shell.copied": "Copied",
  "shell.required": "Required",

  // Foundations
  "foundations.title": "Foundations",
  "foundations.desc": "The tokens from app/globals.css. Everything else on this page is built with these: a component that invents its own gray is a component that steps outside the system.",
  "foundations.color.name": "Color",
  "foundations.color.desc": "Monochrome oklch scale, with destructive and billing as the only two accents. Each token has a light/dark pair; the .dark block redefines them, never the components.",
  "foundations.color.surfaces.title": "Surfaces & semantics",
  "foundations.color.surfaces.desc": "Toggle the theme top-right to see the dark pair.",
  "foundations.color.status.title": "Status colors",
  "foundations.color.status.desc": "The seven pairs consumed by StatusBadge. Pastel background, same-tone text.",
  "foundations.elevation.name": "Elevation & radius",
  "foundations.elevation.desc": "Depth is felt, not seen: short low-alpha shadows plus an inset highlight on top. Base radius is 12px and everything else derives from it.",
  "foundations.elevation.shadows.title": "Shadows",
  "foundations.elevation.radius.title": "Radii",
  "foundations.typography.name": "Typography",
  "foundations.typography.desc": "Saans for headings, Inter for everything else, Geist Mono for code. All three are variables served from /public/fonts except mono.",
  "foundations.typography.families.title": "Families",
  "foundations.typography.scale.title": "Type scale",

  // UI Controls
  "controls.title": "Controls",
  "controls.desc": "components/ui — buttons, fields, and chips. The most repeated layer in the app, so the one least worth reinventing on a new page.",
  "controls.button.name": "Button",
  "controls.button.desc": "Six variants and eight sizes on a single recipe: same radius, same typography, same transition. Depth is a hairline border plus an inner highlight on top and a short shadow below. Focus is an `outline`, not a `ring`, because `box-shadow` is already used for the surface.",
  "controls.button.variant.desc": "How much weight the action carries. default is the primary action on the screen.",
  "controls.button.size.desc": "Icon variants are square; the rest grow only in height and padding.",
  "controls.button.asChild.desc": "Renders the child instead of a <button> — for a <Link> that looks like a button.",
  "controls.button.disabled.desc": "Lowers contrast and cuts pointer-events, not just the cursor.",
  "controls.button.props.desc": "All native props pass through: type, onClick, form, aria-*.",
  "controls.button.note1": "default, destructive, secondary, and outline play a sound on press (data-cuelume-press). ghost and link do not: they're the close X and \"see more\", and sounding them silences the entire app.",
  "controls.button.note2": "The SVG inside sizes itself to 16px unless you pass a size-* class.",
  "controls.button.variants.title": "Variants",
  "controls.button.sizes.title": "Sizes",
  "controls.button.icons.title": "With icon and icon-only",
  "controls.button.icons.desc": "An icon-only button needs an aria-label: the SVG is hidden from screen readers.",
  "controls.button.states.title": "States",

  "controls.suggestionChip.name": "SuggestionChip",
  "controls.suggestionChip.desc": "The conversation starter pill: the empty chat state, both assistants, and the follow-up options for a turn. It's an outline Button with the chip surface on top, so radius, focus, and disabled come from the system.",
  "controls.suggestionChip.size.desc": "xs for options inside a turn.",
  "controls.suggestionChip.extra.desc": "Everything from Button: disabled, onClick, asChild.",
  "controls.suggestionChip.demos.title": "Sizes & disabled",

  "controls.toggleChip.name": "ToggleChip",
  "controls.toggleChip.desc": "The pill that's chosen or not: the brief's language, the template when creating an agent, the option filter for a form step. `aria-pressed` comes from `selected`, not the caller — the three manual copies it replaces didn't all set it.",
  "controls.toggleChip.selected.desc": "Sets the state and writes aria-pressed.",
  "controls.toggleChip.demos.title": "Single choice",
  "controls.toggleChip.demos.desc": "Press: only one stays selected.",

  "controls.badge.name": "Badge",
  "controls.badge.desc": "Label pill, not status pill — that's what StatusBadge is for. Monochrome except destructive, the only accent.",
  "controls.badge.variant.desc": "The label's visual weight.",
  "controls.badge.asChild.desc": "To render the pill as <a>; the [a&] hovers activate automatically.",
  "controls.badge.variants.title": "Variants",
  "controls.badge.icon.title": "With icon",
  "controls.badge.icon.desc": "The SVG sizes itself to 12px inside the pill.",

  "controls.statusBadge.name": "StatusBadge",
  "controls.statusBadge.desc": "The app's only status pill: one pastel per status, line icon, and label. The seven spec variants plus seven product-specific aliases that reuse the same colors.",
  "controls.statusBadge.status.desc": "pending · in-progress · submitted · in-review · success · failed · expired, plus connected · disconnected · active · paused · draft · error · warning.",
  "controls.statusBadge.label.desc": "Overrides the dictionary label. Only when a screen needs a different word.",
  "controls.statusBadge.title.desc": "Hover text for the detail that would make the pill illegibly wide.",
  "controls.statusBadge.note": "Translates via useT() against badge.<variant> keys, so it needs the root layout's I18nProvider.",
  "controls.statusBadge.all.title": "All variants",
  "controls.statusBadge.custom.title": "Custom label",

  "controls.input.name": "Input",
  "controls.input.desc": "The native <input> with the field recipe: sunken background, 1px border, and focus via `outline`. On focus the background rises to --card, signaling \"this is active\" without spending the shadow.",
  "controls.input.type.desc": "Native. file brings its own button style.",
  "controls.input.ariaInvalid.desc": "Paints the border destructive and adds the error shadow.",
  "controls.input.props.desc": "All native props pass through.",
  "controls.input.states.title": "States",

  "controls.textarea.name": "Textarea",
  "controls.textarea.desc": "Same recipe as Input, with field-sizing-content: grows with what's written instead of sitting in a fixed box with scroll.",
  "controls.textarea.props.desc": "Native. rows still works if you want to fix the height.",
  "controls.textarea.title": "Autogrow",
  "controls.textarea.desc2": "Type several lines: the box grows on its own.",

  "controls.switch.name": "Switch",
  "controls.switch.desc": "On/off toggle. The thumb path and double-bounce live in .t-toggle (globals.css); the component sets the box, colors, and accessible wiring.",
  "controls.switch.checked.desc": "Always controlled — no internal state.",
  "controls.switch.onCheckedChange.desc": "The new value, already inverted.",
  "controls.switch.label.desc": "Accessible name: the control has no text of its own.",
  "controls.switch.disabled.desc": "Drops to 40% and changes the cursor.",
  "controls.switch.note": "The off animation only arms after the first click (.is-init): otherwise every switch on the page shakes on hydration.",
  "controls.switch.states.title": "States",

  "controls.liquidSlider.name": "LiquidSlider",
  "controls.liquidSlider.desc": "A slider whose thumb is a droplet: it chases the pointer, stretches with speed, and leaves a trail. Below is a real invisible <input type=\"range\"> that keeps keyboard and screen readers working.",
  "controls.liquidSlider.value.desc": "Controlled.",
  "controls.liquidSlider.label.desc": "Accessible name: the track has no text.",
  "controls.liquidSlider.note": "A jump of more than 40px re-seeds the liquid surface so a click on the other end doesn't show the droplet crossing the track.",
  "controls.liquidSlider.title": "Drag it",

  "controls.buttonGroup.name": "ButtonGroup",
  "controls.buttonGroup.desc": "Stitches several buttons into a single block: removes interior radii and duplicate borders. Works with Button, Select, and fields.",
  "controls.buttonGroup.orientation.desc": "Vertical stacks and stitches top/bottom.",
  "controls.buttonGroup.horizontal.title": "Horizontal & vertical",
  "controls.buttonGroup.text.title": "With text & separator",

  "controls.inputGroup.name": "InputGroup",
  "controls.inputGroup.desc": "A field with things stuck to it: icon in front, button behind, help below. The focus ring belongs to the group, not the control — the group owns the radius.",
  "controls.inputGroup.align.desc": "Where the addon sticks. block-* stack and turn the group into a column.",
  "controls.inputGroup.size.desc": "The inner button is a ghost Button trimmed to fit the row.",
  "controls.inputGroup.icon.title": "Icon & button",
  "controls.inputGroup.help.title": "Help below",

  "controls.spinner.name": "Spinner",
  "controls.spinner.desc": "The Loading03 icon spinning, with role=\"status\" and accessible name pre-set.",
  "controls.spinner.size.desc": "In px.",
  "controls.spinner.className.desc": "For color: inherits currentColor by default.",
  "controls.spinner.title": "Sizes & color",

  "controls.separator.name": "Separator",
  "controls.separator.desc": "A 1px line in --border. Decorative by default, so it doesn't appear in the accessibility tree.",
  "controls.separator.orientation.desc": "Vertical needs a parent with height.",
  "controls.separator.decorative.desc": "When false it's announced as a real separator.",
  "controls.separator.title": "Horizontal & vertical",

  // UI Overlays
  "overlays.title": "Layers & menus",
  "overlays.desc": "Dialogs, menus, and banners. The surface is always --popover with --shadow-float; the enter animation lives in globals.css so a new menu doesn't have to reinvent it.",
  "overlays.dialog.name": "Dialog",
  "overlays.dialog.desc": "Modal panel for editing something. Radix handles focus trapping, scroll lock, and Escape; the wrapper adds the surface, the ✕, and the open cue.",
  "overlays.dialog.open.desc": "Controlled. Without them the Trigger manages itself.",
  "overlays.dialog.showClose.desc": "In DialogContent. Turn it off when the footer already has a Cancel.",
  "overlays.dialog.note1": "An edit dialog needs key={editing?.id ?? \"new\"} at the call site, or it reopens with the previous data.",
  "overlays.dialog.note2": "DialogTitle is required by Radix: if you don't want it visible, put it in sr-only.",
  "overlays.dialog.title": "Edit something",

  "overlays.alertDialog.name": "AlertDialog",
  "overlays.alertDialog.desc": "The Dialog for irreversible decisions. It doesn't close when clicking outside and always has exactly two exits.",
  "overlays.alertDialog.note": "For normal deletion the app uses components/confirm-dialog.tsx, which already wraps this with the text and destructive button set.",
  "overlays.alertDialog.title": "Confirm a deletion",

  "overlays.dropdownMenu.name": "DropdownMenu",
  "overlays.dropdownMenu.desc": "The three-dot menu. Includes checkbox, radio, and submenus.",
  "overlays.dropdownMenu.variant.desc": "destructive tints text and icon, and the hover.",
  "overlays.dropdownMenu.inset.desc": "Indents left to align with items that have a check.",
  "overlays.dropdownMenu.title": "Row actions",

  "overlays.contextMenu.name": "ContextMenu",
  "overlays.contextMenu.desc": "The same menu, opened with a right-click on an area.",
  "overlays.contextMenu.title": "Right-click here",

  "overlays.select.name": "Select",
  "overlays.select.desc": "Single-option dropdown. The trigger shares the field recipe with Input, so a Select and an Input in the same row align.",
  "overlays.select.size.desc": "h-9 and h-8 — same heights as Button.",
  "overlays.select.value.desc": "Controlled; otherwise defaultValue.",
  "overlays.select.title": "With groups",

  "overlays.command.name": "Command",
  "overlays.command.desc": "Filterable list on cmdk. Standalone is an inline search; inside CommandDialog it's the command palette (⌘K).",
  "overlays.command.note": "On mount, cmdk selects its first row and scrolls it into view. On a tall page that yanks the reader down: that's why the inline variant mounts on demand.",
  "overlays.command.dialog.title": "As palette",
  "overlays.command.dialog.desc": "The shape the app ships: CommandDialog over the same Command.",
  "overlays.command.inline.title": "Inline",
  "overlays.command.inline.desc": "Mount it and type to filter.",

  "overlays.tooltip.name": "Tooltip",
  "overlays.tooltip.desc": "Short label on hover. TooltipProvider is already mounted in the root layout, so no need to wrap again.",
  "overlays.tooltip.sideOffset.desc": "Distance from the trigger, in px.",
  "overlays.tooltip.note": "A tooltip is not an accessible name: an icon-only button also needs its aria-label.",
  "overlays.tooltip.title": "Four sides",

  "overlays.hoverCard.name": "HoverCard",
  "overlays.hoverCard.desc": "Like the tooltip, but with room for content: a contact card, a summary.",
  "overlays.hoverCard.title": "Card on hover",

  "overlays.collapsible.name": "Collapsible",
  "overlays.collapsible.desc": "Open and close a block. It's the basis of Reasoning and Tool.",
  "overlays.collapsible.title": "Show a detail",

  "overlays.errorBanner.name": "ErrorBanner",
  "overlays.errorBanner.desc": "The only way a screen says \"that didn't work\". Translates the error on render, not when saved, so changing language re-renders it in the new one. It sounds only when it appears, not when it was already there.",
  "overlays.errorBanner.error.desc": "What failed. Translated via uiErrorMessage.",
  "overlays.errorBanner.messageKey.desc": "Shorthand for error={{ messageKey }} for local failures.",
  "overlays.errorBanner.message.desc": "An already-final phrase. Last resort: not re-translated.",
  "overlays.errorBanner.detail.desc": "Technical context, small and below.",
  "overlays.errorBanner.onRetry.desc": "Adds the retry button.",
  "overlays.errorBanner.onDismiss.desc": "Adds the ✕.",
  "overlays.errorBanner.title": "With retry & dismiss",

  "overlays.orb.name": "Orb",
  "overlays.orb.desc": "The app's single entry point to thinking-orbs: the sphere that shows which verb the agent is performing. Resolves the theme on its own, freezes under prefers-reduced-motion, and pauses off-screen.",
  "overlays.orb.state.desc": "working · searching · solving · listening · connecting · weaving · composing · breathing · shaping.",
  "overlays.orb.size.desc": "20 goes inline with text; 64 is for an empty screen.",
  "overlays.orb.decorative.desc": "Hidden from screen readers: there's always a label next to it naming the state.",
  "overlays.orb.states.title": "The nine states",
  "overlays.orb.large.title": "Size 64",

  "overlays.beam.name": "Beam",
  "overlays.beam.desc": "The metallic halo around a control. Wraps the child in its own <div>, so positional stuff goes in `style`, not `className` — the package injects its CSS after Tailwind and wins by order.",
  "overlays.beam.size.desc": "pulse-outside is the default: it blooms outward instead of tracing the border.",
  "overlays.beam.color.desc": "Overrides the metal by theme. Normally left untouched.",
  "overlays.beam.strength.desc": "0–1. In buttons it's low so it's a tint, not a show.",
  "overlays.beam.active.desc": "Fades out instead of unmounting: the wrapper loads the layout.",
  "overlays.beam.borderRadius.desc": "Only if the child hides its own radius.",
  "overlays.beam.note": "Needs an opaque child with its own 1px border and room to overflow: any overflow:hidden above clips the halo.",
  "overlays.beam.title": "On a button",

  // Motion
  "motion.title": "Motion",
  "motion.desc": "components/motion — spring controls, entering text, and stateful buttons. Nothing here animates under prefers-reduced-motion, and hover effects turn off on their own on non-pointer devices.",
  "motion.checkbox.name": "Checkbox",
  "motion.checkbox.desc": "Box with the check drawing itself. The real <input> stays underneath, so label click and keyboard are native.",
  "motion.checkbox.checked.desc": "Controlled.",
  "motion.checkbox.indeterminate.desc": "Draws the dash for the partial state.",
  "motion.checkbox.label.desc": "Text to the right; also the click target.",
  "motion.checkbox.aria.desc": "Associates an external message, e.g. a form error.",
  "motion.checkbox.title": "Checked, partial, and locked",

  "motion.radio.name": "RadioGroup",
  "motion.radio.desc": "Single option from many, with the inner dot scaling on selection.",
  "motion.radio.value.desc": "Controlled or not.",
  "motion.radio.title": "Vertical",

  "motion.input.name": "Input (motion)",
  "motion.input.desc": "Field with floating label, side icons, and shake on failure. It's the one from the landing forms; inside the app the components/ui/input one rules.",
  "motion.input.label.desc": "Label that rises on focus.",
  "motion.input.onChange.desc": "onChange receives the value, not the event.",
  "motion.input.error.desc": "Truthy shakes and paints red; if it's a string, also shows it.",
  "motion.input.success.desc": "Draws the check on the right.",
  "motion.input.classNames.desc": "Escape hatches by part: root, label, field, input, errorMessage…",
  "motion.input.title": "Type something without @",

  "motion.actionSwap.name": "ActionSwapButton",
  "motion.actionSwap.desc": "A button whose label changes on press without the box moving: a hidden meter stores the longest state and sets the width.",
  "motion.actionSwap.items.desc": "{ id, label, icon?, ariaLabel? } per state.",
  "motion.actionSwap.value.desc": "The active id.",
  "motion.actionSwap.animation.desc": "cascade rolls letter by letter, left to right.",
  "motion.actionSwap.cycle.desc": "Each press advances to the next item and loops back.",
  "motion.actionSwap.iconOnly.desc": "Hides the text and leaves only the icon.",
  "motion.actionSwap.title": "Three animations",
  "motion.actionSwap.desc2": "Press each: blur fades, roll spins, cascade goes letter by letter.",

  "motion.themeToggle.name": "ThemeToggle",
  "motion.themeToggle.desc": "Changes the theme with a View Transition: the new scheme reveals from a point instead of flashing. It suspends the :root cross-fade while it lasts, which is what turned the sweep into mush.",
  "motion.themeToggle.variant.desc": "The shape of the sweep.",
  "motion.themeToggle.start.desc": "Where the reveal starts.",
  "motion.themeToggle.title": "The four variants",
  "motion.themeToggle.desc2": "Each one actually changes the theme — press twice to go back.",

  "motion.textReveal.name": "TextReveal",
  "motion.textReveal.desc": "Heading that enters by words or letters, with blur and spring. A single tokenizer for both modes, so they don't drift on what counts as a word.",
  "motion.textReveal.text.desc": "An array means lines: each enters behind the previous.",
  "motion.textReveal.as.desc": "h1…h6, span, label, strong, em.",
  "motion.textReveal.split.desc": "Granularity of the entrance.",
  "motion.textReveal.stagger.desc": "Seconds between unit and unit.",
  "motion.textReveal.delay.desc": "Delay before starting.",
  "motion.textReveal.blur.desc": "Starting blur, in px.",
  "motion.textReveal.yOffset.desc": "Where it rises from.",
  "motion.textReveal.view.desc": "Fires on entering the viewport, and only once.",
  "motion.textReveal.title": "By words and by letters",

  "motion.textShimmer.name": "TextShimmer",
  "motion.textShimmer.desc": "A glow running across the text — the signal that \"this is still happening\".",
  "motion.textShimmer.duration.desc": "Seconds per pass.",
  "motion.textShimmer.title": "Running",

  "motion.thinkingText.name": "ThinkingText",
  "motion.thinkingText.desc": "Cycles phrases without the box changing width: an invisible meter holds the longest one, so the surrounding button doesn't jump mid-phrase.",
  "motion.thinkingText.states.desc": "The phrases, in order.",
  "motion.thinkingText.hold.desc": "Milliseconds per phrase.",
  "motion.thinkingText.title": "Cycling",

  "motion.downloadAnimation.name": "DownloadAnimation",
  "motion.downloadAnimation.desc": "A file icon flies from the button toward the top-right corner (the browser's downloads area). Respects prefers-reduced-motion.",
  "motion.downloadAnimation.fileType.desc": "The animated file icon.",
  "motion.downloadAnimation.onDownload.desc": "Actual download logic.",
  "motion.downloadAnimation.title": "Three file types",
  "motion.downloadAnimation.desc2": "Press each button: the icon flies toward the top-right corner.",

  "motion.toast.name": "Toast",
  "motion.toast.desc": "The app's notification surface, mounted once in the root layout. Sound is decided here by status, not per call. An error toast doesn't auto-dismiss: 4.2s are enough for \"Saved\" but not to read what failed and decide what to do.",
  "motion.toast.status.desc": "Decides icon, color, and sound.",
  "motion.toast.action.desc": "A button inside the toast.",
  "motion.toast.duration.desc": "ms. 0 = until dismissed. Errors are already 0.",
  "motion.toast.title": "Launch them",

  // Lighting
  "lighting.title": "Lighting",
  "lighting.desc": "The landing's lighting rig. Six fixtures and one rule: the page has one lamp, hanging above it, and every component is that lamp seen from a different distance. None of them loops — a light that pulses is a notification, a light that holds still is a room. All of them read tokens declared on .lp, so outside the marketing wrapper they paint nothing.",

  "lighting.note.lpOnly": "Inside .lp only. The --lp-beam-*, --lp-halo-ink and --lp-lumen-* tokens live on the marketing wrapper; outside it every colour resolves to nothing and the fixture draws an empty box.",

  "lighting.lightBar.desc": "A tube light hung above something: the filament, the bloom around it, and the cone it throws down. This is the piece that goes over every screenshot on the page.",
  "lighting.lightBar.prop.className": "Where it hangs and how wide it is. Composition is the caller's decision, not the component's.",
  "lighting.lightBar.prop.drop": "How far the cone reaches before it is gone.",
  "lighting.lightBar.prop.intensity": "One dial for the whole fixture. Above ~1.4 the cone reads as a grey panel rather than as light.",
  "lighting.lightBar.note.paintOrder": "Render it before the thing it lights and with no z-index: the opaque surface takes the half of the cone that would otherwise wash across the interface.",
  "lighting.lightBar.demo.title": "Over a card",
  "lighting.lightBar.demo.desc": "The tube is inset from the card's sides — a fixture as wide as what it lights is a backlit panel, not a lamp.",
  "lighting.lightBar.demo.body": "The light arrives from above and the corners stay dark. That is what separates a lit card from a card with a border.",

  "lighting.spotlight.desc": "The same lamp with the fixture out of frame: a straight-sided cone opening downward over a headline. A conic gradient, not a clip-path — a beam has soft edges and a polygon has the hardest edge CSS can draw.",
  "lighting.spotlight.prop.className": "Where the beam enters and how far it carries.",
  "lighting.spotlight.prop.intensity": "One dial for the whole cone.",
  "lighting.spotlight.note.apex": "The apex belongs off screen or behind something. A beam that starts in mid-air is a gradient in a lamp's costume.",
  "lighting.spotlight.demo.title": "Over a headline",
  "lighting.spotlight.demo.desc": "Centred over centred text. A beam aimed off to one side of a centred column is the one arrangement that reads as a mistake.",
  "lighting.spotlight.demo.body": "Let the next message already have an answer",

  "lighting.halo.desc": "The pool a lit object leaves under itself. A gradient, not a blurred box: a radial gradient already draws the shape exactly, and the blur would cost a full pass over the area.",
  "lighting.halo.prop.className": "The pool's size and position.",
  "lighting.halo.note.gradient": "Anchored at 50%, not at the top: it is the light around the object rather than the light falling past it. That is the difference between a card on a lit floor and a card with a shadow.",
  "lighting.halo.demo.title": "Under a card",
  "lighting.halo.demo.body": "Standing on something",

  "lighting.glowMark.desc": "An icon that is the source rather than a lit surface: the glyph stacked at three blur radii over a radial that is only air. Four layers because that is what a bloom is — a drop-shadow is the outermost of the four on its own.",
  "lighting.glowMark.prop.icon": "The glyph. The more its silhouette says, the more the effect earns.",
  "lighting.glowMark.prop.size": "Icon size in pixels.",
  "lighting.glowMark.prop.strokeWidth": "Stroke weight, same as HugeiconsIcon.",
  "lighting.glowMark.prop.intensity": "Scales all three layers together.",
  "lighting.glowMark.note.silhouette": "Worth it on a mark whose silhouette says something — a bolt, a key, a shield — and worth nothing on a circle: the bloom is glyph-shaped close in and round further out, and that is all it adds over a shadow.",
  "lighting.glowMark.demo.title": "On a plate, at three intensities",
  "lighting.glowMark.demo.desc": "The plate is the same lp-plate as everywhere else. The only thing that changed is that the icon is on.",

  "lighting.lumen.desc": "Type that has been milled rather than lit: a vertical metallic ramp through the letterforms, with a blurred copy of the same word behind them. Bright at the cap line and dark at the baseline, which is where everything else on the page points.",
  "lighting.lumen.prop.text": "The word the bloom is drawn from. Required even when children renders something else: the bloom is attr(data-text) and cannot read descendants.",
  "lighting.lumen.prop.children": "Defaults to text. Passed separately only when another component is already rendering the word — DigitPop's luminous mode, which wraps one character at a time.",
  "lighting.lumen.prop.className": "Typeface and size. The ramp touches neither.",
  "lighting.lumen.note.figuresOnly": "For figures and almost nothing else. A ramp through a headline is a whole paragraph of chrome; a ramp through $249 is the number somebody came to the section for.",
  "lighting.lumen.note.perGlyph": "It goes on the glyph, never around a box containing one. A clipped background is painted by the element that declares it and masked by its own text, so any descendant that composites separately — an opacity below 1, a filter, a will-change naming either — falls outside that operation and disappears. An animated figure is wrapped one character at a time.",
  "lighting.lumen.demo.title": "Figures",

  "lighting.brand.desc": "A full-colour mark, lit in its own colour. It is the one hue the rig allows, and it does not invent it: the channel logos are already the exception this page makes. They were the only bright objects on a lit page throwing no light of their own, which left them reading as stickers.",
  "lighting.brand.prop.colour": "The mark's brand value, passed by hand: an SVG with three gradients has no single colour, and picking one is an editorial decision.",
  "lighting.brand.prop.intensity": "A dial on top of the theme's, multiplying. It puts a mark further away rather than turning it down: the channel row is the section's argument and runs at 1, the connector footnote at a third.",
  "lighting.brand.note.dropShadow": "drop-shadow, not a blurred copy. Those logos carry gradients addressed by id and are rendered once per document precisely because a second copy would repaint with the first one's defs. drop-shadow takes the glyph's own alpha, so the light comes out exactly the shape of the logo.",
  "lighting.brand.demo.title": "The three channels",
  "lighting.brand.demo.desc": "Instagram's is the magenta from the middle of its ramp, not the orange at the end: it is the colour anybody would name.",

  // AI Elements
  "ai.title": "Agent elements",
  "ai.desc": "components/ai-elements — what draws the conversation: waits, reasoning, tools, and long-list navigation.",
  "ai.slidingTabs.name": "SlidingTabs",
  "ai.slidingTabs.desc": "Tabs with the active pill sliding between them in a shared layout.",
  "ai.slidingTabs.tabs.desc": "{ id, label }.",
  "ai.slidingTabs.value.desc": "The active id.",
  "ai.slidingTabs.trailing.desc": "Content on the right, inside the bar.",
  "ai.slidingTabs.title": "Three tabs",

  "ai.pagination.name": "Pagination",
  "ai.pagination.desc": "Previous/next, page number, and optionally page size.",
  "ai.pagination.page.desc": "Current page, base 1.",
  "ai.pagination.pageCount.desc": "Total pages.",
  "ai.pagination.pageSize.desc": "Shows the size selector.",
  "ai.pagination.pageSizeOptions.desc": "Selector options.",
  "ai.pagination.title": "With page size",

  "ai.skeleton.name": "Skeleton",
  "ai.skeleton.desc": "Cross-fades the skeleton with real content instead of swapping them: the slot doesn't jump when data arrives. Full-page skeletons live here too.",
  "ai.skeleton.skeleton.desc": "The placeholder.",
  "ai.skeleton.children.desc": "The real content.",
  "ai.skeleton.width.desc": "Any CSS measure.",
  "ai.skeleton.size.desc": "Tailwind class, not a number.",
  "ai.skeleton.title": "Loading & dissolve",

  "ai.successCheck.name": "SuccessCheck",
  "ai.successCheck.desc": "The check drawing itself in one stroke when something goes right.",
  "ai.successCheck.active.desc": "Going from false to true triggers the stroke.",
  "ai.successCheck.title": "Trigger it",

  "ai.notificationBadge.name": "NotificationBadge",
  "ai.notificationBadge.desc": "The red counter in the sidebar. With 0 or no value it doesn't draw.",
  "ai.notificationBadge.count.desc": "0 or undefined hide the pill.",
  "ai.notificationBadge.title": "With and without count",

  "ai.reasoning.name": "Reasoning",
  "ai.reasoning.desc": "The \"thought for N s\" block. Opens automatically while the stream arrives and closes a second after it ends, unless opened manually.",
  "ai.reasoning.isStreaming.desc": "While true it counts time and stays open.",
  "ai.reasoning.open.desc": "defaultOpen={false} prevents auto-open.",
  "ai.reasoning.duration.desc": "Seconds, if you already have them measured.",
  "ai.reasoning.children.desc": "Markdown: rendered by Streamdown.",
  "ai.reasoning.title": "Closed, open it",

  "ai.licenseCard.name": "LicenseCreditCard",
  "ai.licenseCard.desc": "The Enterprise license drawn as the card it is. It's draggable, tilts following the pointer, and flips to show both IDs on the back.",
  "ai.licenseCard.info.desc": "What GET /api/license returns. null renders the same as status \"missing\".",
  "ai.licenseCard.installationId.desc": "Goes on the back, with its copy button.",
  "ai.licenseCard.note1": "Needs the i18n provider: labels come from license.card.* and settings.license.*.",
  "ai.licenseCard.note2": "The face carries no state, counter, or long dates: that's the text line below, in LicenseCard. An active license and one with expired maintenance render identically here.",
  "ai.licenseCard.note3": "Under prefers-reduced-motion, dragging and tilting turn off; flipping becomes instant.",
  "ai.licenseCard.note4": "The flip has its own button below the card: the card isn't role=button, because the back's copy button would be nested inside another button.",
  "ai.licenseCard.active.title": "Active license",
  "ai.licenseCard.active.desc2": "Drag it. Click to see the back.",
  "ai.licenseCard.missing.title": "No license",
  "ai.licenseCard.missing.desc2": "The installation runs the same: the card is blank, not blocked.",

  // App Shell
  "app.title": "App pieces",
  "app.desc": "app/_components — the dashboard card, metric tiles, and charts. They depend on types from lib/types.ts, so they can't be extracted to a library without dragging the domain along.",
  "app.card.name": "Card",
  "app.card.desc": "The elevated dashboard surface. `interactive` adds the hover that raises the shadow — only for cards that lead somewhere.",
  "app.card.interactive.desc": "Hover elevation and pointer cursor.",
  "app.card.style.desc": "For staggered entrance delay.",
  "app.card.title": "Static & interactive",

  "app.kpiCard.name": "KpiCard",
  "app.kpiCard.desc": "A metric tile: number, label, delta, and its own drawing. The three drawings share color roles with the charts, because \"warning\" has to mean the same thing in a tile and a chart.",
  "app.kpiCard.value.desc": "Already formatted if it carries a unit.",
  "app.kpiCard.delta.desc": "{ direction, value, label?, tone? }. Occupies the sub line.",
  "app.kpiCard.sub.desc": "Prose context when there's no delta.",
  "app.kpiCard.visual.desc": "KpiBars, KpiSparkline, KpiSplit, or any node.",
  "app.kpiCard.ratio.desc": "0–1, clamped.",
  "app.kpiCard.points.desc": "Minimum two; scales to its own range.",
  "app.kpiCard.parts.desc": "A bar divided by tone.",
  "app.kpiCard.note": "A latency going down is direction: \"down\" with tone: \"positive\" — without the tone, the tile colors by direction, which is right for a counter but not for a time.",
  "app.kpiCard.title": "The three drawings",

  "app.chart.name": "Charts",
  "app.chart.desc": "Two hand-built charts, no library: ranked bars and a time series. Each column in the series is a real button, so values don't live only in the hover.",
  "app.chart.bars.desc": "{ key, label, formatted, value, tone? }.",
  "app.chart.limit.desc": "Past that a ranked list stops being readable.",
  "app.chart.data.desc": "{ key, label, value }.",
  "app.chart.formatValue.desc": "The body of each column's tooltip.",
  "app.chart.height.desc": "",
  "app.chart.markers.desc": "Column keys to mark with a dot — the day something was touched. What the marker says goes in the column's tooltip.",
  "app.chart.tone.desc": "Fallback for rows that don't bring their own.",
  "app.chart.emptyLabel.desc": "What's said when there are no rows.",
  "app.chart.series.desc": "Hover or tab through the columns.",

  "app.channelBadge.name": "ChannelBadge",
  "app.channelBadge.desc": "Where a contact came in. WhatsApp and Instagram are products and keep their names in all languages; \"form\" and \"voice\" are common words and do translate.",
  "app.channelBadge.channel.desc": "A value outside the union falls back to the globe icon instead of breaking the page.",
  "app.channelBadge.title": "The five channels",
  "app.channelBadge.icon.title": "Icon only",

  "app.prospectBadge.name": "ProspectBadge",
  "app.prospectBadge.desc": "Where a conversation stands commercially. It's a StatusBadge with the stage-to-variant mapping already done, and the reason in the title because a sentence doesn't fit in a pill.",
  "app.prospectBadge.prospect.desc": "Without assessment it paints \"unassessed\" instead of nothing.",
  "app.prospectBadge.title": "Stages",

  "app.pageContainer.name": "PageContainer",
  "app.pageContainer.desc": "The wrapper for every page inside AppShell: max width, padding, background pattern, and entrance animation, in one place.",
  "app.pageContainer.maxWidth.desc": "Tailwind class. Settings uses max-w-xl.",
  "app.pageContainer.pattern.desc": "The fixed pattern behind the content, at 30%.",
  "app.pageContainer.title": "The four patterns",
  "app.pageContainer.desc2": "Cropped inside a box here; on a real page they fill the viewport.",

  "app.misc.name": "Other app pieces",
  "app.misc.desc": "Components only seen inside their own screen: they need data, a session, or a selected business, so a standalone demo here would lie about what they do. Listed so you know they exist.",
  "app.misc.title": "Where to find them",
  "app.misc.desc2": "Each one appears on its own screen: chat in /agents/[id], business switcher in the sidebar, CredentialField in /settings.",

  // Pet (bloub)
  "pet.title": "Pet",
  "pet.desc": "The app's animated avatar, generated live by the ported bloub engine (lib/bloub): 16 expressions × 8 shapes × 12 colors, self-contained SMIL animation and embedded dark mode in every SVG.",
  "pet.avatar.desc": "One pet per expression, shape and color. The SVG is generated live (~2 ms) and animates itself: blink and drift loop without a library. Body color travels in two embedded variables that follow the page theme.",
  "pet.avatar.expression.desc": "Resting face: mouth, eyes and eyebrows of the state. The body stays a resting ball — the face does the talking.",
  "pet.avatar.shape.desc": "Body silhouette. Only accepted by baseBody states; changes the outline, not the face.",
  "pet.avatar.color.desc": "Body ink. It goes into the embedded --bot-ink/--bot-paper variables, not attributes: dark mode re-reads them and lightens very dark inks.",
  "pet.avatar.size.desc": "The SVG's width/height. The drawing scales; the animation doesn't change.",
  "pet.avatar.ariaLabel.desc": "When set, the SVG is an image (role=img) for screen readers; without it, decorative.",
  "pet.note.theme": "Dark mode is EMBEDDED per instance (#<id>-root scope): it reads html.dark/html.light on <html> (plus a prefers-color-scheme fallback for the bare document). You don't style it from outside — you switch the page theme.",
  "pet.note.maskId": "Every mounted instance needs its OWN namespace (mask <id>, root <id>-root, gradients <id>-ag…): url(#...) resolves document-wide, and a repeated id would paint them all with the first one's eyes or arcs. The component derives it from useId.",
  "pet.note.feed": "The /runtime feed mounts BloubLive (@/components/pet/bloub-live) with nuage shape and status-driven color+face: failed red/angry, completed green/happy, queued gray/sleepy, running blue wearing the writer's face. Every change MORPHS in the engine.",
  "pet.expressions.title": "The 16 expressions",
  "pet.expressions.desc": "The face is the only difference between agent states: the body stays a resting ball and the eyes do the talking.",
  "pet.shapes.title": "The 8 shapes",
  "pet.shapes.desc": "Silhouettes from bloub's customizer, measured over the same 100 radius. Any expression works over any shape.",
  "pet.colors.title": "The 12 colors",
  "pet.colors.desc": "The customizer palette. In dark mode, very dark inks lighten themselves inside the SVG.",
  "pet.sizes.title": "Sizes",
  "pet.sizes.desc": "The width/height attribute is a bound: the viewBox is fixed and the animation doesn't depend on size.",
  "pet.playground.title": "Playground",
  "pet.playground.desc": "Pick expression, shape and color: the live engine MORPHS (0.45 s) instead of cutting, like bloub's customizer. A single 60 fps instance; the grids use the static SMIL.",
  "pet.morph.title": "The 14 states",
  "pet.morph.aria": "pet {id}",
  "pet.morph.desc": "The ones that DO morph the silhouette: the ball becomes an egg, a hexagon, a \"!\", bursts, orbits or shoots off as a comet. `BLOUB_STATES` lists them; each SVG carries its whole cycle embedded.",
};

// ── Resolution ──────────────────────────────────────────────────────

const dictionaries: Record<CatalogLocale, Dictionary> = { es, en };

let currentLocale: CatalogLocale = "es";

/** Resolve a catalog translation key. Can be called outside React (registry files). */
export function ct(key: string, params?: Record<string, string | number>): string {
  const dict = dictionaries[currentLocale] ?? dictionaries.es;
  let result = dict[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      result = result.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return result;
}

// ── Provider ────────────────────────────────────────────────────────

interface CatalogI18nContextValue {
  locale: CatalogLocale;
  setLocale: (locale: CatalogLocale) => void;
  ct: (key: string, params?: Record<string, string | number>) => string;
}

const CatalogI18nContext = createContext<CatalogI18nContextValue | undefined>(undefined);

const CATALOG_LOCALE_KEY = "senka-catalog-locale";

function getInitialLocale(): CatalogLocale {
  return "es";
}

export function CatalogI18nProvider({ children }: { readonly children: ReactNode }) {
  const [locale, setLocaleState] = useState<CatalogLocale>(getInitialLocale);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CATALOG_LOCALE_KEY);
      if (stored === "en" || stored === "es") {
        if (stored !== "es") {
          currentLocale = stored;
          setLocaleState(stored);
        }
      }
    } catch {}
  }, []);

  // `currentLocale` is kept in step by `getInitialLocale` and by `setLocale`
  // below, not by an assignment in the render body: a render React throws
  // away must not leave the module-level cache pointing at a locale that was
  // never committed.

  const setLocale = useCallback((next: CatalogLocale) => {
    setLocaleState(next);
    currentLocale = next;
    try {
      localStorage.setItem(CATALOG_LOCALE_KEY, next);
    } catch {}
  }, []);

  const value = useMemo(() => ({ locale, setLocale, ct }), [locale, setLocale]);

  return <CatalogI18nContext.Provider value={value}>{children}</CatalogI18nContext.Provider>;
}

export function useCatalogT() {
  const ctx = useContext(CatalogI18nContext);
  if (!ctx) throw new Error("useCatalogT must be used within CatalogI18nProvider");
  return ctx;
}
