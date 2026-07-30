const db = require('./index');
const { hashPassword } = require('../utils/passwords');

function seed() {
  db.prepare("INSERT OR IGNORE INTO institutions (id, name, location) VALUES ('usiu', 'USIU', 'Nairobi, Kenya')").run();

  db.prepare(`INSERT OR IGNORE INTO teams (id, institution_id, name, gender_category, color_primary, color_secondary)
              VALUES ('usiu-men', 'usiu', 'USIU Tigers (Men)', 'Men', '#ff7a1a', '#111827')`).run();
  db.prepare(`INSERT OR IGNORE INTO teams (id, institution_id, name, gender_category, color_primary, color_secondary)
              VALUES ('usiu-women', 'usiu', 'USIU Flames (Women)', 'Women', '#ff7a1a', '#111827')`).run();
  db.prepare(`INSERT OR IGNORE INTO teams (id, institution_id, name, gender_category, color_primary, color_secondary)
              VALUES ('snipers', NULL, 'Snipers', 'Men', '#38bdf8', '#0f172a')`).run();

  db.prepare("INSERT OR IGNORE INTO seasons (id, name, active) VALUES ('2026/27', '2026/27', 1)").run();
  db.prepare("INSERT OR IGNORE INTO seasons (id, name, active) VALUES ('2025/26', '2025/26', 0)").run();

  db.prepare(`INSERT OR IGNORE INTO leagues (name, category, season, description)
              VALUES ('Nairobi Basketball League', 'Men', '2026/27', 'Premier men''s competition for college and club teams.')`).run();

  const demoUsers = [
    { name: 'Alice Statistician', email: 'stats@courtiq.dev', role: 'Statistician', team_id: 'usiu-men' },
    { name: 'Coach Brian', email: 'coach@courtiq.dev', role: 'Coach', team_id: 'usiu-men' },
    { name: 'Admin User', email: 'admin@courtiq.dev', role: 'Administrator', team_id: null },
    { name: 'Team Manager', email: 'manager@courtiq.dev', role: 'Team Manager', team_id: 'usiu-men' },
  ];
  const insertUser = db.prepare(`INSERT OR IGNORE INTO users (name, email, password_hash, role, team_id) VALUES (?, ?, ?, ?, ?)`);
  for (const u of demoUsers) {
    insertUser.run(u.name, u.email, hashPassword('courtiq123'), u.role, u.team_id);
  }

  console.log('Seed complete. Demo login: stats@courtiq.dev / courtiq123 (also coach@, admin@, manager@courtiq.dev)');
}

seed();
