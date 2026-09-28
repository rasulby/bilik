import { test } from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { io as connect } from "socket.io-client";
import { createApp } from "../server/index.js";
const emit = (socket, event, payload) =>
  new Promise((resolve, reject) =>
    socket
      .timeout(3000)
      .emit(event, payload, (error, result) =>
        error ? reject(error) : resolve(result),
      ),
  );
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate, timeout = 3000) {
  const end = performance.now() + timeout;
  while (!predicate()) {
    if (performance.now() > end) throw Error("Condition timed out");
    await delay(20);
  }
}
async function setup(t, { count = 3, realClock = false } = {}) {
  let now = 0;
  const app = createApp({
    password: "test-secret",
    clock: realClock ? undefined : () => now,
  });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${app.server.address().port}`,
    sockets = [];
  t.after(async () => {
    sockets.forEach((s) => s.disconnect());
    await new Promise((resolve) => app.io.close(resolve));
  });
  const client = async () => {
    const s = connect(url, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    sockets.push(s);
    s.on("state", (state) => (s.snapshot = state));
    s.on("timer", (timer) => (s.timer = timer));
    s.sounds = [];
    s.on("sound", (event) => s.sounds.push(event));
    await new Promise((resolve, reject) => {
      s.once("connect", resolve);
      s.once("connect_error", reject);
    });
    return s;
  };
  const admin = await client();
  assert.equal(
    (await emit(admin, "login", { password: "test-secret" })).ok,
    true,
  );
  const players = [];
  for (let i = 0; i < count; i++) {
    const socket = await client();
    const identity = await emit(socket, "register", {
      name: ["A", "B", "C"][i] || `Player ${i}`,
    });
    players.push({ socket, ...identity });
  }
  const snapshot = () => app.game.snapshot(true);
  const context = () => {
    const s = snapshot();
    return {
      competitionId: s.competitionId,
      roundId: s.roundId,
      questionId: s.questionId,
      candidateId: s.currentCandidate?.playerId,
    };
  };
  return {
    ...app,
    url,
    admin,
    players,
    client,
    snapshot,
    context,
    advance: (ms) => (now += ms),
    command: (action, value, extra = {}) =>
      emit(admin, "admin", { action, value, ...context(), ...extra }),
    answer: (i, extra = {}) =>
      emit(players[i].socket, "answer", { ...context(), ...extra }),
  };
}
async function brain(f) {
  assert.equal((await f.command("select", "brain")).ok, true);
  assert.equal((await f.command("start")).ok, true);
}
async function open(f) {
  assert.equal((await f.command("open")).ok, true);
}
async function award(f, i, amount) {
  assert.equal((await f.command("setPoints", amount)).ok, true);
  await open(f);
  assert.equal((await f.answer(i)).ok, true);
  assert.equal((await f.command("correct")).ok, true);
  assert.equal((await f.command("award")).ok, true);
}

test("Xəmsə: B → A → C order, once per round, disabled next round, stale events", async (t) => {
  const f = await setup(t);
  assert.equal((await f.answer(0)).ok, false);
  await f.command("start");
  for (const i of [1, 0, 2]) assert.equal((await f.answer(i)).ok, true);
  assert.deepEqual(
    f.game.order.map((r) => r.playerId),
    [f.players[1].playerId, f.players[0].playerId, f.players[2].playerId],
  );
  await waitFor(() => f.players[0].socket.snapshot?.order.length === 3);
  assert.equal(
    f.players[0].socket.snapshot.order.find(
      (r) => r.playerId === f.players[0].playerId,
    ).position,
    2,
  );
  await Promise.all(Array.from({ length: 5 }, () => f.answer(0)));
  assert.equal(f.game.order.length, 3);
  const old = f.context();
  await f.command("finish");
  await f.command("next");
  assert.equal(f.game.status, "WAITING");
  assert.equal(f.game.order.length, 0);
  await f.command("start");
  assert.equal((await f.answer(0, old)).ok, false);
  assert.equal(f.game.order.length, 0);
  await f.command("reset");
  assert.equal(f.game.status, "WAITING");
});

test("Brain Ring: timer starts at 20, pauses near 15, and resumes remaining time with no queue", async (t) => {
  const f = await setup(t);
  await brain(f);
  assert.equal(f.snapshot().timer.remainingMs, 20000);
  await open(f);
  assert.equal(f.snapshot().timer.running, true);
  f.advance(4800);
  await waitFor(() => f.admin.timer?.remainingMs === 15200);
  assert.equal(f.players[0].socket.timer.remainingMs, 15200);
  await f.answer(0);
  assert.equal(f.snapshot().status, "ANSWER_PENDING");
  assert.equal(f.snapshot().timer.remainingMs, 15200);
  assert.equal(f.snapshot().timer.running, false);
  f.advance(30000);
  await delay(150);
  assert.equal(f.snapshot().timer.remainingMs, 15200);
  assert.equal(f.snapshot().status, "ANSWER_PENDING");
  await f.command("incorrect");
  assert.equal(f.snapshot().status, "ANSWERING_OPEN");
  assert.equal(f.snapshot().timer.remainingMs, 15200);
  f.advance(1200);
  await waitFor(() => f.admin.timer.remainingMs === 14000);
  assert.equal(f.snapshot().timer.remainingMs, 14000);
  const before = f.snapshot().timer.remainingMs;
  assert.equal((await f.answer(0)).ok, false);
  assert.equal(f.snapshot().timer.remainingMs, before);
  assert.equal(f.snapshot().order.length, 1);
});

test("Brain Ring: deterministic A → B → C queue, manual judgment, confirmed points awarded once", async (t) => {
  const f = await setup(t);
  await brain(f);
  await f.command("setPoints", 3);
  await open(f);
  f.advance(10300);
  for (const i of [0, 1, 2]) assert.equal((await f.answer(i)).ok, true);
  const first = f.context();
  assert.equal(f.snapshot().currentCandidate.playerId, f.players[0].playerId);
  assert.deepEqual(
    f.snapshot().buzzQueue.map((r) => r.playerId),
    [f.players[1].playerId, f.players[2].playerId],
  );
  await Promise.all(Array.from({ length: 5 }, () => f.answer(1)));
  assert.equal(f.snapshot().order.length, 3);
  assert.equal((await f.command("next")).ok, false);
  assert.equal((await f.command("finish")).ok, false);
  await f.command("incorrect");
  assert.equal(f.snapshot().currentCandidate.playerId, f.players[1].playerId);
  assert.equal(f.snapshot().timer.remainingMs, 9700);
  f.advance(50000);
  assert.equal(f.snapshot().timer.remainingMs, 9700);
  assert.equal((await f.command("incorrect", undefined, first)).ok, false);
  assert.equal((await f.answer(0)).ok, false);
  await f.command("correct");
  assert.equal(f.snapshot().status, "POINTS_PENDING");
  assert.equal(f.snapshot().awardPoints, 3);
  assert.equal(
    f.snapshot().scoreboard.every((p) => p.points === 0),
    true,
  );
  assert.equal((await f.command("incorrect")).ok, false);
  assert.equal((await f.command("next")).ok, false);
  assert.equal((await f.command("setAwardPoints", 0)).ok, false);
  const awardContext = f.context();
  await f.command("award");
  assert.equal(
    f.snapshot().scoreboard.find((p) => p.playerId === f.players[1].playerId)
      .points,
    3,
  );
  assert.equal(f.snapshot().questionResult.points, 3);
  assert.equal(f.snapshot().status, "QUESTION_FINISHED");
  assert.equal(f.snapshot().buzzQueue.length, 0);
  assert.equal(f.snapshot().currentCandidate, null);
  assert.equal(f.snapshot().timer.running, false);
  assert.equal((await f.command("award", undefined, awardContext)).ok, false);
  assert.equal(f.snapshot().scoreboard[0].points, 3);
  assert.equal(f.snapshot().answerHistory.length, 2);
  assert.equal(f.snapshot().questionHistory[0].answers.length, 2);
});

test("Brain Ring: false start disqualifies; next question clears all temporary state but keeps scores", async (t) => {
  const f = await setup(t);
  await brain(f);
  await f.answer(0);
  assert.equal(f.snapshot().falseStarts.length, 1);
  await f.command("setPoints", 2);
  await open(f);
  assert.equal((await f.answer(0)).ok, false);
  await f.answer(1);
  await f.command("incorrect");
  await f.answer(2);
  await f.command("correct");
  await f.command("setAwardPoints", 5);
  await f.command("award");
  const old = f.context();
  await f.command("next");
  const s = f.snapshot();
  assert.equal(s.round, 1);
  assert.equal(s.questionNumber, 2);
  assert.equal(s.status, "READING_QUESTION");
  assert.equal(s.timer.remainingMs, 20000);
  assert.equal(s.timer.running, false);
  for (const key of [
    "falseStarts",
    "attemptedPlayers",
    "buzzQueue",
    "order",
    "answerHistory",
  ])
    assert.deepEqual(s[key], []);
  assert.equal(s.currentCandidate, null);
  assert.equal(s.questionResult, null);
  assert.equal(s.scoreboard[0].points, 5);
  assert.equal(s.roundId, old.roundId);
  assert.notEqual(s.questionId, old.questionId);
  await open(f);
  assert.equal((await f.answer(0, old)).ok, false);
  assert.equal((await f.command("endQuestion", undefined, old)).ok, false);
  assert.equal((await f.answer(0)).ok, true);
});

test("Brain Ring: deadline checked on event receipt and timeout gives no points", async (t) => {
  const f = await setup(t);
  await brain(f);
  await open(f);
  f.advance(20000);
  assert.equal((await f.answer(0)).ok, false);
  assert.equal(f.snapshot().status, "QUESTION_FINISHED");
  assert.equal(f.snapshot().questionResult.reason, "timeout");
  assert.equal(f.snapshot().timer.remainingMs, 0);
  assert.equal(f.snapshot().order.length, 0);
  assert.equal(
    f.snapshot().scoreboard.every((p) => p.points === 0),
    true,
  );
  await f.command("next");
  await open(f);
  f.advance(19999);
  await f.answer(1);
  f.advance(60000);
  await delay(150);
  assert.equal(f.snapshot().status, "ANSWER_PENDING");
  assert.equal(f.snapshot().timer.remainingMs, 1);
});

test("Brain Ring: real 20-second timer broadcasts and finishes without any client action", async (t) => {
  const f = await setup(t, { realClock: true });
  await brain(f);
  const started = performance.now();
  await open(f);
  assert.ok(f.snapshot().timer.remainingMs > 19900);
  await waitFor(() => f.admin.timer?.remainingMs < 19800);
  assert.ok(f.admin.timer.remainingMs > 18000);
  await waitFor(() => f.admin.snapshot?.status === "QUESTION_FINISHED", 23000);
  assert.ok(performance.now() - started >= 19900);
  assert.equal(f.admin.snapshot.timer.remainingMs, 0);
  assert.equal(f.admin.snapshot.questionResult.reason, "timeout");
  assert.equal((await f.answer(0)).ok, false);
});

test("Brain Ring: explicit low-score round winner, new rounds keep totals, restart resets only competition", async (t) => {
  const f = await setup(t);
  await brain(f);
  await award(f, 1, 3);
  await f.command("finish");
  assert.equal((await f.command("newRound")).ok, false);
  assert.equal(f.snapshot().roundHistory[0].winner, null);
  await f.command("winner", f.players[2].playerId);
  assert.equal(
    f.snapshot().roundHistory[0].winner.playerId,
    f.players[2].playerId,
  );
  const oldRound = f.context();
  await f.command("newRound");
  assert.equal(f.snapshot().round, 2);
  assert.equal(f.snapshot().questionNumber, 1);
  assert.notEqual(f.snapshot().roundId, oldRound.roundId);
  assert.equal(f.snapshot().scoreboard[0].points, 3);
  assert.equal((await f.command("open", undefined, oldRound)).ok, false);
  await award(f, 0, 2);
  await f.command("finish");
  await f.command("winner", f.players[1].playerId);
  await f.command("newRound");
  assert.equal(f.snapshot().roundHistory.length, 2);
  assert.equal(f.snapshot().questionHistory.length, 2);
  const old = f.context();
  await f.command("restart");
  const s = f.snapshot();
  assert.equal(s.round, 1);
  assert.equal(s.questionNumber, 1);
  assert.equal(s.status, "WAITING");
  assert.equal(s.questionPoints, 1);
  assert.equal(s.timer.remainingMs, 20000);
  assert.equal(s.timer.running, false);
  assert.notEqual(s.competitionId, old.competitionId);
  for (const key of [
    "roundHistory",
    "questionHistory",
    "answerHistory",
    "order",
    "falseStarts",
    "buzzQueue",
    "attemptedPlayers",
  ])
    assert.deepEqual(s[key], []);
  assert.equal(s.currentCandidate, null);
  assert.equal(s.questionResult, null);
  assert.equal(s.awardPoints, null);
  assert.equal(
    s.scoreboard.every((p) => p.points === 0),
    true,
  );
  assert.equal(s.players.length, 3);
  assert.equal(
    s.players.every((p) => p.connected),
    true,
  );
  assert.equal((await f.answer(0, old)).ok, false);
  assert.equal((await f.command("restart", undefined, old)).ok, false);
});

test("Brain Ring: reconnect restores candidate/queue and removing candidate advances safely", async (t) => {
  const f = await setup(t);
  await brain(f);
  await open(f);
  await f.answer(0);
  await f.answer(1);
  await f.answer(2);
  const p = f.players[0];
  p.socket.disconnect();
  await waitFor(() => f.game.players.get(p.playerId).sockets.size === 0);
  const replacement = await f.client();
  await emit(replacement, "register", { playerId: p.playerId, token: p.token });
  await waitFor(
    () => replacement.snapshot?.currentCandidate?.playerId === p.playerId,
  );
  assert.equal(f.game.players.size, 3);
  assert.equal(replacement.snapshot.timer.running, false);
  await f.command("remove", f.players[1].playerId);
  assert.deepEqual(
    f.snapshot().buzzQueue.map((r) => r.playerId),
    [f.players[2].playerId],
  );
  await f.command("remove", p.playerId);
  assert.equal(f.snapshot().currentCandidate.playerId, f.players[2].playerId);
  assert.equal(f.snapshot().timer.running, false);
  assert.equal((await emit(replacement, "answer", f.context())).ok, false);
  await f.command("incorrect");
  assert.equal(f.snapshot().status, "ANSWERING_OPEN");
});

test("Authorization, malformed and stale controls, and disabled third mode", async (t) => {
  const f = await setup(t);
  await brain(f);
  for (const action of [
    "start",
    "open",
    "setPoints",
    "incorrect",
    "correct",
    "setAwardPoints",
    "award",
    "endQuestion",
    "next",
    "finish",
    "winner",
    "newRound",
    "restart",
    "remove",
    "select",
  ])
    assert.equal(
      (
        await emit(f.players[0].socket, "admin", {
          action,
          value: 3,
          ...f.context(),
        })
      ).ok,
      false,
      action,
    );
  assert.equal(
    (await emit(f.players[0].socket, "login", { password: "wrong" })).ok,
    false,
  );
  for (const value of [-1, 0, 1.5, 10001, "3", null, {}])
    assert.equal((await f.command("setPoints", value)).ok, false);
  for (const value of ["quiz", "unknown", {}, null])
    assert.equal((await f.command("select", value)).ok, false);
  for (const action of ["addQuestions", "importQuestions"])
    assert.equal((await f.command(action, [])).ok, false);
  for (const payload of [null, {}, "bad", { roundId: f.snapshot().roundId }])
    assert.equal(
      (await emit(f.players[0].socket, "answer", payload)).ok,
      false,
    );
  assert.equal(
    (await f.command("open", undefined, { competitionId: "old" })).ok,
    false,
  );
  assert.equal(f.snapshot().status, "READING_QUESTION");
  await open(f);
  await f.answer(0);
  assert.equal(
    (
      await f.command("correct", undefined, {
        candidateId: f.players[1].playerId,
      })
    ).ok,
    false,
  );
  assert.equal(
    f.snapshot().scoreboard.every((p) => p.points === 0),
    true,
  );
  assert.equal(f.snapshot().question, undefined);
  assert.equal(f.snapshot().questions, undefined);
});

test("Mode changes stop active Brain Ring time and preserve totals; manual skip closes queue", async (t) => {
  const f = await setup(t);
  await brain(f);
  await award(f, 0, 2);
  await f.command("next");
  await open(f);
  await f.answer(1);
  await f.answer(2);
  assert.equal((await f.command("next")).ok, false);
  await f.command("endQuestion");
  assert.equal(f.snapshot().questionResult.reason, "manual");
  assert.equal(f.snapshot().buzzQueue.length, 0);
  await f.command("next");
  await open(f);
  f.advance(3000);
  await f.command("select", "xemse");
  f.advance(30000);
  await f.command("select", "brain");
  assert.equal(f.snapshot().status, "QUESTION_FINISHED");
  assert.equal(f.snapshot().timer.remainingMs, 17000);
  assert.equal(f.snapshot().scoreboard[0].points, 2);
});

test("Identity: multiple tabs do not duplicate players and secrets are not public", async (t) => {
  const f = await setup(t);
  const p = f.players[0],
    other = await f.client();
  assert.equal(
    (
      await emit(other, "register", {
        playerId: p.playerId,
        token: "fake",
        name: "A",
      })
    ).ok,
    false,
  );
  await emit(other, "register", { playerId: p.playerId, token: p.token });
  assert.equal(f.game.players.size, 3);
  p.socket.disconnect();
  await delay(30);
  assert.equal(f.game.players.get(p.playerId).sockets.size, 1);
  assert.equal(f.snapshot().players[0].token, undefined);
  await f.command("start");
  await emit(other, "answer", f.context());
  await f.command("remove", p.playerId);
  assert.equal((await emit(other, "answer", f.context())).ok, false);
});

test("50 concurrent Xəmsə players: one authoritative position per player", async (t) => {
  const f = await setup(t, { count: 50 });
  await f.command("start");
  await Promise.all(f.players.map((_, i) => f.answer(i)));
  assert.equal(f.game.order.length, 50);
  assert.deepEqual(
    f.game.order.map((r) => r.position),
    Array.from({ length: 50 }, (_, i) => i + 1),
  );
  assert.equal(new Set(f.game.order.map((r) => r.playerId)).size, 50);
});

test("HTTP frontend and new Brain Ring module start successfully", async (t) => {
  const f = await setup(t, { count: 0 });
  for (const path of [
    "/",
    "/admin",
    "/app.js",
    "/brain.js",
    "/styles.css",
    "/socket.io/socket.io.js",
    "/health",
  ])
    assert.equal((await fetch(f.url + path)).status, 200, path);
  const source = await (await fetch(f.url + "/app.js")).text();
  assert.equal(
    /Sürətli sual|quiz\.js|data-mode="quiz"|Sual kitabxanası/.test(source),
    false,
  );
});

for (const nominal of [100, 200])
  test(`Xəmsə: ${nominal} nominal, automatic +/- across exactly five questions`, async (t) => {
    const f = await setup(t);
    assert.equal((await f.command("setNominal", nominal)).ok, true);
    let expectedA = 0,
      expectedB = 0;
    for (let question = 1; question <= 5; question++) {
      assert.equal(f.snapshot().questionNumber, question);
      assert.equal(f.snapshot().stageNumber, 1);
      assert.equal(f.snapshot().questionPoints, nominal * question);
      assert.equal((await f.command("start")).ok, true);
      await f.answer(0);
      await f.answer(1);
      await f.answer(2);
      const wrongContext = f.context();
      assert.equal((await f.command("incorrect", 999999)).ok, true);
      expectedA -= nominal * question;
      assert.equal(
        f
          .snapshot()
          .scoreboard.find((p) => p.playerId === f.players[0].playerId).points,
        expectedA,
      );
      assert.equal(
        f.snapshot().currentCandidate.playerId,
        f.players[1].playerId,
      );
      assert.equal(
        (await f.command("incorrect", undefined, wrongContext)).ok,
        false,
      );
      const correctContext = f.context();
      assert.equal((await f.command("correct", 1)).ok, true);
      expectedB += nominal * question;
      assert.equal(
        f
          .snapshot()
          .scoreboard.find((p) => p.playerId === f.players[1].playerId).points,
        expectedB,
      );
      assert.equal(
        (await f.command("correct", undefined, correctContext)).ok,
        false,
      );
      assert.equal(f.snapshot().status, "ROUND_FINISHED");
      assert.deepEqual(
        f.snapshot().scoreboard.map((p) => p.playerId),
        [f.players[1].playerId, f.players[2].playerId, f.players[0].playerId],
      );
      await waitFor(
        () => f.players[0].socket.snapshot?.scoreboard[0]?.points === expectedB,
      );
      if (question < 5) assert.equal((await f.command("next")).ok, true);
      if (question === 3) await delay(1050);
    }
    assert.equal((await f.command("next")).ok, false);
    assert.equal(f.snapshot().questionNumber, 5);
    assert.equal(f.snapshot().scoreboard[0].points, nominal * 15);
    assert.equal(f.snapshot().scoreboard.at(-1).points, -nominal * 15);
  });

test("Xəmsə: next stage resets to question 1, keeps scores, unlocks nominal; modes have independent totals", async (t) => {
  const f = await setup(t);
  await f.command("setNominal", 100);
  const oldStage = f.context();
  assert.equal((await f.command("nextStage")).ok, false);
  for (let question = 1; question <= 5; question++) {
    await f.command("start");
    await f.answer(0);
    await f.command("correct");
    if (question < 5) await f.command("next");
  }
  assert.equal(f.snapshot().scoreboard[0].points, 1500);
  const oldQuestion = f.context();
  assert.equal((await f.command("nextStage")).ok, true);
  assert.equal(f.snapshot().stageNumber, 2);
  assert.equal(f.snapshot().questionNumber, 1);
  assert.equal(f.snapshot().status, "WAITING");
  assert.equal(f.snapshot().scoreboard[0].points, 1500);
  assert.notEqual(f.snapshot().roundId, oldStage.roundId);
  assert.notEqual(f.snapshot().questionId, oldQuestion.questionId);
  assert.deepEqual(f.snapshot().order, []);
  assert.equal(f.snapshot().currentCandidate, null);
  assert.equal((await f.command("setNominal", 200)).ok, true);
  assert.equal(f.snapshot().questionPoints, 200);
  await f.command("start");
  assert.equal((await f.answer(0, oldQuestion)).ok, false);
  await f.answer(1);
  await f.command("correct");
  assert.deepEqual(
    f.snapshot().scoreboard.map((p) => p.points),
    [1500, 200, 0],
  );
  await f.command("select", "brain");
  assert.equal(
    f.snapshot().scoreboard.every((p) => p.points === 0),
    true,
  );
  await f.command("select", "xemse");
  assert.equal(f.snapshot().stageNumber, 2);
  assert.deepEqual(
    f.snapshot().scoreboard.map((p) => p.points),
    [1500, 200, 0],
  );
});

test("Xəmsə: nominal validation, immutable stage value, authenticated scoring and scoped reset", async (t) => {
  const f = await setup(t);
  for (const value of [0, -1, 1.5, 1000001, "200", null, {}])
    assert.equal((await f.command("setNominal", value)).ok, false);
  for (const action of [
    "setNominal",
    "correct",
    "incorrect",
    "nextStage",
    "restart",
  ])
    assert.equal(
      (
        await emit(f.players[0].socket, "admin", {
          action,
          value: 200,
          ...f.context(),
        })
      ).ok,
      false,
    );
  assert.equal((await f.command("setNominal", 250)).ok, true);
  await f.command("start");
  assert.equal((await f.command("setNominal", 300)).ok, false);
  await f.answer(0);
  await f.command("correct");
  await f.command("next");
  assert.equal(f.snapshot().questionPoints, 500);
  assert.equal((await f.command("setNominal", 300)).ok, false);
  await f.command("start");
  await f.answer(0);
  await f.answer(1);
  await f.command("incorrect");
  await f.command("correct");
  assert.deepEqual(
    f.snapshot().scoreboard.map((p) => p.points),
    [500, 0, -250],
  );
  const old = f.context();
  await f.command("reset");
  assert.deepEqual(
    f.snapshot().scoreboard.map((p) => p.points),
    [250, 0, 0],
  );
  assert.equal(f.snapshot().questionNumber, 2);
  assert.equal(f.snapshot().status, "WAITING");
  assert.equal(f.snapshot().scoreHistory.length, 1);
  assert.equal((await f.command("correct", undefined, old)).ok, false);
  await f.command("start");
  await f.answer(1);
  await f.command("correct");
  assert.deepEqual(
    f.snapshot().scoreboard.map((p) => p.points),
    [500, 250, 0],
  );
  await f.command("restart");
  assert.equal(f.snapshot().nominalPoints, 100);
  assert.equal(f.snapshot().questionNumber, 1);
  assert.equal(f.snapshot().stageNumber, 1);
  assert.equal(
    f.snapshot().scoreboard.every((p) => p.points === 0),
    true,
  );
  assert.equal(f.snapshot().players.length, 3);
});

test("Xəmsə: judged scores and candidate survive reconnect; removal advances ordered candidate", async (t) => {
  const f = await setup(t);
  await f.command("start");
  await f.answer(0);
  await f.answer(1);
  await f.answer(2);
  await f.command("incorrect");
  const p = f.players[0];
  p.socket.disconnect();
  const replacement = await f.client();
  await emit(replacement, "register", { playerId: p.playerId, token: p.token });
  await waitFor(() =>
    replacement.snapshot?.scoreboard.some(
      (row) => row.playerId === p.playerId && row.points === -100,
    ),
  );
  assert.equal(
    replacement.snapshot.currentCandidate.playerId,
    f.players[1].playerId,
  );
  assert.equal(f.game.players.size, 3);
  await f.command("remove", f.players[1].playerId);
  assert.equal(f.snapshot().currentCandidate.playerId, f.players[2].playerId);
  await f.command("correct");
  assert.deepEqual(
    f.snapshot().scoreboard.map((row) => row.points),
    [100, -100],
  );
});

test("Sound events: one-shot authoritative cues in both modes, never replayed on reconnect or rejected events", async (t) => {
  const f = await setup(t);
  await f.command("start");
  await f.answer(0);
  await f.answer(1);
  await f.answer(0);
  await f.command("incorrect");
  await f.command("correct");
  await f.command("next");
  await waitFor(() => f.admin.sounds.length === 7);
  assert.deepEqual(
    f.admin.sounds.map((e) => e.kind),
    [
      "timer_start",
      "buzzer",
      "buzzer",
      "wrong",
      "correct",
      "score_awarded",
      "next_question",
    ],
  );
  const replacement = await f.client(),
    p = f.players[0];
  await emit(replacement, "register", { playerId: p.playerId, token: p.token });
  await delay(40);
  assert.equal(replacement.sounds.length, 0);
  await brain(f);
  await f.answer(0);
  await open(f);
  assert.equal((await f.answer(0)).ok, false);
  await f.answer(1);
  await f.answer(2);
  await f.command("incorrect");
  await f.command("correct");
  await f.command("award");
  await f.command("next");
  await open(f);
  f.advance(20000);
  await waitFor(() => f.admin.sounds.at(-1)?.kind === "timer_end");
  assert.deepEqual(
    f.admin.sounds.slice(7).map((e) => e.kind),
    [
      "false_start",
      "timer_start",
      "buzzer",
      "buzzer",
      "wrong",
      "correct",
      "score_awarded",
      "next_question",
      "timer_start",
      "timer_end",
    ],
  );
  assert.equal(
    new Set(f.admin.sounds.map((e) => e.id)).size,
    f.admin.sounds.length,
  );
  assert.equal(
    f.admin.sounds.slice(7).every((e) => e.mode === "brain"),
    true,
  );
  const count = f.admin.sounds.length;
  await f.command("select", "quiz");
  await delay(40);
  assert.equal(f.admin.sounds.length, count);
});
