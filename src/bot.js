"use strict";

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
// suporta tanto getFallbackLink (versão antiga) quanto portalLink (versão nova)
const {
  listarBoletosPorCPF,
  getFallbackLink,
  portalLink,
} = require("./superlogica");
const { log } = require("./db");
const { error } = require("./logger");

async function sendText(client, waId, text) {
  await client.sendText(waId, text);
  await log("OUT", waId, text);
}

async function sendLinkPreviewSafely(
  client,
  waId,
  url,
  title = "2ª via do Boleto",
  description = "Abra para visualizar/baixar."
) {
  try {
    if (!url) return;
    if (typeof client?.sendLinkPreview === "function") {
      await client.sendLinkPreview(waId, url, title, description);
    } else {
      // fallback: manda só o link como texto
      await sendText(client, waId, url);
    }
  } catch (_) {
    // ignora erros de preview
  }
}

// tenta obter o link do portal do cliente de forma compatível
function resolvePortalLink(tenant) {
  // tenta função antiga
  if (typeof getFallbackLink === "function") {
    try {
      const lk = getFallbackLink(tenant);
      if (lk) return lk;
    } catch (_) {}
  }
  // tenta função nova
  const license =
    tenant?.license ||
    tenant?.licenca ||
    tenant?.slug ||
    process.env.SUPERLOGICA_LICENSE;
  if (typeof portalLink === "function" && license) {
    try {
      return portalLink(license);
    } catch (_) {}
  }
  // por fim, variável de ambiente fixa (se existir)
  return process.env.SUPERLOGICA_FALLBACK_LINK || null;
}

async function startSession(sessionName) {
  const client = await getClient(sessionName);
  client.onMessage(async (msg) => handleIncoming(sessionName, client, msg));
  console.log("✅ WhatsApp sessão ativa:", sessionName);
}

async function resolveTenantForContato(waId, sessionName) {
  // tenta empresa selecionada pelo contato; se não, tenant padrão do número (via wa_sessions)
  const contato = await db.getContato(waId);
  if (contato?.current_tenant_id) {
    const t = await db.getTenantById(contato.current_tenant_id);
    if (t) return t;
  }
  // descobrir e164 do remetente a partir do waId
  const e164 = "+" + onlyDigits(String(waId).replace("@c.us", ""));
  const def = await db.getDefaultTenantForPhoneE164(e164);
  if (def) return def;
  return null; // ainda sem tenant (usuário pode escolher pelo menu 3)
}

async function handleIncoming(sessionName, client, msg) {
  const waId = msg.from;
  const text = (msg.body || "").trim();
  const contato = await db.getOrCreateContato(waId);
  await log("IN", waId, text, { sessionName });

  // HUMANO pausado?
  if (contato.state === "HUMAN") {
    if (!contato.human_until || new Date(contato.human_until) > new Date()) {
      return; // não responder
    } else {
      await db.setContatoState(waId, "MENU", null);
      contato.state = "MENU";
    }
  }

  // comando de encerrar
  if (text.toLowerCase() === "/encerrar") {
    await db.setContatoState(waId, "MENU", null);
    const tenant0 = await resolveTenantForContato(waId, sessionName);
    return sendText(
      client,
      waId,
      ENCERRADO + "\n\n" + menu(tenant0?.nome || null)
    );
  }

  // fluxo por estado
  const tenant = await resolveTenantForContato(waId, sessionName);
  let empresaNome = tenant?.nome || null;

  if (contato.state === "MENU") {
    if (text === "1") {
      if (!tenant) {
        // precisa ter empresa definida
        await db.setContatoState(waId, "ESCOLHER_EMPRESA", null);
        const tenants = await db.listTenants();
        return sendText(
          client,
          waId,
          "Antes, escolha a empresa:\n\n" + escolherEmpresa(tenants)
        );
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
      return sendText(
        client,
        waId,
        "Opção inválida. " + escolherEmpresa(tenants)
      );
    }
    await db.setContatoTenant(waId, tenants[n - 1].id);
    await db.setContatoState(waId, "MENU", null);
    return sendText(
      client,
      waId,
      "Empresa definida: *" +
        tenants[n - 1].nome +
        "*.\n\n" +
        menu(tenants[n - 1].nome)
    );
  }

  if (contato.state === "PEDIR_CPF") {
    const cpf = onlyDigits(text);
    if (!validaCPF(cpf)) {
      return sendText(client, waId, CPF_INVALIDO);
    }
    await db.setContatoCPF(waId, cpf);

    // calcula license (para fallback de e-mail/portal quando necessário)
    const license =
      tenant?.license ||
      tenant?.licenca ||
      tenant?.slug ||
      process.env.SUPERLOGICA_LICENSE;

    try {
      const boletos = await listarBoletosPorCPF({
        superBase: tenant?.superlogica_base,
        appToken: tenant?.app_token,
        accessToken: tenant?.access_token,
        condominioId: tenant?.condominio_id,
        cpf,
        license, // usado no fallback dentro do superlogica.js (se implementado)
      });

      if (!boletos || boletos.length === 0) {
        await db.setContatoState(waId, "MENU", null);
        await sendText(client, waId, SEM_BOLETOS + "\n\n" + menu(empresaNome));

        // envia link do portal para o cliente gerar a 2ª via
        const portal = resolvePortalLink(tenant);
        if (portal) {
          await sendLinkPreviewSafely(
            client,
            waId,
            portal,
            "2ª via no Portal do Cliente",
            "Acesse para gerar/baixar seus boletos."
          );
        }
        return;
      }

      // monta mensagem texto com os boletos
      const linhas = boletos.map((b, i) => {
        const valor = b.valor || 0;
        const venc = b.vencimento || "-";
        const nome = b.descricao || "Boleto";
        const linha = b.linha_digitavel || "(linha indisponível)";
        const url =
          b.url_pdf || b.url_segundavia || b.link || "(link indisponível)";
        return `${i + 1}) *${nome}*\nVenc.: ${venc}\nValor: R$ ${Number(
          valor
        ).toFixed(2)}\nLinha: ${linha}\nLink: ${url}`;
      });

      await sendText(
        client,
        waId,
        "*Seus boletos em aberto:*\n\n" + linhas.join("\n\n")
      );

      // tenta enviar previews dos links (se existirem)
      try {
        for (const b of boletos) {
          const url = b.url_pdf || b.url_segundavia || b.link;
          if (url) {
            await sendLinkPreviewSafely(
              client,
              waId,
              url,
              "2ª via do Boleto",
              "Abra para visualizar/baixar o PDF."
            );
          }
        }
      } catch (_) {}

      await db.setContatoState(waId, "MENU", null);
      return sendText(client, waId, menu(empresaNome));
    } catch (e) {
      // caso o superlogica.js tenha disparado e-mail e sinalizado via erro especial
      if (e && e.message === "FALLBACK_EMAIL_SENT") {
        await db.setContatoState(waId, "MENU", null);
        if (e.userMessage) {
          await sendText(client, waId, e.userMessage);
        } else {
          // mensagem padrão
          const portal = resolvePortalLink(tenant);
          await sendText(
            client,
            waId,
            "Acabei de te enviar por e-mail as cobranças em aberto."
          );
          if (portal) {
            await sendLinkPreviewSafely(
              client,
              waId,
              portal,
              "Área do Cliente",
              "Acesse para emitir a 2ª via."
            );
          }
        }
        return sendText(client, waId, menu(empresaNome));
      }

      error("listarBoletosPorCPF", e?.response?.data || e.message);
      await db.setContatoState(waId, "MENU", null);
      await sendText(
        client,
        waId,
        "Não consegui consultar agora. Tente mais tarde ou fale com atendimento (2).\n\n" +
          menu(empresaNome)
      );

      // mesmo com erro, tenta ajudar com link do portal
      try {
        const portal = resolvePortalLink(tenant);
        if (portal) {
          await sendLinkPreviewSafely(
            client,
            waId,
            portal,
            "2ª via no Portal do Cliente",
            "Acesse para gerar/baixar seus boletos."
          );
        }
      } catch (_) {}
      return;
    }
  }

  // fallback
  await db.setContatoState(waId, "MENU", null);
  return sendText(client, waId, menu(empresaNome));
}

module.exports = { startSession };
