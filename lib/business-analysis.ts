import { generateObject } from "ai";
import { z } from "zod";
import { assertPublicHttpsUrl } from "./http-guard";
import { stripMarkup, tidy } from "./rag";
import { modelIdForTask } from "./task-model";
import { resolveLanguageModel } from "./ai-provider";
import { recordAiUsage } from "./ai-meter";
import { listDocuments } from "./knowledge-store";
import type { BusinessProfileRecord } from "./business-profile-store";

// Turns whatever the owner has on hand — a website, a Google Maps listing,
// free-text notes, the documents already sitting in the knowledge base — into
// one structured business profile the agent can use as background context.
//
// Every source is independent and optional, matching how a real business
// shows up here: some have a polished site and nothing else, some have a
// Maps listing and a price-list PDF and no website at all. One missing or
// unreachable source degrades that source, never the whole analysis.

const FETCH_TIMEOUT_MS = 10_000;
/** Bytes read from a fetched page before the rest is discarded. */
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
/** Characters of stripped text kept per source, once fetched. */
const MAX_SOURCE_CHARS = 6000;
/** Documents whose name + preview are handed to the model as extra context. */
const MAX_DOCUMENTS = 8;

export type FetchResult = { readonly text: string } | { readonly error: string };

/**
 * Fetches a public HTTPS page and returns its stripped text, or an error
 * string. Never throws — a bad URL here degrades one source of the analysis
 * instead of failing the whole request.
 *
 * Also used by the identity card to import a terms or privacy page from the
 * owner's own site — same trust model, same SSRF rules.
 */
export async function fetchPageText(
  rawUrl: string,
  options: { readonly maxChars?: number } = {},
): Promise<FetchResult> {
  let url: URL;
  try {
    // No allowlist to check against: this is a URL the signed-in owner typed
    // in themselves, not a host the agent reaches at chat time. The SSRF
    // rules (HTTPS, no loopback/private ranges, no raw IP) still apply.
    url = assertPublicHttpsUrl(rawUrl);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "URL inválida." };
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; SenkaBusinessProfiler/1.0)" },
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };

    const buffer = new Uint8Array(await res.arrayBuffer());
    const html = new TextDecoder("utf-8").decode(buffer.slice(0, MAX_PAGE_BYTES));
    const text = tidy(stripMarkup(html)).slice(0, options.maxChars ?? MAX_SOURCE_CHARS);
    if (!text) return { error: "La página no tenía texto legible." };
    return { text };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo acceder a esa URL." };
  }
}

const businessProfileSchema = z.object({
  name: z.string().describe("The business's name, in the language the sources use."),
  industry: z
    .string()
    .describe("Short industry/category label, e.g. 'Panadería', 'Clínica dental', 'Estudio contable'."),
  description: z
    .string()
    .describe("2-4 sentence summary of what the business does, who it serves, and what makes it findable."),
  services: z.array(z.string()).describe("Products or services offered, as short labels."),
  location: z
    .string()
    .nullable()
    .describe("Address or area served, only if a source actually states it. null otherwise."),
  hours: z.string().nullable().describe("Opening hours, only if a source actually states them. null otherwise."),
  tone: z
    .string()
    .describe(
      "A short instruction for the brand voice to use when talking to customers, e.g. 'cercano y directo, sin tecnicismos'.",
    ),
  highlights: z
    .array(z.string())
    .describe("2-5 standout facts worth mentioning to a customer: differentiators, guarantees, certifications."),
  faqs: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .describe("2-5 questions a customer would likely ask, with short answers grounded only in the sources given."),
});

export type BusinessAnalysisInput = {
  readonly websiteUrl?: string;
  readonly mapsUrl?: string;
  readonly notes?: string;
};

export type BusinessAnalysisOutcome =
  | { readonly ok: true; readonly record: BusinessProfileRecord }
  | { readonly ok: false; readonly reason: "no_sources" | "generation_failed"; readonly detail?: string };

export async function analyzeBusiness(input: BusinessAnalysisInput): Promise<BusinessAnalysisOutcome> {
  const websiteUrl = input.websiteUrl?.trim() || undefined;
  const mapsUrl = input.mapsUrl?.trim() || undefined;
  const notes = input.notes?.trim() || undefined;

  const [website, maps, documents] = await Promise.all([
    websiteUrl ? fetchPageText(websiteUrl) : Promise.resolve(undefined),
    mapsUrl ? fetchPageText(mapsUrl) : Promise.resolve(undefined),
    listDocuments(),
  ]);

  const sections: string[] = [];
  if (website && "text" in website) sections.push(`## Sitio web (${websiteUrl})\n\n${website.text}`);
  if (maps && "text" in maps) sections.push(`## Ficha de Google Maps (${mapsUrl})\n\n${maps.text}`);
  if (notes) sections.push(`## Notas del dueño\n\n${notes}`);

  const usedDocuments = documents.slice(0, MAX_DOCUMENTS);
  if (usedDocuments.length > 0) {
    sections.push(
      ["## Documentos subidos (nombre y vista previa)", "", ...usedDocuments.map((doc) => `- ${doc.name}: ${doc.preview}`)].join(
        "\n",
      ),
    );
  }

  if (sections.length === 0) {
    return { ok: false, reason: "no_sources" };
  }

  const system = [
    "Leés lo que un dueño de negocio pequeño tiene a mano — su sitio web, su ficha de Google Maps, notas propias, y vistas previas de documentos que subió — y lo convertís en un perfil de negocio estructurado.",
    "",
    "## Reglas",
    "",
    "- Usá solo lo que las fuentes realmente dicen. Nunca inventes una dirección, horario, precio o servicio que no esté ahí.",
    "- Un campo opcional sin base en las fuentes se omite, nunca se adivina.",
    "- Escribí cada campo en el mismo idioma en que están las fuentes.",
    "- Las FAQs deben basarse en las fuentes — no inventes políticas ni garantías.",
  ].join("\n");

  try {
    const modelId = await modelIdForTask("agent_design");
    const result = await generateObject({
      model: resolveLanguageModel(modelId),
      schema: businessProfileSchema,
      system,
      prompt: sections.join("\n\n---\n\n"),
      abortSignal: AbortSignal.timeout(60_000),
    });
    await recordAiUsage({
      model: modelId,
      usage: result.usage,
      conversationId: "business-profile",
    });

    const record: BusinessProfileRecord = {
      profile: result.object,
      sources: {
        websiteUrl,
        mapsUrl,
        websiteError: website && "error" in website ? website.error : undefined,
        mapsError: maps && "error" in maps ? maps.error : undefined,
        documentsUsed: usedDocuments.length,
      },
      generatedAt: new Date().toISOString(),
    };
    return { ok: true, record };
  } catch (error) {
    return {
      ok: false,
      reason: "generation_failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
