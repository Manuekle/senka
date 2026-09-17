import { type NextRequest, NextResponse } from "next/server";
import { withApiErrors } from "@/lib/api-error";
import { bookCalendarEvent, checkCalendarSlots } from "@/lib/calendar";
import { createCheckoutLink } from "@/lib/payments";
import { RagError, searchKnowledge } from "@/lib/rag";
import { setReminder } from "@/lib/reminder";
import { getAgent, getAgentByElevenLabsAgentId, upsertChat, upsertContact } from "@/lib/business-store";
import { sendWhatsAppText } from "@/lib/whatsapp-send";
import { toCapabilityIds } from "@/lib/agent-capabilities";
import { rateLimit } from "@/lib/rate-limit";
import { withWorkspace } from "@/lib/workspace-context";
import { readDocument } from "@/lib/doc-store";
import { DEFAULT_BUSINESS_ID } from "@/lib/business-scope";

type RegistryShape = { businesses: ReadonlyArray<{ id: string }> };
import {
  VOICE_TOOL_SECRET_HEADER,
  getVoiceTool,
  voiceSecretMatches,
  voiceToolsSecret,
} from "@/lib/voice-tools";
import type { Contact } from "@/lib/types";

// POST /api/webhooks/elevenlabs/tools/<agentId>/<tool>
//
// What a phone call reaches when the voice agent uses a tool. ElevenLabs calls
// this from its own servers mid-conversation; nothing here ever sees a browser
// session, which is why it is public in middleware (covered by the
// /api/webhooks/elevenlabs prefix) and authenticated by the shared secret this
// app itself put on the tool — see lib/voice-tools.ts.
//
// Two rules run before any work happens, in this order:
//
//   1. The secret has to match. Without it this is an endpoint that books
//      meetings and creates payment links for anyone who finds the URL.
//   2. The agent named in the path has to be allowed the capability the tool
//      belongs to. The URL is the identity here, the same way ctx.session.id
//      is for a chat tool (lib/agent-scope.ts) — which is exactly why the
//      tools are created per agent rather than once per account.
//
// Every answer is a 200 with a JSON body the model reads out loud, including
// the refusals: an HTTP error reaches the model as an opaque tool failure, and
// what a caller then hears is silence or an invention. A sentence it can say
// is always better.

/** The shape the model gets back. `success` is what the prompt tells it to
 *  check before claiming anything happened. */
type ToolReply = Record<string, unknown> & { success: boolean; message: string };

function reply(body: ToolReply) {
  return NextResponse.json(body);
}

function refuse(message: string) {
  return reply({ success: false, message });
}

/** Trimmed string, or undefined. Voice models pad arguments with whitespace
 *  and with literal "null"/"undefined" more often than typed callers do. */
function str(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") return undefined;
  return trimmed;
}

function num(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(str(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** A datetime the model dictated, or `undefined` if it is not a real one. */
function iso(value: unknown): Date | undefined {
  const raw = str(value);
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** How a slot is read out. The ISO string is for the next tool call; this is
 *  for the caller's ear. */
function spoken(date: Date): string {
  return date.toLocaleString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The person on the other end of the call, saved to the CRM.
 *
 * A call has no Eve session, so there is no `getContactBySession` to fall back
 * on: identity is whatever the agent managed to collect out loud. `upsertContact`
 * already merges on phone and email, so a caller who gives their number to
 * `save_contact` and then books an appointment lands on one record rather than
 * two.
 *
 * `channel: "voice"` is deliberate. Calling them a WhatsApp contact would make
 * the follow-up schedule message a number that may not have WhatsApp at all;
 * calling them a web contact would lose where they came from. See ContactChannel.
 */
async function contactFromCall(
  args: Record<string, unknown>,
  agentName: string,
  fallbackNote?: string,
): Promise<Contact | undefined> {
  const name = str(args.contact_name) ?? str(args.name);
  const phone = str(args.contact_phone) ?? str(args.phone);
  const email = str(args.contact_email) ?? str(args.email);
  if (!name && !phone && !email) return undefined;

  const contact = await upsertContact({
    ...(name ? { name } : {}),
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    channel: "voice",
    source: `voice:${agentName}`,
    ...(fallbackNote ? { lastMessage: fallbackNote } : {}),
    lastMessageAt: new Date().toISOString(),
  });
  await upsertChat({
    title: contact.name,
    channel: "web",
    lastMessage: fallbackNote ?? "Llamada telefónica",
    lastMessageAt: contact.lastMessageAt,
    messageCount: 1,
  });
  return contact;
}

/**
 * The workspaces a voice tool may be answered from: the installation's own
 * first, then every additional one the registry knows. The store is scoped by
 * workspace, so the same agent id is not one record but one per workspace —
 * which is exactly why the lookup runs inside each candidate instead of
 * trusting whichever workspace the last browser click left active.
 *
 * Both ids the app answers to (its own `agent_*` and the ElevenLabs mirror)
 * live in the same per-workspace list, so one pass finds the agent under
 * either name.
 */
async function workspaceCandidates(): Promise<string[]> {
  const workspaces = [DEFAULT_BUSINESS_ID];
  try {
    const registry = await readDocument<RegistryShape>("businesses");
    for (const business of registry?.businesses ?? []) {
      if (business.id !== DEFAULT_BUSINESS_ID && !workspaces.includes(business.id)) {
        workspaces.push(business.id);
      }
    }
  } catch {
    // The registry is unreadable: the default workspace is still answered.
  }
  return workspaces;
}

/** The tool itself, run inside the workspace its agent belongs to. Split out
 *  of the handler so the pinning in POST wraps exactly this and nothing else;
 *  the agent's name arrives with it, because the workspace-scoped store is
 *  the only place it lives. */
async function runTool(request: NextRequest, specName: string, agentName: string): Promise<Response> {
  let args: Record<string, unknown> = {};
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object") args = body as Record<string, unknown>;
  } catch {
    // A tool with no required arguments can legitimately arrive with no body.
  }

  switch (specName) {
    case "check_availability": {
      const durationMin = num(args.duration_min, 30);
      const start = iso(args.start_iso) ?? new Date();
      const end =
        iso(args.end_iso) ?? new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
      if (end.getTime() <= start.getTime()) {
        return refuse("El rango de fechas está al revés. Pedile a la persona otra fecha.");
      }
      try {
        const slots = await checkCalendarSlots({
          start: start.toISOString(),
          end: end.toISOString(),
          durationMin,
        });
        if (slots.length === 0) {
          return reply({
            success: true,
            slots: [],
            message: "No hay horarios libres en ese rango. Ofrecé buscar en otras fechas.",
          });
        }
        // Only the first few: a phone call cannot absorb a list, and the whole
        // response is read into the model's context.
        const offered = slots.slice(0, 5).map((slot) => ({
          start_iso: slot.start,
          spoken: spoken(new Date(slot.start)),
        }));
        return reply({
          success: true,
          slots: offered,
          message: `Hay ${slots.length} hueco(s) libre(s). Ofrecé uno o dos, y usá su start_iso al agendar.`,
        });
      } catch (error) {
        return refuse(
          `No pude consultar la agenda: ${error instanceof Error ? error.message : "error desconocido"}. Decile a la persona que no podés confirmar horarios ahora.`,
        );
      }
    }

    case "book_appointment": {
      const start = iso(args.start_iso);
      const summary = str(args.summary);
      if (!start) return refuse("Necesito la fecha y hora exactas de la cita. Volvé a preguntarlas.");
      if (start.getTime() <= Date.now()) {
        return refuse("Esa fecha ya pasó. Pedile a la persona una fecha futura.");
      }
      if (!summary) return refuse("Necesito un título para la cita, con el nombre de la persona.");

      const durationMin = num(args.duration_min, 30);
      const end = new Date(start.getTime() + durationMin * 60_000);
      // Saved before the booking: if Google refuses, the lead is still in the
      // CRM instead of existing only in a transcript nobody reads.
      const contact = await contactFromCall(args, agentName, `Pidió turno: ${summary}`);

      try {
        const booked = await bookCalendarEvent({
          start: start.toISOString(),
          end: end.toISOString(),
          summary,
          description: str(args.description),
          contactEmail: str(args.contact_email) ?? contact?.email,
        });
        return reply({
          success: true,
          event_id: booked.event_id,
          starts_at: start.toISOString(),
          spoken: spoken(start),
          contact_id: contact?.id,
          // Never spoken: a URL read aloud is unusable, and the prompt says so.
          meet_link: booked.meetLink,
          message: `La cita quedó agendada para ${spoken(start)}. Confirmásela a la persona con esas palabras.${
            booked.meetLink ? " El link de la videollamada se envía aparte: no lo leas en voz alta." : ""
          }`,
        });
      } catch (error) {
        return refuse(
          `No pude agendar la cita: ${error instanceof Error ? error.message : "error desconocido"}. Decile a la persona que la agenda no está disponible y que la vuelvan a contactar. No digas que quedó agendada.`,
        );
      }
    }

    case "save_contact": {
      const contact = await contactFromCall(args, agentName, str(args.notes));
      if (!contact) return refuse("Necesito al menos un nombre, un teléfono o un email para guardar.");
      if (str(args.notes)) {
        await upsertContact({ id: contact.id, notes: str(args.notes) });
      }
      return reply({
        success: true,
        contact_id: contact.id,
        message: `Guardado en el sistema como ${contact.name}.`,
      });
    }

    case "set_reminder": {
      const when = iso(args.datetime_iso);
      const message = str(args.message);
      if (!when) return refuse("Necesito la fecha y hora exactas del recordatorio.");
      if (when.getTime() <= Date.now()) {
        return refuse("Ese momento ya pasó. Pedile a la persona una fecha futura.");
      }
      if (!message) return refuse("Necesito saber qué hay que recordarle.");

      const contact = await contactFromCall(args, agentName, `Recordatorio: ${message}`);
      if (!contact) {
        return refuse(
          "Para programar un recordatorio necesito saber para quién es. Pedile el nombre y el teléfono, y volvé a intentarlo.",
        );
      }
      try {
        const result = await setReminder({
          contact_id: contact.id,
          datetime: when.toISOString(),
          message,
        });
        return reply({
          success: true,
          reminder_id: result.reminder_id,
          contact_id: contact.id,
          message: `Recordatorio programado para ${spoken(when)}.`,
        });
      } catch (error) {
        return refuse(
          `No pude programar el recordatorio: ${error instanceof Error ? error.message : "error desconocido"}.`,
        );
      }
    }

    case "send_payment_link": {
      const amount = str(args.amount);
      const productName = str(args.product_name);
      if (!amount || !productName) {
        return refuse("Necesito el importe y qué se está pagando antes de generar el link.");
      }
      const contact = await contactFromCall(args, agentName, `Link de pago: ${productName}`);
      const created = await createCheckoutLink({
        amount,
        currency: str(args.currency) ?? "usd",
        productName,
        contactId: contact?.id,
      });
      if (!created) {
        return refuse(
          "No hay ningún medio de cobro configurado en el sistema. Decile a la persona que te vas a comunicar con el link.",
        );
      }
      // The prompt promises the link arrives on WhatsApp. Whether it actually
      // does is reported honestly, because a caller who is told to expect a
      // message and never gets one is worse off than one who was told nothing.
      const phone = str(args.contact_phone) ?? contact?.phone;
      let delivered = false;
      if (phone) {
        const sent = await sendWhatsAppText(phone, `${productName}: ${created.url}`);
        delivered = sent.ok;
        if (!sent.ok) {
          console.warn("[voice-tools] payment link not delivered", { phone, body: sent.body });
        }
      }
      return reply({
        success: true,
        provider: created.provider,
        delivered,
        contact_id: contact?.id,
        message: delivered
          ? "El link de pago se envió por WhatsApp al número que dio. No leas el link en voz alta."
          : "El link de pago quedó creado, pero no se pudo enviar por WhatsApp. Decile que el equipo se lo hace llegar. Nunca leas el link en voz alta.",
      });
    }

    case "search_knowledge": {
      const query = str(args.query);
      if (!query) return refuse("Necesito saber qué buscar.");
      try {
        const matches = await searchKnowledge(query, { limit: 3 });
        if (matches.length === 0) {
          return reply({
            success: true,
            results: [],
            message: "No hay nada sobre eso en los documentos del negocio. Decilo así, no inventes.",
          });
        }
        return reply({
          success: true,
          results: matches.map((match) => ({ document: match.doc_name, excerpt: match.text })),
          message: `Encontré ${matches.length} pasaje(s). Contestá solo con eso.`,
        });
      } catch (error) {
        if (error instanceof RagError) return refuse(error.message);
        return refuse("No pude buscar en los documentos ahora.");
      }
    }

    case "transfer_to_human": {
      const reason = str(args.reason) ?? "Pidió hablar con una persona.";
      const contact = await contactFromCall(args, agentName, reason);
      if (!contact) {
        return refuse(
          "Para pasar el caso a una persona necesito al menos un nombre o un teléfono. Pedíselos.",
        );
      }
      await upsertContact({ id: contact.id, status: "waiting_human", notes: reason });
      await upsertChat({
        title: contact.name,
        channel: "web",
        lastMessage: reason,
        lastMessageAt: new Date().toISOString(),
        messageCount: 1,
        handoff: true,
      });
      return reply({
        success: true,
        contact_id: contact.id,
        message: "Listo, el caso quedó marcado para el equipo. Decile que alguien la va a contactar.",
      });
    }
  }

  return refuse("Esa herramienta no está disponible para este agente.");
}

export const POST = withApiErrors(async function POST(
  request: NextRequest,
  context: { params: Promise<{ agentId: string; tool: string }> },
) {
  const { agentId, tool } = await context.params;

  // The shared secret is the same for every agent's tools, so what bounds a
  // leaked URL beyond it is the budget — per address, shared with the other
  // public webhooks.
  if (!rateLimit("public-webhook", request, { max: 30, windowMs: 10 * 60_000 }).allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const spec = getVoiceTool(tool);
  if (!spec) return refuse("Esa herramienta no existe en este sistema.");

  const secret = await voiceToolsSecret();
  if (!voiceSecretMatches(request.headers.get(VOICE_TOOL_SECRET_HEADER), secret)) {
    // The only case where an HTTP status is the honest answer: this is not the
    // agent asking, so there is nobody to read a sentence to.
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // The workspace follows the agent, not the browser: whichever business the
  // operator last had open must not decide whose CRM a caller's turno lands
  // in. The URL may name either id the app answers to — its own or the
  // ElevenLabs mirror's — so both are tried, and either way the agent is
  // looked up inside each candidate workspace. Same file or table, a
  // different row.
  type AgentRecord = NonNullable<Awaited<ReturnType<typeof getAgent>>>;
  let found: { readonly agent: AgentRecord; readonly workspace: string } | undefined;
  for (const workspace of await workspaceCandidates()) {
    const record = await withWorkspace(workspace, () => getAgent(agentId) ?? getAgentByElevenLabsAgentId(agentId));
    if (record) {
      found = { agent: record, workspace };
      break;
    }
  }
  if (!found) {
    return refuse("Este agente ya no existe en el sistema. Avisale a la persona que no podés completar la acción.");
  }
  const { agent, workspace: agentWorkspace } = found;

  const allowed = toCapabilityIds(agent.tools);
  if (allowed.length > 0 && !allowed.includes(spec.capability)) {
    return refuse(
      `No tenés habilitada la función "${spec.capability}". Decile a la persona que no podés hacerlo y no afirmes lo contrario.`,
    );
  }

  // Everything the tool reads and writes now belongs to the agent's own
  // business; the installation's active-business pointer is not consulted.
  return withWorkspace(agentWorkspace, () => runTool(request, spec.name, agent.name));
});
