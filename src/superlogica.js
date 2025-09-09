const axios = require("axios");
const { debug, error } = require("./logger");

function forceHttps(u) {
  if (!u) return null;
  let s = String(u).trim();
  if (/^https:\/\//i.test(s)) return s;
  if (/^http:\/\//i.test(s)) return s.replace(/^http:/i, "https:");
  return "https://" + s.replace(/^\/+/, "");
}

function baseUrl(superBase) {
  // Só use se habilitar API por ENV. Caso contrário pulamos a API.
  switch ((superBase || "").toLowerCase()) {
    case "condominios":
      return "https://apicondominios.superlogica.com";
    case "imobiliarias":
      return "https://apiimobiliarias.superlogica.com";
    case "assinaturas":
      return "https://apiassinaturas.superlogica.com";
    default:
      return "https://apiassinaturas.superlogica.com";
  }
}

function headers(appToken, accessToken) {
  return {
    app_token: appToken,
    access_token: accessToken,
    "Content-Type": "application/json",
  };
}

/** Lê o base do portal no ENV e força https */
function getPortalBase() {
  // aceito qualquer uma dessas chaves
  let base =
    process.env.SUPERLOGICA_PORTAL_BASE_URL ||
    process.env.SUPERLOGICA_PORTAL_BASE ||
    process.env.SUPERLOGICA_PORTAL;
  base = forceHttps(base || "");
  return base;
}

/** Dispara o endpoint público que manda e-mail com boletos em aberto */
async function tryEmailSecondCopy(cpf) {
  const portal = getPortalBase();
  if (!portal) return { ok: false, reason: "NO_PORTAL_BASE" };

  const url =
    forceHttps(portal) + "/condor/atual/publico/emailcobrancasemaberto";
  const params = { cpf };
  debug("Superlogica (email 2ª via) GET", url, params);

  try {
    const resp = await axios.get(url, {
      params,
      timeout: 10000,
      // alguns ambientes respondem 200, 204 ou até 302. Qualquer 2xx/3xx consideramos OK
      validateStatus: () => true,
    });

    if (resp.status >= 200 && resp.status < 400) {
      return { ok: true, status: resp.status };
    }

    error(
      "Superlogica (email 2ª via) HTTP_" + resp.status,
      typeof resp.data === "string" ? resp.data.slice(0, 500) : resp.data
    );
    return { ok: false, status: resp.status };
  } catch (e) {
    error("Superlogica (email 2ª via) ERR", e.message);
    return { ok: false, reason: e.code || e.message };
  }
}

/**
 * Link de fallback para o usuário gerar/baixar no portal.
 * (não é o link tokenizado do boleto – esse só a própria Superlógica gera)
 */
function getFallbackLink(cpf) {
  const portal = getPortalBase();
  if (!portal) return null;

  // home da área do cliente
  const home = forceHttps(portal) + "/clients/areadocliente";

  // página pública genérica de cobranças; alguns ambientes aceitam ?cpf=
  const cobranca =
    forceHttps(portal) + "/clients/areadocliente/publico/cobranca";

  if (cpf) return `${cobranca}?cpf=${encodeURIComponent(cpf)}`;
  return home;
}

/**
 * Consulta boletos via API **opcional**.
 * Se SUPERLOGICA_API_ENABLED != 'true', pulamos a API e apenas disparamos o e-mail (fallback).
 */
async function listarBoletosPorCPF({
  superBase,
  appToken,
  accessToken,
  condominioId,
  cpf,
}) {
  const apiEnabled =
    String(process.env.SUPERLOGICA_API_ENABLED || "false").toLowerCase() ===
    "true";

  // sempre tenta mandar e-mail com a 2ª via (não atrapalha a UX)
  try {
    await tryEmailSecondCopy(cpf);
  } catch (_) {}

  if (!apiEnabled) {
    // API desabilitada: retornamos vazio para o bot seguir com o fallback de link.
    return [];
  }

  // --- API habilitada: tenta consultar ---
  const base = forceHttps(
    process.env.SUPERLOGICA_BASE_URL || baseUrl(superBase)
  );
  const path = process.env.SUPERLOGICA_BOLETOS_PATH || "/v1/boletos";
  const url = base.replace(/\/+$/, "") + path;

  // params comuns (ajuste conforme o módulo suportar)
  const params = { cpf, status: "em_aberto" };
  if (condominioId && condominioId !== "NULL")
    params.condominio_id = condominioId;

  debug("Superlogica GET", url, params);

  try {
    const { data } = await axios.get(url, {
      params,
      headers: headers(appToken, accessToken),
      timeout: 12000,
    });

    const arr = Array.isArray(data) ? data : data?.boletos || data?.data || [];
    return arr.map((b) => ({
      id: b.id || b.boleto_id || b.id_boleto,
      descricao: b.descricao || b.titulo || "Boleto",
      vencimento: b.vencimento || b.data_vencimento || b.venc || null,
      valor: b.valor || b.valor_boleto || b.total || 0,
      linha_digitavel: b.linha_digitavel || b.codigo_barras || null,
      url_pdf: b.url_pdf || b.url_segundavia || b.link || null,
    }));
  } catch (e) {
    const st = e.response?.status;
    const body = e.response?.data || e.message;
    error("Superlogica HTTP " + (st || ""), body);
    // deu erro na API → voltamos vazio para o bot usar o fallback
    return [];
  }
}

module.exports = {
  listarBoletosPorCPF,
  getFallbackLink,
  tryEmailSecondCopy,
  getPortalBase,
};
