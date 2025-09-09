const wppconnect = require("@wppconnect-team/wppconnect");

async function getClient(sessionName = "default") {
  if (sessions.has(sessionName)) return sessions.get(sessionName);

  const client = await wppconnect.create({
    session: sessionName,
    headless: true,
    protocolTimeout: 120000, // 120s para chamadas CDP
    puppeteerOptions: {
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      timeout: 120000, // 120s para o launch
    },
  });

  sessions.set(sessionName, client);
  return client;
}
