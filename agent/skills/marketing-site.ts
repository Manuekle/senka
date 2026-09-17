import { defineDynamic } from "eve/skills";
import { INTAKE, NO_INVENTION, PLAIN_LANGUAGE, operatorSkill } from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the owner asks about their website or its SEO: an SEO audit or report, " +
          "Google rankings and organic traffic (Search Console), whether the site works as " +
          "a sales page, why nobody finds them on Google, what to write on the home page, " +
          "or which search terms they should be showing up for.",
        `# The website

Two jobs that share one read of the page:

- **page** — does it turn a visitor into an enquiry, and what should it say.
- **search** — can people find it, and for which words.

## When to use

- "revisá mi sitio", "qué pongo en la home".
- "no aparezco en Google".
- "qué palabras debería usar".

## When NOT to use

- Building or editing the site. This agent cannot publish to it. Everything
  here is copy and a change list the owner applies.

${INTAKE}

## Read the page first, always

web_fetch the site. Then search_knowledge for what the business actually sells
and at what price, because the most common finding is that the page does not
say the thing the business is best at.

Any public site can be read this way — the owner's own or someone else's.
Search Console numbers are different: \`seo\` only reads properties the
connected Google account has in Search Console. If the site asked about is not
in \`seo action=sites\`, do everything else and say in one line that its
traffic data needs that site's owner to connect their Google account in
Conexiones. Do not stop to ask how they want to proceed — start with what you
can read.

For an "informe" or "reporte", finish with \`report\` (headline figures from
\`seo\`, a section per finding, and the change list), plus a \`chart\` of
clicks over time when you have \`dailyClicks\`.

If there is no site, say so and stop the page half. For a business selling on
WhatsApp and Instagram, no site is a valid choice and a bad site is worse than
none.

## page

Score six things, each with what is there now and what it should say:

1. **Does the first screen say what this is?** A visitor should know what is
   sold, to whom, and where, without scrolling. Quote the current first line.
2. **Is the customer's problem named** — in their words, from the archive?
3. **Is there one obvious next step?** One. A page with four buttons has none.
   Say whether the step matches how this business actually sells: if everything
   happens on WhatsApp, the button is WhatsApp.
4. **Is there proof?** Real work, real customers, real numbers.
5. **Are the practical facts findable** — price or price range, area covered,
   hours, how to get in touch? Missing hours is the cheapest fix on the
   internet.
6. **Does it load and work on a phone?** Most of this traffic is a phone.

Then write the replacement copy for the two weakest, not a redesign brief. Use
the customer's own words for the headline.

## search

1. **What the site says now.** From the fetch: title, meta description, H1/H2,
   canonical, indexability (robots), structured data, images without alt, and
   the words that actually appear. web_fetch also reads /robots.txt and
   /sitemap.xml — check both.
2. **What Google already shows it for.** When Google is connected, the \`seo\`
   tool is the real answer: \`overview\` for clicks, impressions, CTR and
   position against the previous window, \`queries\` for the keywords (and
   which grew, dropped or vanished), \`pages\` for the URLs. Terms with many
   impressions and a position between 5 and 20 are the cheapest wins. If \`seo\`
   says Google is not connected, say it is one click in Conexiones and keep
   going with the rest — never ask to be invited by email.
3. **What customers actually type.** inbox and the archive are better than any
   keyword tool here, because they are real people asking for this exact
   service in this exact place. There is no web search on this install, so
   who currently ranks for a term is not something you can check — say so
   instead of guessing.
4. **Group them by intent**, and be honest about which is worth chasing:
   - **Ready to buy** — "[servicio] en [ciudad]", "precio de [servicio]".
     Few searches, almost all of them worth money. Chase these.
   - **Comparing** — "cuál es mejor", "vale la pena".
   - **Learning** — "cómo se hace". Most volume, least money. A small business
     should usually ignore these.
5. **Report at most five terms**, each with: its numbers from \`seo\` when you
   have them, what page this business would need, and whether it is
   realistically winnable. Saying "no
   vas a ganar esta" about a term owned by three national companies is worth
   more than a plan to try.
6. **Say the local thing.** For a business serving one area, the map listing
   and the reviews on it usually move more than anything on the site. If the
   business has one, say so; ask for the Maps link and web_fetch it rather
   than assuming.

## Rules

- Every claim about the current page cites what was actually on it. Quote it.
- Never promise a ranking or a timeframe. Nobody can.
- Never suggest buying links, spinning pages, or stuffing keywords.
- If the honest answer is that the site is fine and the problem is that nobody
  is sending traffic to it, say that instead of finding five small fixes.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
