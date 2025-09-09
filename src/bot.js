// src/bot.js
'use strict';

const axios = require('axios');
const { getClient } = require('./wa');
const db = require('./db');
const Templates = require('./templates');
const { onlyDigits, validaCPF } = require('./validators');
const { listarBoletosPorCPF } = require('./superlogica');
const { log } = require('./db');
const { debug, error } = require('./logger');

async function sendText(client, waId, text) {
  await client.sendText(waId, text);
  try { await log('OUT', waId, text); } catch (_) {}
}

async function sendPdfFromUrlOrBase64(client, waId, url, filename, caption, headers = {}) {
  // Primeiro tenta direto da URL
  try {
    await client.sendFileFromUrl(waId, url, filename, caption);
    return true;
  } catch (e) {
    // Tenta baixar e enviar base64 (caso precise header)
    try {
      const resp = await axios.get(url, { responseType: 'arraybuffer', headers, timeout: 20000 });
      const base64 = Buffer.from(resp.data).toString('base64');
      await client.sendFileFromBase64(waId, `data:application/pdf;base64,${base64}`, filename, caption);
      return true;
    } catch (e2) {
      error('sendPdfFromUrlOrBase64', e2.message);
      return false;
    }
  }
}

async function startSession(sessionName) {
  const client = await getClient(sessionName);
  client.onMessage(async (msg) => handleIncoming(sessionName, client, msg));
  console.log('✅ WhatsApp sessão ativa:', sessionName);
}

async function resolveTenantForContato(waId, sessionName) {
  const contato = await db.getContato(waId);
  if (contato?.current_tenant_id) {
    const t = await db.getTenantById(contato.current_tenant_id);
    if (t) return t;
  }
  const e164 = '+' + onlyDigits(waId.replace('@c.us', ''));
  const def = await db.getDefaultTenantForPhoneE164(e164);
  if (def) return def;
  return null;
}

async function handleIncoming(sessionName, client, msg) {
  const waId = msg.from;
  const text = (msg.body || '').trim();
  const contato = await db.getOrCreateContato(waId);
  await log('IN', waId, text, { sessionName });

  // HUMANO pausado?
  if (contato.state === 'HUMAN') {
    if (!contato.human_until || new Date(contato.human_until) > new Date()) {
      return;
    } else {
      await db.setContatoState(waId, 'MENU', null);
      contato.state = 'MENU';
    }
  }

  // comando de encerrar
  if (text.toLowerCase() === '/encerrar') {
    await db.setContatoState(waId, 'MENU', null);
    const tenant = await resolveTenantForContato(waId, sessionName);
    return sendText(client, waId, Templates.ENCERRADO + '\n\n' + Templates.menu(tenant?.nome || null));
  }

  // fluxo por estado
  const tenant = await resolveTenantForContato(waId, sessionName);
  let empresaNome = tenant?.nome || null;

  if (contato.state === 'MENU' || !contato.state) {
    if (text === '1') {
      if (!tenant) {
        await db.setContatoState(waId, 'ESCOLHER_EMPRESA', null);
        const tenants = await db.listTenants();
        return sendText(client, waId, 'Antes, escolha a empresa:\n\n' + Templates.escolherEmpresa(tenants));
      }
      await db.setContatoState(waId, 'PEDIR_CPF', null);
      return sendText(client, waId, Templates.ASK_CPF);
    }
    if (text === '2') {
      const hours = Number(process.env.HANDOFF_HOURS || 12);
      const until = new Date(Date.now() + hours * 3600 * 1000);
      await db.setContatoState(waId, 'HUMAN', until);
      return sendText(client, waId, Templates.HANDOFF_MSG);
    }
    if (text === '3') {
      await db.setContatoState(waId, 'ESCOLHER_EMPRESA', null);
      const tenants = await db.listTenants();
      return sendText(client, waId, Templates.escolherEmpresa(tenants));
    }
    return sendText(client, waId, Templates.menu(empresaNome));
  }

  if (contato.state === 'ESCOLHER_EMPRESA') {
    const n = parseInt(text, 10);
    const tenants = await db.listTenants();
    if (!Number.isInteger(n) || n < 1 || n > tenants.length) {
      return sendText(client, waId, 'Opção inválida. ' + Templates.escolherEmpresa(tenants));
    }
    await db.setContatoTenant(waId, tenants[n - 1].id);
    await db.setContatoState(waId, 'MENU', null);
    return sendText(client, waId, 'Empresa definida: *' + tenants[n - 1].nome + '*.' + '\n\n' + Templates.menu(tenants[n - 1].nome));
  }

  if (contato.state === 'PEDIR_CPF') {
    const cpf = onlyDigits(text);
    if (!validaCPF(cpf)) {
      return sendText(client, waId, Templates.CPF_INVALIDO);
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

      // Caso modo email
      if (result && typeof result.emailed === 'boolean') {
        await db.setContatoState(waId, 'MENU', null);
        const msgOk = result.emailed
          ? 'Enviei a 2ª via para o e-mail cadastrado. Verifique sua caixa de entrada (e spam).'
          : 'Não consegui disparar o e-mail de 2ª via. Tente novamente mais tarde.';
        await sendText(client, waId, msgOk);
        return sendText(client, waId, Templates.menu(empresaNome));
      }

      const boletos = Array.isArray(result) ? result : [];
      if (!boletos || boletos.length === 0) {
        await db.setContatoState(waId, 'MENU', null);
        return sendText(client, waId, Templates.SEM_BOLETOS + '\n\n' + Templates.menu(empresaNome));
      }

      // Envia até 3 PDFs diretamente
      const maxPdfs = Math.min(boletos.length, 3);
      for (let i = 0; i < maxPdfs; i++) {
        const b = boletos[i];
        const valor = Number(b.valor || 0).toFixed(2);
        const filename = `boleto_${(b.nossoNumero || b.id || (i+1))}.pdf`.replace(/[^\w.-]+/g, '_');

        if (b.url_pdf && /\.(pdf)(\?|$)/i.test(b.url_pdf)) {
          const caption = `2ª via • Venc.: ${b.vencimento || '-'} • Valor: R$ ${valor}`;
          const ok = await sendPdfFromUrlOrBase64(client, waId, b.url_pdf, filename, caption);
          if (!ok) {
            await sendText(client, waId, Templates.boletoItem({
              nossoNumero: b.nossoNumero || b.id,
              vencimento: b.vencimento,
              valor: b.valor,
              link: b.url_pdf
            }));
          }
        } else {
          await sendText(client, waId, Templates.boletoItem({
            nossoNumero: b.nossoNumero || b.id,
            vencimento: b.vencimento,
            valor: b.valor,
            link: b.url_pdf
          }));
        }
      }

      if (boletos.length > maxPdfs) {
        const linhas = boletos.slice(maxPdfs).map((b, idx) => {
          const i = idx + maxPdfs + 1;
          return `${i}) ${b.descricao || 'Boleto'} • Venc.: ${b.vencimento || '-'} • R$ ${Number(b.valor||0).toFixed(2)}`;
        });
        await sendText(client, waId,
          '*Há mais boletos disponíveis:*\n' +
          linhas.join('\n') +
          '\n\n_Para receber o PDF de algum deles, acesse o link enviado acima ou responda novamente com **1** para informar outro CPF._'
        );
      }

      await db.setContatoState(waId, 'MENU', null);
      return sendText(client, waId, Templates.menu(empresaNome));
    } catch (e) {
      error('listarBoletosPorCPF', e?.response?.data || e.message);
      await db.setContatoState(waId, 'MENU', null);
      return sendText(client, waId, 'Não consegui consultar agora. Tente mais tarde ou fale com atendimento (2).\n\n' + Templates.menu(empresaNome));
    }
  }

  // fallback
  await db.setContatoState(waId, 'MENU', null);
  return sendText(client, waId, Templates.menu(empresaNome));
}

module.exports = { startSession };
