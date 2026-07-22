import { Box, Button, Card, CardContent, Chip, Grid, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { createInvite, getAccessRequests, resetPassword, updateInviteStatus, updateUserInstitution, updateUserRole, updateUserStatus, updateUserTeam } from '../services/accountService';

function Users({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('All');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Coach');
  const [inviteInstitution, setInviteInstitution] = useState('USIU');
  const [inviteTeam, setInviteTeam] = useState('USIU Tigers Men');
  const [refreshToken, setRefreshToken] = useState(0);

  const users = useMemo(() => {
    const storedUsers = JSON.parse(window.localStorage.getItem('courtiq-users') || '[]');
    const lowerSearch = search.toLowerCase();
    return storedUsers.filter((user) => {
      const matchesSearch = !lowerSearch || `${user.firstName} ${user.lastName} ${user.email} ${user.role}`.toLowerCase().includes(lowerSearch);
      const matchesRole = filterRole === 'All' || user.role === filterRole;
      return matchesSearch && matchesRole;
    });
  }, [search, filterRole, refreshToken]);

  const invites = useMemo(() => JSON.parse(window.localStorage.getItem('courtiq-invites') || '[]'), [refreshToken]);
  const requests = useMemo(() => JSON.parse(window.localStorage.getItem('courtiq-access-requests') || '[]'), [refreshToken]);

  const createInviteCode = () => {
    createInvite({ email: inviteEmail, institution: inviteInstitution, team: inviteTeam, role: inviteRole, status: 'pending' });
    setInviteEmail('');
    setRefreshToken((prev) => prev + 1);
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

  const revokeInvite = (inviteId) => {
    updateInviteStatus(inviteId, 'revoked');
    setRefreshToken((prev) => prev + 1);
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
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
              <Grid item xs={12} md={3}><TextField fullWidth label="Institution" value={inviteInstitution} onChange={(event) => setInviteInstitution(event.target.value)} /></Grid>
              <Grid item xs={12} md={3}><TextField fullWidth label="Team" value={inviteTeam} onChange={(event) => setInviteTeam(event.target.value)} /></Grid>
            </Grid>
            <Button variant="contained" sx={{ mt: 2 }} onClick={createInviteCode}>Create invite</Button>
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
              {invites.filter((invite) => invite.status === 'pending').map((invite) => (
                <Box key={invite.id} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography fontWeight={600}>{invite.email}</Typography>
                    <Typography variant="body2" color="text.secondary">{invite.code} • {invite.role} • {invite.institution}</Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" variant="outlined" onClick={() => navigator.clipboard?.writeText(invite.code)}>Copy code</Button>
                    <Button size="small" variant="outlined" onClick={() => navigator.clipboard?.writeText(`https://courtiq.app/invite/${invite.code}`)}>Copy link</Button>
                    <Button size="small" variant="outlined" onClick={() => revokeInvite(invite.id)}>Revoke</Button>
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
    </Layout>
  );
}

export default Users;
