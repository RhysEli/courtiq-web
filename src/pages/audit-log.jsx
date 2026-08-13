import {
  Alert, Box, Card, CardContent, Chip, CircularProgress,
  Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import Layout from '../components/layout';
import { backendApi } from '../api/client';

// FR-14: "The system shall maintain an audit log recording all data
// upload events, metric computation runs, and report generation actions
// with timestamps and the identity of the initiating user." Read-only
// view of the real `audit_log` table (backend/src/routes/auditLog.js) --
// no create/edit/delete here, entries are written automatically by the
// real upload/compute/narrative endpoints, not by this page.

const ACTION_LABELS = { upload: 'Upload', compute: 'Compute Metrics', narrative: 'Generate Narrative' };

function AuditLog({ mode, toggleTheme, selectedTeam, onTeamChange, role, selectedSeason, logout }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    backendApi.getAuditLog()
      .then((data) => { if (!cancelled) setEntries(data); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load audit log.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange} role={role} selectedSeason={selectedSeason} logout={logout}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h5" fontWeight={700}>Audit Log</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Real record of data upload events, metric computation runs, and report generation actions, with the initiating user and timestamp -- most recent first.
            </Typography>

            {loading ? (
              <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>
            ) : (
              <>
                {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
                <Table size="small" sx={{ mt: 2 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Timestamp</TableCell>
                      <TableCell>User</TableCell>
                      <TableCell>Action</TableCell>
                      <TableCell>Details</TableCell>
                      <TableCell>Result</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{new Date(entry.created_at).toLocaleString()}</TableCell>
                        <TableCell>{entry.user_name || entry.user_email || 'Unknown'}</TableCell>
                        <TableCell>{ACTION_LABELS[entry.action_type] || entry.action_type}</TableCell>
                        <TableCell>{entry.details || '—'}</TableCell>
                        <TableCell>
                          <Chip
                            label={entry.success ? 'Success' : 'Failed'}
                            color={entry.success ? 'success' : 'error'}
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    {entries.length === 0 && (
                      <TableRow><TableCell colSpan={5}>No audit log entries yet.</TableCell></TableRow>
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

export default AuditLog;
