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
    // Step 53: raised from 900 -- confirmed real (Step 53 verification
    // pass) that 900 is sometimes NOT enough margin even for this
    // function's narrower 250-350 word target: a real call for game 7,
    // same prompt/data/model, thinking already disabled (see below), cut
    // off mid-word ("...high-us") with a real stop_reason of "max_tokens",
    // while an immediate re-run of the identical call finished cleanly at
    // 873 tokens/350 words with stop_reason "end_turn" -- real run-to-run
    // verbosity variance, not a deterministic bug, but real enough to hit
    // production. 1400 mirrors generateOpponentAnalysis's own first real
    // bump (900 -> 1400 -> 2000, Step 47) for the same reason.
    max_tokens: 1400,
    // Step 53: this account's claude-sonnet-5 defaults to extended
    // thinking when this param is omitted, and thinking tokens count
    // against max_tokens with no separate budget -- confirmed real
    // (Step 53 diagnosis) that a demanding-enough prompt can silently
    // consume the ENTIRE max_tokens budget on thinking and return a
    // 200 response with a real model name but a genuinely EMPTY text
    // string, no error anywhere. This function's short, simple prompt
    // has never actually hit that wall in practice, but it's the same
    // latent risk the two new Step 53 generation functions below hit
    // immediately -- disabled explicitly everywhere in this file rather
    // than leaving it as an unaddressed risk on a function that happens
    // to have gotten lucky so far.
    thinking: { type: 'disabled' },
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
    // See generateGameNarrative's own comment above -- same real fix.
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return { text, model: response.model };
}

// Step 53 Phase 1: real, chronological game-flow narrative -- specific
// scoring runs, momentum swings, and the substitutions that drove them.
// Genuinely new ground (Step 52 investigation confirmed generateGameNarrative
// above never receives rotation/quarter/play-by-play data at all). Same
// Claude-calling pattern as the other two functions in this file, different
// prompt and payload -- real per-quarter cumulative scores, real rotation
// stints ranked by |score_diff| (the "notable" stretches), and real
// scoring + substitution play-by-play events (filtered down from the full
// event log, which also carries every rebound/foul -- see analysis.js's
// buildGameFlowData for the real filtering/team-resolution logic).
// On-demand, not persisted -- same reasoning as generateOpponentAnalysis.
async function generateGameFlowNarrative({
  homeTeamName, opponentTeamName, finalScore, quarterByTeam, notableStints, events,
}) {
  const anthropic = getClient();

  const payload = {
    homeTeamName, opponentTeamName, finalScore, quarterByTeam, notableStints, events,
  };

  const prompt = `You are a basketball analyst writing a chronological "game flow" narrative for coaching staff.
You will be given real, already-extracted data for one real game between "${homeTeamName}" (home) and
"${opponentTeamName}" (opponent): the real per-quarter scores and running cumulative score for each team,
a list of the game's most notable real lineup stints (ranked by how much they outscored or were outscored by,
with the real players, real quarter/clock window, and real score of that stretch), and a real chronological log
of every real scoring play and substitution in the game (each with real quarter, clock time, team, player, and
the real running score at that moment). Do not recompute or contradict any of this -- do not invent a run,
player, or substitution that isn't clearly supported by the data below.

Write a specific, chronological game-flow narrative (350-500 words) covering:

1. Quarter-by-quarter flow
A brief real account of how each quarter unfolded and how the score evolved, citing real cumulative scores.

2. Key momentum swings
At least 2 specific real scoring runs or swings -- name the real players or lineup involved, the real score
change, and the real clock window (e.g. quarter and time range) it happened in. Prefer the notable stints
already flagged in the data, and use the scoring events to explain HOW a run happened (which real players
scored, on what kind of real plays where the data shows it).

3. Substitutions and momentum
Where the real data shows a substitution coinciding with a momentum shift (a run starting or stopping right
after a real substitution), call this out specifically with the real players and real timing involved. If the
data doesn't clearly support a substitution-driven explanation for a swing, don't claim one.

Output plain text only -- this renders directly in a UI with no markdown support. Use the three section headers
above verbatim, on their own line (no #, ##, or other markdown heading syntax, no bold/asterisk emphasis
anywhere), and blank lines between sections.

DATA:
${JSON.stringify(payload, null, 2)}`;

  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
    // Denser than generateOpponentAnalysis's 2000 -- Step 52 flagged this
    // content (quarter-by-quarter + named runs + substitution correlation)
    // as more demanding than that 3-section report. Verified real, Step 53:
    // not truncated on either of the 2 real games tested at this budget.
    max_tokens: 2500,
    // Step 53 diagnosis: this account's claude-sonnet-5 defaults to
    // extended thinking when this param is omitted, and thinking tokens
    // count against max_tokens with no separate budget -- confirmed real
    // that game 2's real game-flow payload (larger event list than game
    // 62's) silently exhausted the entire 2500-token budget on thinking
    // before writing any real text, cutting the response off mid-sentence
    // at 452 characters with stop_reason "max_tokens" and 0 real text
    // tokens remaining. Disabled explicitly -- see generateGameNarrative's
    // own comment for the same fix, applied to every function in this file.
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return { text, model: response.model };
}

// Step 53 Phase 2: real, categorized coaching recommendations + a
// strengths/weaknesses verdict -- the structural gap Step 52 found in
// generateGameNarrative's existing single-paragraph Tactical Recommendation
// (real and grounded, but one topic, no priority tiers, no separate
// what-went-well/what-to-fix split, matching none of the 3 reference
// files' own Coaching Notes/Action Plan structure). Reuses the SAME
// already-computed real metrics/tags/players generateGameNarrative uses
// (Steps 48/49's work) -- mostly new prompt work, no new aggregation,
// per Step 52's own scope estimate. On-demand, not persisted, same
// reasoning as generateOpponentAnalysis and generateGameFlowNarrative.
async function generateCoachingVerdict({
  homeTeamName, opponentTeamName, homeMetrics, oppMetrics, insightTags, players,
}) {
  const anthropic = getClient();

  const payload = {
    homeTeamName, opponentTeamName, homeMetrics, opponentMetrics: oppMetrics, insightTags, players,
  };

  const prompt = `You are a basketball coach's analyst preparing a detailed post-game coaching report for
"${homeTeamName}"'s coaching staff, following this real game against "${opponentTeamName}". You will be given
real, already-computed team and player statistics (do not recompute or contradict them, do not invent a
statistic or player not present in the data below).

Write a detailed, categorized coaching report covering exactly these sections, in this order, with these exact
headers:

What went well
3-5 real, specific bullet points on what "${homeTeamName}" did well in this game -- reference real numbers
and real player names, not generic praise.

What must improve
3-5 real, specific bullet points on what "${homeTeamName}" must fix -- same grounding requirement.

Offense
2-4 specific, actionable real recommendations for "${homeTeamName}"'s offense, grounded in the real data above.

Defense
2-4 specific, actionable real recommendations for "${homeTeamName}"'s defense, grounded in the real data above.

Rotation and lineup
2-4 specific, actionable real recommendations about "${homeTeamName}"'s rotation or lineup usage, referencing
real plus-minus, bench, or minutes data where it's present in the data above. If no such data is present, base
this section on real per-player efficiency differences instead.

Player development
2-4 specific, individually-named real recommendations for specific real "${homeTeamName}" players, grounded in
their own real numbers above.

Output plain text only -- this renders directly in a UI with no markdown support. Use the six section headers
above verbatim, on their own line (no #, ##, or other markdown heading syntax), plain numbered lines for each
section's list (no markdown bullets or bold/asterisk emphasis anywhere), and blank lines between sections.

DATA:
${JSON.stringify(payload, null, 2)}`;

  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
    // Six headed sections (vs generateOpponentAnalysis's three) -- started
    // at the same higher ceiling as generateGameFlowNarrative above per
    // Step 52's scope estimate. Verified real, Step 53: not truncated on
    // either of the 2 real games tested at this budget.
    max_tokens: 2500,
    // Step 53 diagnosis: this account's claude-sonnet-5 defaults to
    // extended thinking when this param is omitted, and thinking tokens
    // count against max_tokens with no separate budget -- confirmed real
    // that this function's real, all-players payload (the largest of any
    // prompt in this file) silently exhausted the ENTIRE 2500-token
    // budget on thinking, on both real games tested, returning a 200 with
    // a real model name but a completely empty text string every time.
    // Disabled explicitly -- see generateGameNarrative's own comment for
    // the same fix, applied to every function in this file.
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return { text, model: response.model };
}

module.exports = {
  generateGameNarrative, generateOpponentAnalysis, generateGameFlowNarrative, generateCoachingVerdict,
};
