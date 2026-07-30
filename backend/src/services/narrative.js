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

module.exports = { generateGameNarrative };
