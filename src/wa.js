const wppconnect = require("@wppconnect-team/wppconnect");
const sessions = new Map();

async function getClient(sessionName = "default") {
  if (sessions.has(sessionName)) return sessions.get(sessionName);

  const client = await wppconnect.create({
    session: sessionName,
    headless: true,
    puppeteerOptions: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
  });

  sessions.set(sessionName, client);
  return client;
}

module.exports = { getClient };
