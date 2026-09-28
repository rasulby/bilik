import { test } from "node:test";
import assert from "node:assert/strict";
import { SoundEffects, soundPatterns } from "../client/sounds.js";
class FakeAudio {
  constructor() {
    this.state = "suspended";
    this.currentTime = 0;
    this.destination = {};
    this.starts = 0;
    this.stops = 0;
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  suspend() {
    this.state = "suspended";
    return Promise.resolve();
  }
  createOscillator() {
    const ctx = this;
    return {
      frequency: { setValueAtTime() {} },
      connect() {},
      disconnect() {},
      start() {
        ctx.starts++;
      },
      stop() {
        ctx.stops++;
      },
    };
  }
  createGain() {
    return {
      gain: {
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {},
      },
      connect() {},
      disconnect() {},
    };
  }
}
const event = (id, kind = "buzzer") => ({ id, kind, timestamp: Date.now() });
test("Sounds require gesture unlock, cover every local cue, and deduplicate events", () => {
  const s = new SoundEffects({ AudioContext: FakeAudio });
  assert.equal(s.context, null);
  assert.equal(s.play(event("before")), false);
  s.unlock();
  for (const [index, kind] of Object.keys(soundPatterns).entries()) {
    s.context.currentTime = index * 2;
    assert.equal(s.play(event(kind, kind)), true, kind);
    assert.equal(s.play(event(kind, kind)), false);
  }
  assert.equal(
    s.play({ ...event("expired"), timestamp: Date.now() - 10000 }),
    false,
  );
  assert.equal(s.play(event("unknown", "external-url")), false);
});
test("Sound preference persists per browser and muted events never play later", () => {
  const values = new Map();
  const storage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
  };
  const s = new SoundEffects({ storage, AudioContext: FakeAudio });
  s.unlock();
  s.play(event("one"));
  assert.ok(s.context.starts > 0);
  s.toggle();
  assert.equal(values.get("bilik-sounds"), "false");
  assert.equal(s.context.state, "suspended");
  assert.equal(s.play(event("muted")), false);
  const restored = new SoundEffects({ storage, AudioContext: FakeAudio });
  assert.equal(restored.enabled, false);
  restored.unlock();
  assert.equal(restored.context, null);
  s.toggle();
  assert.equal(s.enabled, true);
  assert.equal(s.play(event("muted")), false);
  const unavailable = new SoundEffects({
    AudioContext: class {
      constructor() {
        throw Error("unsupported");
      }
    },
  });
  assert.doesNotThrow(() => unavailable.unlock());
  assert.equal(unavailable.play(event("safe")), false);
});
