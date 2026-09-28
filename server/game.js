import { randomUUID } from "node:crypto";
import { BrainRing } from "./brain.js";
export const modes = ["xemse", "brain"];

export class Game {
  constructor({ clock } = {}) {
    this.players = new Map();
    this.mode = "xemse";
    this.soundEvents = [];
    this.restartXemse();
    this.brain = new BrainRing(this.players, clock, (kind) => this.sound(kind));
  }
  sound(kind) {
    this.soundEvents.push({
      id: randomUUID(),
      kind,
      mode: this.mode,
      timestamp: Date.now(),
    });
  }
  drainSounds() {
    return this.soundEvents.splice(0);
  }
  restartXemse() {
    this.competitionId = randomUUID();
    this.roundId = randomUUID();
    this.round = 1;
    this.questionNumber = 1;
    this.nominalPoints = 100;
    this.nominalLocked = false;
    this.scores = new Map();
    this.scoreHistory = [];
    this.reset("WAITING");
  }
  get questionPoints() {
    return this.nominalPoints * this.questionNumber;
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
      throw Error("Yarışma, mərhələ və ya sual artıq dəyişib.");
  }
  reset(status) {
    this.questionId = randomUUID();
    this.status = status;
    this.order = [];
    this.falseStarts = [];
    this.currentCandidate = null;
    this.answerHistory = [];
    this.questionResult = null;
  }
  nextCandidate() {
    this.currentCandidate =
      this.order.find(
        (r) =>
          this.players.has(r.playerId) &&
          !this.answerHistory.some((a) => a.playerId === r.playerId),
      ) || null;
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
  command(action, value, payload = {}) {
    if (action === "select") {
      if (!modes.includes(value)) throw Error("Oyun rejimi yanlışdır.");
      if (value === this.mode) return;
      if (this.mode === "brain") this.brain.leaveMode();
      else if (this.status === "ANSWERING_OPEN") {
        this.status = "ROUND_FINISHED";
        this.currentCandidate = null;
      }
      this.mode = value;
      return; // Each mode keeps its own competition and score totals.
    }
    if (this.mode === "brain")
      return this.brain.command(action, value, payload);
    this.checkContext(payload);
    if (action === "restart") {
      this.restartXemse();
      return;
    }
    if (action === "setNominal") {
      if (
        this.nominalLocked ||
        this.questionNumber !== 1 ||
        this.status !== "WAITING"
      )
        throw Error("Nominalı mərhələnin ilk sualı başlamazdan əvvəl seçin.");
      if (!Number.isSafeInteger(value) || value < 1 || value > 1000000)
        throw Error("Nominal 1–1000000 arasında müsbət tam ədəd olmalıdır.");
      this.nominalPoints = value;
    } else if (action === "start") {
      if (this.status !== "WAITING") throw Error("Sual artıq başlayıb.");
      this.nominalLocked = true;
      this.status = "ANSWERING_OPEN";
      this.sound("timer_start");
    } else if (action === "correct" || action === "incorrect") {
      const candidate = this.currentCandidate;
      if (
        this.status !== "ANSWERING_OPEN" ||
        !candidate ||
        payload.candidateId !== candidate.playerId
      )
        throw Error("Cavab verən oyunçu və ya sual artıq dəyişib.");
      const delta =
        action === "correct" ? this.questionPoints : -this.questionPoints;
      const total = (this.scores.get(candidate.playerId) || 0) + delta;
      if (!Number.isSafeInteger(total)) throw Error("Ümumi xal limiti aşılıb.");
      const answer = {
        ...candidate,
        ...this.context(),
        stageNumber: this.round,
        questionNumber: this.questionNumber,
        nominalPoints: this.nominalPoints,
        questionPoints: this.questionPoints,
        points: delta,
        outcome: action,
        decidedAt: Date.now(),
      };
      this.scores.set(candidate.playerId, total);
      this.answerHistory.push(answer);
      this.scoreHistory.push(answer);
      this.sound(action === "correct" ? "correct" : "wrong");
      if (action === "correct") {
        this.sound("score_awarded");
        this.questionResult = {
          name: candidate.name,
          playerId: candidate.playerId,
          points: delta,
        };
        this.currentCandidate = null;
        this.status = "ROUND_FINISHED";
      } else this.nextCandidate();
    } else if (action === "finish") {
      if (this.status !== "ANSWERING_OPEN") throw Error("Aktiv sual yoxdur.");
      this.status = "ROUND_FINISHED";
      this.currentCandidate = null;
    } else if (action === "reset") {
      // Replaying a question reverses only that question's ledger entries; no score farming.
      const totals = new Map(this.scores);
      for (const answer of this.answerHistory) {
        const total = (totals.get(answer.playerId) || 0) - answer.points;
        if (!Number.isSafeInteger(total))
          throw Error("Ümumi xal limiti aşılıb.");
        totals.set(answer.playerId, total);
      }
      this.scores = totals;
      this.scoreHistory = this.scoreHistory.filter(
        (r) => r.questionId !== this.questionId,
      );
      if (this.questionNumber === 1) this.nominalLocked = false;
      this.reset("WAITING");
    } else if (action === "next") {
      if (this.status !== "ROUND_FINISHED")
        throw Error("Əvvəlcə cari sualı bitirin.");
      if (this.questionNumber === 5)
        throw Error("Beş sual tamamlandı. Növbəti mərhələyə keçin.");
      this.questionNumber++;
      this.reset("WAITING");
      this.sound("next_question");
    } else if (action === "nextStage") {
      if (this.questionNumber !== 5 || this.status !== "ROUND_FINISHED")
        throw Error("Əvvəlcə mərhələnin beş sualını tamamlayın.");
      this.round++;
      this.roundId = randomUUID();
      this.questionNumber = 1;
      this.nominalLocked = false;
      this.reset("WAITING");
      this.sound("next_stage");
    } else throw Error("Əmr bu oyun rejimində mövcud deyil.");
  }
  answer(playerId, payload) {
    if (this.mode === "brain") return this.brain.buzz(playerId, payload);
    this.checkContext(payload);
    if (!this.players.has(playerId)) throw Error("Əvvəlcə qeydiyyatdan keçin.");
    if (this.order.some((r) => r.playerId === playerId)) return;
    if (this.status !== "ANSWERING_OPEN") throw Error("Cavab qəbulu bağlıdır.");
    const record = {
      playerId,
      name: this.players.get(playerId).name,
      timestamp: Date.now(),
      ...this.context(),
      position: this.order.length + 1,
    };
    this.order.push(record);
    if (!this.currentCandidate) this.nextCandidate();
    this.sound("buzzer");
  }
  tick() {
    return this.mode === "brain" ? this.brain.tick() : false;
  }
  removePlayer(playerId) {
    this.brain.removePlayer(playerId);
    this.players.delete(playerId);
    if (this.currentCandidate?.playerId === playerId) this.nextCandidate();
  }
  snapshot(admin = false) {
    const game =
      this.mode === "brain"
        ? this.brain.snapshot(admin)
        : {
            mode: this.mode,
            ...this.context(),
            round: this.round,
            stageNumber: this.round,
            questionNumber: this.questionNumber,
            nominalPoints: this.nominalPoints,
            nominalLocked: this.nominalLocked,
            questionPoints: this.questionPoints,
            status: this.status,
            falseStarts: [],
            order: this.order,
            currentCandidate: this.currentCandidate,
            answerHistory: this.answerHistory,
            questionResult: this.questionResult,
            scoreboard: this.scoreboard(),
            ...(admin ? { scoreHistory: this.scoreHistory } : {}),
          };
    return {
      ...game,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.sockets.size > 0,
      })),
    };
  }
}
