import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { activeServers } from "../../lib/mcp-store";
import { probeMcpServer } from "../../lib/mcp-client";

// The owner's MCP servers, as tools.
//
// Eve has a first-class MCP form — `defineMcpClientConnection` in
// agent/connections/*.ts — and it is the better one whenever the server is
// known at build time. It is not usable here, because these servers are not:
// they are rows somebody added in Conexiones this afternoon, and connections
// are resolved from files when the agent compiles. Eve's dynamic form covers
// models, tools, skills and instructions, not connections, so a
// runtime-configured server reaches the model as a *tool* instead.
//
// One tool per server rather than one tool for all of them. The description
// is what the model routes on, and a single `mcp` tool would have to describe
// every connected service in one paragraph — which is how you get a model
// that never calls it. `mcp_notion` with Notion's own description is a tool
// the model can pick.
//
// Each tool exposes two actions: `tools` to see what the server offers and
// `call` to run one. The remote schema is not lowered into this tool's own
// input schema on purpose — it is published by a server we do not own, can
// change between turns, and would have to be re-validated locally anyway. The
// model reads the schema from `tools` and passes arguments straight through.

// Resolved per turn rather than per session: an owner who adds a server in
// Conexiones and comes back to the same chat expects the next message to see
// it — the connections brief in agent/instructions/connections.ts already
// lists it, and a listed server with no tool behind it reads as broken.
export default defineDynamic({
  events: {
    "turn.started": async () => {
      const servers = await activeServers();
      if (servers.length === 0) return null;

      return Object.fromEntries(
        servers.map((server) => [
          `mcp_${server.slug}`,
          defineTool({
            description:
              `${server.description || server.name} (servidor MCP conectado). ` +
              `Llamá primero con action="tools" para ver qué herramientas ofrece y con qué ` +
              `argumentos, después con action="call" pasando tool y arguments. ` +
              `Si el servidor falla, decilo — no inventes el resultado.`,
            inputSchema: z.object({
              action: z.enum(["tools", "call"]),
              tool: z.string().optional().describe("Nombre de la herramienta remota, para action=call."),
              arguments: z
                .record(z.string(), z.unknown())
                .optional()
                .describe("Argumentos de la herramienta remota, según el schema que devuelve action=tools."),
            }),
            outputSchema: z.object({
              success: z.boolean(),
              server: z.string(),
              tools: z
                .array(
                  z.object({
                    name: z.string(),
                    description: z.string().optional(),
                    inputSchema: z.string().optional(),
                  }),
                )
                .optional(),
              result: z.string().optional(),
              message: z.string(),
            }),
            // Inline, and it has to stay inline: eve's bundler reconstructs
            // `execute` from its closure across step boundaries, and a
            // reference to a hoisted function does not survive replay.
            // See node_modules/eve/docs/guides/dynamic-capabilities.md.
            async execute(input) {
              // Re-read the server inside the call rather than closing over
              // the record: the token may have been rotated, or the server
              // disabled, since the session started.
              const { activeServers: readServers } = await import("../../lib/mcp-store");
              const current = (await readServers()).find((entry) => entry.id === server.id);
              if (!current) {
                return {
                  success: false,
                  server: server.name,
                  message: `El servidor ${server.name} ya no está conectado.`,
                };
              }

              if (input.action === "tools") {
                const probe = await probeMcpServer(current);
                if (!probe.ok) {
                  return {
                    success: false,
                    server: current.name,
                    message: `No pude conectarme a ${current.name}: ${probe.error ?? "error desconocido"}.`,
                  };
                }
                return {
                  success: true,
                  server: current.name,
                  tools: probe.tools.map((tool) => ({
                    name: tool.name,
                    ...(tool.description ? { description: tool.description } : {}),
                    ...(tool.inputSchema
                      ? { inputSchema: JSON.stringify(tool.inputSchema).slice(0, 2000) }
                      : {}),
                  })),
                  message: `${probe.tools.length} herramienta(s) disponibles en ${current.name}.`,
                };
              }

              if (!input.tool) {
                return {
                  success: false,
                  server: current.name,
                  message: "Falta `tool`. Pedí primero action=tools.",
                };
              }

              const { callMcpTool } = await import("../../lib/mcp-client");
              const result = await callMcpTool(current, input.tool, input.arguments ?? {});
              if (!result.ok) {
                return {
                  success: false,
                  server: current.name,
                  message: `${current.name} rechazó ${input.tool}: ${result.error ?? "error desconocido"}.`,
                };
              }
              return {
                success: !result.isError,
                server: current.name,
                result: result.text.slice(0, 8000),
                message: result.isError
                  ? `${input.tool} devolvió un error.`
                  : `${input.tool} respondió.`,
              };
            },
          }),
        ]),
      );
    },
  },
});
