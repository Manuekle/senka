import { defineTool } from "eve/tools";
import { z } from "zod";
import { chartSpecSchema } from "../../lib/artifacts";
import { isOperatorConsole, OPERATOR_ONLY } from "../../lib/operator-console";

/**
 * Draw the numbers instead of listing them.
 *
 * Every read tool in this agent — `pipeline`, `marketing`, `inbox`,
 * `operations` — returns rows. A model handed rows writes prose, and prose is
 * where a year of sales goes to die: eleven monthly figures in a paragraph is
 * a paragraph nobody finishes. The same eleven figures as a column chart with
 * one sentence under it is the answer.
 *
 * So this tool takes no query and reads nothing. It is a renderer: the model
 * has already fetched the data, and this is how it puts it on screen. The
 * console draws it from the validated call arguments
 * (`app/_components/chat/artifacts/chart-artifact.tsx`), which is why the
 * result here is one line — echoing the spec back would double its cost in
 * context for a payload the model just wrote.
 *
 * ## Not for diagrams
 *
 * A flow, a funnel, a process, an org map, a state machine — those are
 * Mermaid fences in the reply text. This is for quantities only. The two are
 * not interchangeable and the instructions say which is which.
 *
 * They do share a renderer, though. A chart drawn from this spec is Mermaid
 * `xychart-beta` (`lib/chart-mermaid.ts`) through the same `beautiful-mermaid`
 * call as a fence, so a chart and a diagram in the same reply are drawn by the
 * same engine at the same weight — and the PDF export can redraw the chart
 * from the same source.
 *
 * ## Console-only
 *
 * Gated like `pipeline` and `marketing` (lib/operator-console.ts), for a
 * different reason: WhatsApp and Instagram have no renderer, so a chart there
 * would be a tool call that produced nothing while the model believed it had
 * answered. Refusing tells it to write the numbers out instead.
 */
export default defineTool({
  description:
    "Draw a chart in the console: ranked bars, columns, a trend line, an area or a " +
    "share. Call it after reading the data with `pipeline`, `marketing`, `inbox`, " +
    "`operations`, `seo` or `run_python`, and pass the numbers you got. Use it for any answer " +
    "about magnitude, ranking, share or movement over time — 'ventas de este año', " +
    "'de dónde vienen los leads', 'qué etapa pierde deals'. Always write a short " +
    "summary under it in the reply. For a flow, funnel or process, do not use this: " +
    "put a ```mermaid fence in the reply instead. Console-only.",
  inputSchema: chartSpecSchema,
  outputSchema: z.object({
    ok: z.boolean(),
    error: z.string().optional(),
    /** What the operator is now looking at, so the model can refer to it. */
    rendered: z.string().optional(),
  }),
  async execute(input, ctx) {
    if (!(await isOperatorConsole(ctx.session.id))) {
      return { ok: false, error: OPERATOR_ONLY };
    }

    const points = input.series.reduce((total, series) => total + series.points.length, 0);
    return {
      ok: true,
      rendered: `${input.kind} · "${input.title}" · ${input.series.length} serie(s), ${points} punto(s). Ya está en pantalla: resumí lo que muestra en una o dos frases, sin repetir los números uno por uno.`,
    };
  },
});
