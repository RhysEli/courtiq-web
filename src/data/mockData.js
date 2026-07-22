export const teamOptions = [
  { value: 'usiu-men', label: 'USIU Tigers Men' },
  { value: 'usiu-women', label: 'USIU Tigers Women' },
  { value: 'usiu-division-one', label: 'USIU Tigers Division One' },
  { value: 'usiu-premier', label: 'USIU Tigers Premier League' },
];

export const mockUsers = [
  { id: 'manager-1', name: 'Asha Wanjiru', email: 'manager@courtiq.com', password: 'demo123', role: 'Team Manager' },
  { id: 'statistician-1', name: 'Rhys Cole', email: 'statistician@courtiq.com', password: 'demo123', role: 'Statistician' },
  { id: 'coach-1', name: 'Njeri Mugo', email: 'coach@courtiq.com', password: 'demo123', role: 'Coach' },
  { id: 'athlete-1', name: 'Mina Kibet', email: 'athlete@courtiq.com', password: 'demo123', role: 'Athlete' },
];

const teamData = {
  'usiu-men': {
    profile: {
      name: 'USIU Tigers Men', institution: 'United States International University', league: 'Nairobi Basketball League', season: '2026/27', colours: ['#ff7a1a', '#0f172a'], manager: 'Asha Wanjiru', statistician: 'Rhys Cole', roster: 16,
    },
    stats: [
      { title: 'Players', value: '16', subtitle: '2 imported from academy' },
      { title: 'Games', value: '24', subtitle: '12 home / 12 away' },
      { title: 'Wins', value: '17', subtitle: '71% win rate' },
      { title: 'AI Reports', value: '9', subtitle: '3 pending review' },
    ],
    performance: [
      { name: 'Sep', points: 74, efficiency: 79 },
      { name: 'Oct', points: 81, efficiency: 84 },
      { name: 'Nov', points: 78, efficiency: 82 },
      { name: 'Dec', points: 88, efficiency: 90 },
      { name: 'Jan', points: 91, efficiency: 93 },
      { name: 'Feb', points: 95, efficiency: 96 },
    ],
    recentGames: [
      { opponent: 'Strathmore', result: 'W', score: '92-84', date: 'Feb 16' },
      { opponent: 'KCAU', result: 'W', score: '76-71', date: 'Feb 09' },
      { opponent: 'UON', result: 'L', score: '74-81', date: 'Feb 03' },
    ],
    leaderboard: [
      { name: 'Mina Kibet', value: '26.8 PPG' },
      { name: 'Daniel Mwangi', value: '11.2 RPG' },
      { name: 'Juma Otieno', value: '8.4 APG' },
    ],
    players: [
      { name: 'Mina Kibet', position: 'PG', jersey: 12, height: '5’10"', weight: '148 lbs', ppg: 26.8, rpg: 4.2, apg: 7.6 },
      { name: 'Daniel Mwangi', position: 'PF', jersey: 23, height: '6’8"', weight: '235 lbs', ppg: 18.4, rpg: 11.2, apg: 1.9 },
      { name: 'Juma Otieno', position: 'SG', jersey: 7, height: '6’3"', weight: '193 lbs', ppg: 15.6, rpg: 3.8, apg: 8.4 },
      { name: 'Noah Amani', position: 'C', jersey: 32, height: '6’11"', weight: '252 lbs', ppg: 12.7, rpg: 9.4, apg: 1.1 },
    ],
    games: [
      { title: 'Home vs KU Pirates', type: 'Upcoming', date: 'Mar 22', venue: 'USIU Arena' },
      { title: 'Away vs Daystar', type: 'Upcoming', date: 'Mar 28', venue: 'Daystar Courts' },
      { title: 'Home vs UoN', type: 'Completed', date: 'Mar 08', venue: 'USIU Arena' },
      { title: 'Away vs Strathmore', type: 'Completed', date: 'Feb 16', venue: 'Strathmore Hall' },
    ],
    teamStats: [
      { category: 'Shooting %', value: '47.3%' },
      { category: 'Rebounds', value: '41.2' },
      { category: 'Assists', value: '22.8' },
      { category: 'Turnovers', value: '13.4' },
    ],
    playerStats: [
      { name: 'Mina Kibet', ppg: 26.8, rpg: 4.2, apg: 7.6, fg: '49%' },
      { name: 'Daniel Mwangi', ppg: 18.4, rpg: 11.2, apg: 1.9, fg: '54%' },
      { name: 'Juma Otieno', ppg: 15.6, rpg: 3.8, apg: 8.4, fg: '45%' },
    ],
    aiAnalysis: {
      matchSummary: 'The Tigers controlled the paint and forced 13 turnovers while maintaining a high-tempo transition offense.',
      mvp: 'Mina Kibet',
      offensiveRating: '119.6',
      defensiveRating: '104.2',
      strengths: ['Transition attack', 'Pick-and-roll control', 'Interior rebounding'],
      weaknesses: ['Late-clock isolation', 'Second-chance defense'],
      recommendations: ['Increase weak-side help rotations', 'Use more stagger screens in half-court sets'],
    },
    members: [
      { name: 'Asha Wanjiru', role: 'Team Manager', access: 'Manage roster' },
      { name: 'Rhys Cole', role: 'Statistician', access: 'Upload statistics' },
      { name: 'Njeri Mugo', role: 'Coach', access: 'Review analysis' },
    ],
  },
  'usiu-women': {
    profile: {
      name: 'USIU Tigers Women', institution: 'United States International University', league: 'Women Premier League', season: '2026/27', colours: ['#ff7a1a', '#f8fafc'], manager: 'Lina Otieno', statistician: 'Moses Kiarie', roster: 14,
    },
    stats: [
      { title: 'Players', value: '14', subtitle: '3 starters from campus team' },
      { title: 'Games', value: '21', subtitle: '10 home / 11 away' },
      { title: 'Wins', value: '15', subtitle: '71% win rate' },
      { title: 'AI Reports', value: '8', subtitle: '2 awaiting review' },
    ],
    performance: [
      { name: 'Sep', points: 70, efficiency: 77 },
      { name: 'Oct', points: 76, efficiency: 80 },
      { name: 'Nov', points: 79, efficiency: 83 },
      { name: 'Dec', points: 83, efficiency: 86 },
      { name: 'Jan', points: 86, efficiency: 89 },
      { name: 'Feb', points: 90, efficiency: 93 },
    ],
    recentGames: [
      { opponent: 'Kenyatta', result: 'W', score: '87-79', date: 'Feb 15' },
      { opponent: 'Strathmore', result: 'L', score: '68-73', date: 'Feb 06' },
      { opponent: 'Daystar', result: 'W', score: '81-74', date: 'Jan 28' },
    ],
    leaderboard: [
      { name: 'Alicia Njeri', value: '22.4 PPG' },
      { name: 'Paulette Oduor', value: '9.7 RPG' },
      { name: 'Sarah Wambui', value: '6.8 APG' },
    ],
    players: [
      { name: 'Alicia Njeri', position: 'SG', jersey: 10, height: '5’8"', weight: '145 lbs', ppg: 22.4, rpg: 4.1, apg: 5.8 },
      { name: 'Paulette Oduor', position: 'C', jersey: 21, height: '6’4"', weight: '182 lbs', ppg: 14.3, rpg: 9.7, apg: 1.2 },
      { name: 'Sarah Wambui', position: 'PG', jersey: 5, height: '5’7"', weight: '140 lbs', ppg: 13.8, rpg: 3.2, apg: 6.8 },
      { name: 'Lina Kago', position: 'SF', jersey: 15, height: '5’11"', weight: '154 lbs', ppg: 12.4, rpg: 5.8, apg: 3.5 },
    ],
    games: [
      { title: 'Home vs KCAU', type: 'Upcoming', date: 'Mar 25', venue: 'USIU Arena' },
      { title: 'Away vs Zetech', type: 'Upcoming', date: 'Apr 01', venue: 'Zetech Courts' },
      { title: 'Home vs Kenya College', type: 'Completed', date: 'Feb 15', venue: 'USIU Arena' },
      { title: 'Away vs St. Pauls', type: 'Completed', date: 'Jan 28', venue: 'St. Pauls Gym' },
    ],
    teamStats: [
      { category: 'Shooting %', value: '44.8%' },
      { category: 'Rebounds', value: '36.1' },
      { category: 'Assists', value: '18.9' },
      { category: 'Turnovers', value: '15.3' },
    ],
    playerStats: [
      { name: 'Alicia Njeri', ppg: 22.4, rpg: 4.1, apg: 5.8, fg: '46%' },
      { name: 'Paulette Oduor', ppg: 14.3, rpg: 9.7, apg: 1.2, fg: '51%' },
      { name: 'Sarah Wambui', ppg: 13.8, rpg: 3.2, apg: 6.8, fg: '44%' },
    ],
    aiAnalysis: {
      matchSummary: 'The team used a compact zone and generated extra possessions with aggressive defensive rebounding.',
      mvp: 'Alicia Njeri',
      offensiveRating: '111.8',
      defensiveRating: '107.6',
      strengths: ['Three-point spacing', 'Defensive switches', 'Fast-break outlets'],
      weaknesses: ['Ball pressure in the half court', 'Free throw routine'],
      recommendations: ['Add more late-clock set plays', 'Prioritize extra conditioning before away trips'],
    },
    members: [
      { name: 'Lina Otieno', role: 'Team Manager', access: 'Manage roster' },
      { name: 'Moses Kiarie', role: 'Statistician', access: 'Upload statistics' },
      { name: 'Grace Akinyi', role: 'Coach', access: 'Review analysis' },
    ],
  },
  'usiu-division-one': {
    profile: {
      name: 'USIU Tigers Division One', institution: 'United States International University', league: 'Division One Conference', season: '2026/27', colours: ['#ff7a1a', '#111827'], manager: 'Kevin Ngugi', statistician: 'Nadia Lewis', roster: 18,
    },
    stats: [
      { title: 'Players', value: '18', subtitle: '5 reserve contributors' },
      { title: 'Games', value: '27', subtitle: '14 conference games' },
      { title: 'Wins', value: '19', subtitle: '70% win rate' },
      { title: 'AI Reports', value: '10', subtitle: '4 this week' },
    ],
    performance: [
      { name: 'Sep', points: 73, efficiency: 78 },
      { name: 'Oct', points: 80, efficiency: 82 },
      { name: 'Nov', points: 82, efficiency: 85 },
      { name: 'Dec', points: 86, efficiency: 88 },
      { name: 'Jan', points: 89, efficiency: 91 },
      { name: 'Feb', points: 94, efficiency: 95 },
    ],
    recentGames: [
      { opponent: 'CUEA', result: 'W', score: '95-84', date: 'Feb 13' },
      { opponent: 'Kisumu', result: 'W', score: '88-80', date: 'Feb 04' },
      { opponent: 'UON', result: 'L', score: '79-84', date: 'Jan 29' },
    ],
    leaderboard: [
      { name: 'Benson Mwema', value: '24.8 PPG' },
      { name: 'Chris Ochieng', value: '10.1 RPG' },
      { name: 'Ian Ruto', value: '7.1 APG' },
    ],
    players: [
      { name: 'Benson Mwema', position: 'SF', jersey: 11, height: '6’6"', weight: '212 lbs', ppg: 24.8, rpg: 6.2, apg: 4.4 },
      { name: 'Chris Ochieng', position: 'PF', jersey: 14, height: '6’9"', weight: '228 lbs', ppg: 16.4, rpg: 10.1, apg: 1.7 },
      { name: 'Ian Ruto', position: 'PG', jersey: 4, height: '5’11"', weight: '160 lbs', ppg: 13.1, rpg: 3.9, apg: 7.1 },
      { name: 'Terry Omondi', position: 'C', jersey: 22, height: '6’10"', weight: '242 lbs', ppg: 11.8, rpg: 8.2, apg: 1.3 },
    ],
    games: [
      { title: 'Home vs KCAU II', type: 'Upcoming', date: 'Mar 24', venue: 'USIU Arena' },
      { title: 'Away vs Mombasa', type: 'Upcoming', date: 'Mar 31', venue: 'Mombasa Gym' },
      { title: 'Home vs JKUAT', type: 'Completed', date: 'Feb 13', venue: 'USIU Arena' },
      { title: 'Away vs UoN', type: 'Completed', date: 'Jan 29', venue: 'UoN Court' },
    ],
    teamStats: [
      { category: 'Shooting %', value: '46.9%' },
      { category: 'Rebounds', value: '39.4' },
      { category: 'Assists', value: '21.4' },
      { category: 'Turnovers', value: '14.1' },
    ],
    playerStats: [
      { name: 'Benson Mwema', ppg: 24.8, rpg: 6.2, apg: 4.4, fg: '48%' },
      { name: 'Chris Ochieng', ppg: 16.4, rpg: 10.1, apg: 1.7, fg: '53%' },
      { name: 'Ian Ruto', ppg: 13.1, rpg: 3.9, apg: 7.1, fg: '45%' },
    ],
    aiAnalysis: {
      matchSummary: 'The group controlled pace through balanced floor spacing and high-level rim protection.',
      mvp: 'Benson Mwema',
      offensiveRating: '116.4',
      defensiveRating: '106.3',
      strengths: ['Off-ball movement', 'Transition defense', 'Bench scoring'],
      weaknesses: ['Over-reliance on isolation', 'Early-clock turnovers'],
      recommendations: ['Add more ball-screen reads', 'Improve late-game defensive communication'],
    },
    members: [
      { name: 'Kevin Ngugi', role: 'Team Manager', access: 'Manage roster' },
      { name: 'Nadia Lewis', role: 'Statistician', access: 'Upload statistics' },
      { name: 'Timo Okech', role: 'Coach', access: 'Review analysis' },
    ],
  },
  'usiu-premier': {
    profile: {
      name: 'USIU Tigers Premier League', institution: 'United States International University', league: 'Premier League', season: '2026/27', colours: ['#ff7a1a', '#0f172a'], manager: 'Diana Maina', statistician: 'Felix Barasa', roster: 20,
    },
    stats: [
      { title: 'Players', value: '20', subtitle: '4 national team prospects' },
      { title: 'Games', value: '30', subtitle: '15 home / 15 away' },
      { title: 'Wins', value: '21', subtitle: '70% win rate' },
      { title: 'AI Reports', value: '11', subtitle: '5 this week' },
    ],
    performance: [
      { name: 'Sep', points: 77, efficiency: 80 },
      { name: 'Oct', points: 82, efficiency: 84 },
      { name: 'Nov', points: 84, efficiency: 86 },
      { name: 'Dec', points: 88, efficiency: 89 },
      { name: 'Jan', points: 92, efficiency: 93 },
      { name: 'Feb', points: 97, efficiency: 97 },
    ],
    recentGames: [
      { opponent: 'Kenyatta', result: 'W', score: '98-90', date: 'Feb 17' },
      { opponent: 'Cooperative', result: 'L', score: '82-87', date: 'Feb 10' },
      { opponent: 'State House', result: 'W', score: '91-86', date: 'Jan 30' },
    ],
    leaderboard: [
      { name: 'Dexter Mugo', value: '27.4 PPG' },
      { name: 'Kelvin Otieno', value: '10.5 RPG' },
      { name: 'Elijah Sila', value: '8.7 APG' },
    ],
    players: [
      { name: 'Dexter Mugo', position: 'PG', jersey: 9, height: '6’1"', weight: '172 lbs', ppg: 27.4, rpg: 4.7, apg: 8.7 },
      { name: 'Kelvin Otieno', position: 'PF', jersey: 18, height: '6’7"', weight: '224 lbs', ppg: 17.2, rpg: 10.5, apg: 2.1 },
      { name: 'Elijah Sila', position: 'SG', jersey: 3, height: '6’4"', weight: '198 lbs', ppg: 16.3, rpg: 3.6, apg: 8.7 },
      { name: 'Fidel Omollo', position: 'C', jersey: 25, height: '6’10"', weight: '248 lbs', ppg: 12.9, rpg: 8.8, apg: 1.6 },
    ],
    games: [
      { title: 'Home vs Cooperative', type: 'Upcoming', date: 'Mar 21', venue: 'USIU Arena' },
      { title: 'Away vs KCAU', type: 'Upcoming', date: 'Mar 30', venue: 'KCAU Courts' },
      { title: 'Home vs Kenyatta', type: 'Completed', date: 'Feb 17', venue: 'USIU Arena' },
      { title: 'Away vs State House', type: 'Completed', date: 'Jan 30', venue: 'State House Gym' },
    ],
    teamStats: [
      { category: 'Shooting %', value: '48.6%' },
      { category: 'Rebounds', value: '42.4' },
      { category: 'Assists', value: '24.1' },
      { category: 'Turnovers', value: '12.2' },
    ],
    playerStats: [
      { name: 'Dexter Mugo', ppg: 27.4, rpg: 4.7, apg: 8.7, fg: '50%' },
      { name: 'Kelvin Otieno', ppg: 17.2, rpg: 10.5, apg: 2.1, fg: '55%' },
      { name: 'Elijah Sila', ppg: 16.3, rpg: 3.6, apg: 8.7, fg: '47%' },
    ],
    aiAnalysis: {
      matchSummary: 'The team generated efficient offense from high-level rim pressure and late-clock decision making.',
      mvp: 'Dexter Mugo',
      offensiveRating: '121.8',
      defensiveRating: '103.4',
      strengths: ['Ball handling', 'Pick-and-roll spacing', 'Transition scoring'],
      weaknesses: ['Interior help communication', 'Fast break turnovers'],
      recommendations: ['Add more split action off the horn', 'Deploy a stronger help-side rotation'],
    },
    members: [
      { name: 'Diana Maina', role: 'Team Manager', access: 'Manage roster' },
      { name: 'Felix Barasa', role: 'Statistician', access: 'Upload statistics' },
      { name: 'Esther Nduta', role: 'Coach', access: 'Review analysis' },
    ],
  },
};

export function getTeamData(selectedTeam) {
  return teamData[selectedTeam] || teamData['usiu-men'];
}

export const teamProfile = {
  name: 'USIU Tigers',
  institution: 'United States International University',
  type: 'Men',
  league: 'Nairobi Basketball League',
  season: '2026 / 2027',
  colors: ['#ff7a1a', '#0f172a'],
  members: ['Coach Njeri Mugo', 'Mina Kibet', 'Daniel Mwangi', 'Juma Otieno'],
};

export const statCards = [
  { title: 'Total Players', value: '28', subtitle: '+3 this month', icon: 'Group' },
  { title: 'Games Played', value: '18', subtitle: '82% attendance', icon: 'SportsBasketball' },
  { title: 'Wins', value: '13', subtitle: '72% win rate', icon: 'EmojiEvents' },
  { title: 'Losses', value: '5', subtitle: '2 in last 5', icon: 'TrendingDown' },
];

export const performanceData = [
  { name: 'Sep', points: 78, efficiency: 84 },
  { name: 'Oct', points: 82, efficiency: 88 },
  { name: 'Nov', points: 79, efficiency: 86 },
  { name: 'Dec', points: 88, efficiency: 91 },
  { name: 'Jan', points: 91, efficiency: 93 },
  { name: 'Feb', points: 95, efficiency: 96 },
];

export const recentGames = [
  { opponent: 'Westfield Tigers', result: 'W', score: '86-74', date: 'Mar 14' },
  { opponent: 'Harbor Hawks', result: 'L', score: '71-79', date: 'Mar 08' },
  { opponent: 'River City', result: 'W', score: '94-81', date: 'Mar 02' },
];

export const players = [
  { name: 'Mina Brooks', position: 'PG', number: 12, height: '5’9"', weight: '142 lbs', status: 'Healthy' },
  { name: 'Adrian Cole', position: 'SG', number: 7, height: '6’3"', weight: '190 lbs', status: 'Ready' },
  { name: 'Jordan Lee', position: 'SF', number: 23, height: '6’5"', weight: '205 lbs', status: 'Healthy' },
  { name: 'Noah Reyes', position: 'C', number: 32, height: '6’10"', weight: '245 lbs', status: 'Monitoring' },
];

export const teams = [
  { name: 'USIU Tigers Men', institution: 'USIU', league: 'Nairobi Basketball League', season: '2026/27' },
  { name: 'USIU Tigers Women', institution: 'USIU', league: 'Women Premier League', season: '2026/27' },
  { name: 'USIU Tigers Division One', institution: 'USIU', league: 'Division One Conference', season: '2026/27' },
  { name: 'USIU Tigers Premier League', institution: 'USIU', league: 'Premier League', season: '2026/27' },
];

export const games = [
  { title: 'Home vs Westfield Tigers', type: 'Upcoming', date: 'Apr 18', venue: 'Northbridge Arena' },
  { title: 'Away vs Harbor Hawks', type: 'Upcoming', date: 'Apr 22', venue: 'Harbor Dome' },
  { title: 'Home vs River City', type: 'Completed', date: 'Apr 05', venue: 'Northbridge Arena' },
  { title: 'Away vs Summit Storm', type: 'Completed', date: 'Mar 28', venue: 'Summit Court' },
];

export const teamStats = [
  { category: 'Points per game', value: '84.2' },
  { category: 'Rebounds', value: '39.7' },
  { category: 'Assists', value: '19.4' },
  { category: 'Steals', value: '8.2' },
  { category: 'Turnovers', value: '11.8' },
];

export const playerStats = [
  { name: 'Mina Brooks', ppg: 18.4, rpg: 4.2, apg: 6.7, fg: '48%' },
  { name: 'Adrian Cole', ppg: 15.8, rpg: 3.9, apg: 3.2, fg: '44%' },
  { name: 'Jordan Lee', ppg: 12.1, rpg: 7.4, apg: 1.5, fg: '46%' },
];

export const aiAnalysis = {
  mvp: 'Mina Brooks',
  offensiveRating: '118.4',
  defensiveRating: '104.7',
  strengths: ['High shot creation', 'Transition defense', 'Clutch free throws'],
  weaknesses: ['Late-clock isolation decisions', 'Second-chance rebounding'],
  recommendations: ['Increase off-ball screening', 'Rotate quicker on weak-side help'],
};

export const teamMembers = [
  { name: 'Coach Elena', role: 'Coach', access: 'View statistics' },
  { name: 'Mina Brooks', role: 'Athlete', access: 'View personal stats' },
  { name: 'Owen Patel', role: 'Statistician', access: 'Upload statistics' },
  { name: 'Riley Kim', role: 'Team Manager', access: 'Manage players' },
];
