import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertToolAllowed } from "../../lib/agent-scope";
import { isOperatorConsole, OPERATOR_ONLY } from "../../lib/operator-console";
import { RANGE_IDS } from "../../lib/seo-metrics";

// The SEO page, reachable from a conversation.
//
// The app has read Google Search Console for months — /seo draws clicks,
// impressions, positions and the keywords that moved — and none of it was
// reachable from the chat. Asked for "un informe SEO de mi sitio", the model
// had no tool, so it asked the owner for an email to be invited to Search
// Console. The access already existed: the Google account connected in
// Conexiones carries the read-only Search Console scope.
//
// Read-only and console-only, like `pipeline` and `marketing`. Every refusal is
// a sentence that names the fix, because "not connected" and "connected without
// the Search Console permission" and "this Google account cannot see that
// property" are three different clicks for the owner.

const PAGE = "/seo";
const CONNECT_HINT =
  "El dueño lo resuelve en Conexiones → Google → Conectar (inicia sesión con la cuenta de " +
  "Google que ve el sitio en Search Console). No pidas emails para invitarte, contraseñas ni exportes: " +
  "con esa conexión alcanza.";

const rowSchema = z.object({
  key: z.string(),
  clicks: z.number(),
  impressions: z.number(),
  ctrPercent: z.number(),
  position: z.number(),
  clicksChange: z.number().optional(),
  positionChange: z.number().optional(),
  isNew: z.boolean().optional(),
});

const deltaSchema = z.object({
  current: z.number(),
  previous: z.number(),
  change: z.number(),
  percent: z.number().nullable(),
});

export default defineTool({
  description:
    "Read the website's Google Search Console data — the same numbers as the SEO page: " +
    "clicks, impressions, CTR and average position against the previous equal window, the " +
    "keywords and pages that bring traffic (and which ones grew, dropped or disappeared), " +
    "devices, countries, and the site changes the owner logged. Use it for any question " +
    "about SEO, Google rankings, organic traffic or 'cómo me encuentran en Google'. " +
    "Read-only. Only available in the business owner's own console.",
  inputSchema: z.object({
    action: z
      .enum(["overview", "queries", "pages", "changes", "sites"])
      .describe(
        "overview: totals vs previous window, devices, countries, daily clicks. queries: " +
          "keywords. pages: URLs. changes: the site changes logged on the SEO page. sites: the " +
          "Search Console properties the connected account can read.",
      ),
    range: z.enum(RANGE_IDS as [string, ...string[]]).default("28d").describe("Window to read."),
    site: z
      .string()
      .optional()
      .describe("A property from action=sites. Omit to use the one the SEO page watches."),
    limit: z.number().int().min(1).max(50).default(15).describe("Rows for queries/pages."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    status: z
      .enum(["ok", "not_connected", "needs_scope", "no_property", "forbidden", "rate_limited", "error"])
      .optional(),
    error: z.string().optional(),
    page: z.string(),
    account: z.string().optional(),
    site: z.string().optional(),
    sites: z.array(z.object({ url: z.string(), permission: z.string() })).optional(),
    range: z.string().optional(),
    period: z
      .object({
        current: z.object({ start: z.string(), end: z.string() }),
        previous: z.object({ start: z.string(), end: z.string() }),
      })
      .optional(),
    totals: z
      .object({
        clicks: deltaSchema,
        impressions: deltaSchema,
        ctrPercent: deltaSchema,
        position: deltaSchema,
      })
      .optional(),
    dailyClicks: z.array(z.object({ date: z.string(), clicks: z.number() })).optional(),
    devices: z.array(rowSchema).optional(),
    countries: z.array(rowSchema).optional(),
    rows: z.array(rowSchema).optional(),
    topGainers: z.array(rowSchema).optional(),
    topLosers: z.array(rowSchema).optional(),
    lost: z.array(z.object({ key: z.string(), clicksBefore: z.number() })).optional(),
    totalRows: z.number().optional(),
    changes: z.array(z.object({ date: z.string(), note: z.string() })).optional(),
    note: z.string().optional(),
  }),
  async execute(input, ctx) {
    await assertToolAllowed(ctx.session.id, "seo");
    if (!(await isOperatorConsole(ctx.session.id))) {
      return { ok: false, status: "error" as const, error: OPERATOR_ONLY, page: PAGE };
    }

    const sc = await import("../../lib/search-console");
    const { getStoredConnection } = await import("../../lib/connection-store");
    const { getSeoSite, listSeoChanges } = await import("../../lib/seo-store");

    const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
    const toRow = (row: { key: string; clicks: number; impressions: number; ctr: number; position: number }) => ({
      key: row.key,
      clicks: row.clicks,
      impressions: row.impressions,
      ctrPercent: round(row.ctr * 100, 2),
      position: round(row.position),
    });
    const google = await getStoredConnection("google").catch(() => undefined);
    const account = google?.accountLabel;
    const base = { page: PAGE, ...(account ? { account } : {}) };

    const refuse = async (error: unknown) => {
      if (error instanceof sc.SearchConsoleError) {
        if (error.status === 401) {
          return {
            ...base,
            ok: false,
            status: "not_connected" as const,
            error: `No hay una cuenta de Google conectada con acceso a Search Console. ${CONNECT_HINT}`,
          };
        }
        if (error.status === 403 && !(await sc.connectionHasScope())) {
          return {
            ...base,
            ok: false,
            status: "needs_scope" as const,
            error:
              "La cuenta de Google conectada se conectó antes de que la app pidiera permiso de " +
              "Search Console. El dueño tiene que reconectar Google en Conexiones (Desconectar → Conectar) " +
              "y aceptar el permiso de Search Console.",
          };
        }
        if (error.status === 403) {
          return {
            ...base,
            ok: false,
            status: "forbidden" as const,
            error:
              `Google rechazó la lectura: ${error.message}. La cuenta conectada${account ? ` (${account})` : ""} ` +
              "no tiene acceso a esa propiedad. En Search Console → Configuración → Usuarios y permisos, " +
              "el propietario del sitio tiene que agregar esa cuenta.",
          };
        }
        if (error.status === 429) {
          return { ...base, ok: false, status: "rate_limited" as const, error: "Search Console limitó las consultas; probá en unos minutos." };
        }
        return { ...base, ok: false, status: "error" as const, error: `Search Console respondió: ${error.message}` };
      }
      return {
        ...base,
        ok: false,
        status: "error" as const,
        error: error instanceof Error ? error.message : "No pude leer Search Console.",
      };
    };

    if (input.action === "changes") {
      const changes = await listSeoChanges();
      return {
        ...base,
        ok: true,
        status: "ok" as const,
        changes: changes.slice(0, 50).map((change) => ({ date: change.date, note: change.note })),
        ...(changes.length === 0 ? { note: "No hay cambios registrados en la página SEO." } : {}),
      };
    }

    let sites: { url: string; permission: string }[];
    try {
      sites = await sc.listSites();
    } catch (error) {
      return refuse(error);
    }

    if (input.action === "sites") {
      return { ...base, ok: true, status: "ok" as const, sites };
    }

    const stored = await getSeoSite();
    const site =
      input.site && sites.some((entry) => entry.url === input.site)
        ? input.site
        : stored && sites.some((entry) => entry.url === stored)
          ? stored
          : sc.defaultSite(sites);
    if (!site) {
      return {
        ...base,
        ok: false,
        status: "no_property" as const,
        sites,
        error:
          "La cuenta de Google conectada no tiene ninguna propiedad verificada en Search Console. " +
          "El dueño tiene que verificar el sitio en search.google.com/search-console con esa cuenta, " +
          "o conectar la cuenta que ya lo tiene verificado.",
      };
    }

    const range = sc.isRangeId(input.range) ? input.range : "28d";
    const { current, previous } = sc.periodsFor(range);
    const delta = (now: number, before: number, scale = 1, digits = 1) => {
      const m = sc.metricDelta(now * scale, before * scale);
      return {
        current: round(m.current, digits),
        previous: round(m.previous, digits),
        change: round(m.change, digits),
        percent: m.percent === null ? null : round(m.percent * 100, 1),
      };
    };

    try {
      if (input.action === "overview") {
        const [now, before, daily, devices, countries] = await Promise.all([
          sc.queryTotals(site, current),
          sc.queryTotals(site, previous),
          sc.queryRows({ site, period: current, dimensions: ["date"], rowLimit: 400 }),
          sc.queryRows({ site, period: current, dimensions: ["device"], rowLimit: 10 }),
          sc.queryRows({ site, period: current, dimensions: ["country"], rowLimit: 10 }),
        ]);
        return {
          ...base,
          ok: true,
          status: "ok" as const,
          site,
          range,
          period: { current, previous },
          totals: {
            clicks: delta(now.clicks, before.clicks, 1, 0),
            impressions: delta(now.impressions, before.impressions, 1, 0),
            ctrPercent: delta(now.ctr, before.ctr, 100, 2),
            position: delta(now.position, before.position),
          },
          dailyClicks: [...daily]
            .sort((a, b) => a.key.localeCompare(b.key))
            .map((row) => ({ date: row.key, clicks: row.clicks })),
          devices: devices.map(toRow),
          countries: countries.map(toRow),
          note: "Position: menor es mejor. Search Console tiene ~3 días de demora en datos finales.",
        };
      }

      const dimension = input.action === "queries" ? "query" : "page";
      const [now, before] = await Promise.all([
        sc.queryRows({ site, period: current, dimensions: [dimension], rowLimit: 500 }),
        sc.queryRows({ site, period: previous, dimensions: [dimension], rowLimit: 500 }),
      ]);
      const compared = sc.compareRows(now, before);
      const toCompared = (row: (typeof compared)[number]) => ({
        ...toRow(row.current),
        clicksChange: row.clicksChange,
        positionChange: round(row.positionChange),
        isNew: row.isNew,
      });
      const movers = sc.rankByMovement(compared, compared.length);
      return {
        ...base,
        ok: true,
        status: "ok" as const,
        site,
        range,
        period: { current, previous },
        totalRows: compared.length,
        rows: compared.slice(0, input.limit).map(toCompared),
        topGainers: movers.filter((row) => row.clicksChange > 0).slice(0, 5).map(toCompared),
        topLosers: movers
          .filter((row) => row.clicksChange < 0)
          .slice(-5)
          .reverse()
          .map(toCompared),
        lost: sc
          .lostRows(now, before)
          .slice(0, 10)
          .map((row) => ({ key: row.key, clicksBefore: row.clicks })),
        note: "positionChange positivo = subió en Google. Ordenado por clics del período actual.",
      };
    } catch (error) {
      return refuse(error);
    }
  },
});
