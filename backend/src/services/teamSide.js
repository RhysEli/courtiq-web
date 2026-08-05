// FIBA LiveStats reports don't print teams in a consistent home/away order
// -- which team's table/section comes first varies by report type and by
// game (confirmed directly: in the Lineup Analysis report for USIU vs
// Congo Nets, Congo Nets -- the away team -- printed first). Extractors
// that assigned team_side positionally ('home' = whichever section/table
// appeared first) were silently mislabeling data whenever the away team
// happened to print first.
//
// This assigns team_side by matching each block's own team name against
// the actual home team name (as parsed from the Box Score header), so the
// label is correct regardless of print order.

function normalizeTeamName(name) {
  return (name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// blocks: array of objects, each with a `team_name` field, in the order
// they were found in the PDF. homeTeamName: the actual home team's display
// name (e.g. from Box Score gameInfo.homeTeam), or null/undefined if
// unavailable. Returns a new array with `team_side` set on each block.
function assignTeamSides(blocks, homeTeamName) {
  if (blocks.length !== 2) {
    // Can't do a meaningful home/away match with anything other than
    // exactly two blocks -- fall back to positional labelling.
    return blocks.map((b, i) => ({ ...b, team_side: i === 0 ? 'home' : `team_${i}` }));
  }

  if (homeTeamName) {
    const target = normalizeTeamName(homeTeamName);
    const idx = blocks.findIndex((b) => {
      const n = normalizeTeamName(b.team_name);
      return n && target && (n.includes(target) || target.includes(n));
    });
    if (idx !== -1) {
      return blocks.map((b, i) => ({ ...b, team_side: i === idx ? 'home' : 'opponent' }));
    }
  }

  // No home team name available, or it didn't match either block's parsed
  // name -- fall back to positional assignment, but flag it so callers/DB
  // consumers can tell this wasn't confidently matched.
  return blocks.map((b, i) => ({
    ...b,
    team_side: i === 0 ? 'home' : 'opponent',
    team_side_unconfirmed: true,
  }));
}

module.exports = { assignTeamSides, normalizeTeamName };