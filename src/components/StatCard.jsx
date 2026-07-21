import { Card, CardContent, Typography, Box } from '@mui/material';
import * as Icons from '@mui/icons-material';

function StatCard({ title, value, subtitle, icon }) {
  const Icon = Icons[icon] || Icons.SportsBasketball;

  return (
    <Card sx={{ bgcolor: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, boxShadow: '0 20px 45px rgba(0,0,0,0.25)' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle2" sx={{ color: 'grey.400' }}>{title}</Typography>
          <Box sx={{ p: 1, borderRadius: '50%', bgcolor: 'rgba(255,122,26,0.15)' }}>
            <Icon sx={{ color: 'orange.500' }} />
          </Box>
        </Box>
        <Typography variant="h4" sx={{ color: 'white', fontWeight: 700 }}>{value}</Typography>
        <Typography variant="body2" sx={{ color: 'grey.500', mt: 0.5 }}>{subtitle}</Typography>
      </CardContent>
    </Card>
  );
}

export default StatCard;
