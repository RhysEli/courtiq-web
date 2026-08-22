import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Grid, MenuItem, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import Layout from '../components/layout';
import PhotoUpload from '../components/PhotoUpload';
import { backendApi } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

// FR-11: real roster assignment against the backend `players` table
// (backend/src/routes/players.js), replacing the old localStorage-only
// version of this page (which wrote to 'courtiq-players' and was never
// read by anything real). The create form is still limited to the
// columns that exist -- full_name, jersey_number, position -- but the
// roster table below now also has a real Photo column (players.photo_url,
// staff-curated via PATCH .../photo, same gating as add/remove: only
// Statistician/Team Manager, never self-service since players don't have
// accounts here at all). DOB/medical notes/etc. still have nowhere real
// to be stored -- not part of this change.

function PlayersManagement({ mode, toggleTheme, role, selectedSeason, logout }) {
  const { activeTeam } = useAuth();
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState('');
  const [teamId, setTeamId] = useState('');

  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState('');

  const [form, setForm] = useState({ fullName: '', jerseyNumber: '', position: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitNotice, setSubmitNotice] = useState('');
  const [removingId, setRemovingId] = useState(null);

  // Player identity review queue (playerIdentity.js) -- fuzzy name
  // matches from bulk-import/report-upload/this page's own "Add player"
  // below that need a human confirm/reject before becoming a real roster
  // link. reviewActionId tracks which single row's Confirm/Reject button
  // is mid-request, same pattern as removingId above.
  const [pendingReviews, setPendingReviews] = useState([]);
  const [reviewsError, setReviewsError] = useState('');
  const [reviewActionId, setReviewActionId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setTeamsLoading(true);
    backendApi.getTeams()
      .then((data) => {
        if (cancelled) return;
        setTeams(data);
        // Matched by the session's active team (Step 9 Phase 2/3) -- a
        // real, stable id, not a name string. No match leaves teamId
        // empty (the Team dropdown below still lets them pick one
        // manually) rather than silently loading the wrong team's real
        // roster.
        const myTeam = data.find((t) => t.id === activeTeam?.id);
        if (myTeam) {
          setTeamId(myTeam.id);
        } else {
          setTeamsError(`Could not find your team (${activeTeam?.name || 'unknown'}) in the team list.`);
        }
      })
      .catch((err) => { if (!cancelled) setTeamsError(err.message || 'Could not load teams.'); })
      .finally(() => { if (!cancelled) setTeamsLoading(false); });
    return () => { cancelled = true; };
    // Re-runs on active-team switch (Step 9 Phase 3) so this page re-scopes
    // to the newly active team rather than staying stuck on the old one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTeam?.id]);

  const loadRoster = (id) => {
    if (!id) return;
    setRosterLoading(true);
    setRosterError('');
    backendApi.getTeamPlayers(id)
      .then(setRoster)
      .catch((err) => setRosterError(err.message || 'Could not load roster.'))
      .finally(() => setRosterLoading(false));
  };

  const loadReviews = (id) => {
    if (!id) return;
    setReviewsError('');
    backendApi.getPlayerIdentityReview(id)
      .then(setPendingReviews)
      .catch((err) => setReviewsError(err.message || 'Could not load the identity review queue.'));
  };

  useEffect(() => {
    if (teamId) { loadRoster(teamId); loadReviews(teamId); }
  }, [teamId]);

  // addPlayer's response now has three real outcomes (players.js), not
  // just success/fail -- 200 'linked' (exact match to an existing player,
  // nothing new to show beyond a reload), 201 'created' (a genuinely new
  // player), or 202 'pending_review' (nothing added yet, sent to the
  // queue below instead). None of these throw -- only a real error does.
  const createPlayer = async () => {
    if (!teamId || !form.fullName.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    setSubmitNotice('');
    try {
      const result = await backendApi.addPlayer(teamId, {
        fullName: form.fullName.trim(),
        jerseyNumber: form.jerseyNumber ? Number(form.jerseyNumber) : null,
        position: form.position || null,
      });
      setForm({ fullName: '', jerseyNumber: '', position: '' });
      if (result.status === 'pending_review') {
        setSubmitNotice(result.message || 'This name is pending identity review before it can be added.');
        loadReviews(teamId);
      } else {
        setSubmitNotice(result.status === 'linked' ? `Linked to the existing player ${result.player.full_name}.` : '');
        loadRoster(teamId);
      }
    } catch (err) {
      setSubmitError(err.message || 'Could not add player.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmReviewItem = async (reviewId) => {
    setReviewActionId(reviewId);
    try {
      await backendApi.confirmPlayerIdentityReview(teamId, reviewId);
      loadReviews(teamId);
      loadRoster(teamId);
    } catch (err) {
      setReviewsError(err.message || 'Could not confirm this match.');
    } finally {
      setReviewActionId(null);
    }
  };

  const rejectReviewItem = async (reviewId) => {
    setReviewActionId(reviewId);
    try {
      await backendApi.rejectPlayerIdentityReview(teamId, reviewId);
      loadReviews(teamId);
      loadRoster(teamId);
    } catch (err) {
      setReviewsError(err.message || 'Could not reject this match.');
    } finally {
      setReviewActionId(null);
    }
  };

  const removePlayer = async (playerId) => {
    setRemovingId(playerId);
    try {
      await backendApi.removePlayer(teamId, playerId);
      loadRoster(teamId);
    } catch (err) {
      setRosterError(err.message || 'Could not remove player.');
    } finally {
      setRemovingId(null);
    }
  };

  const uploadPlayerPhoto = async (playerId, blob) => {
    await backendApi.uploadPlayerPhoto(teamId, playerId, blob);
    loadRoster(teamId);
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h5" fontWeight={700}>Player management</Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth select label="Team" value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  disabled={teamsLoading || teams.length === 0}
                >
                  {teams.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Name" value={form.fullName} onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Jersey Number" value={form.jerseyNumber} onChange={(event) => setForm((prev) => ({ ...prev, jerseyNumber: event.target.value }))} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Position" value={form.position} onChange={(event) => setForm((prev) => ({ ...prev, position: event.target.value }))} /></Grid>
            </Grid>
            {teamsError && <Alert severity="error" sx={{ mt: 2 }}>{teamsError}</Alert>}
            {submitError && <Alert severity="error" sx={{ mt: 2 }}>{submitError}</Alert>}
            {submitNotice && <Alert severity="info" sx={{ mt: 2 }}>{submitNotice}</Alert>}
            <Button
              variant="contained" sx={{ mt: 2 }} onClick={createPlayer}
              disabled={submitting || !teamId || !form.fullName.trim()}
            >
              {submitting ? 'Adding…' : 'Add player'}
            </Button>
          </CardContent>
        </Card>

        {pendingReviews.length > 0 && (
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={700}>Possible duplicate players</Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                These names look like they might already be on the roster under a different spelling. Confirm links
                them to the existing player; reject adds the name as a separate, new player instead.
              </Typography>
              {reviewsError && <Alert severity="error" sx={{ mb: 2 }}>{reviewsError}</Alert>}
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>New name seen</TableCell>
                    <TableCell>Might be</TableCell>
                    <TableCell>Why</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pendingReviews.map((review) => (
                    <TableRow key={review.id}>
                      <TableCell>{review.candidate_text}</TableCell>
                      <TableCell>
                        {review.candidate_player_name}
                        {/* Jersey number shown here only as informational context for a human
                            reviewer -- never used to decide the match itself (playerIdentity.js). */}
                        {review.candidate_player_jersey_number != null && ` (#${review.candidate_player_jersey_number})`}
                      </TableCell>
                      <TableCell>{review.match_reason}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1}>
                          <Button
                            size="small" variant="contained"
                            disabled={reviewActionId === review.id}
                            onClick={() => confirmReviewItem(review.id)}
                          >
                            {reviewActionId === review.id ? 'Working…' : 'Confirm same player'}
                          </Button>
                          <Button
                            size="small" variant="outlined"
                            disabled={reviewActionId === review.id}
                            onClick={() => rejectReviewItem(review.id)}
                          >
                            Reject, different player
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Roster</Typography>
            {rosterLoading ? (
              <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>
            ) : (
              <>
                {rosterError && <Alert severity="error" sx={{ mt: 2 }}>{rosterError}</Alert>}
                <Table size="small" sx={{ mt: 2 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Photo</TableCell>
                      <TableCell>Name</TableCell>
                      <TableCell>Jersey Number</TableCell>
                      <TableCell>Position</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {roster.map((player) => (
                      <TableRow key={player.id}>
                        <TableCell>
                          <PhotoUpload
                            value={player.photo_url}
                            onUpload={(blob) => uploadPlayerPhoto(player.id, blob)}
                            size={40}
                            fallback={player.full_name?.charAt(0)?.toUpperCase()}
                          />
                        </TableCell>
                        <TableCell>{player.full_name}</TableCell>
                        <TableCell>{player.jersey_number ?? '—'}</TableCell>
                        <TableCell>{player.position || '—'}</TableCell>
                        <TableCell>
                          <Button
                            size="small" variant="outlined" color="error"
                            disabled={removingId === player.id}
                            onClick={() => removePlayer(player.id)}
                          >
                            {removingId === player.id ? 'Removing…' : 'Remove'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {roster.length === 0 && (
                      <TableRow><TableCell colSpan={5}>No players on this roster yet.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
      </Box>
    </Layout>
  );
}

export default PlayersManagement;
