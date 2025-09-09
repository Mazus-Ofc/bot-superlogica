const { Pool } = require('pg');
const pool = new Pool();

async function log(direction, wa_id, message, meta=null) {
  await pool.query('INSERT INTO logs (direction, wa_id, message, meta) VALUES ($1,$2,$3,$4)', [direction, wa_id, message, meta]);
}

async function getOrCreateContato(wa_id) {
  const q = await pool.query('SELECT * FROM contatos WHERE wa_id=$1', [wa_id]);
  if (q.rows[0]) return q.rows[0];
  const ins = await pool.query('INSERT INTO contatos (wa_id) VALUES ($1) RETURNING *', [wa_id]);
  return ins.rows[0];
}

async function setContatoState(wa_id, state, human_until=null) {
  await pool.query('UPDATE contatos SET state=$2, human_until=$3, updated_at=now() WHERE wa_id=$1', [wa_id, state, human_until]);
}

async function setContatoCPF(wa_id, cpf) {
  await pool.query('UPDATE contatos SET cpf=$2, updated_at=now() WHERE wa_id=$1', [wa_id, cpf]);
}

async function setContatoTenant(wa_id, tenant_id) {
  await pool.query('UPDATE contatos SET current_tenant_id=$2, updated_at=now() WHERE wa_id=$1', [wa_id, tenant_id]);
}

async function getContato(wa_id) {
  const { rows } = await pool.query('SELECT * FROM contatos WHERE wa_id=$1', [wa_id]);
  return rows[0];
}

async function listTenantsByUser(user_id) {
  const { rows } = await pool.query('SELECT * FROM tenants WHERE user_id=$1 ORDER BY id', [user_id]);
  return rows;
}

async function listTenants() {
  const { rows } = await pool.query('SELECT * FROM tenants ORDER BY id');
  return rows;
}

async function getTenantById(id) {
  const { rows } = await pool.query('SELECT * FROM tenants WHERE id=$1', [id]);
  return rows[0];
}

async function getDefaultTenantForPhoneE164(e164) {
  // simples: buscar em wa_sessions
  const { rows } = await pool.query('SELECT t.* FROM wa_sessions w JOIN tenants t ON t.id=w.tenant_id WHERE w.phone_e164=$1 AND w.is_active=true LIMIT 1', [e164]);
  return rows[0];
}

async function createUser({ name, email }) {
  const { rows } = await pool.query('INSERT INTO users (name, email) VALUES ($1,$2) RETURNING *', [name, email]);
  return rows[0];
}

async function createTenant({ user_id, nome, superlogica_base, app_token, access_token, condominio_id }) {
  const { rows } = await pool.query(
    'INSERT INTO tenants (user_id, nome, superlogica_base, app_token, access_token, condominio_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [user_id, nome, superlogica_base, app_token, access_token, condominio_id || null]
  );
  return rows[0];
}

async function createWASession({ tenant_id, session_name, phone_e164 }) {
  const { rows } = await pool.query(
    'INSERT INTO wa_sessions (tenant_id, session_name, phone_e164) VALUES ($1,$2,$3) RETURNING *',
    [tenant_id || null, session_name, phone_e164 || null]
  );
  return rows[0];
}

module.exports = {
  pool,
  log,
  getOrCreateContato, setContatoState, setContatoCPF, setContatoTenant, getContato,
  listTenantsByUser, listTenants, getTenantById, getDefaultTenantForPhoneE164,
  createUser, createTenant, createWASession
};
