// src/superlogica.js
"use strict";

const axios = require("axios");
const dns = require("node:dns").promises;
const { debug, error } = require("./logger");

function pickBase(superBase) {
  const envBase = (process.env.SUPERLOGICA_BASE_URL || "").trim();
  if (envBase) return envBase;

  switch (String(superBase || "").toLowerCase().trim()) {
    case "condominios":
      return "https://apicondominios.superlogica.com";
    case "assinaturas":
      return "https://apiassinaturas.superlogica.com";
    case "imobiliarias":
      return "https://apiimobiliarias.superlogica.com";
    default:
      return "https://apiassinaturas.superlogica.com";
  }
}

function pickPath() {
  const envPath = (process.env.SUPERLOGICA_BOLETOS_PATH || "/v1/boletos").trim();
  return envPath.startsWith("/") ? envPath : `/${envPath}`;
}

function ensureHttpUrl(u) {
  if (!/^https?:\/\//i.test(u)) throw new Error(`Base URL inválida (sem http/https): ${u}`);
  return u.replace(/\s+/g, "");
}

async function assertDnsReachable(urlStr) {
  const host = new URL(urlStr).host;
  await dns.lookup(host);
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
  if (String(superBase || "").toLowerCase() === "condominios" && condominioId && String(condominioId).toUpperCase() !== "NULL") {
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
    nossoNumero: b.nossoNumero || b.nosso_numero || b.referencia || b.id || null,
  }));
}

async function tryEmailSecondCopy(cpf) {
  const lic = (process.env.SUPERLOGICA_LICENSE || "").trim();
  if (!lic) return { attempted: false, emailed: false };

  const url = `https://${lic}.superlogica.net/condor/atual/publico/emailcobrancasemaberto`;
  const params = { cpf };
  debug("Superlogica (email 2ª via) GET", url, params);
  try {
    const resp = await axios.get(url, { params, timeout: 15000, validateStatus: (s) => s < 500 });
    if (resp.status >= 400) {
      error("Superlogica email HTTP " + resp.status, resp.data);
      return { attempted: true, emailed: false };
    }
    return { attempted: true, emailed: true };
  } catch (e) {
    error("Superlogica email exception", { code: e.code, message: e.message });
    return { attempted: true, emailed: false };
  }
}

async function listarBoletosPorCPF({ superBase, appToken, accessToken, condominioId, cpf, baseUrlOverride, pathOverride }) {
  const mode = (process.env.SUPERLOGICA_MODE || "api").toLowerCase();
  if (mode === "email") return tryEmailSecondCopy(cpf);

  let base = (baseUrlOverride || pickBase(superBase) || "").trim();
  let path = (pathOverride || pickPath() || "").trim();

  base = ensureHttpUrl(base);
  const fullBase = new URL("/", base).toString();
  const url = new URL(path, fullBase).toString();

  try {
    await assertDnsReachable(fullBase);
  } catch (e) {
    const fb = await tryEmailSecondCopy(cpf);
    if (fb.attempted) return fb;
    throw new Error(`DNS não resolve para ${new URL(fullBase).host} (${e.code}). Ajuste SUPERLOGICA_BASE_URL ou o superBase do tenant.`);
  }

  const params = buildParams(superBase, condominioId, cpf);
  const headers = buildHeaders(appToken, accessToken);
  debug("Superlogica GET", url, params);

  try {
    const resp = await axios.get(url, { params, headers, timeout: 20000, validateStatus: (s) => s < 500 });
    const { data, status, headers: respHeaders } = resp;

    if (status >= 400) {
      error(`Superlogica HTTP ${status}`, data);
      const fb = await tryEmailSecondCopy(cpf);
      if (fb.attempted) return fb;
      return [];
    }

    const ct = String(respHeaders["content-type"] || "");
    if (ct.includes("text/html")) {
      error("Superlogica retornou HTML (path incorreto?)", { url, ct });
      const fb = await tryEmailSecondCopy(cpf);
      if (fb.attempted) return fb;
      return [];
    }

    const out = normalizeBoletos(data);
    if (!out.length) {
      const fb = await tryEmailSecondCopy(cpf);
      if (fb.attempted) return fb;
    }
    return out;
  } catch (err) {
    error("listarBoletosPorCPF", { code: err.code, message: err.message, responseStatus: err.response?.status, responseData: err.response?.data });
    const fb = await tryEmailSecondCopy(cpf);
    if (fb.attempted) return fb;

    if (err.message && /invalid url/i.test(err.message)) { throw new Error("URL inválida construída."); }
    throw err;
  }
}

module.exports = { listarBoletosPorCPF };
