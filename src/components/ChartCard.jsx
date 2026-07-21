import { Card, CardContent, Typography, Box } from '@mui/material';

function ChartCard({ title, children }) {
  return (
    <Card sx={{ bgcolor: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, boxShadow: '0 20px 45px rgba(0,0,0,0.25)' }}>
      <CardContent>
        <Typography variant="h6" sx={{ color: 'white', mb: 2, fontWeight: 600 }}>{title}</Typography>
        <Box sx={{ height: 260 }}>{children}</Box>
      </CardContent>
    </Card>
  );
}

export default ChartCard;
