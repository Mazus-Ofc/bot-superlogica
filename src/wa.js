// src/wa.js
'use strict';

let wppconnect;
try {
  wppconnect = require('@wppconnect-team/wppconnect');
} catch (e) {
  wppconnect = require('wppconnect'); // fallback para projetos antigos
}

const sessions = new Map();

async function getClient(sessionName = process.env.DEFAULT_WA_SESSION || 'whats-default') {
  if (sessions.has(sessionName)) return sessions.get(sessionName);

  const client = await wppconnect.create({
    session: sessionName,
    headless: true,
    protocolTimeout: 120000,
    autoClose: 0,
    puppeteerOptions: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
    catchQR: (base64Qr, asciiQR, attempts) => {
      console.log(`[${sessionName}] QR attempts:`, attempts);
      if (asciiQR) console.log(asciiQR);
    },
    statusFind: (statusSession) => {
      console.log(`[${sessionName}] status:`, statusSession);
    },
  });

  sessions.set(sessionName, client);
  return client;
}

module.exports = { getClient };
