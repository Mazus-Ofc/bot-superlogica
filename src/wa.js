"use strict";

let wppconnect;
try {
  wppconnect = require("@wppconnect-team/wppconnect");
} catch (e1) {
  try {
    wppconnect = require("wppconnect");
  } catch (e2) {
    throw new Error("Nenhum pacote WPPConnect encontrado. Instale: npm i @wppconnect-team/wppconnect");
  }
}

const sessions = new Map();

async function getClient(sessionName = process.env.DEFAULT_WA_SESSION || "whats-default") {
  if (sessions.has(sessionName)) return sessions.get(sessionName);

  const client = await wppconnect.create({
    session: sessionName,
    headless: true,
    debug: false,
    browserArgs: ["--no-sandbox", "--disable-setuid-sandbox"],
    catchQR: (base64Qr, asciiQR) => {
      console.log(`[${sessionName}] QR gerado. Veja os logs para escanear.`);
    },
    logQR: true,
  });

  sessions.set(sessionName, client);
  return client;
}

module.exports = { getClient };
