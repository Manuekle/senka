import { defineDynamic } from "eve/skills";
import { INTAKE, NO_INVENTION, PLAIN_LANGUAGE, operatorSkill } from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the owner is losing to a competitor, asks how to answer 'why you " +
          "and not them', or wants a comparison against a specific rival.",
        `# Battlecard

One competitor, one page, written to be used mid-conversation.

## When to use

- "me están comparando con [competidor]".
- "por qué me elegirían a mí y no a ellos".
- After a loss where the reason was a named rival.

## When NOT to use

- General market research with no rival named.
- Writing the actual reply to the customer — that is outreach, which can read
  this first.

${INTAKE}

## Steps

1. **Read their side.** web_fetch the competitor's site: what they sell, their
   published prices, what they claim, who they say it is for. Then web_fetch
   any reviews or news page the owner links. There is no web search here, so
   say what could not be checked.
2. **Read our side.** search_knowledge for this business's own prices, terms,
   guarantees, and delivery times. Both columns must come from documents, or
   the comparison is two opinions.
3. **Check the record.** If any lost deal names this competitor, read the
   recorded reasons. That is the most reliable input on this page.
4. **Write the card:**
   - **Where they genuinely win.** First, and honestly. A battlecard that
     starts with our advantages gets ignored the moment reality contradicts it,
     and the seller stops trusting the whole page.
   - **Where we win**, each backed by something checkable — a price, a term, a
     time.
   - **The three questions** that surface the difference without naming them.
     A seller who asks good questions beats one who runs down a comparison.
   - **What to say when the customer names them.** Two sentences. Never
     disparage; concede the point and move to the difference that matters.
   - **When to walk away.** The customer profile this competitor should win.
     Saying it out loud saves more time than any of the above.

## Rules

- Only public, checkable claims about the competitor. No speculation about
  their finances, their customers, or their internals.
- Every claim carries its source URL. A price found nowhere is not written
  down.
- Prices move. Date the card and say the prices were correct on that date.
- If the honest read is that the competitor is simply better for this segment,
  say it. That is the finding, and the owner can act on it.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
