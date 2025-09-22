# Copilot Game Spec — Knowledge-Quiz Chess-like Game

> A detailed specification and developer guide for a Next.js + TypeScript multiplayer board game using MongoDB and Socket.IO. Intended to be used as a single-file reference for GitHub Copilot prompts and as the repository README.

---

## 1. Project overview

Build a turn-based, multiplayer board game (8x8 board) that resembles chess movement but with trivia mechanics. Two teams (Team A and Team B) each have 8 pawns placed on starting rows. Pawns move one square in any direction. When a pawn attempts to **move onto a square occupied by an enemy or empty square with a category**, the moving player receives a timed multiple-choice question from that field's category. Correct answer -> move succeeds and that pawn promotes one level (pawn -> knight -> cavalry). Incorrect answer -> move fails and player loses that turn.

Key features:
- 8x8 board with randomized category assignment (8 categories total, assigned to board fields at the start of each game)
- 2 teams × 8 pawns each
- Pawn movement: 1 field in any direction
- Promotion: pawn -> knight -> cavalry (max 3 levels). Promotion now only occurs when the moving piece eliminates (captures or pushes off board) at least one enemy piece during its resolving move.
- Combat: stepping on an enemy pawn attempts capture; rules differ depending on levels
- Push-back: if a higher-level piece is attacked it will be demoted and pushed back 1 field; going out-of-bounds -> piece dies
- Timed multiple-choice questions (choices A/B/C/D) from the category assigned to the target field
- Language selection with Google Translate integration for UI and question translation
- User accounts, points, lobby, invitations, past games, global scoreboard
- Tech stack: Next.js (app router), TypeScript, MongoDB (Atlas or self-hosted), Socket.IO for real-time game updates

---

## 2. Game rules (precise)

1. Board: 8x8 grid, coordinates `x:0-7`, `y:0-7` (or algebraic `a1`-`h8`).
2. Teams: `teamA`, `teamB`. Each team has 8 pawns initially (place on rows 0 and 7 or a custom layout).
3. Piece levels: `Pawn` (level 1), `Knight` (level 2), `Cavalry` (level 3). When a piece gains a level it upgrades: Pawn→Knight→Cavalry. Max level = Cavalry.
4. Movement: any piece may move exactly one square in any direction (8-neighborhood) per turn.
5. Landing on a field triggers a question from that field's category. Questions are multiple choice (A/B/C/D) and timed (~15 seconds default, configurable per game).
6. If the mover answers correctly within time: the move completes; if the target had an enemy pawn, usual capture/push rules apply. The moving piece levels up by +1 (capped).
7. If the mover fails or times out: move is cancelled; no capture; turn ends.
8. Capture/push rules:
   - If a Pawn_A steps on Pawn_B: Pawn_B is killed (removed).
   - If a Pawn_A steps on Knight_B: Knight_B is demoted 1 level and pushed back one square in the same vector direction. If demoted, Knight->Pawn.
   - If a Pawn_A steps on Cavalry_B: Cavalry_B is demoted to Knight and pushed back one square.
   - When a piece is demoted and pushed, if the target pushed square is occupied: chain resolution needed (push that piece similarly) or block/die depending on implementation choice — choose *push chain* or *block prevents movement* (spec chooses push chain and if pushed out-of-bounds -> killed).
   - If after any push a piece is pushed out of the board bounds -> piece dies immediately.
9. Promotion condition: a moving piece upgrades by one level (Pawn→Knight→Cavalry) only if that move results in at least one enemy piece death (capture in destination or enemy pushed out-of-bounds). No promotion on purely positional (non-lethal) moves or on demotions/pushes that do not kill.
10. Win condition: either eliminate all opposing pieces or other custom scoring/point threshold.

---

## 3. Questions and categories

- There are **8 categories** (for example): `History`, `Geography`, `Theology`, `Philosophy`, `Science`, `Arts`, `Sports`, `Technology` (the user specified 4; expand to 8 — you can set exact categories in config).
- At **game start**, the 64 board fields are assigned categories randomly (but enforce distribution: each category appears ~8 times). Save this category-map in the `Game` document in DB.
- Questions are stored in a `questions` collection with these fields: `category`, `questionText`, `choices: [A,B,C,D]`, `correctIndex`, `language` (original language), `metdata` (difficulty, source).
- When a question is sent to a player, the server should select a random unused or suitably-difficult question from that field's category. Mark question as used for that game or rotate through to avoid repeats.

---

## 4. UX / UI flow

1. Login / Create account (email or OAuth). Users have profile with points, locale/language preference.
2. Lobby: create or join games, invite friends, view public games, global scoreboard.
3. Game creation: host configures time per question, categories list, public/private, language (default), points-to-win (optional).
4. Game start: server creates game doc, places pieces for both teams, generates randomized category board and persists it.
5. Turn sequence (realtime via Socket.IO):
   - Server emits `yourTurn` to player's client with timeout and allowed moves.
   - Player clicks a pawn and a target cell.
   - Client sends `attemptMove` event to server with `{gameId, from, to, pieceId}`.
   - Server verifies move validity (one-square move, not moving opponent piece, player's turn).
   - Server selects a question for that target cell category and emits `questionPrompt` to the moving player with `questionId`, `text`, `choices`, `timeLimit`.
   - Client displays multi-choice UI and starts a local countdown. Client may optionally display server time for anti-cheat.
   - Player answers `answerChoice` within time; client emits `answerSubmission`.
   - Server validates answer against stored `correctIndex`. If correct: commit move; level up piece; resolve capture/push chain; emit `updateBoard` to both players and `moveSucceeded` to mover. If incorrect: emit `moveFailed` and end turn.

6. Visuals: pieces should show level visually (glyph/icons, badges). Animations for push/demote and captures.

---

## 5. Tech architecture

- Frontend: Next.js (App Router), TypeScript, React functional components, Tailwind CSS (optional). Use SWR/React Query for non-real-time data. Use component-based UI for Board, Square, Piece, Modal (question), Lobby.
- Backend: Next.js API routes or a separate Node/Express server (TypeScript) hosting Socket.IO server. For simplicity, host Socket.IO in Next.js (edge vs serverless caveats — prefer a dedicated server or Next.js `app` with custom server).
- DB: MongoDB (players, games, questions, scores, past games). Use Mongoose or MongoDB native driver with TypeScript types.
- Auth: NextAuth.js with email/password or OAuth providers.
- Translation: use Google Cloud Translate API — client selects language, server translates UI and questions on-demand (cache translations).
- Deployment: Vercel for Next.js (if using serverless Socket.IO this becomes complex), or use a dedicated VPS/Heroku/Render for real-time server, and Vercel for static/SSR parts.

---

## 6. Data models (TypeScript interfaces - examples)

```ts
// models.ts
export type Team = 'A' | 'B';

export interface User {
  _id: string;
  email: string;
  name?: string;
  language?: string; // e.g. 'en', 'hr'
  points: number; // global points
  createdAt: Date;
}

export type PieceLevel = 1 | 2 | 3; // 1 pawn, 2 knight, 3 cavalry

export interface Piece {
  id: string;
  team: Team;
  level: PieceLevel;
  x: number; y: number;
  alive: boolean;
}

export interface Game {
  _id: string;
  players: { userId: string; team: Team }[];
  boardCategories: string[][]; // 8x8 categories by name
  pieces: Piece[];
  turnOfUserId: string;
  status: 'waiting' | 'running' | 'finished';
  createdAt: Date;
  questionHistory: { turn: number; questionId: string; correct: boolean }[];
}

export interface Question {
  _id: string;
  category: string;
  text: string;
  choices: string[]; // length 4
  correctIndex: number; // 0..3
  language: string;
}
```

---

## 7. Socket.IO event definitions

**Client -> Server**
- `createGame` `{options}`
- `joinGame` `{gameId}`
- `startGame` `{gameId}`
- `attemptMove` `{gameId, pieceId, from: {x,y}, to: {x,y}}`
- `submitAnswer` `{gameId, questionId, answerIndex}`
- `leaveGame` `{gameId}`

**Server -> Client**
- `gameCreated` `{gameId}`
- `gameJoined` `{gameState}`
- `yourTurn` `{validMoves}`
- `questionPrompt` `{questionId, text, choices, timeLimitMs}`
- `moveSucceeded` `{newGameState, pieceId}`
- `moveFailed` `{reason}`
- `boardUpdate` `{gameState}`
- `gameOver` `{result}`
- `error` `{message}`

---

## 8. API endpoints (Next.js /server)

- `POST /api/auth/*` - authentication (NextAuth)
- `GET /api/games` - list public games
- `POST /api/games` - create game
- `GET /api/games/:id` - game state (for reconnect)
- `POST /api/games/:id/start` - start
- `GET /api/questions?category=History&lang=en` - fetch question(s)
- `POST /api/translate` - proxy to Google Translate for UI/question translation (or do server-side caching)
- `GET /api/leaderboard` - global scoreboard

---

## 9. Pseudocode: move resolution

```ts
on attemptMove(gameId, playerId, pieceId, to):
  game = db.findGame(gameId)
  if game.turnOfUserId != playerId: reject
  piece = game.pieces.find(pieceId)
  if !isNeighbor(piece.pos, to): reject
  // determine the field category
  category = game.boardCategories[to.y][to.x]
  question = pickQuestionForCategory(category)
  send questionPrompt to player
  wait for submitAnswer or timeout
  if answer correct:
    // commit move and level up
    result = resolveCapture(game, piece, to)
    applyPromotions(piece)
    db.save(game)
    emit boardUpdate to both
  else:
    emit moveFailed; end turn
```

Resolve capture must implement: if destination contains enemy piece, apply capture/push/demote logic. Use vector = normalize(to - from) for push direction. If pushed square is occupied, attempt to push chain recursively. If any push forces piece out of bounds -> piece dies.

---

## 10. Google Translate integration (high level)

- Use Google Cloud Translation API (v3) with a server-side key. Do not put API key in client code.
- Workflow: when user selects language `lang`, store preference in user profile and in socket session. When sending question objects to the client, server checks question's `language`. If `question.language != lang`, call translate API to translate `text` and each choice. Cache these translations keyed by `{questionId, targetLang}` in DB or Redis.
- Also optionally translate UI strings on the server or use a client-side i18n library (i18next) combined with a translation pipeline.

---

## 11. Authentication, accounts, persistence

- Use NextAuth with JWT sessions or database sessions paired to MongoDB.
- Store `User`, `Game`, `PastGame` (for replay), `Leaderboard` entries.
- Post-game: add points to `User.points` based on kills, promotions, or victory.

---

## 12. Lobby, invites, past games

- Lobby: keep public game list via `GET /api/games?status=waiting`.
- Invitations: create an `invite` object with `gameId`, `fromUserId`, `toUserEmail` or `toUserId` and send push notification via websocket to `toUserId` if online.
- Past games: save each finished game's `gameStateHistory` array with per-turn snapshots so users can review or replay.

---

## 13. Scoreboard and points

- Points per answer: configurable. Example: correct answer grants +5 points.
- Bonus for captures and winning a game. Example: capture +10, win +50.
- Global scoreboard: aggregate `User.points` and optionally weekly leaderboards.

---

## 14. File/folder structure (starter)

```
/copilot-quiz-game
  /app (Next.js app)
    /game
      page.tsx
      components/Board.tsx
      components/Square.tsx
      components/Piece.tsx
      components/QuestionModal.tsx
  /server (optional separate server)
    server.ts (Socket.IO server)
    routes/api/*
  /lib
    db.ts
    socket.ts
    translations.ts
  /models
    user.ts
    game.ts
    question.ts
  /scripts
    seedQuestions.ts
  package.json
  tsconfig.json
  README.md
```

---

## 15. Example code snippets (TypeScript)

**Pick a question on server**
```ts
async function pickQuestion(category: string, lang: string) {
  // try cached translated question
  const q = await db.questions.findOne({ category })
  if(!q) throw new Error('no question')
  if(q.language === lang) return q
  const cached = await db.translations.findOne({ qid: q._id, lang })
  if(cached) return cached
  const translation = await translateText([q.text, ...q.choices], lang)
  await db.translations.insertOne({ qid: q._id, lang, translated: translation })
  return { ...q, text: translation[0], choices: translation.slice(1) }
}
```

**Resolve push chain (simple)**
```ts
function pushChain(game: Game, pos: Pos, vector: Vec): boolean {
  const target = pieceAt(game, pos)
  if(!target) return true
  const next = add(pos, vector)
  if(!inBounds(next)) {
    // push leads out of bounds: kill target
    removePiece(game, target.id)
    return true
  }
  const ok = pushChain(game, next, vector)
  if(!ok) return false
  // move target to next and demote
  target.level = Math.max(1, target.level - 1)
  target.x = next.x; target.y = next.y
  return true
}
```

---

## 16. GitHub Copilot prompts (starter)

_PASTE THESE PROMPTS INTO COPILOT TO GENERATE CODE FASTER_:

```js
// PROMPT: Create a TypeScript function `isNeighbor(from:Pos, to:Pos): boolean` which returns true
// if `to` is one of the 8-neighbor squares of `from`. Include boundary checks for 0..7.

// PROMPT: Generate a Next.js API route /api/games that creates a new game document with
// - randomized boardCategories (8 categories distributed evenly)
// - initial pieces for two teams
// - returns the created document

// PROMPT: Write a socket.io handler that receives `attemptMove` events, picks a question from DB,
// emits `questionPrompt` and waits for `submitAnswer`. Validate answer server-side.
```

---

## 17. Security and fairness considerations

- Server-side authoritative logic — never trust client for move validation or answer correctness.
- Rate limit answer attempts to prevent abuse.
- Obfuscate correct answers from client until validation returns.
- Cache translations and questions to avoid exposing raw DB content unnecessarily.

---

## 18. Tests and QA

- Unit tests for movement validation, pushChain, promotion rules.
- Integration tests simulating whole turn sequences with stubbed socket events.
- E2E tests (Cypress/Playwright) for UI flows: login, lobby, join game, answer prompt flows.

---

## 19. Deployment checklist

- Configure MongoDB URI in env (`MONGODB_URI`).
- Configure Google Translate API key: `GOOGLE_TRANSLATE_KEY`.
- Configure socket server origin allowed list.
- Ensure session secret and OAuth credentials are set.

---

## 20. Next steps & priorities (MVP roadmap)

1. Setup repo, TypeScript config, and CI.
2. Implement DB models and seed question script.
3. Implement authentication and user profiles.
4. Implement game creation and board generation.
5. Implement Socket.IO server + basic board update events.
6. Implement question modal and timed answer flow.
7. Implement promotion/push/capture logic and persistence.
8. Implement lobby, invitations, and global scoreboard.
9. Add translations and caching.
10. Polish UI and launch.

---

## 21. Contact-style note for contributors

If you're using this spec with GitHub Copilot, paste the Copilot prompts provided and ask Copilot to generate scaffold code for one module at a time: `board generation`, `socket handlers`, `question picking`, `translate cache`, `auth`. Keep PRs small and focused.

---

*End of spec.*

---

## Quick Start (MVP Scaffold Implemented)

This repository now contains an initial scaffold:

- Domain types in `models/types.ts`
- Board & game generation utilities in `lib/board.ts`
- MongoDB connection helper in `lib/db.ts`
- REST game creation/listing via `POST /api/games` and `GET /api/games`
- Basic game demo page at `/game` that auto-creates a demo game
- UI components: `Board`, `Square`, `Piece`, `QuestionModal`
- Seed script: `scripts/seedQuestions.ts`

### Prerequisites

1. Node.js 18+
2. MongoDB running locally or provide `MONGODB_URI` in `.env.local`.

### Install & Run

```bash
npm install
cp .env.example .env.local # (create this file and add MONGODB_URI if needed)
npm run dev
```

Then open: http://localhost:3000/game

### Seed Questions

```bash
node --loader ts-node/esm scripts/seedQuestions.ts
```

### Assets

Place piece icon images at:
- `public/images/pawn.png` (level 1)
- `public/images/knight.png` (level 2) 
- `public/images/cavalry.png` (level 3)

All images should be 48x48 or similar with transparent backgrounds recommended. Each has a fallback chain: PNG → SVG. For example, pawn fallback: `/images/pawn.png` → `/images/pawn.svg` → `/pawn.svg`. All piece levels now use images with team-based CSS filter tinting.

### Next Steps (from Spec)

1. Add Socket.IO real-time server & events.
2. Implement question selection and answer flow.
3. Add authentication (NextAuth) & user model persistence.
4. Implement push / capture / promotion logic server-side.
5. Add translations & caching layer.

### Recent Implementation Delta (Internal)

- Combat + movement resolution extracted to `lib/combat.ts` exposing `resolveCombatAndMove` which yields structured events: `promotion`, `demotion`, `push`, `kill`.
- Win condition now enforced client-side: game ends when a team has zero alive pieces (banner + toast).
- Visual feedback added: demotion flash (amber) and promotion glow (emerald) with temporary `-1` / `+1` badges on affected pieces.
- Toast messages enhanced to specify promotion level changes, demotions, and kill reasons (capture vs pushed off board).
- This prepares for migrating logic to a server-authoritative Socket.IO layer without re-writing combat mechanics.
 - Promotion rule updated: attacker now only promotes if at least one enemy piece dies during its move (capture or edge push). Pure positional moves no longer level pieces.
 - Piece visuals updated: removed solid colored circular backgrounds; level 1 pawn image is tinted via CSS filter classes (`team-a-tint`, `team-b-tint`) allowing a single monochrome base asset.
 - README and landing page feature copy adjusted to reflect capture-based promotions.

### Environment Variables

Create a `.env.local` (not committed) file based on `.env.example`:

```
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster0.9wkt8p3.mongodb.net/
MONGODB_DB=kl
NEXTAUTH_SECRET=your-long-secret
NEXTAUTH_URL=http://localhost:3000
GOOGLE_TRANSLATE_KEY=your-api-key
```

Security: Never commit real connection strings or secrets. The example file uses placeholders only.

### Troubleshooting Game Creation (500 / Internal Server Error)

If the `/game` page shows a persistent "Creating game..." or you see 500 errors for `POST /api/games`:

1. Verify `.env.local` contains a valid `MONGODB_URI` and optional `MONGODB_DB`.
2. Test connectivity:
  ```bash
  mongosh "${MONGODB_URI}" --eval 'db.runCommand({ ping: 1 })'
  ```
3. Check server logs in terminal running `npm run dev` for stack traces.
4. If MongoDB is temporarily unavailable the app now returns an ephemeral (non‑persisted) game instead of 500; a yellow notice appears above the board.
5. Ensure firewall / network allows outbound connections (for Atlas). If using Atlas, whitelist your IP.
6. Rotate credentials if you accidentally committed a real password.

Still failing? Add temporary logging inside `lib/db.ts` or run with `DEBUG=mongodb* npm run dev` to inspect driver output.

---

## Realtime (Ably Pub/Sub) Integration

This project now supports realtime lobby updates using Ably channels.

### Setup
1. Create an Ably app (choose "Pub/Sub").
2. Generate an API key and place it in `.env.local`:
  ```env
  ABLY_API_KEY=xxxx:yyyy
  ```
3. Restart dev server so the key is available to the Next.js runtime.
4. The backend token endpoint: `GET /api/realtime/token` issues a token request (anonymous clientId for now).

### Channel Naming
- Lobby channel: `lobby-{lobbyCode}`

### Events Published
- `player.joined` `{ userId }`
- `lobby.started` `{ gameId }`

The client (lobby page) subscribes and refetches lobby state or redirects on `lobby.started`.

### Publish Helper
`lib/realtime.ts` exports `publishLobbyEvent(lobbyCode, type, data)` leveraging Ably REST.

### Fallback Behavior
If `ABLY_API_KEY` is missing, publishing is a no-op; the UI still works via REST fetches (manual refresh semantics).

### Security / Rotation
- Never expose the raw API key to the client; only the token endpoint is used by the browser.
- If the key is accidentally leaked, rotate it in the Ably dashboard and update `.env.local` & production env vars.

### Future Enhancements
- Presence (`channel.presence.enter`) to show live player list without refetch.
- Sequence numbers and gap detection for robust resync.
- Game state channel (`game-{gameId}`) for turn/move events.

---