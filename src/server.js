require("dotenv").config();
require("dns").setDefaultResultOrder("ipv4first");
const express = require("express");
const cron = require("node-cron");
const { helmet, rateLimit } = require("./security");
const routes = require("./routes");
const { startSession } = require("./bot");
const { Pool } = require("pg");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(helmet());
app.use(rateLimit);
app.use("/", routes);

// CRON: reativar contatos após handoff expirar
const pool = new Pool();
cron.schedule("*/10 * * * *", async () => {
  await pool.query(`
    UPDATE contatos
       SET state='MENU', human_until=NULL, updated_at=now()
     WHERE state='HUMAN' AND human_until IS NOT NULL AND human_until < now()
  `);
});

const PORT = process.env.PORT || 3010;
app.listen(PORT, async () => {
  console.log("HTTP API on :" + PORT);
  // iniciar sessão padrão
  const session = process.env.DEFAULT_WA_SESSION || "whats-default";
  await startSession(session);
});
