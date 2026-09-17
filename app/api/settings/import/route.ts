import { NextResponse, type NextRequest } from "next/server";
import {
  CREDENTIAL_GROUPS,
  saveCredentials,
  type CredentialKey,
  type CredentialStore,
} from "@/lib/credentials";
import { parseConfigFile } from "@/lib/env-file";
import { apiError, apiErrorBody, missingField, withApiErrors } from "@/lib/api-error";
import { requireOwner } from "@/lib/owner-gate";

// POST /api/settings/import — take a .env or JSON file the user already has
// and load the values into the credential store.
//
// Accepts a multipart upload (field "file") or a JSON body { content }, so the
// same endpoint serves the drop zone and a pasted block of text.

export const maxDuration = 60;

const KNOWN_KEYS = new Set<string>(
  CREDENTIAL_GROUPS.flatMap((group) => group.fields.map((field) => field.key)),
);

export const POST = withApiErrors(async function POST(request: NextRequest) {
  // Import replaces credential values wholesale — write access to the same
  // secrets the export above reads, so the same gate.
  const denied = await requireOwner(request);
  if (denied) return denied;

  let text = "";

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return apiError("no_file");
    }
    if (file.size > 512 * 1024) {
      return apiError("too_large");
    }
    text = await file.text();
  } else {
    let body: { content?: unknown };
    try {
      body = await request.json();
    } catch {
      return apiError("invalid_json");
    }
    if (typeof body.content !== "string") {
      return missingField("content");
    }
    text = body.content;
  }

  const parsed = parseConfigFile(text);
  const updates: CredentialStore = {};
  const applied: string[] = [];
  const ignored: string[] = [];

  for (const [key, value] of Object.entries(parsed)) {
    if (!KNOWN_KEYS.has(key)) {
      ignored.push(key);
      continue;
    }
    // An empty value in an imported file means "not configured", not "delete
    // what I already have" — importing a half-filled .env.example should never
    // wipe working credentials.
    if (value === "") continue;
    updates[key as CredentialKey] = value;
    applied.push(key);
  }

  if (applied.length === 0) {
    return NextResponse.json(
      { ...apiErrorBody("no_recognized_keys"), ignored },
      { status: 422 },
    );
  }

  await saveCredentials(updates);
  return NextResponse.json({ ok: true, applied, ignored });
});
