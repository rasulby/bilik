import { test } from "node:test";
import assert from "node:assert/strict";
import { QuestionStore, seeds } from "../server/questions.js";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("Question store: exactly 10 seeds and atomic persistence", () => {
  const directory = mkdtempSync(join(tmpdir(), "bilik-"));
  try {
    const file = join(directory, "nested", "questions.json");
    const store = new QuestionStore(file);
    assert.equal(store.items.length, 10);
    assert.equal(
      seeds.every(
        (q) =>
          q.options.length === 5 &&
          Number.isInteger(q.correctOption) &&
          q.correctOption >= 0 &&
          q.correctOption < 5,
      ),
      true,
    );
    store.add([
      {
        question: "New question",
        options: ["A1", "B1", "C1", "D1", "E1"],
        correctOption: 4,
      },
    ]);
    assert.equal(new QuestionStore(file).items.length, 11);
    assert.deepEqual(new QuestionStore(file).items.at(-1), store.items.at(-1));
    const before = readFileSync(file, "utf8");
    assert.throws(() =>
      store.import("Valid?|a|b|c|d|e|A\nInvalid?|a|b|c|d|e|F"),
    );
    assert.equal(readFileSync(file, "utf8"), before);
    assert.equal(store.items.length, 11);
    store.import("New?|a|b|c|d|e|B\nNext?|f|g|h|i|j|E");
    assert.deepEqual(
      new QuestionStore(file).items.slice(-2).map((q) => q.correctOption),
      [1, 4],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("Legacy question banks are preserved instead of silently replacing custom questions", () => {
  const directory = mkdtempSync(join(tmpdir(), "bilik-legacy-"));
  try {
    const file = join(directory, "questions.json");
    const old = JSON.stringify([
      { id: "custom", text: "Custom?", answer: "Answer" },
    ]);
    writeFileSync(file, old);
    assert.throws(() => new QuestionStore(file), /Köhnə sual formatı/);
    assert.equal(readFileSync(file, "utf8"), old);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
