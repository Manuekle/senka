# Eve Agent App

This project uses the Eve framework. Before writing code, always read the relevant guide in `node_modules/eve/docs/` and the installed `node_modules/eve/CHANGELOG.md`.

## Skills policy

- The Eve agent's skills live in `agent/skills/` (and each subagent's `agent/subagents/*/skills/`). Only skills that serve the product (marketing, sales, support, operations, media) belong there.
- Do NOT install developer-oriented skills (code audits, security audits, infrastructure/cloud docs, framework tooling) into the agent's skill directories. The agent is a business assistant, not a coding agent.
- To find out whether a skill for some task exists, use the `/find-skills` directory first. Install a third-party skill only when it is genuinely needed, and update `skills-lock.json` with it.
