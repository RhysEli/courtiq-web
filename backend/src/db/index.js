require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Switched from Node's built-in SQLite to real PostgreSQL (via Supabase),
// per the project proposal's Table 6/7 tech stack. Requires DATABASE_URL
// in the environment (backend/.env), e.g.:
//   DATABASE_URL=postgresql://postgres:<password>@<host>:5432/postgres
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Add it to backend/.env -- see Supabase '
    + 'Project Settings -> Database -> Connection string (URI).',
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase's managed Postgres requires SSL; its certificate isn't in
  // Node's default trust store, so this disables strict verification.
  // Standard for connecting to Supabase from a backend app.
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  // Idle client errors (e.g. connection dropped) shouldn't crash the whole
  // server -- log and let the pool recover on the next query.
  console.error('Unexpected error on idle Postgres client', err);
});

// --- Compatibility shim ---------------------------------------------------
// The rest of the codebase was written against node:sqlite's synchronous
// `db.prepare(sql).get(...)/.all(...)/.run(...)` API. Rather than hand-
// rewrite every one of the ~58 call sites (real risk of transcription
// errors with no way to test against live Postgres before handing this
// over), this shim keeps that exact call pattern but executes against
// Postgres underneath. Callers only need two changes: mark the enclosing
// function `async`, and `await` the .get/.all/.run call -- the SQL string
// and argument list stay exactly as they were, `?` placeholders included.
//
// Known limitation: `?` placeholders are converted to Postgres's `$1, $2,
// ...` positionally, in order -- this only works correctly if the SQL
// doesn't reuse the same `?` for the same value twice (none of the
// existing queries do this).
function toPositional(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// executor is whatever has a pg-compatible .query(sql, params) method --
// the module-level `pool` for every existing call site (unchanged
// behavior, since it's the default), or one specific checked-out client
// when called from inside transaction() below, so every statement in a
// transaction actually runs on the SAME real connection BEGIN/COMMIT was
// issued on. pool.query() itself checks out a (possibly different)
// connection per call, which is exactly why a real multi-statement
// transaction can't just be "call pool.query('BEGIN') then more
// pool.query() calls" -- there'd be no guarantee any of them share a
// connection at all.
function prepare(sql, executor = pool) {
  const pgSql = toPositional(sql);
  return {
    async get(...params) {
      const result = await executor.query(pgSql, params);
      return result.rows[0];
    },
    async all(...params) {
      const result = await executor.query(pgSql, params);
      return result.rows;
    },
    async run(...params) {
      const result = await executor.query(pgSql, params);
      // Postgres has no built-in "last insert id" -- callers that need it
      // must add `RETURNING id` to their INSERT statement (a handful of
      // call sites do this; see the 2026-08 Postgres migration notes).
      const lastInsertRowid = result.rows[0] ? result.rows[0].id : undefined;
      return { changes: result.rowCount, lastInsertRowid };
    },
  };
}

async function exec(sql) {
  await pool.query(sql);
}

// Batch-inserts `rows` (each an array of column values, in the exact
// order `columns` lists them) into `tableName` via one or a few
// multi-row `INSERT ... VALUES (...), (...), ...` statements, instead of
// one individually-awaited single-row INSERT per row -- confirmed
// directly (not assumed) to be the real, dominant cost of persisting a
// real Play-by-Play report: 540 sequential round trips to this project's
// remote Supabase instance measured at ~144.6s, against a measured
// ~200ms baseline round-trip latency for a trivial query on the same
// connection. Collapsing many rows into few round trips is the fix.
//
// tableName/columns are always literal strings the CALLING code
// controls, never derived from request input -- same reasoning already
// established for annotations.js's resolveAnnotationScope (Step 17),
// which interpolates a column name into SQL text the same way. Only the
// actual VALUES are parameterized (via `?`, same as every other query in
// this shim).
//
// Chunked to stay safely under PostgreSQL's real, hard 65535-parameter-
// per-query limit (the extended query protocol's parameter count is a
// 16-bit field) -- computed per call from columns.length, not assumed
// safe for every table just because it happens to be for the widest one.
// Returns the total number of rows inserted; 0 (no query run at all) if
// `rows` is empty, matching every existing persist* function's own
// "nothing to insert" no-op.
const POSTGRES_MAX_PARAMS = 65535;
const BATCH_INSERT_SAFETY_CEILING = 2000; // well under the hard limit even for the widest real table (22 columns -> 44,000 params)

async function batchInsert(tableName, columns, rows, executor = pool) {
  if (rows.length === 0) return 0;

  const maxRowsPerChunk = Math.max(1, Math.floor(POSTGRES_MAX_PARAMS / columns.length));
  const chunkSize = Math.min(maxRowsPerChunk, BATCH_INSERT_SAFETY_CEILING);

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const rowPlaceholders = chunk.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
    const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${rowPlaceholders}`;
    const flatParams = chunk.flat();
    await prepare(sql, executor).run(...flatParams);
  }

  return rows.length;
}

// Real multi-statement transaction, added for Step 61 (a real re-upload
// through reports.js's single-report Box Score route was found to
// duplicate player_game_stats rows -- the delete and the insert need to
// either both happen or neither, not observably land in between). No
// precedent existed anywhere in this codebase before this -- every
// existing db.prepare/db.batchInsert call already auto-commits its own
// single statement against the pool, which is correct for all of them,
// just not sufficient for a real delete-then-insert pair that must be
// atomic.
//
// callback receives `tx`, a { prepare, batchInsert } pair with the exact
// same shape/behavior as the module-level db.prepare/db.batchInsert --
// just bound to this transaction's own dedicated client instead of the
// shared pool -- so code inside a transaction reads identically to code
// outside one. A thrown error (from the callback, or from any query
// inside it) rolls back and rethrows; the caller's own try/catch (e.g.
// reports.js's existing extraction-failure handling) still sees the real
// error and still runs its own real failure path, unchanged.
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tx = {
      prepare: (sql) => prepare(sql, client),
      batchInsert: (tableName, columns, rows) => batchInsert(tableName, columns, rows, client),
    };
    const result = await callback(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function migrate() {
  let schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  // Strip a leading UTF-8 BOM if present -- Postgres fails with
  // "syntax error at or near ..." (the BOM character) if the SQL text
  // starts with one. Easy to introduce by accident (some Windows editors
  // default to "UTF-8 with BOM"), so this is defensive regardless of how
  // the file was last saved.
  if (schema.charCodeAt(0) === 0xFEFF) {
    schema = schema.slice(1);
  }
  await exec(schema);
}

const db = {
  prepare, exec, pool, migrate, batchInsert, transaction,
};

module.exports = db;