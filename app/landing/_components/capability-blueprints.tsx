"use client";

import {
  AiVoiceIcon,
  BotIcon,
  Calendar03Icon,
  Call02Icon,
  Chat01Icon,
  CheckmarkCircle02Icon,
  CustomerSupportIcon,
  File02Icon,
  GoogleDriveIcon,
  Link01Icon,
  Megaphone01Icon,
  Note01Icon,
  PauseIcon,
  Pdf01Icon,
  Search01Icon,
  UserAdd01Icon,
  WebhookIcon,
} from "@hugeicons/core-free-icons";
import {
  Blueprint,
  blueprintStyles as styles,
  Callout,
  Glyph,
  Node,
  onPlate,
  Plane,
  plateReach,
  Slab,
} from "./blueprint";

/*
 * A guide that ends on something printed ends at its edge, never its centre:
 * the node and the dashes would sit on top of the glyphs. Each end below is
 * the point where the guide's diagonal crosses the thing's edge, which keeps
 * the guide vertical and the type clear.
 */

// ── 01 · Tu propio conocimiento ─────────────────────────────────────

/**
 * The answer, exploded into what it is made of.
 *
 * Three slabs, bottom to top: the documents you loaded, the index the agent
 * searches, and the reply. One dashed guide runs straight up through all three
 * — from the source file, through the passage that matched, to the citation in
 * the answer — which is the claim of the card: nothing in the reply that is not
 * in a document underneath it.
 *
 * The guide is vertical because the three points share `x + y` on their plates;
 * change one and move the others with it.
 */
export function KnowledgeBlueprint() {
  const cx = 180;
  const size = 88;
  const reach = plateReach(size);
  const levels = { answer: 56, index: 128, docs: 200 } as const;

  // All on `x + y = -4.5`: the source sheet's right edge (clear of its icon),
  // the matched passage, and the citation's lower edge (clear of its "[1]").
  const source = onPlate(cx, levels.docs, -14, 9.5);
  const passage = onPlate(cx, levels.index, -15, 10.5);
  const citation = onPlate(cx, levels.answer, -28, 23.5);

  const sheets = [
    { icon: Pdf01Icon, x: -34 },
    { icon: File02Icon, x: -10 },
    { icon: GoogleDriveIcon, x: 14 },
  ];

  return (
    <Blueprint>
      {/* Corner guides first, so each slab covers the stretch behind it. */}
      <path
        className={styles.guide}
        d={`M${cx - reach} ${levels.answer}V${levels.docs}M${cx + reach} ${levels.answer}V${levels.docs}`}
      />

      <Slab cx={cx} cy={levels.docs} size={size}>
        {sheets.map((sheet) => (
          <g key={sheet.x}>
            {/* A chamfered corner rather than a folded, rounded one. */}
            <path
              className={styles.ink}
              d={`M${sheet.x} 6.5H${sheet.x + 14}L${sheet.x + 20} 12.5V32.5H${sheet.x}Z`}
            />
            <Glyph icon={sheet.icon} size={13} x={sheet.x + 3.5} y={13} />
          </g>
        ))}
        <text className={styles.stamp} x={-34} y={40}>
          [1]
        </text>
      </Slab>

      <Slab cx={cx} cy={levels.index} size={size}>
        <rect className={styles.ink} height={13} width={72} x={-36} y={-36} />
        <Glyph icon={Search01Icon} size={9} x={-34} y={-34} />
        <text className={styles.stamp} x={-22} y={-27.5}>
          envío
        </text>
        {Array.from({ length: 20 }, (_, cell) => {
          const column = cell % 5;
          const row = Math.floor(cell / 5);
          const matched = column === 1 && row === 2;
          return (
            <rect
              className={matched ? styles.solid : styles.faint}
              height={9}
              key={cell}
              width={12}
              x={-36 + column * 15}
              y={-18 + row * 12}
            />
          );
        })}
      </Slab>

      <Slab cx={cx} cy={levels.answer} size={size}>
        <Glyph icon={Chat01Icon} size={12} x={-37} y={-39} />
        <text className={styles.stamp} x={-22} y={-30.5}>
          agente
        </text>
        <rect className={styles.ink} height={28} width={72} x={-36} y={-20} />
        <path className={styles.faint} d="M-31 -12H25M-31 -5H18M-31 2H6" />
        <rect className={styles.solid} height={10} width={26} x={-36} y={13.5} />
        <text className={styles.knock} x={-32} y={20.8}>
          [1]
        </text>
        <path className={styles.faint} d="M-6 18.5H30" />
      </Slab>

      {/* The citation's line of descent, drawn over the slabs it passes. */}
      <path className={styles.guide} d={`M${source[0]} ${source[1]}V${citation[1]}`} />
      <Node x={source[0]} y={source[1]} />
      <Node x={passage[0]} y={passage[1]} />
      <Node x={citation[0]} y={citation[1]} />

      <Callout label="RESPUESTA" side="left" tip={124} x={8} y={62} />
      <Callout label="TUS DOCUMENTOS" side="left" tip={128} x={8} y={212} />
      <Callout label="ÍNDICE" side="right" tip={240} x={352} y={128} />
      <Callout label="CITA [1]" side="right" tip={194} x={352} y={77} />
    </Blueprint>
  );
}

// ── 02 · Pasar a una persona ────────────────────────────────────────

/**
 * The conversation changing hands, with the note it travels with.
 *
 * Two slabs on the same floor — the agent, its replies paused, and the person
 * on the team — and between them, lifted above both, the note the contact is
 * left with. The route is an elbow: up out of the agent, through the note, down
 * into the person. Nothing reaches the person except by way of the note, which
 * is the whole point of handing off with context rather than just stopping.
 */
export function HandoffBlueprint() {
  const floor = 150;
  const agent = 112;
  const person = 248;
  const slab = 70;
  const note = { cx: 180, cy: 64, size: 60 } as const;
  const noteReach = plateReach(note.size);
  // Where the route leaves the agent and lands on the person, on each plate.
  const lift = floor - 22;

  return (
    <Blueprint>
      <Slab cx={agent} cy={floor} size={slab}>
        <Glyph icon={BotIcon} size={13} x={-30} y={-30} />
        <text className={styles.stamp} x={-14} y={-21}>
          agente
        </text>
        <path className={styles.faint} d="M-30 -6H22M-30 2H12M-30 10H18" />
        <Glyph icon={PauseIcon} size={11} x={-30} y={18} />
        <text className={styles.stamp} x={-16} y={26}>
          en pausa
        </text>
      </Slab>

      <Slab cx={person} cy={floor} size={slab}>
        <Glyph icon={CustomerSupportIcon} size={24} x={-14} y={-18} />
        <text className={styles.stamp} x={-12.5} y={20}>
          persona
        </text>
      </Slab>

      <Slab cx={note.cx} cy={note.cy} size={note.size}>
        <rect className={styles.solid} height={10} width={52} x={-26} y={-20} />
        <text className={styles.knock} x={-23.4} y={-12.9}>
          ESPERA HUMANO
        </text>
        <Glyph icon={Note01Icon} size={11} x={-26} y={-5} />
        <path className={styles.faint} d="M-11 -1H24M-11 6H16M-26 15H20" />
      </Slab>

      {/* The route, drawn last so it reads over the plates it leaves and
          reaches: up from the agent, into the note, down into the person. */}
      <path
        className={styles.guide}
        d={`M${agent} ${lift}V${note.cy}H${note.cx - noteReach}M${note.cx + noteReach} ${note.cy}H${person}V${lift}`}
      />
      <path className={styles.ink} d={`M${person - 3} ${lift - 5}L${person} ${lift}L${person + 3} ${lift - 5}`} />
      <Node x={agent} y={lift} />

      <Callout label="CON CONTEXTO" side="left" tip={174} x={8} y={40} />
      <Callout label="ESPERA HUMANO" side="right" tip={197} x={352} y={46} />
      <Callout label="AGENTE" side="left" tip={96} x={8} y={170} />
      <Callout label="PERSONA" side="right" tip={266} x={352} y={170} />
    </Blueprint>
  );
}

// ── 03 · Agenda y turnos ────────────────────────────────────────────

/** Monday to Sunday, the week's column heads. */
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"] as const;

/** Taken slots in the drawn week, as `column-row`. The booked one is not here. */
const BUSY = new Set(["0-0", "1-0", "4-0", "1-1", "2-1", "5-1", "0-2", "2-2", "5-2", "3-3", "5-3", "6-3"]);

/**
 * The week the agent reads, and the conversation it books from.
 *
 * Bottom slab: your Google Calendar, taken slots hatched, free ones empty.
 * Top slab: the conversation, a question and an answer, and the booking it
 * ends in. The guide drops from the booking straight onto the one slot it
 * took — Thursday — so the card says both halves of the sentence: it checks
 * the calendar, and it books inside the chat.
 *
 * The slot and the booking share `x + y = 6` on their plates; that is what
 * keeps the guide vertical.
 */
export function CalendarBlueprint() {
  const cx = 180;
  const size = 100;
  const reach = plateReach(size);
  const levels = { chat: 80, week: 180 } as const;

  // Thursday's slot, third row, and the booking tag's lower edge — clear of
  // the time printed on it.
  const slot = onPlate(cx, levels.week, 0, 6);
  const booking = onPlate(cx, levels.chat, -22, 28);

  return (
    <Blueprint>
      <path
        className={styles.guide}
        d={`M${cx - reach} ${levels.chat}V${levels.week}M${cx + reach} ${levels.chat}V${levels.week}`}
      />

      <Slab cx={cx} cy={levels.week} size={size}>
        <Glyph icon={Calendar03Icon} size={11} x={-44} y={-45} />
        <text className={styles.stamp} x={-30} y={-37}>
          google calendar
        </text>
        {WEEKDAYS.map((day, column) => (
          <text
            className={styles.stamp}
            // Days repeat a letter, so the column is the identity.
            key={column}
            textAnchor="middle"
            x={-39 + column * 13}
            y={-24}
          >
            {day}
          </text>
        ))}
        {Array.from({ length: 28 }, (_, cell) => {
          const column = cell % 7;
          const row = Math.floor(cell / 7);
          const x = -44 + column * 13;
          const y = -20 + row * 11;
          const booked = column === 3 && row === 2;
          const busy = BUSY.has(`${column}-${row}`);
          return (
            <g key={cell}>
              <rect className={booked ? styles.solid : styles.faint} height={8} width={10} x={x} y={y} />
              {busy ? <path className={styles.faint} d={`M${x} ${y + 8}L${x + 10} ${y}`} /> : null}
            </g>
          );
        })}
      </Slab>

      <Slab cx={cx} cy={levels.chat} size={size}>
        <Glyph icon={Chat01Icon} size={11} x={-44} y={-45} />
        <text className={styles.stamp} x={-30} y={-37}>
          conversación
        </text>
        <rect className={styles.ink} height={14} width={58} x={-44} y={-28} />
        <path className={styles.faint} d="M-39 -23H6M-39 -18H-8" />
        <rect className={styles.ink} height={14} width={58} x={-14} y={-8} />
        <path className={styles.faint} d="M-9 -3H36M-9 2H20" />
        <rect className={styles.solid} height={12} width={56} x={-44} y={16} />
        <text className={styles.knock} x={-36} y={24.1}>
          JUE · 10:30
        </text>
        <Glyph icon={CheckmarkCircle02Icon} size={12} x={16} y={16} />
        <path className={styles.faint} d="M-44 38H20" />
      </Slab>

      {/* From the booking down to the slot it took. */}
      <path className={styles.guide} d={`M${slot[0]} ${slot[1]}V${booking[1]}`} />
      <Node x={slot[0]} y={slot[1]} />
      <Node x={booking[0]} y={booking[1]} />

      {/* "RESERVADO", not "TURNO RESERVADO": the longer label starts left of
          the right-hand corner guide, which then runs through its letters. */}
      <Callout label="CONVERSACIÓN" side="left" tip={118} x={8} y={70} />
      <Callout label="RESERVADO" side="right" tip={199} x={352} y={99} />
      <Callout label="DISPONIBLE" side="right" tip={192} x={352} y={183} />
      <Callout label="GOOGLE CALENDAR" side="left" tip={142} x={8} y={204} />
    </Blueprint>
  );
}

// ── 04 · Leads de Meta Ads ──────────────────────────────────────────

/** Distance between two stations of the leads line, in plate units. */
const LEADS_STEP = 92.4;

/**
 * A lead arriving on its own, three stations in a line.
 *
 * The campaign, the contact it becomes and the conversation that opens — each
 * a slab, stepping back along the floor, joined by arrows drawn on the floor
 * itself. Nobody stands between the stations: that is "without you watching".
 * The one filled thing on the contact is the campaign it came from, because
 * that is what a lead form carries and a typed-in contact does not; the one on
 * the conversation is the first message, already sent.
 *
 * Stations step along the plates' own `x` axis, so the line recedes in the
 * same perspective as everything on it.
 */
export function LeadsBlueprint() {
  const stations = [0, 1, 2].map((index) => onPlate(100, 174, index * LEADS_STEP, 0));
  const [campaign, contact, conversation] = stations;

  return (
    <Blueprint>
      {/* Back to front: the furthest station first, so nearer ones cover it. */}
      <Slab cx={conversation[0]} cy={conversation[1]} size={60}>
        <Glyph icon={Chat01Icon} size={12} x={-26} y={-26} />
        <text className={styles.stamp} x={-12} y={-17.5}>
          whatsapp
        </text>
        <rect className={styles.solid} height={11} width={40} x={-26} y={-8} />
        <text className={styles.knock} x={-22} y={0}>
          ¡hola!
        </text>
        <path className={styles.faint} d="M-26 10H22M-26 17H8" />
      </Slab>

      <Slab cx={contact[0]} cy={contact[1]} size={60}>
        <Glyph icon={UserAdd01Icon} size={12} x={-26} y={-26} />
        <text className={styles.stamp} x={-12} y={-17.5}>
          contacto
        </text>
        <rect className={styles.ink} height={7} width={52} x={-26} y={-8} />
        <rect className={styles.ink} height={7} width={52} x={-26} y={2} />
        <rect className={styles.solid} height={9} width={34} x={-26} y={14} />
        <text className={styles.knock} x={-23.5} y={20.6}>
          CAMPAÑA
        </text>
      </Slab>

      <Slab cx={campaign[0]} cy={campaign[1]} size={60}>
        <Glyph icon={Megaphone01Icon} size={12} x={-26} y={-26} />
        <text className={styles.stamp} x={-12} y={-17.5}>
          meta ads
        </text>
        <rect className={styles.ink} height={24} width={40} x={-26} y={-8} />
        <path className={styles.ink} d="M-22 12L-14 3L-6 7L6 -3L10 0" />
        <path className={styles.faint} d="M-26 23H4" />
      </Slab>

      {/* The floor between stations. Each arrow stops short of the next slab's
          side face, so it reads as lying in front of it, not through it. */}
      {[campaign, contact].map(([cx, cy]) => (
        <Plane cx={cx} cy={cy} key={cx}>
          <path className={styles.guide} d="M34 0H52" />
          <path className={styles.ink} d="M47 -3L52 0L47 3" />
        </Plane>
      ))}

      <Callout label="PRIMER MENSAJE" side="left" tip={238} x={8} y={88} />
      <Callout label="CONTACTO" side="right" tip={214} x={352} y={122} />
      <Callout label="CON SU CAMPAÑA" side="right" tip={196} x={352} y={144} />
      <Callout label="META ADS" side="left" tip={92} x={8} y={196} />
    </Blueprint>
  );
}

// ── 05 · Cobrar por chat ────────────────────────────────────────────

/**
 * A payment link, and the webhook that closes it.
 *
 * The link is the big slab: the amount, the processor, the conversation it
 * went out in, and an empty status box. Behind it on the same floor is the
 * webhook, with an arrow on the floor into the link; above it, what the box
 * ends up holding. The guide runs from the empty box straight up to "PAGADO",
 * and the order is the claim: nothing is marked paid until the webhook says so.
 *
 * The box and the tag share `x + y = 6` on their plates. Anything else printed
 * on that diagonal of the link would have the guide drawn through it, which is
 * why the processor's name sits well to the left of it.
 */
export function PaymentsBlueprint() {
  const link = { cx: 160, cy: 160, size: 100 } as const;
  const paid = { cx: 160, cy: 58, size: 48 } as const;
  // Straight back along the floor, far enough that the arrow between the two
  // clears the webhook's side face.
  const webhook = onPlate(link.cx, link.cy, 100, 0);

  // The empty box, and the "PAGADO" tag's lower edge — clear of the word.
  const status = onPlate(link.cx, link.cy, -24, 30);
  const receipt = onPlate(paid.cx, paid.cy, -6, 12);

  return (
    <Blueprint>
      <Slab cx={webhook[0]} cy={webhook[1]} size={44}>
        <Glyph icon={WebhookIcon} size={20} x={-10} y={-10} />
      </Slab>

      <Slab cx={link.cx} cy={link.cy} size={link.size}>
        <Glyph icon={Link01Icon} size={12} x={-44} y={-44} />
        <text className={styles.stamp} x={-29} y={-35.5}>
          link de pago
        </text>
        <text className={styles.figure} x={-44} y={-10}>
          $24.500
        </text>
        <path className={styles.faint} d="M-44 2H44" />
        <text className={styles.stamp} x={-44} y={14}>
          stripe
        </text>
        <rect className={styles.ink} height={12} width={40} x={-44} y={24} />
        <Glyph icon={Chat01Icon} size={12} x={28} y={24} />
      </Slab>

      <Slab cx={paid.cx} cy={paid.cy} size={paid.size}>
        <Glyph icon={CheckmarkCircle02Icon} size={14} x={-20} y={-18} />
        <rect className={styles.solid} height={12} width={40} x={-20} y={0} />
        <text className={styles.knock} x={-10.8} y={8.1}>
          PAGADO
        </text>
        <text className={styles.stamp} x={-20} y={21}>
          confirmado
        </text>
      </Slab>

      {/* The webhook's call, on the floor, into the link. */}
      <Plane cx={link.cx} cy={link.cy}>
        <path className={styles.guide} d="M70 0H54" />
        <path className={styles.ink} d="M59 -3L54 0L59 3" />
      </Plane>

      <path className={styles.guide} d={`M${status[0]} ${status[1]}V${receipt[1]}`} />
      <Node x={status[0]} y={status[1]} />
      <Node x={receipt[0]} y={receipt[1]} />

      <Callout label="PAGADO" side="left" tip={146} x={8} y={64} />
      <Callout label="WEBHOOK" side="right" tip={278} x={352} y={110} />
      <Callout label="EN EL CHAT" side="right" tip={230} x={352} y={158} />
      <Callout label="LINK DE PAGO" side="left" tip={122} x={8} y={184} />
    </Blueprint>
  );
}

// ── 06 · Agentes de voz ─────────────────────────────────────────────

/** The voices on offer, left to right. The middle one is the chosen one. */
const VOICES = ["A", "B", "C"] as const;

/** Heights of the level meter's bars, standing up off the agent's plate. */
const WAVE = [6, 12, 20, 28, 16, 24, 10, 18, 8, 14] as const;

/**
 * A call, the agent that takes it, and what is left of it afterwards.
 *
 * Top slab: the incoming call and the voices to pick from, one chosen. Middle:
 * the same agent as in the chat, speaking — a level meter standing up off the
 * plate, bars of different heights, not moving. Bottom: the transcript, speaker
 * marks down the margin. The guide drops from the chosen voice, through the
 * meter, to the transcript's last line, which is the card's promise in one
 * stroke: the voice you choose, and every call kept.
 *
 * All three ends share `x + y = -6`. The top one is the chosen voice's lower
 * edge, clear of its label; the bottom one is the last line's speaker mark.
 */
export function VoiceBlueprint() {
  const cx = 180;
  const size = 84;
  const reach = plateReach(size);
  const levels = { call: 58, agent: 130, transcript: 202 } as const;

  const voice = onPlate(cx, levels.call, -4, -2);
  const speech = onPlate(cx, levels.agent, -14, 8);
  const record = onPlate(cx, levels.transcript, -34.5, 28.5);

  return (
    <Blueprint>
      <path
        className={styles.guide}
        d={`M${cx - reach} ${levels.call}V${levels.transcript}M${cx + reach} ${levels.call}V${levels.transcript}`}
      />

      <Slab cx={cx} cy={levels.transcript} size={size}>
        {/* Lower on the plate than on the others: the slab above covers this
            one's far corner, and a label up there would lose its end. */}
        <Glyph icon={File02Icon} size={12} x={-36} y={-20} />
        <text className={styles.stamp} x={-21} y={-11.5}>
          transcripción
        </text>
        {[3, 11, 19, 27].map((y, line) => (
          <g key={y}>
            {/* Agent and caller take turns; the agent's marks are filled. */}
            <rect
              className={line % 2 === 1 ? styles.solid : styles.faint}
              height={3}
              width={3}
              x={-36}
              y={y}
            />
            <path className={styles.faint} d={`M-29 ${y + 1.5}H${[20, 28, 6, 24][line]}`} />
          </g>
        ))}
      </Slab>

      <Slab cx={cx} cy={levels.agent} size={size}>
        <Glyph icon={AiVoiceIcon} size={12} x={-36} y={-36} />
        <text className={styles.stamp} x={-21} y={-27.5}>
          agente
        </text>
        <path className={styles.faint} d="M-36 8H22" />
      </Slab>

      {/* The meter stands on the plate rather than lying printed on it: bars
          sheared flat along the plate read as hatching, not as sound. Drawn
          before the call slab, so that slab would cover a bar that grew into
          it — none is tall enough to. */}
      {WAVE.map((height, bar) => {
        const [x, y] = onPlate(cx, levels.agent, -34 + bar * 6, 8);
        // Bars sit at fixed positions; their heights are the index-keyed data.
        return <path className={styles.ink} d={`M${x} ${y}V${y - height * 0.6}`} key={bar} />;
      })}

      <Slab cx={cx} cy={levels.call} size={size}>
        <Glyph icon={Call02Icon} size={12} x={-36} y={-36} />
        <text className={styles.stamp} x={-21} y={-27.5}>
          llamada
        </text>
        {VOICES.map((name, index) => {
          const x = -36 + index * 26;
          const chosen = index === 1;
          return (
            <g key={name}>
              <rect className={chosen ? styles.solid : styles.faint} height={10} width={22} x={x} y={-12} />
              <text
                className={chosen ? styles.knock : styles.stamp}
                textAnchor="middle"
                x={x + 11}
                y={-4.9}
              >
                {chosen ? `VOZ ${name}` : name}
              </text>
            </g>
          );
        })}
        <path className={styles.faint} d="M-36 8H20M-36 15H6" />
      </Slab>

      <path className={styles.guide} d={`M${record[0]} ${record[1]}V${voice[1]}`} />
      <Node x={voice[0]} y={voice[1]} />
      <Node x={speech[0]} y={speech[1]} />
      <Node x={record[0]} y={record[1]} />

      <Callout label="TU VOZ" side="right" tip={188} x={352} y={54} />
      <Callout label="LLAMADA" side="left" tip={124} x={8} y={64} />
      <Callout label="AGENTE" side="left" tip={124} x={8} y={136} />
      <Callout label="TRANSCRIPCIÓN" side="right" tip={226} x={352} y={214} />
    </Blueprint>
  );
}
