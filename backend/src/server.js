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
const annotationRoutes = require('./routes/annotations');
const playerRoutes = require('./routes/players');
const playerIdentityReviewRoutes = require('./routes/playerIdentityReview');
const teamCompetitionSeasonRoutes = require('./routes/teamCompetitionSeasons');
const seasonRoutes = require('./routes/seasons');
const competitionRoutes = require('./routes/competitions');
const institutionRoutes = require('./routes/institutions');
const auditLogRoutes = require('./routes/auditLog');
const userRoutes = require('./routes/users');
const passwordResetRoutes = require('./routes/passwordReset');
const { ensureBucketExists } = require('./services/imageUpload');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/teams', playerRoutes);
app.use('/api/teams', playerIdentityReviewRoutes);
app.use('/api/teams', teamCompetitionSeasonRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/annotations', annotationRoutes);
app.use('/api/seasons', seasonRoutes);
app.use('/api/competitions', competitionRoutes);
app.use('/api/institutions', institutionRoutes);
app.use('/api/audit-log', auditLogRoutes);
app.use('/api/users', userRoutes);
// Public -- the account holder follows a staff-triggered reset link here,
// unauthenticated (see users.js's POST /:userId/reset-password for the
// staff-facing trigger).
app.use('/api/reset-password', passwordResetRoutes);
// reportRoutes/bulkImportRoutes mount at the broad '/api' prefix (their own
// paths start with '/games/...') -- keep every specific-prefix router
// ('/api/teams', '/api/invites', etc.) registered above these two, or a
// request that happens to match one of their internal patterns first would
// get handled (and likely 401'd/404'd) by the wrong router.
app.use('/api', reportRoutes);       // /api/games/:gameId/reports
app.use('/api', bulkImportRoutes);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;

// Postgres migration is async (unlike the old SQLite exec-at-require-time),
// so the server only starts listening once the schema is confirmed applied
// AND the Storage bucket photo uploads write to is confirmed to exist --
// same "fail loudly at startup, not on the first real request" reasoning
// as the DB migration.
db.migrate()
  .then(() => ensureBucketExists())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`CourtIQ backend listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start up (migration or storage bucket check):', err);
    process.exit(1);
  });