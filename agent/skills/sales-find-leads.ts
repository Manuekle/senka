import { defineDynamic } from "eve/skills";
import { INTAKE, NO_INVENTION, PIPELINE_NOTE, PLAIN_LANGUAGE, operatorSkill } from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the owner wants new leads found: prospects in a segment, businesses " +
          "in an area, companies matching their best customers, or a list to reach out " +
          "to this week.",
        `# Find leads

Surface businesses worth contacting, score them against what already works in
this account, and save the ones that survive.

## When to use

- "conseguime 20 leads de X", "find me leads in Y".
- "quiénes son como mis mejores clientes".
- "qué empresas hay en [zona] que necesiten esto".

## When NOT to use

- Researching one named company — that is the account research skill.
- Messaging anyone. This skill finds and saves. Sending is a separate decision
  the owner makes.

${INTAKE}

${PIPELINE_NOTE}

## Before searching: learn what good looks like

Never search on the owner's description alone when the account already has
evidence.

1. pipeline action=deals stage=[won] — the customers that closed.
2. pipeline action=contacts — their attributes: city, budget, need, source.
3. From those, write the profile I am about to search against: industry, size,
   location, the need that recurs, and the price band. State it back in one
   sentence and search on it.

If there are fewer than three won deals, there is no pattern to read. Say so
and ask the one question that matters: who is the best customer they ever had,
and why.

## Steps

1. **Confirm the segment and the count.** If either is missing, ask for the
   missing one only. Default to 15 if a count is genuinely not implied.
2. **Source.** There is no web search on this install, so candidates come from
   a list the owner points to: a directory or chamber-of-commerce page, a Maps
   search link, an association's member list, an event's exhibitor page. Ask
   for one such link if none was given (one question). web_fetch it, then
   web_fetch each promising candidate's own site to confirm the business is
   real, still operating, and actually in the segment.
3. **Score each candidate** against the profile from above. Keep only:
   - **good** — matches the profile and shows a reason to talk now.
   - **maybe** — matches the profile, no timing signal.
   Drop the rest and say how many were dropped.
4. **Deduplicate against the CRM.** pipeline action=contacts, and drop anyone
   already there by name, phone, or domain. Report the overlap count — a high
   overlap means the segment is already worked, which is itself useful.
5. **Save the survivors** with upsert_contact, one call each: name, phone or
   email if found publicly, and attributes carrying the city, the need, and the
   trigger. Nothing goes in that did not come from a page I actually read.
6. **Report** the top three inline with why each is worth the call, then the
   count of the rest, then offer the obvious next step: research the top one, or
   draft the outreach.

## Sourcing rules

- Every lead cites where it came from. A lead with no URL behind it is invented
  and does not get saved.
- Public business contact details only: what a company publishes about itself.
  I do not compile personal information about individuals, and I do not go
  looking for private contact details.
- If a search returns nothing usable, I say the segment came up empty and
  suggest a narrower or wider one. I never fill the gap with plausible names.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
