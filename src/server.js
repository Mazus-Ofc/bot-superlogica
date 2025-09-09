"use strict";

require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const { startSession } = require("./bot");
const { info } = require("./logger");

const app = express();
app.use(helmet());
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = Number(process.env.PORT || 3010);

const server = app.listen(PORT, async () => {
  info(`HTTP API on :${PORT}`);
});

server.once("listening", async () => {
  const session = process.env.DEFAULT_WA_SESSION || "whats-default";
  try {
    await startSession(session);
  } catch (e) {
    console.error("Falha ao iniciar sessão WhatsApp:", e?.message || e);
  }
});

module.exports = app;
