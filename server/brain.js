import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

export const ANSWER_TIME_MS = 20_000;
const LIVE_STATES = [
  "READING_QUESTION",
  "ANSWERING_OPEN",
  "ANSWER_PENDING",
  "POINTS_PENDING",
];
const points = (value) => {
  if (!Number.isSafeInteger(value) || value < 1 || value > 10000)
    throw Error("Xal 1–10000 arasında müsbət tam ədəd olmalıdır.");
  return value;
};

export class BrainRing {
  constructor(players, clock = () => performance.now(), notify = () => {}) {
    this.notify = notify;
    this.players = players;
    this.clock = clock;
    this.restart();
  }
  restart() {
    this.competitionId = randomUUID();
    this.roundId = randomUUID();
    this.round = 1;
    this.questionNumber = 1;
    this.scores = new Map();
    this.roundHistory = [];
    this.questionHistory = [];
    this.questionPoints = 1;
    this.freshQuestion("WAITING");
  }
  freshQuestion(status) {
    this.questionId = randomUUID();
    this.status = status;
    this.remainingMs = ANSWER_TIME_MS;
    this.deadline = null;
    this.currentCandidate = null;
    this.buzzQueue = [];
    this.order = [];
    this.falseStarts = [];
    this.attemptedPlayers = new Set();
    this.answerHistory = [];
    this.questionResult = null;
    this.awardPoints = null;
  }
  context() {
    return {
      competitionId: this.competitionId,
      roundId: this.roundId,
      questionId: this.questionId,
    };
  }
  checkContext(payload) {
    if (
      !payload ||
      Object.entries(this.context()).some(
        ([key, value]) => payload[key] !== value,
      )
    )
      throw Error("Yarışma, raund və ya sual artıq dəyişib.");
  }
  remaining() {
    return this.deadline === null
      ? this.remainingMs
      : Math.max(0, this.deadline - this.clock());
  }
  pause() {
    this.remainingMs = this.remaining();
    this.deadline = null;
  }
  resume() {
    if (this.remainingMs <= 0) {
      this.finishQuestion({ reason: "timeout" });
      return;
    }
    this.deadline = this.clock() + this.remainingMs;
    this.status = "ANSWERING_OPEN";
  }
  tick() {
    if (this.status === "ANSWERING_OPEN" && this.remaining() <= 0) {
      this.finishQuestion({ reason: "timeout" });
      return true;
    }
    return false;
  }
  timerSnapshot() {
    return {
      ...this.context(),
      remainingMs: this.remaining(),
      running: this.deadline !== null,
    };
  }
  record(playerId) {
    return {
      ...this.context(),
      playerId,
      name: this.players.get(playerId).name,
      timestamp: Date.now(),
    };
  }
  buzz(playerId, payload) {
    this.checkContext(payload);
    this.tick(); // A late event cannot sneak in between scheduler ticks.
    if (!this.players.has(playerId)) throw Error("Əvvəlcə qeydiyyatdan keçin.");
    if (this.falseStarts.some((r) => r.playerId === playerId))
      throw Error("Erkən basma: bu sualda iştirak edə bilməzsiniz.");
    if (this.attemptedPlayers.has(playerId))
      throw Error("Bu sualda artıq cavab vermisiniz.");
    if (this.order.some((r) => r.playerId === playerId)) return; // Repeated packets are idempotent.
    if (this.status === "READING_QUESTION") {
      this.falseStarts.push(this.record(playerId));
      this.notify("false_start");
      return;
    }
    // Queue throughout ANSWER_PENDING, not a browser-dependent 'simultaneous tap' window.
    if (!["ANSWERING_OPEN", "ANSWER_PENDING"].includes(this.status))
      throw Error("Cavab qəbulu bağlıdır.");
    const record = {
      ...this.record(playerId),
      position: this.order.length + 1,
    };
    this.order.push(record);
    this.notify("buzzer");
    if (this.currentCandidate) this.buzzQueue.push(record);
    else {
      this.pause();
      this.currentCandidate = record;
      this.status = "ANSWER_PENDING";
    }
  }
  checkCandidate(payload, status) {
    if (
      this.status !== status ||
      !this.currentCandidate ||
      payload.candidateId !== this.currentCandidate.playerId
    )
      throw Error("Cavab verən oyunçu və ya qərar mərhələsi artıq dəyişib.");
  }
  nextCandidate() {
    this.currentCandidate = this.buzzQueue.shift() || null;
    if (this.currentCandidate) this.status = "ANSWER_PENDING";
    else this.resume();
  }
  finishQuestion(result) {
    this.pause();
    if (result.reason === "timeout") {
      this.remainingMs = 0;
      this.notify("timer_end");
    }
    this.questionResult = { ...result, timestamp: Date.now() };
    this.currentCandidate = null;
    this.buzzQueue = [];
    this.awardPoints = null;
    this.status = "QUESTION_FINISHED";
    this.questionHistory.push({
      ...this.context(),
      round: this.round,
      questionNumber: this.questionNumber,
      questionPoints: this.questionPoints,
      remainingMs: this.remainingMs,
      order: structuredClone(this.order),
      falseStarts: structuredClone(this.falseStarts),
      answers: structuredClone(this.answerHistory),
      result: structuredClone(this.questionResult),
    });
  }
  command(action, value, payload) {
    this.checkContext(payload);
    this.tick();
    if (action === "restart") {
      this.restart();
      return;
    }
    if (action === "start") {
      if (this.status !== "WAITING") throw Error("Raund artıq başlayıb.");
      this.status = "READING_QUESTION";
    } else if (action === "open") {
      if (this.status !== "READING_QUESTION")
        throw Error("Əvvəlcə sualın oxunmasını gözləyin.");
      this.resume();
      this.notify("timer_start");
    } else if (action === "setPoints") {
      if (
        ![
          "WAITING",
          "READING_QUESTION",
          "ANSWERING_OPEN",
          "ANSWER_PENDING",
        ].includes(this.status)
      )
        throw Error("Bu mərhələdə sualın xalını dəyişmək olmaz.");
      this.questionPoints = points(value);
    } else if (action === "incorrect") {
      this.checkCandidate(payload, "ANSWER_PENDING");
      this.attemptedPlayers.add(this.currentCandidate.playerId);
      this.answerHistory.push({
        ...this.currentCandidate,
        outcome: "incorrect",
        points: 0,
        decidedAt: Date.now(),
      });
      this.nextCandidate();
      this.notify("wrong");
    } else if (action === "correct") {
      this.checkCandidate(payload, "ANSWER_PENDING");
      this.status = "POINTS_PENDING";
      this.awardPoints = this.questionPoints;
      this.notify("correct");
    } else if (action === "setAwardPoints") {
      this.checkCandidate(payload, "POINTS_PENDING");
      this.awardPoints = points(value);
    } else if (action === "award") {
      this.checkCandidate(payload, "POINTS_PENDING");
      const amount = points(this.awardPoints);
      const candidate = this.currentCandidate;
      const total = (this.scores.get(candidate.playerId) || 0) + amount;
      if (!Number.isSafeInteger(total)) throw Error("Ümumi xal limiti aşılıb.");
      this.scores.set(candidate.playerId, total);
      this.notify("score_awarded");
      this.attemptedPlayers.add(candidate.playerId);
      this.answerHistory.push({
        ...candidate,
        outcome: "correct",
        points: amount,
        decidedAt: Date.now(),
      });
      this.finishQuestion({
        reason: "correct",
        playerId: candidate.playerId,
        name: candidate.name,
        points: amount,
      });
    } else if (action === "endQuestion") {
      if (!LIVE_STATES.includes(this.status)) throw Error("Aktiv sual yoxdur.");
      this.finishQuestion({ reason: "manual" });
    } else if (action === "next") {
      if (this.status !== "QUESTION_FINISHED")
        throw Error("Əvvəlcə cari sualı bitirin.");
      this.questionNumber++;
      this.freshQuestion("READING_QUESTION");
      this.notify("next_question");
    } else if (action === "finish") {
      if (this.status !== "QUESTION_FINISHED")
        throw Error("Raundu bitirməzdən əvvəl sualı bitirin.");
      this.status = "ROUND_FINISHED";
      this.roundHistory.push({
        round: this.round,
        roundId: this.roundId,
        winner: null,
        scores: this.scoreboard(),
        finishedAt: Date.now(),
      });
    } else if (action === "winner") {
      const entry = this.roundHistory.at(-1);
      if (this.status !== "ROUND_FINISHED" || !entry || entry.winner)
        throw Error("Raund qalibi artıq seçilib və ya raund bitməyib.");
      const player = this.players.get(value);
      if (!player || !player.sockets.size) throw Error("Onlayn oyunçu seçin.");
      entry.winner = {
        playerId: player.id,
        name: player.name,
        confirmedAt: Date.now(),
      };
    } else if (action === "newRound") {
      if (this.status !== "ROUND_FINISHED" || !this.roundHistory.at(-1)?.winner)
        throw Error("Əvvəlcə raund qalibini təsdiqləyin.");
      this.round++;
      this.roundId = randomUUID();
      this.questionNumber = 1;
      this.freshQuestion("READING_QUESTION");
      this.notify("next_stage");
    } else throw Error("Əmr bu oyun rejimində mövcud deyil.");
  }
  removePlayer(playerId) {
    this.buzzQueue = this.buzzQueue.filter((r) => r.playerId !== playerId);
    if (this.currentCandidate?.playerId !== playerId) return;
    this.attemptedPlayers.add(playerId);
    this.answerHistory.push({
      ...this.currentCandidate,
      outcome: "removed",
      points: 0,
      decidedAt: Date.now(),
    });
    if (this.status === "POINTS_PENDING")
      this.finishQuestion({ reason: "removed" });
    else this.nextCandidate();
  }
  leaveMode() {
    if (LIVE_STATES.includes(this.status))
      this.finishQuestion({ reason: "mode_changed" });
  }
  scoreboard() {
    return [...this.players.values()]
      .map((p) => ({
        playerId: p.id,
        name: p.name,
        connected: p.sockets.size > 0,
        points: this.scores.get(p.id) || 0,
      }))
      .sort((a, b) => b.points - a.points);
  }
  snapshot(admin) {
    const timer = this.timerSnapshot();
    return {
      mode: "brain",
      ...this.context(),
      round: this.round,
      questionNumber: this.questionNumber,
      status: this.status,
      timer,
      questionPoints: this.questionPoints,
      awardPoints: this.awardPoints,
      order: this.order,
      falseStarts: this.falseStarts,
      currentCandidate: this.currentCandidate,
      buzzQueue: this.buzzQueue,
      attemptedPlayers: [...this.attemptedPlayers],
      answerHistory: this.answerHistory,
      questionResult: this.questionResult,
      scoreboard: this.scoreboard(),
      roundHistory: this.roundHistory,
      ...(admin ? { questionHistory: this.questionHistory } : {}),
    };
  }
}
