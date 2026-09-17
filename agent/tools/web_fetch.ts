import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertToolAllowed } from "../../lib/agent-scope";
import { isOperatorConsole, OPERATOR_ONLY } from "../../lib/operator-console";

// Read one public web page — the owner's site, a competitor's, a robots.txt.
//
// Replaces eve's default `web_fetch`, which was disabled because it fetched
// anything from the app runtime. Ten operator skills still told the model to
// "web_fetch the site", so every SEO or competitor question ran into a tool
// that did not exist and the model made something up instead. This one is
// narrow on purpose (see lib/web-page.ts): public HTTPS only, every redirect
// hop and every resolved address checked, GET only, bounded size and time,
// and only in the owner's own console — a stranger on WhatsApp cannot point
// this server at a URL.
export default defineTool({
  description:
    "Read one public web page by URL and return its SEO tags (title, meta description, " +
    "canonical, robots, lang, H1/H2, Open Graph, structured data, link and image counts) " +
    "plus its readable text. Also reads plain-text files such as robots.txt and sitemap.xml. " +
    "Use it to review the owner's own website, a landing page or a competitor's page. " +
    "Public HTTPS only. It cannot search the web — you need the URL. Only available in the " +
    "business owner's own console.",
  inputSchema: z.object({
    url: z
      .string()
      .min(3)
      .describe("Full https URL, or a bare domain like example.com (https is assumed)."),
    maxChars: z
      .number()
      .int()
      .min(500)
      .max(20_000)
      .optional()
      .describe("How much readable text to return. Default 6000."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    url: z.string(),
    status: z.number().optional(),
    finalUrl: z.string().optional(),
    redirects: z.array(z.string()).optional(),
    contentType: z.string().optional(),
    elapsedMs: z.number().optional(),
    bytes: z.number().optional(),
    seo: z.record(z.string(), z.unknown()).optional(),
    text: z.string().optional(),
    truncated: z.boolean().optional(),
    error: z.string().optional(),
  }),
  async execute(input, ctx) {
    await assertToolAllowed(ctx.session.id, "web_fetch");
    if (!(await isOperatorConsole(ctx.session.id))) {
      return { ok: false, url: input.url, error: OPERATOR_ONLY };
    }
    const { readWebPage } = await import("../../lib/web-page");
    const reading = await readWebPage(input.url, { maxChars: input.maxChars });
    if (!reading.ok) return reading;
    return { ...reading, redirects: [...reading.redirects], seo: reading.seo };
  },
});
