import { defineTool } from "eve/tools";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { createAutomation } from "../../lib/business-store";
import { workflowStepSchema, toWorkflowSteps } from "../../lib/workflow-schema";
import { assertOwnerConsole, assertToolAllowed } from "../../lib/agent-scope";

export default defineTool({
  description:
    "Draft a new automation (playbook) from what the user describes in this chat. " +
    "It is ALWAYS created as a draft — it never runs and never notifies contacts until " +
    "the business owner reviews it and activates it themselves from the Automations page. " +
    "Use this whenever the user asks for an auto-reply, a keyword trigger, a follow-up, or " +
    "any other automated workflow, instead of just describing how they'd set it up.",
  inputSchema: z.object({
    name: z.string().min(1).describe("Short, human-readable name shown in the Automations list."),
    description: z.string().optional().describe("One sentence explaining what it does."),
    trigger: z.enum(["keyword", "schedule", "new_chat", "no_reply", "webhook"]),
    triggerValue: z
      .string()
      .optional()
      .describe("keyword: comma-separated keywords. schedule: 5-field cron (UTC). no_reply: duration like '30min'. Unused for new_chat and webhook."),
    channel: z.enum(["web", "whatsapp", "instagram", "all"]).default("all"),
    steps: z
      .array(workflowStepSchema)
      .default([])
      .describe(
        "Ordered playbook steps. Can be empty — the agent will freestyle a reply. A 'condition' " +
          "step can carry thenSteps/elseSteps for real branching, shown as a fork on the visual " +
          "flow canvas.",
      ),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
  }),
  async execute({ name, description, trigger, triggerValue, channel, steps }, ctx) {
    await assertOwnerConsole(ctx.session.id);
    await assertToolAllowed(ctx.session.id, "propose_automation");
    const list = await createAutomation({
      name,
      description: description ?? "",
      trigger,
      // A webhook secret must never be model-authored or copied from a
      // keyword. The owner can read it in Automations after reviewing draft.
      triggerValue: trigger === "webhook" ? randomBytes(24).toString("hex") : triggerValue ?? "",
      channel,
      steps: toWorkflowSteps(steps),
    });
    // createAutomation prepends the new automation to the list.
    const created = list[0]!;
    return { id: created.id, name: created.name, status: created.status };
  },
  toModelOutput(output) {
    return {
      type: "text",
      value:
        `Created draft automation "${output.name}" (id: ${output.id}). ` +
        "It is inactive and will stay that way until a human activates it from the Automations page — tell the user to review and approve it there.",
    };
  },
});
