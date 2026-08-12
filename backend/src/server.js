require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');

const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/games');
const reportRoutes = require('./routes/reports');
const analysisRoutes = require('./routes/analysis');
const bulkImportRoutes = require('./routes/bulkImport');
const teamRoutes = require('./routes/teams');
const inviteRoutes = require('./routes/invites');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api', reportRoutes);       // /api/games/:gameId/reports
app.use('/api', bulkImportRoutes);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;

// Postgres migration is async (unlike the old SQLite exec-at-require-time),
// so the server only starts listening once the schema is confirmed applied.
db.migrate()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`CourtIQ backend listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to run database migration on startup:', err);
    process.exit(1);
  });