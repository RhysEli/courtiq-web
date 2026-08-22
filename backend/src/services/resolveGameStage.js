const db = require('../db');

// Shared by games.js's POST / and bulkImport.js's per-file loop -- the
// real complexity a stage tag adds beyond seasonId/competitionId's plain
// "if (institutionId) validate it exists" shape. A stage belongs to one
// team's own team_competition_seasons row (see schema.sql's comment on
// `stages`), but a game has two teams, so tagging one first has to
// resolve WHICH of the request's own team(s) is actually playing, then
// find THAT team's membership row for this exact season+competition,
// then confirm the given stageId is really one of that row's own stages
// -- not just any real stage in the system. Returns { ok: true, stageId }
// (stageId is null when no stage was requested at all -- a game can skip
// the stage layer entirely, same as season/competition) or
// { ok: false, error } for a clear, explicit rejection -- never a silent
// drop of a stageId the caller actually sent.
async function resolveGameStageId({ teamIds, homeTeamId, opponentTeamId, seasonId, competitionId, stageId }) {
  if (!stageId) {
    return { ok: true, stageId: null };
  }

  if (!seasonId || !competitionId) {
    return { ok: false, error: 'stageId requires seasonId and competitionId to also be set on this game' };
  }

  const myTeamId = (teamIds || []).includes(homeTeamId)
    ? homeTeamId
    : ((teamIds || []).includes(opponentTeamId) ? opponentTeamId : null);
  if (!myTeamId) {
    return { ok: false, error: 'stageId requires access to one of the teams in this game' };
  }

  const tcs = await db.prepare(
    'SELECT id FROM team_competition_seasons WHERE team_id = ? AND competition_id = ? AND season_id = ?',
  ).get(myTeamId, competitionId, seasonId);
  if (!tcs) {
    return { ok: false, error: 'Your team has no recorded competition-season membership for this season/competition -- record one before tagging a stage' };
  }

  const stage = await db.prepare(
    'SELECT id FROM stages WHERE id = ? AND team_competition_season_id = ?',
  ).get(stageId, tcs.id);
  if (!stage) {
    return { ok: false, error: 'stageId does not belong to a real stage for your team\'s participation in this competition/season' };
  }

  return { ok: true, stageId };
}

module.exports = { resolveGameStageId };
