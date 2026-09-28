import { networkInterfaces } from "node:os";
import { randomUUID } from "node:crypto";
import { verifyPassword } from "./auth.js";
export function bindSockets(io, game, password) {
  const attempts = new Map();
  const lanHosts = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a.family === "IPv4" && !a.internal)
    .map((a) => a.address);
  const broadcast = () => {
    const sounds = game.drainSounds();
    for (const s of io.sockets.sockets.values())
      if (s.data.admin || s.data.playerId) {
        s.emit("state", {
          ...game.snapshot(s.data.admin, s.data.playerId),
          ...(s.data.admin
            ? {
                joinUrl: `http://${lanHosts[0] || "localhost"}:${io.httpServer.address()?.port}/`,
              }
            : {}),
        });
        for (const sound of sounds) s.emit("sound", sound);
      }
  };
  // The server pushes measured remaining time; browsers never decide expiry.
  const timer = setInterval(() => {
    if (game.tick()) broadcast();
    else if (game.mode === "brain" && game.brain.status === "ANSWERING_OPEN") {
      const snapshot = game.brain.timerSnapshot();
      for (const s of io.sockets.sockets.values())
        if (s.data.admin || s.data.playerId) s.emit("timer", snapshot);
    }
  }, 100);
  timer.unref();
  io.httpServer.once("close", () => clearInterval(timer));
  io.on("connection", (socket) => {
    let count = 0,
      windowStart = Date.now();
    function event(name, handler) {
      socket.on(name, (payload, ack) => {
        try {
          if (Date.now() - windowStart > 1000) {
            count = 0;
            windowStart = Date.now();
          }
          if (++count > 40) throw Error("Çox sürətli sorğu göndərirsiniz.");
          if (game.tick()) broadcast();
          const result = handler(payload);
          if (typeof ack === "function") ack({ ok: true, ...result });
          broadcast();
        } catch (error) {
          if (typeof ack === "function")
            ack({ ok: false, error: error.message });
          if (count <= 40) broadcast();
        }
      });
    }
    event("register", (payload) => {
      if (!payload || typeof payload !== "object")
        throw Error("Adınızı daxil edin.");
      if (socket.data.playerId)
        return {
          playerId: socket.data.playerId,
          token: game.players.get(socket.data.playerId)?.token,
        };
      let player =
        typeof payload.playerId === "string"
          ? game.players.get(payload.playerId)
          : null;
      if (
        player &&
        (typeof payload.token !== "string" || player.token !== payload.token)
      )
        throw Error("Oyunçu kimliyi təsdiqlənmədi.");
      if (!player) {
        if (typeof payload.name !== "string")
          throw Error("Adınızı daxil edin.");
        const name = payload.name.replace(/[\p{Cc}\p{Cf}<>]/gu, "").trim();
        if (!name || name.length > 40)
          throw Error("Adınız 1–40 simvol olmalıdır.");
        if (game.players.size >= 200) throw Error("Otaq doludur.");
        player = {
          id: randomUUID(),
          token: randomUUID(),
          name,
          sockets: new Set(),
        };
        game.players.set(player.id, player);
      }
      player.sockets.add(socket.id);
      socket.data.playerId = player.id;
      return { playerId: player.id, token: player.token, name: player.name };
    });
    event("login", (payload) => {
      const ip = socket.handshake.address;
      const now = Date.now();
      for (const [key, value] of attempts)
        if (now - value.at > 60000) attempts.delete(key);
      const entry = attempts.get(ip) || { at: now, count: 0 };
      attempts.set(ip, entry);
      if (++entry.count > 10)
        throw Error("Bir dəqiqə sonra yenidən cəhd edin.");
      if (!verifyPassword(payload?.password, password))
        throw Error("Admin kodu yanlışdır.");
      socket.data.admin = true;
      attempts.delete(ip);
      return {};
    });
    event("answer", (payload) => {
      if (!socket.data.playerId) throw Error("Əvvəlcə qeydiyyatdan keçin.");
      game.answer(socket.data.playerId, payload);
    });
    event("admin", (payload) => {
      if (!socket.data.admin) throw Error("İcazəniz yoxdur.");
      if (!payload || typeof payload.action !== "string")
        throw Error("Əmr yanlışdır.");
      if (payload.action === "remove") {
        const player = game.players.get(payload.value);
        if (player) {
          for (const id of player.sockets) {
            const s = io.sockets.sockets.get(id);
            if (s) {
              s.data.playerId = undefined;
              s.emit("removed");
            }
          }
          game.removePlayer(player.id);
        }
      } else game.command(payload.action, payload.value, payload);
    });
    socket.on("disconnect", () => {
      game.players.get(socket.data.playerId)?.sockets.delete(socket.id);
      broadcast();
    });
  });
  return broadcast;
}
