import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../server/index.js";

let now = 0;
const app = createApp({ password: "browser-test", clock: () => now });
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const errors = [];
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const admin = await (
    await browser.newContext({ viewport: { width: 1440, height: 1050 } })
  ).newPage();
  const watch = (page) => {
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
  };
  watch(admin);
  await admin.addInitScript(() => {
    window.audioStarts = 0;
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (...args) {
      const oscillator = create.apply(this, args),
        start = oscillator.start.bind(oscillator);
      oscillator.start = (...params) => {
        window.audioStarts++;
        return start(...params);
      };
      return oscillator;
    };
  });
  const soundEvents = [];
  admin.on("websocket", (socket) =>
    socket.on("framereceived", (frame) => {
      const text = String(frame.payload);
      if (text.startsWith('42["sound",'))
        soundEvents.push(JSON.parse(text.slice(2))[1]);
    }),
  );
  const noThirdMode = async (page) => {
    await expect(
      page.getByText(/Sürətli sual|Quiz|Sual kitabxanası/),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-mode="quiz"],[data-page="questions"]'),
    ).toHaveCount(0);
  };
  await admin.goto(base + "/admin");
  await noThirdMode(admin);
  await admin.getByLabel("Admin kodu").fill("browser-test");
  await admin.getByRole("button", { name: "Daxil ol", exact: true }).click();
  await admin.getByRole("heading", { name: "Yarışmanın mərkəzi." }).waitFor();
  await expect(admin.locator("[data-mode]")).toHaveCount(2);
  await noThirdMode(admin);
  const pages = [];
  for (const name of ["Rəsul", "Aysel", "Murad"]) {
    const page = await (
      await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      })
    ).newPage();
    watch(page);
    await page.goto(base);
    await noThirdMode(page);
    await page.getByLabel("Adınız", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Yarışmaya qoşul" }).click();
    await page.getByRole("heading", { name, exact: true }).waitFor();
    pages.push(page);
  }
  const [a, b, c] = pages;
  // Xəmsə: ordered candidates, automatic +/- scores, five-question stages and local audio.
  await expect(a.locator("#buzz")).toBeDisabled();
  await admin.locator('[data-nominal="200"]').click();
  await expect(admin.locator(".question-value h3")).toHaveText(
    "Sual 1 / 5 — 200 xal",
  );
  await admin
    .getByRole("button", { name: "Sualı başlat", exact: true })
    .click();
  await expect
    .poll(() => admin.evaluate(() => window.audioStarts))
    .toBeGreaterThan(0);
  await expect(a.locator("#buzz")).toBeEnabled();
  await b.locator("#buzz").tap();
  await b.getByRole("heading", { name: "Siz 1-ci oldunuz" }).waitFor();
  await a.locator("#buzz").tap();
  await a.getByRole("heading", { name: "Siz 2-ci oldunuz" }).waitFor();
  await a.reload();
  await a.getByRole("heading", { name: "Siz 2-ci oldunuz" }).waitFor();
  await expect(admin.locator(".candidate-card")).toContainText(
    "Cavab verir: Aysel",
  );
  await admin.getByRole("button", { name: "- Səhv", exact: true }).click();
  await expect(admin.locator(".candidate-card")).toContainText(
    "Cavab verir: Rəsul",
  );
  await expect(
    admin.locator(".score-row").filter({ hasText: "Aysel" }),
  ).toContainText("-200 xal");
  await admin.getByRole("button", { name: "+ Düzgün", exact: true }).click();
  await expect(admin.locator(".score-row").first()).toContainText("Rəsul");
  await expect(admin.locator(".score-row").first()).toContainText("200 xal");
  await b.locator(".player-score-details summary").click();
  await expect(b.locator(".score-row").first()).toContainText("Rəsul");
  await expect(b.locator(".score-row").last()).toContainText("-200 xal");
  await b.screenshot({
    path: join(tmpdir(), "bilik-xemse-player.png"),
    fullPage: true,
  });
  await admin.screenshot({
    path: join(tmpdir(), "bilik-xemse-admin.png"),
    fullPage: true,
  });
  await admin.locator("[data-sound-toggle]").click();
  await expect(admin.locator("[data-sound-toggle]")).toHaveText(
    "Səslər: Bağlı",
  );
  const audioBefore = await admin.evaluate(() => window.audioStarts);
  await admin
    .getByRole("button", { name: "Növbəti sual", exact: true })
    .click();
  await expect(admin.locator(".question-value h3")).toHaveText(
    "Sual 2 / 5 — 400 xal",
  );
  assert.equal(await admin.evaluate(() => window.audioStarts), audioBefore);
  await admin.reload();
  await admin.getByRole("heading", { name: "Yarışmanın mərkəzi." }).waitFor();
  await expect(admin.locator("[data-sound-toggle]")).toHaveText(
    "Səslər: Bağlı",
  );
  assert.equal(await admin.evaluate(() => window.audioStarts), 0);
  await admin.locator("[data-sound-toggle]").click();
  await expect(admin.locator("[data-sound-toggle]")).toHaveText("Səslər: Açıq");
  for (let question = 2; question <= 5; question++) {
    await expect(admin.locator(".question-value h3")).toHaveText(
      `Sual ${question} / 5 — ${question * 200} xal`,
    );
    await expect(a.locator("#buzz")).toBeDisabled();
    await admin
      .getByRole("button", { name: "Sualı başlat", exact: true })
      .click();
    await expect(a.locator("#buzz")).toBeEnabled();
    await a.locator("#buzz").tap();
    await expect(admin.locator(".candidate-card")).toContainText(
      "Cavab verir: Rəsul",
    );
    await admin.getByRole("button", { name: "+ Düzgün", exact: true }).click();
    if (question < 5)
      await admin
        .getByRole("button", { name: "Növbəti sual", exact: true })
        .click();
  }
  await expect(
    admin.getByRole("button", { name: "Növbəti sual", exact: true }),
  ).toBeDisabled();
  await admin.getByRole("button", { name: "Növbəti mərhələ" }).click();
  await expect(admin.locator(".xemse-controls h2")).toHaveText(
    "Xəmsə · Mərhələ 2",
  );
  await expect(admin.locator(".question-value h3")).toHaveText(
    "Sual 1 / 5 — 200 xal",
  );
  await expect(admin.locator(".score-row").first()).toContainText("3000 xal");
  await admin.locator("#nominal").fill("250");
  await admin.locator("#nominal-form button").click();
  await expect(admin.locator(".question-value h3")).toHaveText(
    "Sual 1 / 5 — 250 xal",
  );
  assert.ok(soundEvents.some((event) => event.kind === "next_stage"));
  await admin.locator('[data-page="players"]').click();
  await expect(admin.locator(".scoreboard")).toBeVisible();
  await admin.locator('[data-page="dashboard"]').click();
  await expect(a.locator("#buzz")).toBeDisabled();
  await admin.locator('[data-mode="brain"]').click();
  await admin.getByRole("button", { name: "Təsdiq et" }).click();
  await noThirdMode(admin);
  const control = (name) => admin.locator(`[data-brain-action="${name}"]`);
  await expect(control("correct")).toBeDisabled();
  await expect(control("incorrect")).toBeDisabled();
  await expect(control("open")).toHaveCount(0);
  await control("start").click();
  await expect(control("open")).toBeEnabled();
  await expect(a.locator("#buzz")).toBeEnabled();
  // False start survives opening the timer; explicit skip is available.
  await a.locator("#buzz").tap();
  await a.getByRole("heading", { name: "ERKƏN BASMA" }).waitFor();
  await expect(a.locator("#buzz")).toBeDisabled();
  await expect(admin.locator(".false-list")).toContainText(
    "Erkən basma: Rəsul",
  );
  await control("open").click();
  await expect(control("open")).toBeDisabled();
  await expect(a.locator("#buzz")).toBeDisabled();
  await control("endQuestion").click();
  await admin.getByRole("button", { name: "Təsdiq et" }).click();
  await control("next").click();
  await expect(a.locator("#buzz")).toBeEnabled();
  await expect(a.locator(".brain-player-status")).not.toContainText(
    "ERKƏN BASMA",
  );
  // Pause at 15.2 seconds and preserve near-simultaneous B in the queue.
  await admin.locator('[data-point-kind="question"][data-points="3"]').click();
  await control("open").click();
  now += 4800;
  await expect(admin.locator("[data-brain-timer]")).toHaveText("15.2");
  await expect(a.locator("[data-brain-timer]")).toHaveText("15.2");
  await a.locator("#buzz").tap();
  await a
    .getByRole("heading", { name: "Cavab vermək hüququ sizdədir" })
    .waitFor();
  await b.locator("#buzz").tap();
  await b
    .getByRole("heading", { name: "Cavab gözlənilir · növbədəsiniz" })
    .waitFor();
  await expect(control("next")).toBeDisabled();
  const paused = app.game.brain.remaining();
  now += 30000;
  assert.equal(app.game.brain.remaining(), paused);
  await expect(admin.locator(".candidate-card")).toContainText(
    "Cavab verir: Rəsul",
  );
  await control("incorrect").click();
  await expect(admin.locator(".candidate-card")).toContainText(
    "Cavab verir: Aysel",
  );
  await expect(a.locator("#buzz")).toBeDisabled();
  await a.getByRole("heading", { name: "Cavab səhvdir" }).waitFor();
  assert.equal(app.game.brain.remaining(), paused);
  await b.reload();
  await b
    .getByRole("heading", { name: "Cavab vermək hüququ sizdədir" })
    .waitFor();
  await expect(b.locator("#buzz")).toBeDisabled();
  await admin.screenshot({
    path: join(tmpdir(), "bilik-brain-admin.png"),
    fullPage: true,
  });
  await b.screenshot({
    path: join(tmpdir(), "bilik-brain-player.png"),
    fullPage: true,
  });
  // Queue exhausted: timer resumes from 15.2, never 20.
  await control("incorrect").click();
  assert.equal(app.game.brain.status, "ANSWERING_OPEN");
  assert.equal(app.game.brain.remaining(), paused);
  now += 5500;
  await expect(admin.locator("[data-brain-timer]")).toHaveText("9.7");
  await c.locator("#buzz").tap();
  await expect(admin.locator(".candidate-card")).toContainText(
    "Cavab verir: Murad",
  );
  await control("correct").click();
  await expect(
    admin.locator('[data-point-kind="award"][data-points="3"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(control("next")).toBeDisabled();
  assert.equal(app.game.brain.scores.size, 0);
  await control("award").click();
  await expect(admin.locator(".brain-result")).toContainText(
    "Murad — Düzgün cavab — +3 xal",
  );
  await expect(
    admin.locator(".score-row").filter({ hasText: "Murad" }),
  ).toContainText("3 xal");
  await c.getByRole("heading", { name: "Cavab düzgündür · +3 xal" }).waitFor();
  // Next question resets eligibility and timer while keeping points.
  await control("next").click();
  assert.equal(app.game.brain.questionNumber, 3);
  assert.equal(app.game.brain.round, 1);
  await expect(admin.locator("[data-brain-timer]")).toHaveText("20.0");
  for (const page of pages) await expect(page.locator("#buzz")).toBeEnabled();
  assert.equal(app.game.brain.scoreboard()[0].points, 3);
  // Server-only expiry and manual low-score round winner.
  await control("open").click();
  now += 20000;
  await expect(admin.locator(".brain-result")).toHaveText("Vaxt bitdi");
  await expect(a.locator("#buzz")).toBeDisabled();
  await control("finish").click();
  await expect(control("newRound")).toBeDisabled();
  const winnerId = [...app.game.players.values()].find(
    (p) => p.name === "Rəsul",
  ).id;
  await admin.getByLabel("Onlayn oyunçu / komanda").selectOption(winnerId);
  await admin
    .getByRole("button", { name: "Qalib kimi təsdiqlə", exact: true })
    .click();
  await admin.getByRole("button", { name: "Təsdiq et" }).click();
  await expect(admin.locator(".winner-confirmed")).toHaveText(
    "Raund qalibi: Rəsul",
  );
  await expect(a.locator(".brain-result")).toHaveText("Raund qalibi: Rəsul");
  await control("newRound").click();
  assert.equal(app.game.brain.round, 2);
  assert.equal(app.game.brain.questionNumber, 1);
  assert.equal(app.game.brain.scoreboard()[0].points, 3);
  // Custom point value and a second recorded round.
  await admin.locator("#question-points").fill("5");
  await admin.locator('[data-custom-points="question"] button').click();
  assert.equal(app.game.brain.questionPoints, 5);
  await control("open").click();
  await b.locator("#buzz").tap();
  await expect(admin.locator(".candidate-card")).toContainText("Aysel");
  await control("correct").click();
  await expect(admin.locator(".award-panel h3")).toHaveText(
    "Veriləcək xal: +5",
  );
  await control("award").click();
  await expect(
    admin.locator(".score-row").filter({ hasText: "Aysel" }),
  ).toContainText("5 xal");
  await control("finish").click();
  await admin.getByLabel("Onlayn oyunçu / komanda").selectOption(winnerId);
  await admin
    .getByRole("button", { name: "Qalib kimi təsdiqlə", exact: true })
    .click();
  await admin.getByRole("button", { name: "Təsdiq et" }).click();
  // The confirmation really gates reset; cancel changes nothing.
  await control("restart").click();
  await expect(admin.getByRole("dialog")).toContainText(
    "Bütün xallar, raundlar və nəticələr sıfırlanacaq. Davam edilsin?",
  );
  await admin.getByRole("button", { name: "Ləğv et" }).click();
  assert.equal(app.game.brain.roundHistory.length, 2);
  assert.equal(app.game.brain.scoreboard()[0].points, 5);
  await control("restart").click();
  await admin.getByRole("button", { name: "Təsdiq et" }).click();
  await expect(control("start")).toBeEnabled();
  assert.equal(app.game.brain.round, 1);
  assert.equal(app.game.brain.questionNumber, 1);
  assert.equal(app.game.brain.questionPoints, 1);
  assert.equal(app.game.brain.roundHistory.length, 0);
  assert.equal(app.game.brain.questionHistory.length, 0);
  assert.equal(
    app.game.brain.scoreboard().every((p) => p.points === 0),
    true,
  );
  assert.equal(app.game.players.size, 3);
  for (const page of pages) {
    await expect(page.locator("#buzz")).toBeDisabled();
    await expect(page.locator("[data-brain-timer]")).toHaveText("20.0");
    await noThirdMode(page);
  }
  await admin.setViewportSize({ width: 390, height: 844 });
  await control("start").click();
  await control("open").click();
  await a.locator("#buzz").tap();
  await expect(admin.locator(".candidate-card")).toContainText("Rəsul");
  await admin.screenshot({
    path: join(tmpdir(), "bilik-brain-admin-mobile.png"),
    fullPage: true,
  });
  for (const page of [admin, ...pages])
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      "No horizontal overflow",
    );
  await admin.locator('[data-page="players"]').click();
  await noThirdMode(admin);
  await admin.locator("[data-remove]").first().click();
  await admin.getByRole("button", { name: "Təsdiq et" }).click();
  await a.getByRole("heading", { name: "Yarışmaya qoşulun" }).waitFor();
  for (const kind of [
    "buzzer",
    "correct",
    "wrong",
    "false_start",
    "timer_start",
    "timer_end",
    "score_awarded",
    "next_question",
    "next_stage",
  ])
    assert.ok(
      soundEvents.some((event) => event.kind === kind),
      kind,
    );
  assert.deepEqual(errors, []);
  console.log(
    "Browser checks passed: Xəmsə automatic scoring, five-question stages, ranked leaderboards, synthesized audio and remembered mute, only two visible modes, three mobile players, false starts, timer/queue pause and resume, judgment and confirmed awards, next questions, explicit round winners, two rounds, confirmed restart, reconnect and removal, mobile layout.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => app.io.close(resolve));
}
