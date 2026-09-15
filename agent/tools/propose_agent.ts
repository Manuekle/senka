import { defineTool } from "eve/tools";
import { z } from "zod";
import { createAgent } from "../../lib/business-store";
import { composePrompt, normalizeBrief } from "../../lib/agent-brief";
import { assertOwnerConsole } from "../../lib/agent-scope";

const CAPABILITIES = [
  "contacts",
  "deals",
  "handoff",
  "knowledge",
  "media",
  "calendar",
  "sheets",
  "reminders",
  "payments",
  "shopify",
  "http",
  "automations",
  "code",
] as const;

const optionalText = z.string().max(600).optional().default("");

/**
 * Create a complete agent from the owner's normal-language request. It is a
 * draft because assigning it to a customer channel is a separate decision;
 * creation through chat must never replace the agent currently answering.
 */
export default defineTool({
  description:
    "Create a new AI agent for the business owner from this chat. Use when the owner explicitly asks to create an agent, assistant, receptionist, sales or support bot. It always creates a complete DRAFT for review and never assigns or activates it.",
  inputSchema: z.object({
    name: z.string().trim().min(2).max(80).describe("Short agent name shown in Mis Agentes."),
    description: z.string().trim().min(2).max(280).describe("One line explaining what the agent does."),
    role: z.string().trim().min(2).max(600).describe("The agent's job."),
    goal: z.string().trim().min(2).max(600).describe("What a successful conversation achieves."),
    audience: optionalText.describe("Who the agent speaks with."),
    tone: optionalText.describe("How the agent should sound."),
    language: z.enum(["auto", "es", "en", "pt", "fr", "it", "de"]).default("auto"),
    greeting: optionalText.describe("Opening message when it starts the conversation."),
    rules: z.array(z.string().trim().min(1).max(500)).max(12).default([]),
    avoid: z.array(z.string().trim().min(1).max(500)).max(12).default([]),
    handoff: z.string().trim().min(2).max(600).describe("Exactly when it must hand the conversation to a person."),
    capabilities: z.array(z.enum(CAPABILITIES)).max(CAPABILITIES.length).default(["handoff"])
      .describe("Complete capability list. Always include handoff; only include sensitive capabilities when the owner explicitly requested them."),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    status: z.literal("draft"),
    href: z.string(),
  }),
  async execute(input, ctx) {
    await assertOwnerConsole(ctx.session.id);
    const capabilities = [...new Set(["handoff", ...input.capabilities])];
    const brief = normalizeBrief({
      role: input.role,
      goal: input.goal,
      audience: input.audience,
      tone: input.tone,
      language: input.language,
      greeting: input.greeting,
      rules: input.rules,
      avoid: input.avoid,
      handoff: input.handoff,
    });
    const agent = await createAgent({
      name: input.name,
      description: input.description,
      systemPrompt: composePrompt(brief),
      tools: capabilities,
      brief,
      status: "draft",
    });
    return { id: agent.id, name: agent.name, status: "draft" as const, href: `/agents/${agent.id}` };
  },
  toModelOutput(output) {
    return {
      type: "text",
      value:
        `Created draft agent "${output.name}" (id: ${output.id}). ` +
        `It is not active or assigned to customers. Tell the owner to review it in ${output.href} and activate it when ready.`,
    };
  },
});
