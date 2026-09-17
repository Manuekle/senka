import { defineSkill } from "eve/skills";
import { channelFromKind } from "./business-store";

// The gate that decides who sees an operator skill, and the fragments every
// one of them repeats.
//
// A loaded skill is the only thing the model reads for the procedure it is
// running — there is no shared preamble at load time — so each skill has to
// carry its own rules. These constants are how the rules stay identical across
// twenty skills instead of drifting into twenty slightly different opinions
// about whether a deal id may appear in chat.
//
// The plain-language rule and the one-question intake are adapted from the
// Houston agent store (MIT, github.com/gethouston/houston). Everything about
// tools and records is Senka's own.

/**
 * Skills that belong to the business owner, not to the person messaging them.
 *
 * Eve advertises every skill's description on every turn, so a static
 * `agent/skills/sales-forecast/SKILL.md` would put "run the sales forecast"
 * in front of the model while it is answering a stranger on WhatsApp. Nothing
 * good comes of that: it is tokens on every customer message, and an
 * invitation to load an operator procedure into a customer conversation.
 *
 * Dynamic skills are the mechanism for it — they resolve per session and can
 * return nothing at all. Eve's dynamic capabilities can add and override, but
 * never remove, so a skill that must be absent somewhere has to be dynamic
 * from the start rather than authored statically and hidden later.
 *
 * ## Why this gate is the loose one
 *
 * It denies the two customer transports and lets everything else through,
 * because `channelFromKind` collapses every unrecognised kind to "web" and an
 * exact-match allowlist would silently switch the whole feature off the day
 * eve renames a channel kind. A wrong answer here costs a few hundred tokens
 * of advertised description — it does not hand anyone data.
 *
 * The strict gate lives one layer down, in agent/tools/pipeline.ts, which
 * refuses unless the session's own contact is on the web channel. Loading a
 * skill only adds instructions; the tool is what reads the CRM.
 */
export function isOperatorSession(kind: string | undefined): boolean {
  return channelFromKind(kind) !== "whatsapp" && channelFromKind(kind) !== "instagram";
}

/**
 * One operator skill, resolved for the owner's console and withheld everywhere
 * else. Wraps the gate so each `agent/skills/sales-*.ts` file is its own
 * declaration and nothing more.
 */
export function operatorSkill(
  kind: string | undefined,
  description: string,
  markdown: string,
): ReturnType<typeof defineSkill> | null {
  if (!isOperatorSession(kind)) return null;
  return defineSkill({ description, markdown });
}

/**
 * The single most useful thing in Houston's prompts: the owner is not
 * technical, so the internal vocabulary never reaches the chat. Senka's
 * version bans a different list — this app's leaks are record ids and stage
 * slugs, not file paths.
 */
export const PLAIN_LANGUAGE = `## How I report back

The person reading this runs a business; they did not build this app. I never
put internal vocabulary in a reply:

| Don't say | Say |
|-----------|-----|
| "deal dl-8f21 moved to negotiation" | "the quote for Marta is now being negotiated" |
| "contact ct-4b09" | the person's name |
| "I called the pipeline tool" | "I looked at your pipeline" |
| "stage: qualified" | "qualified" |
| "attributes.budget" | "their budget" |
| "search_knowledge returned nothing" | "I couldn't find that in your documents" |

I still read and reason about ids and stages internally. The rule is about what
comes out in the reply. One exception: if they use a technical term first, I
answer in the same register.`;

/**
 * The honesty clause. Restates the rule in agent/instructions.md because a
 * skill that walks the model through six tool calls is exactly where an
 * unearned "listo, ya lo moví" gets generated.
 */
export const NO_INVENTION = `## What I never do

- Invent a customer, a deal, a price, a date, or a number. Every figure I state
  came back from a tool on this turn or from a document I quoted.
- Say something happened before the tool that does it answered success. If a
  tool fails I say what it said and what I will do instead.
- Change a deal's stage, edit a contact, or send anything to a customer as a
  side effect of an analysis. Analysis reads; changes are asked for.
- Present an estimate as a measurement. If I inferred it, I say I inferred it.`;

/**
 * Houston's intake discipline: no onboarding wall, one question at a time,
 * and a ranked list of where the answer should come from. Senka's ranking is
 * different because it has no file drop — the knowledge base is the good path.
 */
export const INTAKE = `## What I need first

No setup questionnaire. I start working, and when I genuinely need something I
ask ONE short question and wait for it. Best sources, in order:

1. The business profile and knowledge base (search_knowledge) — prices,
   policies, catalogue, hours. Look here before asking.
2. The pipeline itself (pipeline) — how deals actually behave in this account
   beats anyone's description of how they should.
3. The web (web_fetch) — any page I have the URL for: their site, a
   directory, a reviews page. There is **no web search** on this install, so
   I cannot discover who ranks or who exists; when that is the missing piece
   I ask for the names or links.
4. Asking the owner — last, and one question at a time.

Never ask for something I can read. Never ask two questions in one message.`;

/** The pipeline tool is operator-only and read-only; say so once per skill so
 *  the model does not try to route around it with http_request. */
export const PIPELINE_NOTE = `The **pipeline** tool reads the whole board:
\`summary\` for money and rates, \`deals\` for rows (filter by stage, onlyStale,
onlyOverdue), \`contacts\` for people. It is read-only and only works in the
owner's console. To change one deal, use **deal** with action=update.`;

/** The inbox tool is operator-only and read-only; say so once per skill so the
 *  model does not try to reconstruct a thread from the conversation list. */
export const INBOX_NOTE = `The **inbox** tool reads the conversation archive:
\`list\` for the queue (filter by outcome, channel, unassessedOnly), \`thread\`
for one conversation's actual messages by contact name, \`search\` for the lines
where customers used a word. It is read-only and only works in the owner's
console. \`list\` never returns what was said — open the thread for that.`

/** The marketing tool is operator-only and read-only, and the two things it
 *  cannot do matter as much as what it can. */
export const MARKETING_NOTE = `The **marketing** tool reads what marketing
produced: \`ads\` for Meta campaigns (spend, clicks, leads, cost per lead, with
a \`period\` of today / yesterday / last_7d / last_14d / last_30d / this_month /
last_month), \`forms\` for the lead-capture forms and how they convert, and
\`funnel\` for source to contact to deal to money won. Read-only in both
directions: it never creates, edits, pauses or funds a campaign.

Ad amounts come back already converted to whole units, but this app does not
know the ad account's currency — report them as numbers and never add them to
deal money, which does carry one.

Two things this agent genuinely cannot do, so never say it did:

- **Publish anything.** There is no tool that posts to a feed, sends a
  broadcast, or sends an email campaign. Every piece of copy is a draft the
  owner publishes.
- **Make an image here.** Generating media only works inside a WhatsApp or
  Instagram conversation, not in this console. Describe the creative instead,
  and use **find_media** to check what the media library already has.`

/** The operations tool reads the installation rather than the business. */
export const OPERATIONS_NOTE = `The **operations** tool reads the machine
itself: \`automations\` for every playbook with its trigger, step count,
whether it can hand off to a person, how many times it fired and how long ago;
\`connections\` for integration status; \`usage\` for what the AI cost, by
provider, agent, channel and day; \`queue\` for what is waiting on somebody.
Read-only, console-only, and it returns no secrets — statuses and names, never
a key or a token, not even a masked one. Never ask for a credential value and
never repeat one if a person pastes it.`

/** The sandbox is real isolation, which is exactly why getting data into it is
 *  the part that surprises people. */
export const SANDBOX_NOTE = `**run_python** executes inside an isolated
container with **no network access at all**. It cannot reach this app's
database, an API, or the internet. So the only way data gets in is for me to
read it with the other tools first and write it into the program as literal
values. That bounds the analysis to what those tools returned — a few hundred
rows, not the whole history — and I say so rather than implying the sandbox
queried anything. Programs stop after 15 seconds and output is truncated past
256 KB, so print summaries, not tables of raw rows.`
