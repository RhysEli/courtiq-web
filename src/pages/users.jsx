import { Alert, Box, Button, Card, CardContent, Grid, MenuItem, Snackbar, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout';
import PhotoUpload from '../components/PhotoUpload';
import { getAccessRequests } from '../services/accountService';
import { backendApi } from '../api/client';

// Real staff-facing user directory (backend/src/routes/users.js),
// replacing the old entirely-localStorage 'courtiq-users' version below
// (which never touched the real `users` table -- same "still on the old
// mock" gap teams.jsx/players-management.jsx had before their own
// earlier real-backend passes).
//
// Deliberately NOT migrated, flagged rather than guessed at:
//   - Status (active/inactive) column + Deactivate/Reactivate button --
//     no such column exists on the real `users` table at all. Inventing
//     one now would mean deciding real semantics (does a deactivated
//     user's still-valid JWT keep working until it expires? does login
//     itself get blocked?) that are a separate feature, not implied by
//     "list/edit users so photos have somewhere to attach to."
//   - "Institution" button -- wrote to nothing real even in the mock
//     version's own intent (users have no institution_id column; an
//     institution is only ever implied via team.institution_id), and is
//     now fully redundant with real Team reassignment below.
//   - "Reset" password button -- real password reset needs secure random
//     generation, re-hashing, and a notification path (email), i.e. a
//     whole separate feature with its own security surface, not a
//     one-line real-backend swap like the others here.
//   - "Access requests" card below -- still reads/writes
//     'courtiq-access-requests' via accountService, untouched: a separate,
//     unrelated feature (the public "request access" flow) that doesn't
//     need to be real for staff-curated photo uploads to work.
function Users({ selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('All');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Coach');
  const [inviteStatus, setInviteStatus] = useState({ open: false, message: '', severity: 'success' });
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteTeamId, setInviteTeamId] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);

  // Real teams (for the invite form's team picker) and real pending
  // invites -- both from the actual database now, not localStorage.
  const [teams, setTeams] = useState([]);
  const [invites, setInvites] = useState([]);
  const [invitesLoading, setInvitesLoading] = useState(true);

  useEffect(() => {
    backendApi.getTeams().then((rows) => {
      setTeams(rows);
      if (rows.length > 0 && !inviteTeamId) setInviteTeamId(rows[0].id);
    }).catch(() => setTeams([]));
  }, []);

  useEffect(() => {
    setInvitesLoading(true);
    backendApi.listInvites()
      .then((rows) => setInvites(rows))
      .catch(() => setInvites([]))
      .finally(() => setInvitesLoading(false));
  }, [refreshToken]);

  const [allUsers, setAllUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');

  useEffect(() => {
    setUsersLoading(true);
    setUsersError('');
    backendApi.getUsers()
      .then(setAllUsers)
      .catch((err) => setUsersError(err.message || 'Could not load users.'))
      .finally(() => setUsersLoading(false));
  }, [refreshToken]);

  const users = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    return allUsers.filter((user) => {
      const matchesSearch = !lowerSearch || `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(lowerSearch);
      const matchesRole = filterRole === 'All' || user.role === filterRole;
      return matchesSearch && matchesRole;
    });
  }, [allUsers, search, filterRole]);

  const requests = useMemo(() => JSON.parse(window.localStorage.getItem('courtiq-access-requests') || '[]'), [refreshToken]);

  const createInviteCode = async () => {
    if (!inviteEmail || !inviteTeamId) return;
    setSendingInvite(true);
    try {
      const result = await backendApi.sendInviteEmail({
        toEmail: inviteEmail,
        role: inviteRole,
        teamId: inviteTeamId,
        appUrl: window.location.origin,
      });
      if (result.emailSent) {
        setInviteStatus({ open: true, message: `Invite email sent to ${inviteEmail}.`, severity: 'success' });
      } else {
        setInviteStatus({ open: true, message: `Invite created, but the email failed to send: ${result.emailError}. The invite link below still works if shared manually.`, severity: 'warning' });
      }
      setInviteEmail('');
      setRefreshToken((prev) => prev + 1);
    } catch (err) {
      setInviteStatus({ open: true, message: `Could not create invite: ${err.message}`, severity: 'error' });
    } finally {
      setSendingInvite(false);
    }
  };

  const [userUpdateError, setUserUpdateError] = useState('');

  const changeRole = async (userId, roleValue) => {
    setUserUpdateError('');
    try {
      await backendApi.updateUser(userId, { role: roleValue });
      setRefreshToken((prev) => prev + 1);
    } catch (err) {
      setUserUpdateError(err.message || 'Could not update role.');
    }
  };

  const changeTeam = async (userId, teamId) => {
    setUserUpdateError('');
    try {
      await backendApi.updateUser(userId, { teamId });
      setRefreshToken((prev) => prev + 1);
    } catch (err) {
      setUserUpdateError(err.message || 'Could not update team.');
    }
  };

  // Staff-curated photo -- applies to every role including the uploader's
  // own row (this table has no notion of "is this me", it's the same
  // staff-managed action either way). No self-service equivalent anywhere
  // else in the app (profile.jsx never gets an upload control).
  const uploadUserPhoto = async (userId, blob) => {
    await backendApi.uploadUserPhoto(userId, blob);
    setRefreshToken((prev) => prev + 1);
  };

  const revokeInvite = async (token) => {
    try {
      await backendApi.revokeInvite(token);
      setRefreshToken((prev) => prev + 1);
    } catch (err) {
      setInviteStatus({ open: true, message: `Could not revoke invite: ${err.message}`, severity: 'error' });
    }
  };

  return (
    <Layout selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h5" fontWeight={700}>User management</Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}><TextField fullWidth label="Search users" value={search} onChange={(event) => setSearch(event.target.value)} /></Grid>
              <Grid item xs={12} md={6}><TextField select fullWidth label="Filter by role" value={filterRole} onChange={(event) => setFilterRole(event.target.value)}>
                <MenuItem value="All">All</MenuItem>
                <MenuItem value="Team Manager">Team Manager</MenuItem>
                <MenuItem value="Statistician">Statistician</MenuItem>
                <MenuItem value="Coach">Coach</MenuItem>
                <MenuItem value="Athlete">Athlete</MenuItem>
              </TextField></Grid>
            </Grid>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Invite user</Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={3}><TextField fullWidth label="Email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} /></Grid>
              <Grid item xs={12} md={3}><TextField select fullWidth label="Role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
                <MenuItem value="Coach">Coach</MenuItem>
                <MenuItem value="Statistician">Statistician</MenuItem>
                <MenuItem value="Team Manager">Team Manager</MenuItem>
                <MenuItem value="Athlete">Athlete</MenuItem>
              </TextField></Grid>
              <Grid item xs={12} md={6}>
                <TextField select fullWidth label="Team" value={inviteTeamId} onChange={(event) => setInviteTeamId(event.target.value)} disabled={teams.length === 0}>
                  {teams.length === 0 && <MenuItem value="" disabled>No teams found yet</MenuItem>}
                  {teams.map((t) => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.institution_name ? `${t.institution_name} — ` : ''}{t.name}{t.gender_category ? ` (${t.gender_category})` : ''}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>
            <Button variant="contained" sx={{ mt: 2 }} onClick={createInviteCode} disabled={sendingInvite || !inviteEmail || !inviteTeamId}>
              {sendingInvite ? 'Sending invite email…' : 'Create invite & send email'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Users</Typography>
            {usersError && <Alert severity="error" sx={{ mt: 2 }}>{usersError}</Alert>}
            {userUpdateError && <Alert severity="error" sx={{ mt: 2 }}>{userUpdateError}</Alert>}
            {usersLoading ? (
              <Typography color="text.secondary" sx={{ mt: 2 }}>Loading…</Typography>
            ) : (
              <Table size="small" sx={{ mt: 2 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Photo</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Team</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <PhotoUpload
                          value={user.photo_url}
                          onUpload={(blob) => uploadUserPhoto(user.id, blob)}
                          size={40}
                          fallback={user.name?.charAt(0)?.toUpperCase()}
                        />
                      </TableCell>
                      <TableCell>{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {/* Administrator isn't an assignable role here (matches the
                            role dropdown's own pre-existing restriction, now that a
                            real Administrator row can actually appear) -- an editable
                            Select with no matching MenuItem would render misleadingly
                            blank, so this shows as plain read-only text instead. */}
                        {user.role === 'Administrator' ? (
                          <Typography variant="body2">Administrator</Typography>
                        ) : (
                          <TextField select size="small" value={user.role} onChange={(event) => changeRole(user.id, event.target.value)}>
                            <MenuItem value="Team Manager">Team Manager</MenuItem>
                            <MenuItem value="Statistician">Statistician</MenuItem>
                            <MenuItem value="Coach">Coach</MenuItem>
                            <MenuItem value="Athlete">Athlete</MenuItem>
                          </TextField>
                        )}
                      </TableCell>
                      <TableCell>
                        <TextField
                          select size="small" sx={{ minWidth: 160 }}
                          value={user.teams?.[0]?.id || ''}
                          onChange={(event) => changeTeam(user.id, event.target.value)}
                        >
                          {!user.teams?.length && <MenuItem value="" disabled>No team assigned</MenuItem>}
                          {teams.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                        </TextField>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && (
                    <TableRow><TableCell colSpan={5}>No users match.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Pending invitations</Typography>
            <Stack spacing={1.5} sx={{ mt: 2 }}>
              {invitesLoading && <Typography color="text.secondary">Loading…</Typography>}
              {!invitesLoading && invites.filter((invite) => invite.status === 'pending').length === 0 && (
                <Typography color="text.secondary">No pending invitations.</Typography>
              )}
              {invites.filter((invite) => invite.status === 'pending').map((invite) => (
                <Box key={invite.id} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography fontWeight={600}>{invite.email}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {invite.role}{invite.team_name ? ` • ${invite.team_name}` : ''}{invite.institution_name ? ` • ${invite.institution_name}` : ''}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" variant="outlined" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/accept-invite/${invite.token}`)}>Copy link</Button>
                    <Button size="small" variant="outlined" onClick={() => revokeInvite(invite.token)}>Revoke</Button>
                  </Stack>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={700}>Access requests</Typography>
            <Stack spacing={1.5} sx={{ mt: 2 }}>
              {requests.map((request) => (
                <Box key={request.id} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography fontWeight={600}>{request.email}</Typography>
                    <Typography variant="body2" color="text.secondary">{request.desiredRole} • {request.institution}</Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" variant="outlined" onClick={() => { const nextRequests = JSON.parse(window.localStorage.getItem('courtiq-access-requests') || '[]').map((item) => item.id === request.id ? { ...item, status: 'approved' } : item); window.localStorage.setItem('courtiq-access-requests', JSON.stringify(nextRequests)); setRefreshToken((prev) => prev + 1); }}>Approve</Button>
                    <Button size="small" variant="outlined" onClick={() => { const nextRequests = JSON.parse(window.localStorage.getItem('courtiq-access-requests') || '[]').map((item) => item.id === request.id ? { ...item, status: 'rejected' } : item); window.localStorage.setItem('courtiq-access-requests', JSON.stringify(nextRequests)); setRefreshToken((prev) => prev + 1); }}>Reject</Button>
                  </Stack>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Box>

      <Snackbar open={inviteStatus.open} autoHideDuration={6000} onClose={() => setInviteStatus((prev) => ({ ...prev, open: false }))}>
        <Alert severity={inviteStatus.severity} onClose={() => setInviteStatus((prev) => ({ ...prev, open: false }))}>
          {inviteStatus.message}
        </Alert>
      </Snackbar>
    </Layout>
  );
}

export default Users;