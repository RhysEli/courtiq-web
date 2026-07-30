# CourtIQ Backend — Setup

## Install & run
```
cd courtiq-backend
npm install
cp .env.example .env
# edit .env: set ANTHROPIC_API_KEY to your own key
npm run seed     # creates data/courtiq.db and demo users
npm run dev      # starts on http://localhost:4000
```

Demo logins (password for all: `courtiq123`):
- stats@courtiq.dev (Statistician)
- coach@courtiq.dev (Coach)
- admin@courtiq.dev (Administrator)
- manager@courtiq.dev (Team Manager)

## Run the frontend against it
```
cd courtiq-web
npm install
echo "VITE_API_URL=http://localhost:4000/api" > .env
npm run dev
```
Log in with one of the demo accounts above, go to Games → Create Game →
Upload report (Box Score, PDF only) → Analysis → Compute metrics → Generate
AI narrative.

## What's real vs. still mock
- Real: auth/RBAC, game repository, Box Score PDF extraction, the rule-based
  metrics engine (TS%, eFG%, PPP, TOV rate, ORB%, FT rate, Four Factors),
  AI narrative generation via the Claude API.
- Not yet built: extraction for the other 9 FIBA report types (Play-by-Play,
  Player Evaluation, Plus Minus Summary, Quarter Scoring, Rotation Summary,
  Lineup Analysis, Shot Areas, Shot Charts, Score Sheet) — they upload and
  store fine, just aren't parsed yet. Same goes for "Bench Superiority"
  insight tagging, which needs Rotation Summary data.
- Frontend pages other than Login and Games (Teams, Players, Statistics,
  Dashboard, Seasons, Leagues, Institutions, Settings, Reports) are still on
  mockData.js and not wired to the backend yet.

## Box Score parser — needs calibration
`src/services/pdfExtraction.js` parses Box Score PDFs with a regex built
from the public FIBA LiveStats column layout (OR, DR, REB, AST, STL, BLK,
TO, PF, then +/-). It's been tested against a synthetic sample PDF and
extracts correctly, but real FIBA exports can vary between LiveStats
versions/templates. Upload one real Box Score PDF and check the extracted
numbers against the source — if columns are off, the fix is in one place
(the regex + destructuring in that file), not a rewrite.

## Moving from SQLite to PostgreSQL
The proposal specifies PostgreSQL (via Supabase). This build uses Node 22's
built-in `node:sqlite` so it runs locally with zero external services.
`src/db/schema.sql` avoids SQLite-only syntax so porting means: swap
`src/db/index.js` for a `pg` client, replace `AUTOINCREMENT` with
`GENERATED ALWAYS AS IDENTITY`, and point `DB_PATH`-style config at a
Postgres connection string instead.
