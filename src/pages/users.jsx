import { Alert, Box, Button, Card, CardContent, Chip, Grid, MenuItem, Snackbar, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout';
import { getAccessRequests, resetPassword, updateUserInstitution, updateUserRole, updateUserStatus, updateUserTeam } from '../services/accountService';
import { backendApi } from '../api/client';

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

  const users = useMemo(() => {
    const storedUsers = JSON.parse(window.localStorage.getItem('courtiq-users') || '[]');
    const lowerSearch = search.toLowerCase();
    return storedUsers.filter((user) => {
      const matchesSearch = !lowerSearch || `${user.firstName} ${user.lastName} ${user.email} ${user.role}`.toLowerCase().includes(lowerSearch);
      const matchesRole = filterRole === 'All' || user.role === filterRole;
      return matchesSearch && matchesRole;
    });
  }, [search, filterRole, refreshToken]);

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

  const toggleUserStatus = (userId, status) => {
    updateUserStatus(userId, status);
    setRefreshToken((prev) => prev + 1);
  };

  const changeRole = (userId, roleValue) => {
    updateUserRole(userId, roleValue);
    setRefreshToken((prev) => prev + 1);
  };

  const changeTeam = (userId, teamValue) => {
    updateUserTeam(userId, teamValue);
    setRefreshToken((prev) => prev + 1);
  };

  const changeInstitution = (userId, institutionValue) => {
    updateUserInstitution(userId, institutionValue);
    setRefreshToken((prev) => prev + 1);
  };

  const resetUserPassword = (userId) => {
    resetPassword(userId, 'demo123');
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
            <Table size="small" sx={{ mt: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Team</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{`${user.firstName} ${user.lastName}`}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <TextField select size="small" value={user.role} onChange={(event) => changeRole(user.id, event.target.value)}>
                        <MenuItem value="Team Manager">Team Manager</MenuItem>
                        <MenuItem value="Statistician">Statistician</MenuItem>
                        <MenuItem value="Coach">Coach</MenuItem>
                        <MenuItem value="Athlete">Athlete</MenuItem>
                      </TextField>
                    </TableCell>
                    <TableCell>
                      <TextField size="small" value={user.team} onChange={(event) => changeTeam(user.id, event.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Chip label={user.status} color={user.status === 'active' ? 'success' : 'default'} size="small" />
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1}>
                        <Button size="small" variant="outlined" onClick={() => toggleUserStatus(user.id, user.status === 'active' ? 'inactive' : 'active')}>{user.status === 'active' ? 'Deactivate' : 'Reactivate'}</Button>
                        <Button size="small" variant="outlined" onClick={() => resetUserPassword(user.id)}>Reset</Button>
                        <Button size="small" variant="outlined" onClick={() => changeInstitution(user.id, inviteInstitution)}>Institution</Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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