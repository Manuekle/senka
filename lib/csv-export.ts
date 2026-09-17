/**
 * Shared CSV export helpers.
 *
 * Every export used to quote its own cells, and the inbox's did not guard
 * them at all — a contact whose name began with `=` opened in a spreadsheet
 * as a formula. One function now builds every cell, for every export: quote,
 * double the quotes, and neutralise the four first characters a spreadsheet
 * will interpret as a formula (`=`, `+`, `@`, and `-` after a line break,
 * where Excel starts evaluating again). The apostrophe prefix is what a
 * spreadsheet itself writes when a user types a literal formula; it is the
 * one marker both Excel and Google Sheets skip on open.
 */

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+@]/.test(text) || /^\t/.test(text) || /^(?:\r\n|\r|\n)-/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

/** A whole export: one row of cells per line, CRLF endings, and the BOM Excel
 *  needs before it will read the file as UTF-8. */
export function csvFile(header: string, rows: readonly string[][]): Blob {
  const lines = rows.map((cells) => cells.join(","));
  return new Blob(["\uFEFF", header, lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
}