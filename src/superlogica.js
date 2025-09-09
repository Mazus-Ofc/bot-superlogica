"use strict";

const axios = require("axios");
const { debug, error } = require("./logger");

/** Escolhe a base pública da Superlógica por módulo */
function baseUrl(superBase) {
  if (process.env.SUPERLOGICA_BASE_URL) {
    // override total pelo .env
    return process.env.SUPERLOGICA_BASE_URL.replace(/\/+$/, "");
  }
  switch ((superBase || "").toLowerCase()) {
    case "condominios":
      return "https://apicondominios.superlogica.com";
    case "imobiliarias":
      return "https://apiimobiliarias.superlogica.com";
    case "assinaturas":
    default:
      return "https://apiassinaturas.superlogica.com";
  }
}

/** Cabeçalhos de auth */
function headers(appToken, accessToken) {
  return {
    app_token: appToken,
    access_token: accessToken,
    "Content-Type": "application/json",
  };
}

/** Resolve host do portal a partir da license (subdomínio). Pode ser sobrescrito via .env */
function portalHost(license) {
  const envHost = process.env.SUPERLOGICA_PORTAL_HOST;
  if (envHost) {
    return envHost.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  }
  if (!license) return null;
  return `${license}.superlogica.net`;
}

/** Link geral do Portal do Cliente (página pública para 2ª via) */
function portalLink(license) {
  const host = portalHost(license);
  if (!host) return null;
  // rota pública costuma ser essa; dá pro cliente informar documento e ver cobranças
  return `https://${host}/clients/areadocliente/publico/cobranca`;
}

/**
 * Tenta disparar e-mail de cobranças em aberto (2ª via) pelo portal.
 * Testa várias rotas e nomes de parâmetro (cpf | documento | cpf_cnpj).
 * Sucesso: retorna { ok:true, url, params }.
 * Falha: lança erro.
 */
async function tryEmailSecondCopy({ license, cpf }) {
  if (!license) throw new Error("NO_LICENSE");

  const host = portalHost(license);
  const httpsBase = `https://${host}`;

  // Permite configurar uma ou mais rotas no .env (separadas por vírgula).
  // Mantemos duas candidatas padrão:
  //  - rota nova de "clients/areadocliente"
  //  - rota antiga "condor/atual"
  const paths = (
    process.env.SUPERLOGICA_PORTAL_EMAIL_PATHS ||
    process.env.SUPERLOGICA_PORTAL_EMAIL_PATH ||
    "/clients/areadocliente/publico/cobranca/emailcobrancasemaberto,/condor/atual/publico/emailcobrancasemaberto"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // alguns tenants esperam "documento" ou "cpf_cnpj"
  const paramVariants = [{ cpf }, { documento: cpf }, { cpf_cnpj: cpf }];

  for (const p of paths) {
    const path = p.startsWith("/") ? p : `/${p}`;
    for (const params of paramVariants) {
      const url = `${httpsBase}${path}`;
      debug("Superlogica (email 2ª via) GET", url, params);
      try {
        const res = await axios.get(url, {
          params,
          timeout: 10000,
          // axios já segue 302 por padrão
        });
        // se retornou 2xx, consideramos OK (muitos retornam HTML "ok" ou tela)
        if (res.status >= 200 && res.status < 300) {
          return { ok: true, url, params };
        }
      } catch (_) {
        // tenta próxima combinação
      }
    }
  }
  throw new Error("EMAIL_ENDPOINT_NOT_FOUND");
}

/**
 * Tenta listar boletos via API pública. Se 404/erro, cai no fallback de disparo por e-mail.
 * Retorna array normalizado de boletos (se API responder). Caso dispare e-mail, lança
 * erro especial FALLBACK_EMAIL_SENT com uma userMessage para o bot avisar o cliente.
 */
async function listarBoletosPorCPF({
  superBase,
  appToken,
  accessToken,
  condominioId,
  cpf,
  license, // importante para o fallback por e-mail/portal
}) {
  const path = (process.env.SUPERLOGICA_BOLETOS_PATH || "/v1/boletos").replace(
    /\/+$/,
    ""
  );
  const base = baseUrl(superBase);
  const url = `${base}${path}`;
  const params = { cpf, status: "em_aberto" };

  // alguns módulos exigem condominio_id; só envia se veio algo válido
  if (
    condominioId &&
    String(condominioId).toUpperCase() !== "NULL" &&
    String(condominioId).toLowerCase() !== "null"
  ) {
    params.condominio_id = condominioId;
  }

  debug("Superlogica GET", url, params);

  try {
    const { data } = await axios.get(url, {
      params,
      headers: headers(appToken, accessToken),
      timeout: 12000,
    });

    const arr = Array.isArray(data) ? data : data?.boletos || data?.data || [];

    // normalização básica
    return arr.map((b) => ({
      id: b.id || b.boleto_id || b.id_boleto,
      descricao: b.descricao || b.titulo || "Boleto",
      vencimento: b.vencimento || b.data_vencimento || b.venc || null,
      valor: b.valor || b.valor_boleto || b.total || 0,
      linha_digitavel: b.linha_digitavel || b.codigo_barras || null,
      url_pdf: b.url_pdf || b.url_segundavia || b.link || null,
    }));
  } catch (e) {
    const status = e?.response?.status;
    error("Superlogica HTTP", status || e.message);

    // Fallback: tentar disparar por e-mail via portal
    try {
      const r = await tryEmailSecondCopy({ license, cpf });
      debug("Superlogica (email 2ª via) OK", r.url, r.params);
      const err = new Error("FALLBACK_EMAIL_SENT");
      err.userMessage =
        "Acabei de enviar por e-mail as cobranças em aberto para o endereço cadastrado.";
      throw err;
    } catch (_) {
      // não conseguimos nem a API nem o e-mail – repassa erro original
      throw e;
    }
  }
}

module.exports = {
  listarBoletosPorCPF,
  portalLink,
};
