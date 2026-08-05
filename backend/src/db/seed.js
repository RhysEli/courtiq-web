const db = require('./index');
const { hashPassword } = require('../utils/passwords');

// Postgres migration note: SQLite's "INSERT OR IGNORE" became
// "INSERT ... ON CONFLICT (<key>) DO NOTHING" -- Postgres needs an actual
// conflict target (a column with a unique/primary-key constraint), which
// institutions.id, teams.id, seasons.id, and users.email all have.
// `leagues` has no natural unique key (id is just a SERIAL), so -- same as
// the old SQLite version, where "INSERT OR IGNORE" had nothing to conflict
// against either -- re-running seed.js multiple times will insert a
// duplicate leagues row each time. Not a new issue introduced by this
// migration; flagging it here in case it's worth a real UNIQUE constraint
// later (e.g. on name+category+season).

async function seed() {
  await db.migrate();
  await db.prepare("INSERT INTO institutions (id, name, location) VALUES ('usiu', 'USIU', 'Nairobi, Kenya') ON CONFLICT (id) DO NOTHING").run();

  await db.prepare(`INSERT INTO teams (id, institution_id, name, gender_category, color_primary, color_secondary)
              VALUES ('usiu-men', 'usiu', 'USIU Tigers (Men)', 'Men', '#ff7a1a', '#111827') ON CONFLICT (id) DO NOTHING`).run();
  await db.prepare(`INSERT INTO teams (id, institution_id, name, gender_category, color_primary, color_secondary)
              VALUES ('usiu-women', 'usiu', 'USIU Flames (Women)', 'Women', '#ff7a1a', '#111827') ON CONFLICT (id) DO NOTHING`).run();
  await db.prepare(`INSERT INTO teams (id, institution_id, name, gender_category, color_primary, color_secondary)
              VALUES ('snipers', NULL, 'Snipers', 'Men', '#38bdf8', '#0f172a') ON CONFLICT (id) DO NOTHING`).run();

  await db.prepare("INSERT INTO seasons (id, name, active) VALUES ('2026/27', '2026/27', 1) ON CONFLICT (id) DO NOTHING").run();
  await db.prepare("INSERT INTO seasons (id, name, active) VALUES ('2025/26', '2025/26', 0) ON CONFLICT (id) DO NOTHING").run();

  await db.prepare(`INSERT INTO leagues (name, category, season, description)
              VALUES ('Nairobi Basketball League', 'Men', '2026/27', 'Premier men''s competition for college and club teams.')`).run();

  const demoUsers = [
    { name: 'Alice Statistician', email: 'stats@courtiq.dev', role: 'Statistician', team_id: 'usiu-men' },
    { name: 'Coach Brian', email: 'coach@courtiq.dev', role: 'Coach', team_id: 'usiu-men' },
    { name: 'Admin User', email: 'admin@courtiq.dev', role: 'Administrator', team_id: null },
    { name: 'Team Manager', email: 'manager@courtiq.dev', role: 'Team Manager', team_id: 'usiu-men' },
  ];
  const insertUser = db.prepare(`INSERT INTO users (name, email, password_hash, role, team_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT (email) DO NOTHING`);
  for (const u of demoUsers) {
    await insertUser.run(u.name, u.email, hashPassword('courtiq123'), u.role, u.team_id);
  }

  console.log('Seed complete. Demo login: stats@courtiq.dev / courtiq123 (also coach@, admin@, manager@courtiq.dev)');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });