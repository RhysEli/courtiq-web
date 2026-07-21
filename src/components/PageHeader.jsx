import { Box, Typography, Chip } from '@mui/material';

function PageHeader({ title, subtitle, badge }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700, color: 'white' }}>{title}</Typography>
        <Typography variant="body1" sx={{ color: 'grey.400', mt: 0.5 }}>{subtitle}</Typography>
      </Box>
      {badge && <Chip label={badge} sx={{ bgcolor: 'orange.600', color: 'white', fontWeight: 700 }} />} 
    </Box>
  );
}

export default PageHeader;
