const axios = require("axios");
const { debug, error } = require("./logger");

const HTTP_SCHEME = (process.env.SUPERLOGICA_HTTP_SCHEME || "http")
  .replace(":", "")
  .toLowerCase();

function baseUrl(superBase) {
  const override = (process.env.SUPERLOGICA_BASE_URL || "").trim();
  if (override && /^https?:\/\//i.test(override))
    return override.replace(/\/+$/, "");
  const b = (
    superBase ||
    process.env.SUPERLOGICA_DEFAULT_BASE ||
    "imobiliarias"
  ).toLowerCase();
  switch (b) {
    case "imobiliarias":
      return "https://apiimobiliarias.superlogica.com";
    case "condominios":
      return "https://apicondominios.superlogica.com";
    case "assinaturas":
      return "https://apiassinaturas.superlogica.com";
    default:
      return "https://apiimobiliarias.superlogica.com";
  }
}

function headers(appToken, accessToken) {
  return {
    app_token: appToken,
    access_token: accessToken,
    "Content-Type": "application/json",
  };
}

function fmtCpfMask(cpfDigits) {
  const d = String(cpfDigits || "")
    .replace(/\D/g, "")
    .slice(-11);
  return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

function licenseHost(license) {
  if (!license) throw new Error("MISSING_LICENSE");
  return `${HTTP_SCHEME}://${license}.superlogica.net`;
}

async function triggerEmailCobrancas(license, cpf) {
  const host = licenseHost(license);
  const path = "/condor/atual/publico/emailcobrancasemaberto";

  // 1) só dígitos
  const urlClean = `${host}${path}?cpf=${cpf.replace(/\D/g, "")}`;
  debug("Superlogica (email 2ª via) GET", urlClean);
  try {
    const r = await axios.get(urlClean, { timeout: 10000 });
    return r.status === 200 || r.status === 202;
  } catch (e1) {
    // 2) com máscara
    const urlMasked = `${host}${path}?cpf=${encodeURIComponent(
      fmtCpfMask(cpf)
    )}`;
    debug("Superlogica (email 2ª via) GET", urlMasked);
    try {
      const r2 = await axios.get(urlMasked, { timeout: 10000 });
      return r2.status === 200 || r2.status === 202;
    } catch (e2) {
      error("emailcobrancasemaberto", e2?.response?.status || e2.message);
      return false;
    }
  }
}

function portalLink(license) {
  return `https://${license}.superlogica.net/clients/areadocliente`;
}

/**
 * Tenta API oficial /v1/boletos. Se falhar (404, etc), dispara e-mail de 2ª via
 * e retorna um erro especial para o bot montar a mensagem amigável.
 */
async function listarBoletosPorCPF({
  superBase,
  appToken,
  accessToken,
  condominioId,
  cpf,
  license,
}) {
  const url = `${baseUrl(superBase)}/v1/boletos`;
  const params = { cpf, status: "em_aberto" };
  if (condominioId && String(condominioId).toUpperCase() !== "NULL") {
    params.condominio_id = condominioId;
  }

  try {
    debug("Superlogica GET", url, params);
    const { data } = await axios.get(url, {
      params,
      headers: headers(appToken, accessToken),
      timeout: 15000,
    });
    const arr = Array.isArray(data) ? data : data?.boletos || [];
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
    error("Superlogica HTTP", status ? `${status}` : e.message);

    // Fallback: envia e-mail com cobranças em aberto + devolve link do portal
    if (license) {
      const ok = await triggerEmailCobrancas(license, cpf);
      if (ok) {
        const err = new Error("FALLBACK_EMAIL_SENT");
        err.userMessage =
          `Acabei de te enviar por e-mail as cobranças em aberto. ` +
          `Se preferir, acesse também: ${portalLink(license)}`;
        throw err;
      }
    }

    const err = new Error("HTTP_" + (status || "ERR"));
    throw err;
  }
}

module.exports = { listarBoletosPorCPF, portalLink, triggerEmailCobrancas };
