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
const { listarBoletosPorCPF, getFallbackLink } = require("./superlogica");
const { log } = require("./db");
const { debug, error } = require("./logger");

async function sendText(client, waId, text) {
  await client.sendText(waId, text);
  await log("OUT", waId, text);
}

async function sendLinkPreviewSafely(client, waId, url, title = "2ª via do Boleto", description = "Abra para visualizar/baixar.") {
  try {
    if (!url) return;
    if (client?.sendLinkPreview) {
      await client.sendLinkPreview(waId, url, title, description);
    } else {
      // fallback: manda só o link como texto
      await sendText(client, waId, url);
    }
  } catch (e) {
    // ignora erros de preview
  }
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
  // descobrir e164 do remetente a partir do waId (simples: tirar '@c.us' e prefixar '+' se precisar)
  const e164 = "+" + onlyDigits(waId.replace("@c.us", ""));
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
    const tenant = await resolveTenantForContato(waId, sessionName);
    return sendText(
      client,
      waId,
      ENCERRADO + "\n\n" + menu(tenant?.nome || null)
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

    try {
      const boletos = await listarBoletosPorCPF({
        superBase: tenant.superlogica_base,
        appToken: tenant.app_token,
        accessToken: tenant.access_token,
        condominioId: tenant.condominio_id,
        cpf,
      });
      if (!boletos || boletos.length === 0) {
        await db.setContatoState(waId, "MENU", null);
        await sendText(
          client,
          waId,
          SEM_BOLETOS + "\\n\\n" + menu(empresaNome)
        );
        /* __INJECT_NOBOLETOS_FALLBACK__ */
        const portal = getFallbackLink && getFallbackLink();
        if (portal) {
          await sendLinkPreviewSafely(client, waId, portal, "2ª via no Portal do Cliente", "Acesse para gerar/baixar seus boletos.");
        }
        return;
      }
      const linhas = boletos.map((b, i) => {
        const valor = b.valor || 0;
        const venc = b.vencimento || "-";
        const nome = b.descricao || "Boleto";
        const linha = b.linha_digitavel || "(linha indisponível)";
        const url = b.url_pdf || "(link indisponível)";
        return `${i + 1}) *${nome}*\\nVenc.: ${venc}\\nValor: R$ ${Number(
          valor
        ).toFixed(2)}\\nLinha: ${linha}\\nLink: ${url}`;
      });
      await sendText(
        client,
        waId,
        "*Seus boletos em aberto:*\\n\\n" + linhas.join("\\n\\n")
      );
      /* __INJECT_PREVIEWS_SUCCESS__ */
      try {
        for (const b of boletos) {
          const url = b.url_pdf || b.url_segundavia || b.link;
          if (url) {
            await sendLinkPreviewSafely(client, waId, url, "2ª via do Boleto", "Abra para visualizar/baixar o PDF.");
          }
        }
      } catch (_) {}

      await db.setContatoState(waId, "MENU", null);
      return sendText(client, waId, menu(empresaNome));
    } catch (e) {
      error("listarBoletosPorCPF", e?.response?.data || e.message);
      await db.setContatoState(waId, "MENU", null);
      await sendText(
        client,
        waId,
        "Não consegui consultar agora. Tente mais tarde ou fale com atendimento (2).\\n\\n" +
          menu(empresaNome)
      );
      /* __INJECT_CATCH_FALLBACK__ */
      try {
        const portal = getFallbackLink && getFallbackLink();
        if (portal) {
          await sendLinkPreviewSafely(client, waId, portal, "2ª via no Portal do Cliente", "Acesse para gerar/baixar seus boletos.");
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
