# Bilik — Local-network buzzer competition

Azerbaijani-language live competition application with **Xəmsə** and **Brain Ring**. Express serves the frontend and Socket.IO synchronizes all devices over WebSockets. No internet connection, CDN, or external font is needed after installation.

## Installation and startup

Use Node.js 22 or newer:

```bash
npm install
npm start
```

Development with automatic server restarts: `npm run dev`.

- Player: **http://localhost:3000/**
- Admin: **http://localhost:3000/admin**
- Default development admin code: **`parol`**

The server listens on **0.0.0.0** and prints available LAN URLs. Copy `.env.example` to `.env` to configure `ADMIN_PASSWORD` and `PORT`, or set them in the environment:

```bash
ADMIN_PASSWORD='your-new-code' PORT=3000 npm start
```

`parol` is only a development default and MUST be changed for real use. Admin commands are authenticated on the server. The current browser tab keeps the admin password in session storage for reconnection; signing out clears it. This application is intended for a trusted LAN.

## Connect other devices

1. Connect the host computer and player devices to the same Wi-Fi/LAN.
2. Find the host's local IPv4 address:
   - Windows: `ipconfig`
   - Linux: `ip addr`
   - macOS: `ifconfig` or `ipconfig getifaddr en0`
3. For an address of `192.168.1.25`, players open **http://192.168.1.25:3000/**; the admin opens **http://192.168.1.25:3000/admin**.
4. Allow inbound TCP port 3000 in the host firewall if necessary. Guest-network isolation can block device-to-device connections.

Players enter only a name, which can also be a team name. A generated player ID and secret reconnect token are stored locally. Refreshing or reconnecting restores the same identity and current game state. Multiple tabs share one identity and cannot submit twice. Offline players remain registered. A separate admin removal action revokes their current connection authorization.

## Xəmsə

Xəmsə is played in repeated **mərhələ** (stages), each with exactly five questions. Set the stage nominal with **100**, **200**, **300**, or a custom positive integer up to 1,000,000 before starting its first question. The nominal remains fixed during the stage. The server computes every question's value:

```javascript
questionPoints = nominalPoints * questionNumber; // questionNumber: 1–5
```

| Nominal | Q1  | Q2  | Q3  | Q4   | Q5   |
| ------- | --- | --- | --- | ---- | ---- |
| 100     | 100 | 200 | 300 | 400  | 500  |
| 200     | 200 | 400 | 600 | 800  | 1000 |
| 300     | 300 | 600 | 900 | 1200 | 1500 |

The admin and player screens prominently show the current question/value, for example **Sual 4 / 5 — 800 xal**.

1. **Sualı başlat** opens the buzzer. The question is read aloud; no written question is displayed. Players may buzz once, and every accepted buzz retains its server-assigned position.
2. The first unjudged player in buzzer order becomes the current answering candidate. Additional buzzes continue to be recorded in order.
3. **- Səhv** automatically deducts the current question value from that candidate, then selects the next unjudged player. Negative total scores are permitted. If nobody remains in the queue, other players can still buzz.
4. **+ Düzgün** automatically adds the current question value and finishes the question. There is no manually entered award amount. Repeated/stale judgment commands cannot score again.
5. **Sualı bitir** manually closes an unanswered question. **Növbəti sual** is enabled only after the current question finishes and returns to the disabled waiting state. It never opens the buzzer automatically.
6. After question 5, **Növbəti sual** is disabled and **Növbəti mərhələ** becomes available. The stage number increments, question number resets to 1, totals are preserved, and the nominal can be changed again. There is no question 6. The previous nominal is preselected for the new stage.

**Sualı sıfırla** requires confirmation and reverses only the current question's score changes before clearing its results and issuing a new question ID. Scores earned on other questions remain intact. This prevents replaying a reset question from duplicating points. Resetting question 1 also permits correcting its nominal before restarting it. **Yenidən başlat** requires confirmation and resets the whole Xəmsə competition to stage 1, question 1, nominal 100, and zero scores, retaining registered players.

## Live leaderboards

Both games show a numbered leaderboard sorted by total score descending, including offline registered players. Equal scores retain registration order. The admin sees the full list on the dashboard and player-management page; players can expand a compact **Xal cədvəli**. Every score change is broadcast immediately. Each game has independent totals; switching modes preserves both competitions' scores. Only authenticated admin judgments can change scores.

## Local sound effects

Both modes use short Web Audio tones synthesized locally by `client/sounds.js`; there are no audio downloads, CDN URLs, or background music. Cues cover accepted buzzes, correct/wrong judgments, false starts, answering/timer start, timer expiry, confirmed point awards, and next-question/next-stage transitions. Xəmsə uses the start cue when answering opens; it does not acquire a countdown timer.

Use **Səslər: Açıq / Bağlı** in the admin header. The browser remembers the preference in local storage. Sound defaults to enabled for admins and disabled for players; players have their own optional toggle. The browser must receive a tap/click/key gesture before audio is unlocked. Unsupported or blocked audio never stops gameplay. Muting stops scheduled tones immediately.

The server emits unique, transient `sound` events only for successful actions. They are not part of reconnect snapshots, so refreshing or reconnecting does not replay historical effects. Clients deduplicate events, discard old cues, and bound audio bursts from simultaneous buzzes.

## Brain Ring

Each round contains multiple questions. Scores accumulate across questions and rounds until **Yenidən başlat**.

### Question and timer flow

1. **Raundu başlat** enters `READING_QUESTION`. Pressing the buzzer during reading creates **ERKƏN BASMA** and disqualifies that player for this question.
2. Choose the question value with **1 xal**, **2 xal**, **3 xal**, or a custom positive integer up to 10,000. The initial default is 1. It can be changed before judgment; the selected question value carries to the next question.
3. **VAXT GETDİ** opens answering and starts exactly **20 seconds of total running answer time**.
4. The first eligible buzz becomes the current candidate and immediately pauses the timer. Remaining time is preserved to millisecond precision internally and displayed to one decimal place.
5. Other eligible players may join the queue throughout `ANSWER_PENDING`. This explicit rule preserves near-simultaneous buzzes deterministically. Each player appears at most once, in server receipt order. There is no client-side timing window.
6. **CAVAB SƏHVDİR** gives no points and permanently disqualifies that player for this question. The next queued candidate takes over while time remains paused. If the queue is empty, the timer resumes from its exact remaining budget, never from 20 again.
7. **CAVAB DÜZGÜNDÜR** enters `POINTS_PENDING`. The configured question value is preselected as the award. The admin can choose **+1**, **+2**, **+3**, or a custom value, and must press **+N xal ver · Təsdiqlə**. No score changes before that confirmation.
8. The confirmed award is added once, the queue is closed, and the question becomes `QUESTION_FINISHED`. Players see the result; the admin must explicitly press **Növbəti sual**.
9. If running time reaches zero before a buzz arrives, the server finishes the question with **Vaxt bitdi** and no points. Paused time never expires in the background.

**Növbəti sual** creates a fresh question ID and resets time to 20 seconds, candidate, queue, order, attempted-player eligibility, false starts, active answer history, and result. It preserves total scores and starts in `READING_QUESTION`. **Sualı bitir / keç** provides a confirmed manual end/skip, including during pending judgment; no additional points are awarded. Next-question controls are disabled until the question has ended.

### Rounds and winner selection

After a question finishes, **Raundu bitir** closes the round. In **Raund qalibini seç**, select an online registered player/team and confirm **Qalib kimi təsdiqlə**. The winner is recorded explicitly, regardless of score. A low-scoring player can be the admin-selected winner; the app never infers one.

**Yeni raundu başlat** becomes available after the winner is confirmed. It increments the round number, creates a new round ID, returns the question number to 1, keeps total scores, and starts a fresh reading phase. The admin sees round winners and expandable question history, including decisions and awarded points.

### Restart

**Yenidən başlat** displays:

> Bütün xallar, raundlar və nəticələr sıfırlanacaq. Davam edilsin?

Confirming creates a new competition, round, and question identity; resets round/question counters to 1, all scores to 0, point value to 1, and timer to a stopped 20 seconds; and clears candidates, queues, attempts, false starts, answers, results, question history, and round winners. It returns to `WAITING`. Registered players and connections are retained. Canceling the dialog changes nothing.

### Reconnection, removal, and mode changes

A disconnected candidate or queued player retains their place so a transient network fault cannot reorder a live competition. Admins may judge them normally or explicitly remove them. Removing a queued player removes that queue entry; removing the current candidate advances the queue or resumes time. Removing a candidate awaiting an award ends that question without an award. Historical names/results are retained.

Changing away from Brain Ring explicitly ends any active question and stops its timer. Returning to Brain Ring preserves scores and history; use the restart control to clear the competition. Changing away from an active Xəmsə question closes that question. Returning preserves its stage, question, and scores; each mode has its own confirmed competition restart.

### States

```text
WAITING → READING_QUESTION → ANSWERING_OPEN
ANSWERING_OPEN → ANSWER_PENDING (first buzz, timer pauses)
ANSWER_PENDING → ANSWER_PENDING (wrong answer, queue has another candidate)
ANSWER_PENDING → ANSWERING_OPEN (wrong answer, queue exhausted)
ANSWER_PENDING → POINTS_PENDING (correct answer)
POINTS_PENDING → QUESTION_FINISHED (confirmed award)
ANSWERING_OPEN → QUESTION_FINISHED (timeout)
QUESTION_FINISHED → READING_QUESTION (next question)
QUESTION_FINISHED → ROUND_FINISHED (admin ends round)
ROUND_FINISHED → READING_QUESTION (winner confirmed, new round)
any state → WAITING (confirmed competition restart)
```

## Server authority and protocol

A single Node event loop serializes state changes. `server/brain.js` uses a monotonic clock (`performance.now`) and a deadline only while running. Pausing captures remaining milliseconds and removes the deadline. The server checks expiry both in its 100 ms scheduler and before processing commands/buzzes, so a delayed scheduler callback cannot admit a late buzz. Clients receive measured timer updates over WebSockets and never decide expiry or independently count down. Network latency affects receipt order; no claim is made about which physical tap happened first on devices with different latency.

Each competition, Brain Ring round / Xəmsə stage, and question has a separate unique ID. Mutations require all three current IDs; judgments and award controls additionally require the expected candidate ID. Duplicate buzzes are idempotent; repeat or stale awards cannot change scores twice. Clients cannot set scores directly.

Events:

- `register` `{ name, playerId?, token? }`
- `login` `{ password }`
- `answer` `{ competitionId, roundId, questionId }`
- `admin` `{ action, value?, competitionId, roundId, questionId, candidateId? }`
- `state` — full authoritative role-specific snapshot
- `timer` — server-measured remaining time and IDs, sent while running
- `sound` — one-shot event `{ id, kind, mode, timestamp }` for local audio cues
- `removed` — revokes a removed player's current identity

Brain Ring actions: `start`, `open`, `setPoints`, `incorrect`, `correct`, `setAwardPoints`, `award`, `endQuestion`, `next`, `finish`, `winner`, `newRound`, `restart`. Shared admin actions: `select`, `remove`. Xəmsə actions: `setNominal`, `start`, `correct`, `incorrect`, `finish`, `next`, `nextStage`, `reset`, `restart`. For Xəmsə, `roundId` identifies the stage, `questionId` identifies the active question, and `candidateId` is required for score judgments.

All commands acknowledge `{ ok, error? }`. Inbound messages are limited to 100 KB, clients to 40 events per second, names to 40 characters, and login attempts per IP. UI strings are HTML-escaped. Passwords and identity tokens are not included in public snapshots.

## Project structure

- `server/index.js` — Express/Socket.IO startup and LAN binding.
- `server/sockets.js` — authentication enforcement, identities, reconnection, state/timer broadcasts.
- `server/game.js` — two-mode selection, Xəmsə stages/scoring ledger, and one-shot sound events.
- `server/brain.js` — Brain Ring timer, queue, judging, points, histories, and restart.
- `server/auth.js`, `config/index.js` — password verification and environment settings.
- `client/app.js` — shared admin/player shell, registration, mode selection, socket integration.
- `client/brain.js` — Brain Ring controls, candidate states, and history.
- `client/xemse.js` — nominal selection, five-question stages, automatic scoring controls, and player status.
- `client/leaderboard.js` — shared ranked leaderboard for both modes.
- `client/sounds.js` — local Web Audio tones, gesture unlocking, saved mute setting, event deduplication.
- `client/styles.css`, `client/icons.js`, `client/text.js` — local styles, icons, escaping.
- `test/multiplayer.test.js` — real multi-client WebSocket integration tests.
- `test/browser.mjs` — isolated desktop/mobile browser verification, including actual Web Audio scheduling.
- `test/sounds.test.js` — sound unlock, mute persistence, duplicate/expired event handling.

The third mode and its question navigation are unavailable in the live app, and the server rejects selection of it or its administration commands. Reusable `server/questions.js` and `client/quiz.js` code and any saved `data/questions.json` are retained for future work but are not loaded by the active application. Storage tests for that preserved module remain in `test/question-store.test.js`.

Competition state, scores, registered players, and histories are in memory and reset when the server process restarts. Browser reconnects do not reset them. This is a single-server local application; do not run multiple independent workers with divergent authorities for the same room.

## Verification

```bash
npm test
npx playwright install chromium
node test/browser.mjs
```

Integration tests include a **real 20-second timeout**, deterministic injected-clock tests for precise pause/resume and deadline boundaries, three-player queues, failed-player eligibility, false starts, confirmed point awards, stale/unauthorized commands, next-question cleanup, manual round winners, multiple rounds, full restart, reconnection/removal, 50 Xəmsə clients, and preserved question storage. Xəmsə tests cover 100/200 nominal values across questions 1–5, automatic addition/deduction, negative totals, candidate ordering, next-stage resets, score persistence, leaderboard sorting, custom nominals, scoped reset reversal, authorization, and sound emission.

The browser test starts an isolated server and uses a controllable server clock with real WebSocket connections. It exercises one desktop admin and three mobile browser contexts, both modes, Xəmsə scoring and all five questions, next-stage progression, shared ranked leaderboards, audio generation and mute persistence after reload, the complete Brain Ring flow, disabled controls, custom points, round winner confirmation, restart cancellation/confirmation, and absence of third-mode navigation. Screenshots are written to the system temporary directory. For an event, also verify the actual Wi-Fi access point and physical devices; local tests cannot verify venue wireless conditions.
