import { sharedPool } from "./postgres-pool";
import type { Pool } from "pg";

/**
 * PostgreSQL backing for the app's JSON stores.
 *
 * Documents, not schemas. Every one of these stores was a JSON file that its
 * module read whole, mutated in memory, and wrote back — business.json,
 * connections.json, credentials.json — and their call sites are written that
 * way throughout. Keeping one `jsonb` document per store preserves all of them
 * unchanged; normalising contacts, chats, automations, tokens and keys into
 * tables would be a rewrite of every module at once, and the shapes are still
 * moving.
 *
 * What it does buy, beyond surviving a read-only filesystem: `updateDocument`
 * takes a row lock, so two processes can no longer read the same document,
 * mutate their own copies, and have the second write erase the first. The file
 * mode's per-module `writeQueue` only ever serialised writes inside one
 * process — the Eve runtime and Next.js each had their own.
 *
 * Sized for the workload it actually has: one business, and stores of
 * kilobytes. If a single install ever grows past what is reasonable to read
 * and write whole, that is the signal to normalise, not this file's job to
 * pre-empt.
 *
 * Documents hold live secrets (OAuth tokens, API keys), exactly as the 0600
 * files they replace did. The database is the trust boundary: give this
 * connection string the access you would give that file.
 */

/** One row per store. Add a member when a module moves off its JSON file. */
export type DocumentId =
  | "business"
  | "connections"
  | "credentials"
  | "knowledge"
  | "media"
  | "business-profile"
  | "payments"
  | "onboarding"
  | "model-access"
  | "email-templates"
  | "license"
  | "installation"
  | "chat-models"
  | "seo"
  | "businesses"
  | "workspace-purchases"
  | "session-workspaces"
  | "phone-numbers"
  | "agent-skills"
  | "mcp-servers"
  | "runtime";

let schemaReady: Promise<void> | undefined;

function getPool(): Pool {
  // One pool for the whole process — see lib/postgres-pool.ts. This module
  // used to build its own, as did three others, and four pools against one
  // database exhausted Supabase's session-pooler client cap in production.
  return sharedPool();
}

const SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS senka;

CREATE TABLE IF NOT EXISTS senka.documents (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((error: unknown) => {
        // Let the next call retry: a pool that came up before the database was
        // ready would otherwise cache the failure for the life of the process.
        schemaReady = undefined;
        throw error;
      });
  }
  await schemaReady;
}

/**
 * A document's row key.
 *
 * The business-owned stores are keyed per business (see lib/business-scope.ts),
 * and the first business keeps the bare id so an install that predates
 * multi-business finds its rows exactly where it left them.
 */
export type StoredDocumentId = DocumentId | `${DocumentId}::${string}`;

/** Whether this database already holds the document. Used to decide between
 *  DB and file mode, and to decide whether a file needs migrating in. */
export async function hasDocument(id: StoredDocumentId): Promise<boolean> {
  await ensureSchema();
  const result = await getPool().query("SELECT 1 FROM senka.documents WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

/** The stored document, or `null` when this install has never written one. */
export async function readDocument<T>(id: StoredDocumentId): Promise<T | null> {
  await ensureSchema();
  const result = await getPool().query<{ data: T }>(
    "SELECT data FROM senka.documents WHERE id = $1",
    [id],
  );
  return result.rows[0]?.data ?? null;
}

/**
 * Read, mutate and write the document under a row lock.
 *
 * `fn` is the same synchronous mutator the file store takes, so a caller
 * cannot tell which backend it is running against. The lock is held for the
 * duration of the transaction, which is one round trip plus whatever `fn`
 * does in memory.
 */
export async function updateDocument<TStore, TResult>(
  id: StoredDocumentId,
  /** Turns the stored row — or `null`, on a document that does not exist yet —
   *  into the object the mutator works on, filling in whatever an older
   *  version did not write. Its return value is what gets written back, so a
   *  `load` that builds a new object keeps the mutations made to it. */
  load: (raw: Partial<TStore> | null) => TStore,
  fn: (store: TStore) => TResult,
): Promise<TResult> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // The insert makes the row exist so `FOR UPDATE` has something to lock;
    // ON CONFLICT DO NOTHING keeps a concurrent first write from failing here.
    await client.query(
      "INSERT INTO senka.documents (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING",
      [id, JSON.stringify(load(null))],
    );
    const locked = await client.query<{ data: Partial<TStore> }>(
      "SELECT data FROM senka.documents WHERE id = $1 FOR UPDATE",
      [id],
    );
    const store = load(locked.rows[0]?.data ?? null);
    const result = fn(store);
    await client.query(
      "UPDATE senka.documents SET data = $2::jsonb, updated_at = now() WHERE id = $1",
      [id, JSON.stringify(store)],
    );
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Seed the database from a file store, once, on the first DB access.
 *
 * Does nothing when a document already exists: the database is the source of
 * truth from that point on, and re-importing a stale file would silently undo
 * everything written since.
 */
export async function migrateFromFileStore<T>(id: StoredDocumentId, store: T): Promise<void> {
  await ensureSchema();
  await getPool().query(
    "INSERT INTO senka.documents (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING",
    [id, JSON.stringify(store)],
  );
}

// ── The routing every store repeats ───────────────────────────────

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type DocumentStore<T> = {
  /** The document, normalized, from whichever backend is active. */
  read(): Promise<T>;
  /** Read, mutate and write. On Postgres the row lock serialises across
   *  processes; on the file, an in-process queue is all there is. */
  update<R>(fn: (store: T) => R): Promise<R>;
  /** Whether this process resolved to Postgres. For messages, not logic. */
  usingDatabase(): Promise<boolean>;
};

/**
 * A store that lives in Postgres when one is configured and in a JSON file
 * otherwise.
 *
 * Thirteen modules were each their own copy of this: read the file, parse it,
 * fill in the keys a older version did not write, mutate, write a temp file,
 * rename. The differences between those copies were accidents, not decisions,
 * and every one of them had to grow the same database branch. This is that
 * branch, written once.
 *
 * Behaviour, the same for all of them:
 *
 *   - No WORKFLOW_POSTGRES_URL: the file, exactly as before.
 *   - With one: Postgres, and on the first access an existing file is
 *     imported once. The database is the source of truth from then on, so a
 *     stale file can never overwrite it later.
 *   - Database unreachable: keep serving the file rather than reporting an
 *     empty store, and retry on the next call rather than caching the outage.
 */
export function createDocumentStore<T>(options: {
  readonly id: DocumentId;
  readonly file: string;
  readonly empty: () => T;
  /** Fills in whatever an older version of the document did not write. */
  readonly normalize: (parsed: Partial<T>) => T;
  /** File mode only. 0o600 for anything holding a secret. */
  readonly fileMode?: number;
  /**
   * Owned by one business rather than by the installation, so the row key and
   * the file path carry the active business — see lib/business-scope.ts.
   *
   * Off by default, and deliberately: the account, the provider keys and the
   * plan belong to the install, and scoping one of those by accident would
   * ask an owner to set it up again for every shop they added.
   */
  readonly scoped?: boolean;
  /** Transactions that must never silently fall back to a separate file. */
  readonly requireDatabase?: boolean;
}): DocumentStore<T> {
  let dbMode: boolean | null = null;
  let writeQueue: Promise<unknown> = Promise.resolve();
  /** Scopes whose file has already been considered for migration. Per scope,
   *  not per store: a second business starts with no row and no file, and
   *  must not import the first one's. */
  const migrated = new Set<string>();

  /** Which row and which file this call is about. */
  async function target(): Promise<{ id: StoredDocumentId; file: string }> {
    if (!options.scoped) return { id: options.id, file: options.file };
    // Imported lazily so the scope module can build its own registry store
    // through this factory without an import cycle.
    const { scopedDocumentId, scopedFile } = await import("./business-scope");
    return {
      id: (await scopedDocumentId(options.id)) as StoredDocumentId,
      file: await scopedFile(options.file),
    };
  }

  async function readFileStore(file: string): Promise<T | null> {
    try {
      const raw = await readFile(file, "utf-8");
      return options.normalize(JSON.parse(raw) as Partial<T>);
    } catch {
      return null;
    }
  }

  async function writeFileStore(file: string, store: T): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(store, null, 2) + "\n", {
      encoding: "utf-8",
      ...(options.fileMode === undefined ? {} : { mode: options.fileMode }),
    });
    await rename(tmp, file);
  }

  async function usingDb(where?: { id: StoredDocumentId; file: string }): Promise<boolean> {
    if (!process.env.WORKFLOW_POSTGRES_URL) {
      if (options.requireDatabase) throw new Error("PostgreSQL is required for this operation");
      dbMode = false;
      return false;
    }
    const resolved = where ?? (await target());
    if (dbMode === true && migrated.has(resolved.id)) return true;
    try {
      if (!(await hasDocument(resolved.id))) {
        const file = await readFileStore(resolved.file);
        if (file !== null) await migrateFromFileStore(resolved.id, file);
      }
      dbMode = true;
      migrated.add(resolved.id);
    } catch (error) {
      if (options.requireDatabase) throw error;
      // Database unreachable — keep serving the file rather than failing every
      // read, and retry on the next call rather than caching the outage.
      return false;
    }
    return true;
  }

  return {
    async read(): Promise<T> {
      const where = await target();
      if (await usingDb(where)) {
        const document = await readDocument<Partial<T>>(where.id);
        return document ? options.normalize(document) : options.empty();
      }
      return (await readFileStore(where.file)) ?? options.empty();
    },

    async update<R>(fn: (store: T) => R): Promise<R> {
      const where = await target();
      if (await usingDb(where)) {
        return updateDocument(
          where.id,
          (raw) => (raw ? options.normalize(raw) : options.empty()),
          fn,
        );
      }
      const run = writeQueue.then(runUpdate, runUpdate);
      writeQueue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;

      async function runUpdate(): Promise<R> {
        const store = (await readFileStore(where.file)) ?? options.empty();
        const result = fn(store);
        await writeFileStore(where.file, store);
        return result;
      }
    },

    usingDatabase: () => usingDb(),
  };
}

// ── Blobs ─────────────────────────────────────────────────────────
//
// The one thing that is not a document. Media assets and the business logo
// are bytes, and bytes do not belong in a row that is read and rewritten
// whole — so they get their own table, keyed by the same basename the file
// backend uses.
//
// This is the third option in a chain that already had two: an asset goes to
// Google Drive when an account is connected, and otherwise to disk. On a host
// with no writable disk, this is where "otherwise" leads. It is deliberately
// not a CDN — bytes come back through the app, the same way the file backend
// serves them, so nothing becomes public that was not public before.

const BLOB_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS senka.blobs (
  id text PRIMARY KEY,
  bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

let blobSchemaReady: Promise<void> | undefined;

async function ensureBlobSchema(): Promise<void> {
  await ensureSchema();
  if (!blobSchemaReady) {
    blobSchemaReady = getPool()
      .query(BLOB_SCHEMA_SQL)
      .then(() => undefined)
      .catch((error: unknown) => {
        blobSchemaReady = undefined;
        throw error;
      });
  }
  await blobSchemaReady;
}

/** Whether this process stores blobs in Postgres. Mirrors the document
 *  routing: a configured, reachable database owns them. */
export async function blobsInDatabase(): Promise<boolean> {
  if (!process.env.WORKFLOW_POSTGRES_URL) return false;
  try {
    await ensureBlobSchema();
    return true;
  } catch {
    return false;
  }
}

export async function writeBlob(id: string, bytes: Uint8Array): Promise<void> {
  await ensureBlobSchema();
  await getPool().query(
    "INSERT INTO senka.blobs (id, bytes) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET bytes = EXCLUDED.bytes",
    [id, Buffer.from(bytes)],
  );
}

/** The bytes, or `null` when nothing is stored under that id. */
export async function readBlob(id: string): Promise<Uint8Array | null> {
  await ensureBlobSchema();
  const result = await getPool().query<{ bytes: Buffer }>(
    "SELECT bytes FROM senka.blobs WHERE id = $1",
    [id],
  );
  const row = result.rows[0];
  return row ? new Uint8Array(row.bytes) : null;
}

/** Every blob id under a prefix ("media/", "profile/"), for the cleanup passes
 *  that used to walk a directory. */
export async function listBlobIds(prefix: string): Promise<string[]> {
  await ensureBlobSchema();
  const result = await getPool().query<{ id: string }>(
    "SELECT id FROM senka.blobs WHERE id LIKE $1",
    [`${prefix}%`],
  );
  return result.rows.map((row) => row.id);
}

export async function deleteBlob(id: string): Promise<void> {
  await ensureBlobSchema();
  await getPool().query("DELETE FROM senka.blobs WHERE id = $1", [id]);
}
