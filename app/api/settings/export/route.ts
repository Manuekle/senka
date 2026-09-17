import { NextResponse, type NextRequest } from "next/server";
import { CREDENTIAL_GROUPS, getStoredCredentials } from "@/lib/credentials";
import { withApiErrors } from "@/lib/api-error";
import { requireOwner } from "@/lib/owner-gate";

// GET /api/settings/export?format=env|json — download everything saved in
// Settings as a file the user can keep or move to another machine.
//
// The file contains real secrets in plain text: that is the point of a backup,
// and GET /api/settings already returns the same values to the same caller, so
// this adds no exposure the app didn't have. The UI says so before the click.
// Which is also why a session alone is no longer enough to ask for one: on a
// multi-account install a session can belong to an account that is not the
// owner's, and this stays owner-only. The owner's own export keeps working
// exactly as before.

export const GET = withApiErrors(async function GET(request: NextRequest) {
  const denied = await requireOwner(request);
  if (denied) return denied;

  const format = new URL(request.url).searchParams.get("format") === "json" ? "json" : "env";
  const stored = await getStoredCredentials();
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    return new NextResponse(JSON.stringify(stored, null, 2) + "\n", {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="senka-config-${stamp}.json"`,
        "cache-control": "no-store",
      },
    });
  }

  // Grouped and commented, so the exported file reads like .env.example
  // rather than an alphabetized dump.
  const lines = [
    "# Senka — configuración exportada",
    `# ${new Date().toISOString()}`,
    "# Contiene credenciales en texto plano. Guardalo en un lugar seguro.",
  ];
  for (const group of CREDENTIAL_GROUPS) {
    const present = group.fields.filter((field) => stored[field.key]);
    if (present.length === 0) continue;
    lines.push("", `# ── ${group.label} ${"─".repeat(Math.max(0, 60 - group.label.length))}`);
    for (const field of present) {
      lines.push(`${field.key}="${stored[field.key]}"`);
    }
  }

  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="senka-config-${stamp}.env"`,
      "cache-control": "no-store",
    },
  });
});
