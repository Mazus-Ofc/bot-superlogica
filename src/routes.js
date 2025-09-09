const express = require('express');
const router = express.Router();
const { adminAuth } = require('./security');
const db = require('./db');
const { listarBoletosPorCPF } = require('./superlogica');
const { onlyDigits, validaCPF } = require('./validators');

router.get('/health', (req,res)=>res.json({ ok: true }));

// cria usuário lógico
router.post('/admin/users', adminAuth, async (req,res) => {
  const { name, email } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name é obrigatório' });
  const u = await db.createUser({ name, email: email || null });
  res.json(u);
});

// cria tenant
router.post('/admin/tenants', adminAuth, async (req,res) => {
  const { user_id, nome, superlogica_base, app_token, access_token, condominio_id } = req.body || {};
  if (!user_id || !nome || !superlogica_base || !app_token || !access_token) {
    return res.status(400).json({ error: 'Campos obrigatórios: user_id, nome, superlogica_base, app_token, access_token' });
  }
  const t = await db.createTenant({ user_id, nome, superlogica_base, app_token, access_token, condominio_id });
  res.json(t);
});

// registra sessão de WhatsApp (apenas cadastro; QR aparece nos logs ao iniciar server)
router.post('/admin/wa-sessions', adminAuth, async (req,res) => {
  const { tenant_id, session_name, phone_e164 } = req.body || {};
  if (!session_name) return res.status(400).json({ error: 'session_name é obrigatório' });
  const s = await db.createWASession({ tenant_id: tenant_id || null, session_name, phone_e164: phone_e164 || null });
  res.json(s);
});

// define tenant padrão para um número E.164 (ex.: +55...)
router.post('/admin/assign-default-tenant', adminAuth, async (req,res) => {
  const { phone_e164, tenant_id, session_name } = req.body || {};
  if (!phone_e164 || !tenant_id || !session_name) {
    return res.status(400).json({ error: 'phone_e164, tenant_id e session_name são obrigatórios' });
  }
  // simples: atualiza/insere wa_sessions
  const s = await db.createWASession({ tenant_id, session_name, phone_e164 });
  res.json(s);
});

// Disparo manual de 2ª via por CPF (retorna JSON com lista)
router.post('/admin/boletos/disparar', adminAuth, async (req,res) => {
  const { tenant_id, cpf } = req.body || {};
  if (!tenant_id || !cpf) return res.status(400).json({ error: 'tenant_id e cpf são obrigatórios' });
  if (!validaCPF(cpf)) return res.status(400).json({ error: 'CPF inválido' });

  const tenant = await db.getTenantById(tenant_id);
  if (!tenant) return res.status(404).json({ error: 'tenant não encontrado' });

  try {
    const boletos = await listarBoletosPorCPF({
      superBase: tenant.superlogica_base,
      appToken: tenant.app_token,
      accessToken: tenant.access_token,
      condominioId: tenant.condominio_id,
      cpf: onlyDigits(cpf)
    });
    res.json({ ok: true, total: boletos.length, boletos });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao consultar boletos', detail: e?.response?.data || e.message });
  }
});

module.exports = router;
