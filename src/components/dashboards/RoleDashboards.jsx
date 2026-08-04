import { Box, Typography, Grid, Stack, Chip, LinearProgress, Avatar } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadialBarChart, RadialBar } from 'recharts';
import { motion } from 'framer-motion';
import GlassCard, { GlassCardContent } from '../GlassCard';
import { getRoleTheme } from '../../theme/themeConfig';
import { useThemePreferences } from '../../contexts/ThemeContext';
import SportsBasketballRoundedIcon from '@mui/icons-material/SportsBasketballRounded';
import FitnessCenterRoundedIcon from '@mui/icons-material/FitnessCenterRounded';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

function HeroBanner({ role, userName, teamName, season }) {
  const roleTheme = getRoleTheme(role);
  const { teamColors } = useThemePreferences();

  return (
    <motion.div {...fadeIn}>
      <GlassCard glowColor={roleTheme.glow} sx={{ overflow: 'visible' }}>
        <GlassCardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
            <Box>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                <Typography variant="h3" sx={{ fontSize: '2rem' }}>{roleTheme.icon}</Typography>
                <Chip label={roleTheme.label} size="small" sx={{ bgcolor: `${teamColors.primary}33`, color: teamColors.primary, fontWeight: 700, border: `1px solid ${teamColors.primary}55` }} />
              </Stack>
              <Typography variant="h4" fontWeight={800} sx={{ background: `linear-gradient(135deg, ${teamColors.primary}, ${teamColors.accent})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Welcome, {userName}
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 0.5, fontStyle: 'italic' }}>{roleTheme.tagline}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{teamName} • Season {season}</Typography>
            </Box>
            <Avatar sx={{ width: 72, height: 72, bgcolor: `${teamColors.primary}33`, border: `3px solid ${teamColors.primary}`, fontSize: '1.8rem', fontWeight: 700 }}>
              {userName?.charAt(0)?.toUpperCase() || 'A'}
            </Avatar>
          </Stack>
        </GlassCardContent>
      </GlassCard>
    </motion.div>
  );
}

function StatTile({ title, value, subtitle, icon: Icon, color, delay = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay }}>
      <GlassCard glowColor={color}>
        <GlassCardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Box>
              <Typography color="text.secondary" variant="body2">{title}</Typography>
              <Typography variant="h3" fontWeight={800} sx={{ mt: 0.5, color }}>{value}</Typography>
              <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
            </Box>
            <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: `${color}22` }}>
              <Icon sx={{ color, fontSize: 28 }} />
            </Box>
          </Stack>
        </GlassCardContent>
      </GlassCard>
    </motion.div>
  );
}

export function AthleteDashboard({ data, summary, matches, userName, season }) {
  const { teamColors } = useThemePreferences();
  const roleTheme = getRoleTheme('Athlete');

  const fitnessData = [
    { name: 'Shooting', value: 78, fill: teamColors.primary },
    { name: 'Defense', value: 65, fill: roleTheme.glow },
    { name: 'Stamina', value: 82, fill: teamColors.secondary },
    { name: 'Agility', value: 71, fill: '#ff9500' },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <HeroBanner role="Athlete" userName={userName} teamName={data.profile.name} season={season} />

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}><StatTile title="My Games" value={summary.completed} subtitle="Completed this season" icon={SportsBasketballRoundedIcon} color={teamColors.primary} delay={0.1} /></Grid>
        <Grid item xs={12} sm={6} md={3}><StatTile title="Avg Points" value="14.2" subtitle="Per game average" icon={TrendingUpRoundedIcon} color={roleTheme.glow} delay={0.15} /></Grid>
        <Grid item xs={12} sm={6} md={3}><StatTile title="Training Load" value="87%" subtitle="Weekly target" icon={FitnessCenterRoundedIcon} color="#ff9500" delay={0.2} /></Grid>
        <Grid item xs={12} sm={6} md={3}><StatTile title="Next Game" value={summary.upcoming} subtitle="Upcoming matches" icon={EmojiEventsRoundedIcon} color={teamColors.secondary} delay={0.25} /></Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={5}>
          <GlassCard glowColor={roleTheme.glow}>
            <GlassCardContent>
              <Typography variant="h6" fontWeight={700}>Performance Radar</Typography>
              <Box sx={{ height: 260, mt: 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="90%" data={fitnessData} startAngle={180} endAngle={0}>
                    <RadialBar background dataKey="value" cornerRadius={8} />
                    <Tooltip />
                  </RadialBarChart>
                </ResponsiveContainer>
              </Box>
              <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1 }}>
                {fitnessData.map((d) => (
                  <Chip key={d.name} label={`${d.name}: ${d.value}%`} size="small" sx={{ bgcolor: `${d.fill}22`, color: d.fill }} />
                ))}
              </Stack>
            </GlassCardContent>
          </GlassCard>
        </Grid>
        <Grid item xs={12} md={7}>
          <GlassCard glowColor={teamColors.primary}>
            <GlassCardContent>
              <Typography variant="h6" fontWeight={700}>Season Progress</Typography>
              <Box sx={{ height: 260, mt: 2 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.performance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                    <XAxis dataKey="name" stroke="currentColor" tick={{ fill: 'currentColor', fontSize: 12 }} />
                    <YAxis stroke="currentColor" tick={{ fill: 'currentColor', fontSize: 12 }} />
                    <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }} />
                    <Line type="monotone" dataKey="points" stroke={teamColors.primary} strokeWidth={3} dot={{ fill: teamColors.primary }} />
                    <Line type="monotone" dataKey="efficiency" stroke={roleTheme.glow} strokeWidth={3} dot={{ fill: roleTheme.glow }} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </GlassCardContent>
          </GlassCard>
        </Grid>
      </Grid>

      <GlassCard glowColor={roleTheme.glow}>
        <GlassCardContent>
          <Typography variant="h6" fontWeight={700}>Coach Notes for You</Typography>
          <Stack spacing={2} sx={{ mt: 2 }}>
            {['Focus on catch-and-shoot opportunities in transition', 'Improve off-ball movement — keep cutting hard', 'Box out aggressively on defensive rebounds'].map((note, i) => (
              <Box key={note} sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.04)', borderLeft: `3px solid ${roleTheme.glow}` }}>
                <Typography fontWeight={600}>Note {i + 1}</Typography>
                <Typography color="text.secondary" variant="body2">{note}</Typography>
              </Box>
            ))}
          </Stack>
        </GlassCardContent>
      </GlassCard>
    </Box>
  );
}

export function CoachDashboard({ data, summary, matches, analysisEntries, userName, season }) {
  const { teamColors } = useThemePreferences();
  const roleTheme = getRoleTheme('Coach');
  const nextMatch = matches.find((m) => m.status === 'Scheduled');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <HeroBanner role="Coach" userName={userName} teamName={data.profile.name} season={season} />

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}><StatTile title="Upcoming" value={summary.upcoming} subtitle="Scheduled matches" icon={SportsBasketballRoundedIcon} color={roleTheme.glow} delay={0.1} /></Grid>
        <Grid item xs={12} sm={6} md={3}><StatTile title="Live Now" value={summary.live} subtitle="Active games" icon={TrendingUpRoundedIcon} color="#ef4444" delay={0.15} /></Grid>
        <Grid item xs={12} sm={6} md={3}><StatTile title="Win Rate" value="68%" subtitle="This season" icon={EmojiEventsRoundedIcon} color={teamColors.primary} delay={0.2} /></Grid>
        <Grid item xs={12} sm={6} md={3}><StatTile title="Roster" value="12" subtitle="Active players" icon={FitnessCenterRoundedIcon} color={teamColors.secondary} delay={0.25} /></Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          <GlassCard glowColor={roleTheme.glow}>
            <GlassCardContent>
              <Typography variant="h6" fontWeight={700}>Team Performance Trend</Typography>
              <Box sx={{ height: 280, mt: 2 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.performance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                    <XAxis dataKey="name" stroke="currentColor" />
                    <YAxis stroke="currentColor" />
                    <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.9)', borderRadius: 12 }} />
                    <Line type="monotone" dataKey="points" stroke={roleTheme.glow} strokeWidth={3} />
                    <Line type="monotone" dataKey="efficiency" stroke={teamColors.primary} strokeWidth={3} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </GlassCardContent>
          </GlassCard>
        </Grid>
        <Grid item xs={12} lg={4}>
          <GlassCard glowColor={teamColors.primary}>
            <GlassCardContent>
              <Typography variant="h6" fontWeight={700}>Next Match Briefing</Typography>
              {nextMatch ? (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="h5" fontWeight={800} color="primary.main">{nextMatch.homeTeam} vs {nextMatch.awayTeam}</Typography>
                  <Typography color="text.secondary" sx={{ mt: 1 }}>{nextMatch.matchDate} • {nextMatch.venue}</Typography>
                  <Box sx={{ mt: 3, p: 2, borderRadius: 2, bgcolor: `${roleTheme.glow}15`, border: `1px solid ${roleTheme.glow}33` }}>
                    <Typography fontWeight={700} sx={{ color: roleTheme.glow }}>Scouting Focus</Typography>
                    <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>Transition defense and rim protection in the first half. Limit opponent second-chance points.</Typography>
                  </Box>
                </Box>
              ) : (
                <Typography color="text.secondary" sx={{ mt: 2 }}>No scheduled match — create one in Games.</Typography>
              )}
            </GlassCardContent>
          </GlassCard>
        </Grid>
      </Grid>

      <GlassCard glowColor={roleTheme.glow}>
        <GlassCardContent>
          <Typography variant="h6" fontWeight={700}>AI Coaching Recommendations</Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {(analysisEntries[0]?.recommendations || ['Increase pick-and-roll frequency with your primary ball handler', 'Deploy full-court press in Q3 when trailing by 5+', 'Rest starters earlier — fatigue index is elevated']).map((rec) => (
              <Grid item xs={12} md={4} key={rec}>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.04)', height: '100%' }}>
                  <Typography fontWeight={600}>{rec}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </GlassCardContent>
      </GlassCard>
    </Box>
  );
}

export function StatisticianDashboard({ data, summary, reports, userName, season }) {
  const { teamColors } = useThemePreferences();
  const roleTheme = getRoleTheme('Statistician');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <HeroBanner role="Statistician" userName={userName} teamName={data.profile.name} season={season} />

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}><StatTile title="Total Matches" value={summary.total} subtitle="In database" icon={SportsBasketballRoundedIcon} color={roleTheme.glow} delay={0.1} /></Grid>
        <Grid item xs={12} sm={6} md={3}><StatTile title="Reports" value={reports.length} subtitle="Imported PDFs" icon={TrendingUpRoundedIcon} color={teamColors.primary} delay={0.15} /></Grid>
        <Grid item xs={12} sm={6} md={3}><StatTile title="Data Points" value="2.4k" subtitle="Tracked this season" icon={FitnessCenterRoundedIcon} color="#a78bfa" delay={0.2} /></Grid>
        <Grid item xs={12} sm={6} md={3}><StatTile title="Accuracy" value="96%" subtitle="Extraction rate" icon={EmojiEventsRoundedIcon} color={teamColors.secondary} delay={0.25} /></Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          <GlassCard glowColor={roleTheme.glow}>
            <GlassCardContent>
              <Typography variant="h6" fontWeight={700}>Analytics Overview</Typography>
              <Box sx={{ height: 280, mt: 2 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.performance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                    <XAxis dataKey="name" stroke="currentColor" />
                    <YAxis stroke="currentColor" />
                    <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.9)', borderRadius: 12 }} />
                    <Line type="monotone" dataKey="points" stroke={roleTheme.glow} strokeWidth={3} name="Points" />
                    <Line type="monotone" dataKey="efficiency" stroke={teamColors.primary} strokeWidth={3} name="Efficiency" />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </GlassCardContent>
          </GlassCard>
        </Grid>
        <Grid item xs={12} lg={4}>
          <GlassCard glowColor={teamColors.primary}>
            <GlassCardContent>
              <Typography variant="h6" fontWeight={700}>Recent Reports</Typography>
              <Stack spacing={1.5} sx={{ mt: 2 }}>
                {reports.slice(0, 4).map((report) => (
                  <Box key={report.id} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.04)' }}>
                    <Typography fontWeight={600} variant="body2">{report.name}</Typography>
                    <Typography color="text.secondary" variant="caption">{report.type} • {report.uploadedAt}</Typography>
                  </Box>
                ))}
                {!reports.length && <Typography color="text.secondary">No reports imported yet.</Typography>}
              </Stack>
            </GlassCardContent>
          </GlassCard>
        </Grid>
      </Grid>

      <GlassCard glowColor={roleTheme.glow}>
        <GlassCardContent>
          <Typography variant="h6" fontWeight={700}>Data Pipeline Status</Typography>
          <Stack spacing={2} sx={{ mt: 2 }}>
            {[
              { label: 'PDF Extraction', progress: 96 },
              { label: 'Box Score Parsing', progress: 88 },
              { label: 'Player Stats Sync', progress: 72 },
              { label: 'Report Generation', progress: 100 },
            ].map((item) => (
              <Box key={item.label}>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                  <Typography variant="body2">{item.label}</Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ color: roleTheme.glow }}>{item.progress}%</Typography>
                </Stack>
                <LinearProgress variant="determinate" value={item.progress} sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.08)', '& .MuiLinearProgress-bar': { bgcolor: roleTheme.glow, borderRadius: 3 } }} />
              </Box>
            ))}
          </Stack>
        </GlassCardContent>
      </GlassCard>
    </Box>
  );
}

export function TeamManagerDashboard({ data, summary, matches, userName, season }) {
  const { teamColors } = useThemePreferences();
  const roleTheme = getRoleTheme('Team Manager');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <HeroBanner role="Team Manager" userName={userName} teamName={data.profile.name} season={season} />

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}><StatTile title="Active Teams" value="2" subtitle="Under management" icon={SportsBasketballRoundedIcon} color={roleTheme.glow} delay={0.1} /></Grid>
        <Grid item xs={12} sm={6} md={3}><StatTile title="Season Games" value={summary.total} subtitle="Total scheduled" icon={TrendingUpRoundedIcon} color={teamColors.primary} delay={0.15} /></Grid>
        <Grid item xs={12} sm={6} md={3}><StatTile title="Staff Members" value="8" subtitle="Coaches & stats" icon={FitnessCenterRoundedIcon} color={teamColors.secondary} delay={0.2} /></Grid>
        <Grid item xs={12} sm={6} md={3}><StatTile title="Budget Used" value="74%" subtitle="Season allocation" icon={EmojiEventsRoundedIcon} color="#fbbf24" delay={0.25} /></Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <GlassCard glowColor={roleTheme.glow}>
            <GlassCardContent>
              <Typography variant="h6" fontWeight={700}>Organization Overview</Typography>
              <Stack spacing={2} sx={{ mt: 2 }}>
                {[
                  { label: 'USIU Tigers (Men)', status: 'Active', games: summary.total },
                  { label: 'USIU Flames (Women)', status: 'Active', games: 6 },
                ].map((team) => (
                  <Box key={team.label} sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography fontWeight={700}>{team.label}</Typography>
                      <Chip label={team.status} size="small" sx={{ mt: 0.5, bgcolor: `${roleTheme.glow}22`, color: roleTheme.glow }} />
                    </Box>
                    <Typography variant="h5" fontWeight={800} sx={{ color: teamColors.primary }}>{team.games}</Typography>
                  </Box>
                ))}
              </Stack>
            </GlassCardContent>
          </GlassCard>
        </Grid>
        <Grid item xs={12} md={6}>
          <GlassCard glowColor={teamColors.primary}>
            <GlassCardContent>
              <Typography variant="h6" fontWeight={700}>Upcoming Schedule</Typography>
              <Stack spacing={1.5} sx={{ mt: 2 }}>
                {matches.filter((m) => m.status === 'Scheduled').slice(0, 4).map((match) => (
                  <Box key={match.id || match.matchDate} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.04)' }}>
                    <Typography fontWeight={600}>{match.homeTeam} vs {match.awayTeam}</Typography>
                    <Typography color="text.secondary" variant="caption">{match.matchDate} • {match.venue}</Typography>
                  </Box>
                ))}
                {!matches.filter((m) => m.status === 'Scheduled').length && (
                  <Typography color="text.secondary">No upcoming matches scheduled.</Typography>
                )}
              </Stack>
            </GlassCardContent>
          </GlassCard>
        </Grid>
      </Grid>

      <GlassCard glowColor={roleTheme.glow}>
        <GlassCardContent>
          <Typography variant="h6" fontWeight={700}>Management Tasks</Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {[
              { task: 'Review player registrations', priority: 'High', color: '#ef4444' },
              { task: 'Confirm venue bookings', priority: 'Medium', color: roleTheme.glow },
              { task: 'Approve travel budget', priority: 'High', color: '#ef4444' },
              { task: 'Update league standings', priority: 'Low', color: '#64748b' },
            ].map((item) => (
              <Grid item xs={12} sm={6} md={3} key={item.task}>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.04)', borderTop: `3px solid ${item.color}` }}>
                  <Typography fontWeight={600} variant="body2">{item.task}</Typography>
                  <Chip label={item.priority} size="small" sx={{ mt: 1, bgcolor: `${item.color}22`, color: item.color, fontSize: '0.7rem' }} />
                </Box>
              </Grid>
            ))}
          </Grid>
        </GlassCardContent>
      </GlassCard>
    </Box>
  );
}
