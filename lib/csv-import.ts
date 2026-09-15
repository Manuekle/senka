import type { ContactStatus } from "./types";

// Contact import from a spreadsheet export.
//
// Everything here runs in the browser, before a single row reaches the server:
// the person importing needs to see what their file turns into — how many rows
// are usable, which ones repeat, which column became the phone — while they can
// still fix the mapping. The server re-validates what it receives; this module
// is about showing the truth early, not about trusting the client.
//
// Excel in Spanish-speaking locales saves "CSV" with semicolons, and Google
// Sheets with commas, so the delimiter is sniffed rather than assumed.

export const CSV_MAX_BYTES = 5 * 1024 * 1024;
export const CSV_MAX_ROWS = 2000;

export type CsvTable = {
  readonly headers: string[];
  readonly rows: string[][];
};

export type ContactField =
  | "email"
  | "phone"
  | "name"
  | "first_name"
  | "last_name"
  | "status"
  | "notes"
  | "attribute"
  | "ignore";

export const CONTACT_FIELDS: readonly ContactField[] = [
  "email", "phone", "name", "first_name", "last_name", "status", "notes", "attribute", "ignore",
];

/** Fields a contact has one of. A second column claiming one is a mistake. */
export const UNIQUE_FIELDS: ReadonlySet<ContactField> = new Set([
  "email", "phone", "name", "first_name", "last_name", "status", "notes",
]);

export type ImportContact = {
  name?: string;
  email?: string;
  phone?: string;
  status?: ContactStatus;
  notes?: string;
  attributes: Record<string, string>;
};

export type ImportPreview = {
  readonly contacts: ImportContact[];
  /** Rows with neither a valid email nor a usable phone. */
  readonly invalid: number;
  /** Rows whose email or phone already appeared higher up in the file. */
  readonly duplicates: number;
  readonly total: number;
  readonly byStatus: Partial<Record<ContactStatus, number>>;
};

function sniffDelimiter(text: string): string {
  const counts = new Map([[",", 0], [";", 0], ["\t", 0]]);
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) break;
    else if (!quoted && counts.has(char)) counts.set(char, counts.get(char)! + 1);
  }
  let best = ",";
  for (const [delimiter, count] of counts) if (count > counts.get(best)!) best = delimiter;
  return best;
}

/** RFC 4180, plus the dialects real exports produce: a BOM, CRLF or bare CR
 *  line ends, and `;` or tab separators. Blank lines are dropped. */
export function parseCsv(input: string): CsvTable {
  const text = input.replace(/^﻿/, "");
  const delimiter = sniffDelimiter(text);
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  const endField = () => { record.push(field); field = ""; };
  const endRecord = () => {
    endField();
    if (record.some((value) => value.trim() !== "")) records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') { field += '"'; i += 1; }
      else quoted = false;
    } else if (char === '"' && field === "") {
      quoted = true;
    } else if (char === delimiter) {
      endField();
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      endRecord();
    } else {
      field += char;
    }
  }
  if (field !== "" || record.length > 0) endRecord();

  const [head = [], ...body] = records;
  const headers = head.map((header, index) => header.trim() || `#${index + 1}`);
  const rows = body.map((row) => headers.map((_, index) => (row[index] ?? "").trim()));
  return { headers, rows };
}

/** "Correo electrónico" and "correo_electronico" are the same header. */
function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const SYNONYMS: Record<Exclude<ContactField, "attribute">, readonly string[]> = {
  email: ["email", "e_mail", "mail", "correo", "correo_electronico", "email_address", "direccion_de_correo"],
  phone: ["phone", "phone_number", "telefono", "tel", "celular", "cel", "movil", "mobile", "whatsapp", "numero", "numero_de_telefono"],
  name: ["name", "full_name", "nombre_completo", "contacto", "contact", "cliente"],
  first_name: ["first_name", "firstname", "given_name", "nombres"],
  last_name: ["last_name", "lastname", "surname", "family_name", "apellido", "apellidos"],
  status: ["status", "estado", "etapa", "stage"],
  notes: ["notes", "note", "notas", "nota", "comentarios", "comentario", "observaciones"],
  // Our own CSV export carries these. Re-importing it should not turn a
  // contact id or a timestamp into a custom attribute on every contact.
  ignore: ["id", "created_at", "createdat", "updated_at", "channel", "canal", "source", "origen"],
};

function guessField(header: string): ContactField {
  const key = normalizeKey(header);
  for (const [field, names] of Object.entries(SYNONYMS) as [ContactField, readonly string[]][]) {
    if (names.includes(key)) return field;
  }
  return "attribute";
}

/** One field per column, best guess first. "Nombre" is a first name when the
 *  file also has a surname column, and a full name when it does not. */
export function autoMap(headers: readonly string[]): ContactField[] {
  const guesses = headers.map(guessField);
  const hasLastName = guesses.includes("last_name");
  const taken = new Set<ContactField>();
  return headers.map((header, index) => {
    let field = guesses[index];
    const key = normalizeKey(header);
    if (field === "attribute" && (key === "nombre" || key === "name")) field = hasLastName ? "first_name" : "name";
    if (UNIQUE_FIELDS.has(field)) {
      if (taken.has(field)) return "attribute";
      taken.add(field);
    }
    return field;
  });
}

/** Shared with the import route, so a row the preview counted as valid is never
 *  the one that makes the server reject the whole batch. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_PATTERN = /^\+?\d{6,15}$/;

function cleanPhone(value: string): string | undefined {
  const compact = value.replace(/[\s().-]/g, "");
  return PHONE_PATTERN.test(compact) ? compact : undefined;
}

const STATUS_VALUES: Record<string, ContactStatus> = {
  open: "open", abierto: "open", nuevo: "open", new: "open", activo: "open", lead: "open",
  waiting_human: "waiting_human", esperando: "waiting_human", esperando_humano: "waiting_human", humano: "waiting_human",
  followup_due: "followup_due", follow_up: "followup_due", followup: "followup_due", seguimiento: "followup_due",
  closed: "closed", cerrado: "closed", ganado: "closed", won: "closed", perdido: "closed", lost: "closed",
};

export function parseStatus(value: string): ContactStatus | undefined {
  return STATUS_VALUES[normalizeKey(value)];
}

/** Turns the table into what the server will receive, counting what it drops. */
export function buildImport(table: CsvTable, mapping: readonly ContactField[]): ImportPreview {
  const contacts: ImportContact[] = [];
  const seen = new Set<string>();
  const byStatus: Partial<Record<ContactStatus, number>> = {};
  let invalid = 0;
  let duplicates = 0;

  for (const row of table.rows) {
    const contact: ImportContact = { attributes: {} };
    let first = "";
    let last = "";
    mapping.forEach((field, column) => {
      const value = row[column] ?? "";
      if (!value) return;
      switch (field) {
        case "email": if (EMAIL_PATTERN.test(value)) contact.email = value.toLowerCase().slice(0, 254); break;
        case "phone": contact.phone = cleanPhone(value); break;
        case "name": contact.name = value.slice(0, 120); break;
        case "first_name": first = value; break;
        case "last_name": last = value; break;
        case "status": contact.status = parseStatus(value); break;
        case "notes": contact.notes = value.slice(0, 2000); break;
        case "attribute":
          if (Object.keys(contact.attributes).length < 30) {
            contact.attributes[table.headers[column].slice(0, 60)] = value.slice(0, 500);
          }
          break;
        case "ignore": break;
      }
    });
    if (!contact.name && (first || last)) contact.name = `${first} ${last}`.trim().slice(0, 120);

    if (!contact.email && !contact.phone) { invalid += 1; continue; }
    const keys = [contact.email && `e:${contact.email}`, contact.phone && `p:${contact.phone}`].filter(Boolean) as string[];
    if (keys.some((key) => seen.has(key))) { duplicates += 1; continue; }
    for (const key of keys) seen.add(key);

    contacts.push(contact);
    const status = contact.status ?? "open";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }

  return { contacts, invalid, duplicates, total: table.rows.length, byStatus };
}

export function sampleCsv(): string {
  return [
    "name,email,phone,status,notes,company",
    "Ana Pérez,ana@ejemplo.com,+54 9 11 5555-0101,open,Pidió presupuesto,Estudio Norte",
    "Bruno Díaz,bruno@ejemplo.com,+52 55 5555 0102,followup_due,Llamar el lunes,Díaz & Asociados",
    'Carla Gómez,,+34 600 555 103,closed,"Compró el plan anual, pagó con tarjeta",Gómez Retail',
  ].join("\r\n");
}
