// src/wa.js
"use strict";

const wppconnect = require("@wppconnect-team/wppconnect");

const sessions = new Map();

async function getClient(sessionName = "whats-default") {
  if (sessions.has(sessionName)) return sessions.get(sessionName);

  const client = await wppconnect.create({
    session: sessionName,
    headless: true,
    protocolTimeout: 120000,
    puppeteerOptions: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
    catchQR: (base64Qr, asciiQR, attempts) => {
      console.log(`[${sessionName}] QR attempts:`, attempts);
    },
    statusFind: (statusSession, session) => {
      console.log(`[${sessionName}] status:`, statusSession);
    },
  });

  sessions.set(sessionName, client);
  return client;
}

module.exports = { getClient }; // <<< export NOMEADO
