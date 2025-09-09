const axios = require('axios');
const { debug } = require('./logger');

function baseUrl(superBase) {
  switch (superBase) {
    case 'condominios':   return 'https://apicondominios.superlogica.com';
    case 'assinaturas':   return 'https://apiassinaturas.superlogica.com';
    case 'imobiliarias':  return 'https://apiimobiliarias.superlogica.com'; // CONFIRMAR com a Superlógica
    default:              return 'https://apiassinaturas.superlogica.com';
  }
}

function headers(appToken, accessToken) {
  return {
    'app_token': appToken,
    'access_token': accessToken,
    'Content-Type': 'application/json'
  };
}

/**
 * Ajuste este endpoint conforme seu módulo/escopo contratado.
 * Abaixo é apenas um exemplo ilustrativo.
 */
async function listarBoletosPorCPF({ superBase, appToken, accessToken, condominioId, cpf }) {
  const url = `${baseUrl(superBase)}/v1/boletos`; // ajuste!
  const params = { cpf, status: 'em_aberto', condominio_id: condominioId };
  debug('Superlogica GET', url, params);
  const { data } = await axios.get(url, { params, headers: headers(appToken, accessToken) });
  // normalize
  const arr = Array.isArray(data) ? data : (data?.boletos || []);
  return arr.map(b => ({
    id: b.id || b.boleto_id || b.id_boleto,
    descricao: b.descricao || b.titulo || 'Boleto',
    vencimento: b.vencimento || b.data_vencimento || b.venc || null,
    valor: b.valor || b.valor_boleto || b.total || 0,
    linha_digitavel: b.linha_digitavel || b.codigo_barras || null,
    url_pdf: b.url_pdf || b.url_segundavia || b.link || null
  }));
}

module.exports = { listarBoletosPorCPF };
