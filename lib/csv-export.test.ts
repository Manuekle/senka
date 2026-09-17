import { describe, expect, it } from "vitest";
import { csvCell, csvFile } from "./csv-export";

/**
 * The formula-injection guard every export shares. A contact whose name
 * begins with `=`, `+`, `@` or a line-break hyphen used to open in a
 * spreadsheet as a formula — the CSV injection the audit confirmed on the
 * inbox export. The apostrophe prefix is what a spreadsheet itself writes
 * for a literal formula, so both Excel and Google Sheets skip it on open.
 */
describe("csvCell", () => {
  it("quotes plain values and doubles embedded quotes", () => {
    expect(csvCell("Ana Pérez")).toBe('"Ana Pérez"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("neutralises the characters a spreadsheet evaluates", () => {
    expect(csvCell("=cmd|' /C calc'!A0")).toBe('"\'=cmd|\' /C calc\'!A0"');
    expect(csvCell("+15000")).toBe('"\'+15000"');
    expect(csvCell("@import_all")).toBe('"\'@import_all"');
    expect(csvCell("\tTabbed")).toBe('"\'\tTabbed"');
    expect(csvCell("\r\n-1")).toBe('"\'\r\n-1"');
  });

  it("leaves an interior hyphen alone", () => {
    expect(csvCell("hello -world")).toBe('"hello -world"');
  });

  it("renders nothing for null and undefined", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });
});

describe("csvFile", () => {
  it("carries the BOM Excel needs and CRLF line endings", async () => {
    const blob = csvFile("id,name\r\n", [["a-1", "Ana", "Ana 2"]]);
    // The bytes, not text(): Blob.text() decodes as UTF-8 and strips the BOM
    // it finds — Excel reads the bytes, so the bytes are what get checked.
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = await blob.text();
    expect(text).toContain("id,name\r\na-1,Ana,Ana 2");
  });
});