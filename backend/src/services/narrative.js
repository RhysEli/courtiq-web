const Anthropic = require('@anthropic-ai/sdk');

// The Anthropic Claude API is used exclusively for narrative text
// generation from already-computed metrics — no statistical computation
// happens here, per the proposal's design (rule-based engine stays
// deterministic; the LLM only turns numbers into prose).

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      const err = new Error('ANTHROPIC_API_KEY is not set. Add it to backend/.env to enable narrative generation.');
      err.code = 'MISSING_API_KEY';
      throw err;
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

async function generateGameNarrative({ homeTeamName, opponentTeamName, homeMetrics, oppMetrics, insightTags, topPlayers }) {
  const anthropic = getClient();

  const payload = {
    homeTeamName,
    opponentTeamName,
    homeMetrics,
    opponentMetrics: oppMetrics,
    insightTags,
    topPlayers,
  };

  const prompt = `You are writing a post-game basketball analysis summary for coaching staff.
You will be given computed statistics (already calculated — do not recompute or contradict them).
Write a concise, professional narrative (250-350 words) covering:
1. Final outcome and overall game story
2. The Four Factors breakdown and what decided the game
3. Standout player performances
4. One tactical recommendation for the coach

Do not invent statistics not present in the data below. Stay factual and grounded in the numbers.

DATA:
${JSON.stringify(payload, null, 2)}`;

  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
    max_tokens: 900,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return { text, model: response.model };
}

// Step 47 Phase 2: real, data-grounded strengths/weaknesses/areas-to-
// improve for a specific opponent matchup -- replaces opponent-
// analysis.jsx's old fixed-threshold label generator (a handful of canned
// strings like "Dominant Rebounding"/"High Turnovers", the same output
// for any team crossing the same thresholds, confirmed shallow by
// Step 46). Same Claude-calling pattern as generateGameNarrative above,
// just a different prompt and payload -- real head-to-head team totals,
// real per-player averages (both scoped to ONLY the shared games between
// these two teams, never season-wide), and the real insight tags already
// computed per game.
async function generateOpponentAnalysis({
  teamName, opponentTeamName, encounters, mine, opponent, myPlayers, opponentPlayers, tagFrequency, meetings,
}) {
  const anthropic = getClient();

  const payload = {
    teamName, opponentTeamName, encounters, mine, opponent, myPlayers, opponentPlayers, tagFrequency, meetings,
  };

  const prompt = `You are a basketball coach's analyst preparing a scouting report on an upcoming opponent.
You will be given real, already-computed statistics from every real game "${teamName}" has actually played
against "${opponentTeamName}" (${encounters} meeting${encounters === 1 ? '' : 's'} so far) -- team totals for both
sides, per-player averages for both rosters, and recurring per-game insight tags. Do not recompute or contradict
these numbers, and do not invent any statistic not present in the data below.

Write a concise, specific scouting report (250-400 words) for "${teamName}"'s coaching staff, covering exactly
three sections with these headers:

Strengths
What "${teamName}" has genuinely done well in this real matchup -- reference real player names and real numbers
from the data (e.g. a specific player's real scoring/shooting average against this opponent, a real team-level
stat differential), not generic labels.

Weaknesses
What "${teamName}" has genuinely struggled with against this specific opponent, same grounding requirement --
real numbers, real names where relevant.

Areas to Improve
Concrete, actionable recommendations for the next meeting against "${opponentTeamName}" specifically, derived
from the real patterns in the data above (e.g. the recurring insight tags, a real shooting or turnover
differential) -- not generic basketball advice that could apply to any opponent.

If there is only one real meeting so far, say so plainly rather than implying a trend from a single data point.

Output plain text only -- this renders directly in a UI with no markdown support. Use the exact section headers
above on their own line (no #, ##, or other markdown heading syntax), plain numbered lines for the Areas to
Improve list (no markdown bullets or bold/asterisk emphasis anywhere), and blank lines between sections.

DATA:
${JSON.stringify(payload, null, 2)}`;

  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
    // Higher than generateGameNarrative's 900 -- confirmed real (Step 47):
    // three full headed sections (Strengths/Weaknesses/Areas to Improve),
    // each with real player-level grounding, cut off mid-sentence in the
    // third section at both 900 and 1400 on real multi-game tests (more
    // real encounters means more real data to ground the report in, so
    // richer matchups genuinely need more room).
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return { text, model: response.model };
}

module.exports = { generateGameNarrative, generateOpponentAnalysis };
