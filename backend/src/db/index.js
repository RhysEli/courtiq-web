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

function prepare(sql) {
  const pgSql = toPositional(sql);
  return {
    async get(...params) {
      const result = await pool.query(pgSql, params);
      return result.rows[0];
    },
    async all(...params) {
      const result = await pool.query(pgSql, params);
      return result.rows;
    },
    async run(...params) {
      const result = await pool.query(pgSql, params);
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

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await exec(schema);
}

const db = { prepare, exec, pool, migrate };

module.exports = db;