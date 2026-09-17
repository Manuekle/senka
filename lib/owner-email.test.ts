import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The owner question the owner-only routes hinge on. The explicit
 * `STEVE_OWNER_EMAIL` answer is the one these tests exercise directly: the
 * file and database branches depend on where the install happens, and the
 * module is written so that this one variable short-circuits both.
 */

/** What the mocked `readFileSync` serves — set per test, before any import
 *  of ./owner-email, because vi.mock factories are hoisted and cannot close
 *  over plain locals. */
const authFile = vi.hoisted(() => ({ content: undefined as string | Error | undefined }));

vi.mock("node:fs", () => ({
  readFileSync: () => {
    const value = authFile.content;
    if (typeof value === "string") return value;
    throw value instanceof Error ? value : new Error("ENOENT");
  },
}));

const savedOwner = process.env.STEVE_OWNER_EMAIL;
const savedPostgres = process.env.WORKFLOW_POSTGRES_URL;

beforeEach(() => {
  delete process.env.STEVE_OWNER_EMAIL;
  delete process.env.WORKFLOW_POSTGRES_URL;
  authFile.content = undefined;
});

afterEach(() => {
  if (savedOwner === undefined) delete process.env.STEVE_OWNER_EMAIL;
  else process.env.STEVE_OWNER_EMAIL = savedOwner;
  if (savedPostgres === undefined) delete process.env.WORKFLOW_POSTGRES_URL;
  else process.env.WORKFLOW_POSTGRES_URL = savedPostgres;
  vi.restoreAllMocks();
});

describe("isOwnerEmail — explicit owner", () => {
  it("answers yes for the owner, in any casing or padding", async () => {
    process.env.STEVE_OWNER_EMAIL = "Owner@Example.com";
    const { isOwnerEmail } = await import("./owner-email");
    expect(isOwnerEmail("  owner@example.com ")).toBe(true);
  });

  it("answers no for anybody else — and for nothing at all", async () => {
    process.env.STEVE_OWNER_EMAIL = "owner@example.com";
    const { isOwnerEmail } = await import("./owner-email");
    expect(isOwnerEmail("colleague@example.com")).toBe(false);
    expect(isOwnerEmail(undefined)).toBe(false);
    expect(isOwnerEmail("")).toBe(false);
  });

  it("fails closed with no answer configured", async () => {
    const { isOwnerEmail } = await import("./owner-email");
    expect(isOwnerEmail("owner@example.com")).toBe(false);
  });
});

describe("isOwnerEmail — file backend", () => {
  it("reads the first account of ~/.senka/auth.json", async () => {
    authFile.content = JSON.stringify({
      accounts: [
        { email: "owner@example.com", hash: "x", salt: "y" },
        { email: "second@example.com", hash: "x", salt: "y" },
      ],
    });
    const { isOwnerEmail } = await import("./owner-email");
    expect(isOwnerEmail("OWNER@example.com")).toBe(true);
    expect(isOwnerEmail("second@example.com")).toBe(false);
  });

  it("honours the legacy single-owner shape", async () => {
    authFile.content = JSON.stringify({ owner: { email: "legacy@example.com" }, sessions: [] });
    const { isOwnerEmail } = await import("./owner-email");
    expect(isOwnerEmail("legacy@example.com")).toBe(true);
  });

  it("fails closed when the file is unreadable", async () => {
    authFile.content = new Error("ENOENT");
    const { isOwnerEmail } = await import("./owner-email");
    expect(isOwnerEmail("owner@example.com")).toBe(false);
  });
});