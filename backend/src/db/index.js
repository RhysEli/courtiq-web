const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

// NOTE: The project proposal specifies PostgreSQL (via Supabase) as the
// production database. This backend uses Node's built-in SQLite so the
// whole system can run locally with zero external services while you
// develop. The schema in schema.sql avoids SQLite-only syntax so it can
// be ported to Postgres later with minimal changes (see README section
// "Moving to PostgreSQL").

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/courtiq.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');

function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
}

migrate();

module.exports = db;
