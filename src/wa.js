const wppconnect = require('wppconnect');
const sessions = new Map();

async function getClient(sessionName='default') {
  if (sessions.has(sessionName)) return sessions.get(sessionName);
  const client = await wppconnect.create({ session: sessionName, headless: true });
  sessions.set(sessionName, client);
  return client;
}

module.exports = { getClient };
