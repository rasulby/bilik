import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";
import { config } from "../config/index.js";
import { Game } from "./game.js";
import { bindSockets } from "./sockets.js";
export function createApp({ password = config.password, clock } = {}) {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, { maxHttpBufferSize: 100000 });
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; frame-ancestors 'none'",
    );
    next();
  });
  app.get("/health", (req, res) => res.json({ ok: true }));
  app.use(express.static(fileURLToPath(new URL("../client", import.meta.url))));
  app.get("/admin", (req, res) =>
    res.sendFile(
      fileURLToPath(new URL("../client/index.html", import.meta.url)),
    ),
  );
  const game = new Game({ clock });
  bindSockets(io, game, password);
  return { app, server, io, game };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server } = createApp();
  server.listen(config.port, "0.0.0.0", () => {
    console.log(
      `Bilik Yarışması: http://localhost:${config.port}\nİdarəetmə: http://localhost:${config.port}/admin`,
    );
    for (const addresses of Object.values(networkInterfaces()))
      for (const a of addresses || [])
        if (a.family === "IPv4" && !a.internal)
          console.log(`LAN: http://${a.address}:${config.port}`);
  });
}
