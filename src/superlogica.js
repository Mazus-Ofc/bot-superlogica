// src/superlogica.js
"use strict";

const axios = require("axios");
const dns = require("node:dns").promises;
const { debug, error } = require("./logger");

function resolveBase(superBase) {
  // Permite override por .env (útil se o host oficial mudar)
  if (process.env.SUPERLOGICA_BASE_URL) return process.env.SUPERLOGICA_BASE_URL;

  switch (String(superBase || "").toLowerCase()) {
    case "condominios":
      return "https://apicondominios.superlogica.com";
    case "assinaturas":
      return "https://apiassinaturas.superlogica.com";
    case "imobiliarias":
      // ATENÇÃO: este host pode não resolver em alguns ambientes.
      // Use SUPERLOGICA_BASE_URL no .env se precisar apontar para outro host.
      return "https://apiimobiliarias.superlogica.com";
    default:
      // fallback seguro
      return "https://apiassinaturas.superlogica.com";
  }
}

async function assertDnsReachable(baseUrl) {
  const host = new URL(baseUrl).host;
  try {
    await dns.lookup(host);
  } catch (e) {
    throw new Error(
      `DNS não resolve para ${host} (${e.code}). ` +
        `Defina SUPERLOGICA_BASE_URL no .env ou ajuste o superBase do tenant.`
    );
  }
}

function buildHeaders(appToken, accessToken) {
  return {
    app_token: appToken,
    access_token: accessToken,
    "Content-Type": "application/json",
  };
}

function buildParams(superBase, condominioId, cpf) {
  const p = { cpf, status: "em_aberto" };
  // Só condomínios usa condominio_id (e não envie string 'NULL')
  if (
    String(superBase || "").toLowerCase() === "condominios" &&
    condominioId &&
    String(condominioId).toUpperCase() !== "NULL"
  ) {
    p.condominio_id = condominioId;
  }
  return p;
}

function normalizeBoletos(data) {
  const arr = Array.isArray(data) ? data : data?.boletos || [];
  return arr.map((b) => ({
    id: b.id || b.boleto_id || b.id_boleto,
    descricao: b.descricao || b.titulo || "Boleto",
    vencimento: b.vencimento || b.data_vencimento || b.venc || null,
    valor: b.valor || b.valor_boleto || b.total || 0,
    linha_digitavel: b.linha_digitavel || b.codigo_barras || null,
    url_pdf: b.url_pdf || b.url_segundavia || b.link || null,
  }));
}

/**
 * superBase: 'condominios' | 'assinaturas' | 'imobiliarias'
 * appToken/accessToken: tokens da Superlógica
 * condominioId: só para Condomínios (opcional)
 * cpf: string com apenas dígitos
 * options:
 *  - baseUrlOverride: sobrescreve host (alternativa ao SUPERLOGICA_BASE_URL)
 *  - pathOverride: sobrescreve path (alternativa ao SUPERLOGICA_BOLETOS_PATH)
 */
async function listarBoletosPorCPF({
  superBase,
  appToken,
  accessToken,
  condominioId,
  cpf,
  baseUrlOverride,
  pathOverride,
}) {
  const base = baseUrlOverride || resolveBase(superBase);
  await assertDnsReachable(base);

  // O path pode variar por produto; deixe configurável
  const path =
    pathOverride || process.env.SUPERLOGICA_BOLETOS_PATH || "/v1/boletos";
  const url = `${base}${path}`;
  const params = buildParams(superBase, condominioId, cpf);
  const headers = buildHeaders(appToken, accessToken);

  debug("Superlogica GET", url, params);

  try {
    const { data, status } = await axios.get(url, {
      params,
      headers,
      timeout: 15000,
      // Deixe 4xx passar para logarmos a resposta do servidor
      validateStatus: (s) => s < 500,
    });

    if (status >= 400) {
      error("Superlogica HTTP " + status, data);
      // devolve vazio para o fluxo seguir sem quebrar
      return [];
    }

    return normalizeBoletos(data);
  } catch (err) {
    // DNS, timeout, rede, etc.
    error("listarBoletosPorCPF", {
      code: err.code,
      message: err.message,
      responseStatus: err.response?.status,
      responseData: err.response?.data,
    });
    // Propague um erro mais amigável ou retorne []
    throw new Error(
      err.code === "ENOTFOUND"
        ? "Não consegui resolver o host da API. Verifique o domínio ou use SUPERLOGICA_BASE_URL."
        : "Falha ao consultar a API da Superlógica."
    );
  }
}

module.exports = { listarBoletosPorCPF };
