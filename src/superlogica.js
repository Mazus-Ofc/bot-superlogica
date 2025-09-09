"use strict";

const axios = require("axios");
const { debug, error } = require("./logger");

const MODE = (process.env.SUPERLOGICA_MODE || "api").toLowerCase(); // "api" | "email"
const BASE_URL_ENV = process.env.SUPERLOGICA_BASE_URL || "";
const PATH_BOLETOS_ENV = process.env.SUPERLOGICA_BOLETOS_PATH || "/v1/boletos";
const LICENSE = process.env.SUPERLOGICA_LICENSE || "";
const FALLBACK_LINK = process.env.SUPERLOGICA_FALLBACK_LINK || "";

/** Resolve host por base do módulo quando não há override no .env */
function baseUrl(superBase) {
  if (BASE_URL_ENV) return BASE_URL_ENV.replace(/\/+$/, "");
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

function headers(appToken, accessToken) {
  return {
    app_token: appToken,
    access_token: accessToken,
    "Content-Type": "application/json",
  };
}

function looksLikeHtml(data, headers = {}) {
  try {
    if (typeof data === "string" && /<!DOCTYPE|<html/i.test(data)) return true;
    const ct = (headers["content-type"] || headers["Content-Type"] || "").toString();
    if (ct && !/json|javascript/i.test(ct)) return true; // não é json
  } catch (_) {}
  return false;
}

function getFallbackLink() {
  return FALLBACK_LINK || null;
}

/**
 * Fallback público por e-mail (Condo/Imob): dispara a 2ª via para o e-mail cadastrado.
 * Ex.: https://<license>.superlogica.net/condor/atual/publico/emailcobrancasemaberto?cpf=...
 */
async function enviarSegundaViaPorEmail({ cpf }) {
  if (!LICENSE) {
    debug("Superlogica (email 2ª via) SKIP: LICENSE ausente no .env");
    return { ok: false, sent: false };
  }
  const url = `https://${LICENSE}.superlogica.net/condor/atual/publico/emailcobrancasemaberto`;
  const params = { cpf };
  debug("Superlogica (email 2ª via) GET", url, params);
  try {
    const resp = await axios.get(url, { params, timeout: 15000 });
    // Muitos desses endpoints retornam HTML ou redirecionam — consideramos sucesso 2xx
    return { ok: true, sent: true, status: resp.status };
  } catch (e) {
    error("Superlogica (email 2ª via) erro", e.message);
    return { ok: false, sent: false, status: e.response?.status };
  }
}

/**
 * Tenta buscar boletos pela API oficial. Em caso de HTML/404, lança erro.
 * Retorna array normalizado de boletos (id, descricao, vencimento, valor, linha_digitavel, url_pdf/link).
 */
async function listarBoletosPorCPF({ superBase, appToken, accessToken, condominioId, cpf }) {
  if (MODE === "email") {
    // Apenas dispara por e-mail e retorna vazio para o bot usar o fallback de link.
    await enviarSegundaViaPorEmail({ cpf });
    return [];
  }

  const base = baseUrl(superBase);
  const path = PATH_BOLETOS_ENV.startsWith("/") ? PATH_BOLETOS_ENV : `/${PATH_BOLETOS_ENV}`;
  const url = `${base}${path}`;
  const params = { cpf, status: "em_aberto" };
  if (condominioId && condominioId !== "NULL") params.condominio_id = condominioId;

  debug("Superlogica GET", url, params);
  try {
    const resp = await axios.get(url, {
      params,
      headers: headers(appToken, accessToken),
      timeout: 20000,
      validateStatus: (s) => true, // vamos inspecionar
    });

    if (resp.status >= 400 || looksLikeHtml(resp.data, resp.headers)) {
      error("Superlogica HTTP " + resp.status, typeof resp.data === "string" ? resp.data.slice(0, 500) : JSON.stringify(resp.data).slice(0, 500));
      throw new Error(`HTTP_${resp.status}`);
    }

    const data = resp.data;
    const arr = Array.isArray(data) ? data : (data?.boletos || data?.data || []);

    return arr.map((b) => ({
      id: b.id || b.boleto_id || b.id_boleto,
      descricao: b.descricao || b.titulo || "Boleto",
      vencimento: b.vencimento || b.data_vencimento || b.venc || null,
      valor: b.valor || b.valor_boleto || b.total || 0,
      linha_digitavel: b.linha_digitavel || b.codigo_barras || null,
      url_pdf: b.url_pdf || b.url_segundavia || b.link || null,
    }));
  } catch (e) {
    // Plano B: dispara por e-mail, mas propaga erro pro bot acionar fallback visual
    await enviarSegundaViaPorEmail({ cpf });
    throw e;
  }
}

module.exports = {
  listarBoletosPorCPF,
  getFallbackLink,
  enviarSegundaViaPorEmail,
};
