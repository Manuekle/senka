import { defineTool } from "eve/tools";
import { z } from "zod";
import { reportSpecSchema } from "../../lib/artifacts";
import { isOperatorConsole, OPERATOR_ONLY } from "../../lib/operator-console";

/**
 * A document, not a message.
 *
 * "Hacéme un informe de ventas del año" and "¿cómo venimos de ventas?" want
 * different things from the same numbers. The second wants two sentences and a
 * chart. The first wants something with a title, a period, headline figures,
 * sections, and a file at the end that can be forwarded to an accountant or
 * printed for a meeting — and a chat reply, however well written, is none of
 * those.
 *
 * The gap this closes is the last one: until now the agent could describe a
 * report but could not produce one. The console renders this spec as a
 * document card and offers it as a PDF, generated on demand from the same
 * spec by `app/api/reports/pdf/route.ts`.
 *
 * ## Why a spec and not Markdown
 *
 * The model could write the whole report as Markdown text and the chat would
 * render it. It would look like a chat message, because it would be one — no
 * cover, no KPI row, no page breaks, and nothing to hand to the PDF writer but
 * a wall of text to guess the structure of. Structure declared up front is
 * what makes the same content render correctly twice, on screen and on paper.
 *
 * Bodies are still Markdown, because prose is prose. It is the frame that is
 * typed.
 *
 * ## Console-only
 *
 * Same gate as `chart`, same reason: nothing on WhatsApp can render this.
 */
export default defineTool({
  description:
    "Produce a formal report in the console — title, period, headline figures, sections " +
    "with prose, tables and charts — and offer it as a downloadable PDF. Use it when the " +
    "person asks for an 'informe', 'reporte', 'resumen ejecutivo', a PDF, or something " +
    "to send to somebody else. Read the data first with `pipeline`, `marketing`, `inbox`, " +
    "`operations`, `seo` or `web_fetch`; every number here must come from a tool that returned it on this " +
    "turn. For a quick answer with one chart, use `chart` instead — this is heavier and " +
    "the person has to read it. Console-only.",
  inputSchema: reportSpecSchema,
  outputSchema: z.object({
    ok: z.boolean(),
    error: z.string().optional(),
    rendered: z.string().optional(),
  }),
  async execute(input, ctx) {
    if (!(await isOperatorConsole(ctx.session.id))) {
      return { ok: false, error: OPERATOR_ONLY };
    }

    const charts = input.sections.filter((section) => section.chart).length;
    const tables = input.sections.filter((section) => section.table).length;
    return {
      ok: true,
      rendered:
        `Informe "${input.title}" en pantalla: ${input.sections.length} sección(es), ` +
        `${charts} gráfico(s), ${tables} tabla(s), con botón de descarga en PDF. ` +
        `Decile en una frase qué encontraste y que puede bajarlo en PDF desde la tarjeta; ` +
        `no repitas el informe en el texto.`,
    };
  },
});
