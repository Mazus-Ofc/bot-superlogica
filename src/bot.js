"use strict";

const axios = require("axios");
const { getClient } = require("./wa");
const db = require("./db");
const {
  menu,
  ASK_CPF,
  CPF_INVALIDO,
  SEM_BOLETOS,
  HANDOFF_MSG,
  ENCERRADO,
  escolherEmpresa,
} = require("./templates");
const { onlyDigits, validaCPF } = require("./validators");
const { listarBoletosPorCPF } = require("./superlogica");
const { log } = require("./db");
const { debug, error } = require("./logger");

async function sendText(client, waId, text) {
  await client.sendText(waId, text);
  await log("OUT", waId, text);
}

async function sendPdfByUrlOrBase64(client, waId, url, filename = "boleto.pdf", caption = "Segue sua 2ª via") {
  try {
    await client.sendFile(waId, url, filename, caption);
    return true;
  } catch (e1) {
    try {
      const resp = await axios.get(url, { responseType: "arraybuffer" });
      const b64 = "data:application/pdf;base64," + Buffer.from(resp.data).toString("base64");
      await client.sendFileFromBase64(waId, b64, filename, caption);
      return true;
    } catch (e2) {
      error("sendPdfByUrlOrBase64", e2?.message || e2);
      return false;
    }
  }
}

async function startSession(sessionName) {
  const client = await getClient(sessionName);
  client.onMessage(async (msg) => handleIncoming(sessionName, client, msg));
  console.log("✅ WhatsApp sessão ativa:", sessionName);
}

async function resolveTenantForContato(waId, sessionName) {
  const contato = await db.getContato(waId);
  if (contato?.current_tenant_id) {
    const t = await db.getTenantById(contato.current_tenant_id);
    if (t) return t;
  }
  const e164 = "+" + onlyDigits(waId.replace("@c.us", ""));
  const def = await db.getDefaultTenantForPhoneE164(e164);
  if (def) return def;
  return null;
}

async function handleIncoming(sessionName, client, msg) {
  const waId = msg.from;
  const text = (msg.body || "").trim();
  const contato = await db.getOrCreateContato(waId);
  await log("IN", waId, text, { sessionName });

  if (contato.state === "HUMAN") {
    if (!contato.human_until || new Date(contato.human_until) > new Date()) {
      return;
    } else {
      await db.setContatoState(waId, "MENU", null);
      contato.state = "MENU";
    }
  }

  if (text.toLowerCase() === "/encerrar") {
    await db.setContatoState(waId, "MENU", null);
    const tenant = await resolveTenantForContato(waId, sessionName);
    return sendText(client, waId, ENCERRADO + "\n\n" + menu(tenant?.nome || null));
  }

  const tenant = await resolveTenantForContato(waId, sessionName);
  let empresaNome = tenant?.nome || null;

  if (contato.state === "MENU") {
    if (text === "1") {
      if (!tenant) {
        await db.setContatoState(waId, "ESCOLHER_EMPRESA", null);
        const tenants = await db.listTenants();
        return sendText(client, waId, "Antes, escolha a empresa:\n\n" + escolherEmpresa(tenants));
      }
      await db.setContatoState(waId, "PEDIR_CPF", null);
      return sendText(client, waId, ASK_CPF);
    }
    if (text === "2") {
      const hours = Number(process.env.HANDOFF_HOURS || 12);
      const until = new Date(Date.now() + hours * 3600 * 1000);
      await db.setContatoState(waId, "HUMAN", until);
      return sendText(client, waId, HANDOFF_MSG);
    }
    if (text === "3") {
      await db.setContatoState(waId, "ESCOLHER_EMPRESA", null);
      const tenants = await db.listTenants();
      return sendText(client, waId, escolherEmpresa(tenants));
    }
    return sendText(client, waId, menu(empresaNome));
  }

  if (contato.state === "ESCOLHER_EMPRESA") {
    const n = parseInt(text, 10);
    const tenants = await db.listTenants();
    if (!Number.isInteger(n) || n < 1 || n > tenants.length) {
      return sendText(client, waId, "Opção inválida. " + escolherEmpresa(tenants));
    }
    await db.setContatoTenant(waId, tenants[n - 1].id);
    await db.setContatoState(waId, "MENU", null);
    return sendText(client, waId, "Empresa definida: *" + tenants[n - 1].nome + "*.\n\n" + menu(tenants[n - 1].nome));
  }

  if (contato.state === "PEDIR_CPF") {
    const cpf = onlyDigits(text);
    if (!validaCPF(cpf)) {
      return sendText(client, waId, CPF_INVALIDO);
    }
    await db.setContatoCPF(waId, cpf);

    try {
      const result = await listarBoletosPorCPF({
        superBase: tenant?.superlogica_base,
        appToken: tenant?.app_token,
        accessToken: tenant?.access_token,
        condominioId: tenant?.condominio_id,
        cpf,
      });

      if (result && typeof result === "object" && !Array.isArray(result)) {
        if (result.emailed) {
          await db.setContatoState(waId, "MENU", null);
          return sendText(client, waId, "Enviei a 2ª via para o seu e-mail cadastrado. 📧\n\n" + menu(empresaNome));
        }
        await db.setContatoState(waId, "MENU", null);
        return sendText(client, waId, "Não consegui consultar nem enviar por e-mail agora. Tente mais tarde ou fale com atendimento (2).\n\n" + menu(empresaNome));
      }

      const boletos = Array.isArray(result) ? result : [];
      if (!boletos.length) {
        await db.setContatoState(waId, "MENU", null);
        return sendText(client, waId, SEM_BOLETOS + "\n\n" + menu(empresaNome));
      }

      const maxPdf = 3;
      let enviados = 0;
      for (const b of boletos.slice(0, maxPdf)) {
        if (b.url_pdf) {
          const ok = await sendPdfByUrlOrBase64(client, waId, b.url_pdf, `boleto-${b.nossoNumero || b.id || "2via"}.pdf`, "Segue sua 2ª via");
          if (!ok) await sendText(client, waId, `Não consegui anexar o PDF. Acesse: ${b.url_pdf}`);
        } else {
          const val = Number(b.valor) || 0;
          const textBoleto = [`*${b.descricao || "Boleto"}*`, `Venc.: ${b.vencimento || "-"}`, `Valor: R$ ${val.toFixed(2)}`, b.linha_digitavel ? `Linha: ${b.linha_digitavel}` : null].filter(Boolean).join("\n");
          await sendText(client, waId, textBoleto);
        }
        enviados++;
      }

      if (boletos.length > enviados) {
        const resto = boletos.slice(enviados).map((b, i) => {
          const val = Number(b.valor) || 0;
          return `${i + 1 + enviados}) *${b.descricao || "Boleto"}*\nVenc.: ${b.vencimento || "-"}\nValor: R$ ${val.toFixed(2)}${b.url_pdf ? `\nLink: ${b.url_pdf}` : ""}`;
        });
        await sendText(client, waId, "*Outros boletos em aberto:*\n\n" + resto.join("\n\n"));
      }

      await db.setContatoState(waId, "MENU", null);
      return sendText(client, waId, menu(empresaNome));
    } catch (e) {
      error("listarBoletosPorCPF", e?.response?.data || e.message);
      await db.setContatoState(waId, "MENU", null);
      return sendText(client, waId, "Não consegui consultar agora. Tente mais tarde ou fale com atendimento (2).\n\n" + menu(empresaNome));
    }
  }

  await db.setContatoState(waId, "MENU", null);
  return sendText(client, waId, menu(empresaNome));
}

module.exports = { startSession };
