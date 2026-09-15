import { describe, expect, it } from "vitest";
import { autoMap, buildImport, parseCsv, parseStatus, sampleCsv } from "./csv-import";

describe("parseCsv", () => {
  it("reads quoted fields with delimiters, escaped quotes and line breaks", () => {
    const table = parseCsv('﻿name,notes\r\n"Díaz, Bruno","Dijo ""hola""\nel lunes"\r\n\r\nAna,ok');
    expect(table.headers).toEqual(["name", "notes"]);
    expect(table.rows).toEqual([["Díaz, Bruno", 'Dijo "hola"\nel lunes'], ["Ana", "ok"]]);
  });

  it("sniffs semicolons from Excel exports and pads short rows", () => {
    const table = parseCsv("Nombre;Apellido;Correo\nAna;Pérez;ana@x.com\nBruno");
    expect(table.headers).toEqual(["Nombre", "Apellido", "Correo"]);
    expect(table.rows[1]).toEqual(["Bruno", "", ""]);
  });

  it("names blank headers by position", () => {
    expect(parseCsv("email,\na@b.co,x").headers).toEqual(["email", "#2"]);
  });
});

describe("autoMap", () => {
  it("recognises Spanish and English headers, accents and spacing", () => {
    expect(autoMap(["Correo electrónico", "Teléfono", "Nombre completo", "Estado", "Empresa"]))
      .toEqual(["email", "phone", "name", "status", "attribute"]);
  });

  it("treats Nombre as a first name only when a surname column exists", () => {
    expect(autoMap(["Nombre", "Apellido"])).toEqual(["first_name", "last_name"]);
    expect(autoMap(["Nombre", "Email"])).toEqual(["name", "email"]);
  });

  it("ignores the columns of our own export and never maps a field twice", () => {
    expect(autoMap(["id", "name", "phone", "email", "channel", "status", "source", "createdAt", "Celular"]))
      .toEqual(["ignore", "name", "phone", "email", "ignore", "status", "ignore", "ignore", "attribute"]);
  });
});

describe("buildImport", () => {
  it("counts invalid rows and in-file duplicates by email or phone", () => {
    const table = parseCsv([
      "email,phone,first,last,status,company",
      "ANA@x.com,,Ana,Pérez,cerrado,Norte",
      "ana@x.com,+54 11 5555-0101,,,,",
      ",11 5555 0101,Bruno,,,",
      "no-es-email,,Carla,,,",
      ",123,Dani,,,",
      ",(011) 5555-0102,Eva,,seguimiento,",
    ].join("\n"));
    const preview = buildImport(table, ["email", "phone", "first_name", "last_name", "status", "attribute"]);
    expect(preview.total).toBe(6);
    expect(preview.invalid).toBe(2);
    expect(preview.duplicates).toBe(1);
    expect(preview.contacts).toEqual([
      { email: "ana@x.com", name: "Ana Pérez", status: "closed", attributes: { company: "Norte" } },
      { phone: "1155550101", name: "Bruno", attributes: {} },
      { phone: "01155550102", name: "Eva", status: "followup_due", attributes: {} },
    ]);
    expect(preview.byStatus).toEqual({ closed: 1, open: 1, followup_due: 1 });
  });

  it("imports the downloadable sample as three valid contacts", () => {
    const table = parseCsv(sampleCsv());
    const preview = buildImport(table, autoMap(table.headers));
    expect(preview.contacts).toHaveLength(3);
    expect(preview.contacts[2].notes).toBe("Compró el plan anual, pagó con tarjeta");
  });

  it("maps status labels regardless of case and accents", () => {
    expect(parseStatus("  Seguimiento ")).toBe("followup_due");
    expect(parseStatus("Won")).toBe("closed");
    expect(parseStatus("vip")).toBeUndefined();
  });
});
