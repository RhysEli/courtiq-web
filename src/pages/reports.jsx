import { Box, Button, Card, CardContent, Chip, Grid, Stack, Typography } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useState } from 'react';
import Layout from '../components/Layout';

function Reports({ mode, toggleTheme, selectedTeam, onTeamChange, role, reports, setReports }) {
  const [uploading, setUploading] = useState(false);
  const canManage = role === 'Administrator' || role === 'Statistician' || role === 'Coach';

  const uploadReport = () => {
    if (!canManage) return;
    setUploading(true);
    setTimeout(() => {
      setReports((prev) => [
        ...prev,
        { id: prev.length + 1, name: `FIBA Report ${prev.length + 1}.pdf`, type: 'FIBA Report', uploadedAt: 'Just now' },
      ]);
      setUploading(false);
    }, 900);
  };

  return (
    <Layout mode={mode} toggleTheme={toggleTheme} selectedTeam={selectedTeam} onTeamChange={onTeamChange}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>FIBA reports</Typography>
          <Typography color="text.secondary">Upload official reports and keep AI analysis anchored to real match documentation.</Typography>
        </Box>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Upload report</Typography>
              <Box sx={{ border: '2px dashed', borderColor: 'primary.main', borderRadius: 3, p: 4, textAlign: 'center' }}>
                <UploadFileIcon sx={{ fontSize: 44, color: 'primary.main' }} />
                <Typography mt={2}>Select a PDF or FIBA report export</Typography>
                <Button variant="contained" color="primary" sx={{ mt: 2 }} onClick={uploadReport} disabled={!canManage}>
                  {uploading ? 'Uploading…' : 'Upload report'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Recent uploads</Typography>
              <Stack spacing={2}>
                {reports.map((report) => (
                  <Box key={report.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography fontWeight={700}>{report.name}</Typography>
                      <Typography color="text.secondary">{report.type} • {report.uploadedAt}</Typography>
                    </Box>
                    <Chip label="Ready for AI" color="primary" size="small" />
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Layout>
  );
}

export default Reports;
