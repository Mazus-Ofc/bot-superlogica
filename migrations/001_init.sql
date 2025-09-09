
-- usuários administradores/lógicos (donos das empresas no seu painel)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(180) UNIQUE,
  created_at TIMESTAMP DEFAULT now()
);

-- empresas/tenants
CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  nome VARCHAR(120) NOT NULL,
  superlogica_base VARCHAR(40) NOT NULL,      -- "assinaturas" | "condominios" | "imobiliarias"
  app_token TEXT NOT NULL,
  access_token TEXT NOT NULL,
  condominio_id VARCHAR(64),
  created_at TIMESTAMP DEFAULT now()
);

-- sessões de WhatsApp (uma por número)
CREATE TABLE IF NOT EXISTS wa_sessions (
  id SERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id),
  session_name VARCHAR(120) NOT NULL UNIQUE,  -- ex.: whats-empresa-x
  phone_e164 VARCHAR(20),                     -- +55XXXXXXXXXXX
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);

-- contatos (usuários finais)
CREATE TABLE IF NOT EXISTS contatos (
  id SERIAL PRIMARY KEY,
  wa_id VARCHAR(40) NOT NULL UNIQUE,          -- "55XXXXXXXXXXX@c.us"
  nome VARCHAR(120),
  cpf VARCHAR(14),
  current_tenant_id INT REFERENCES tenants(id), -- empresa ativa p/ o contato
  state VARCHAR(40) DEFAULT 'MENU',           -- MENU | PEDIR_CPF | HUMAN | ESCOLHER_EMPRESA
  human_until TIMESTAMP,
  updated_at TIMESTAMP DEFAULT now()
);

-- histórico/auditoria
CREATE TABLE IF NOT EXISTS logs (
  id BIGSERIAL PRIMARY KEY,
  wa_id VARCHAR(40),
  direction VARCHAR(8) NOT NULL,              -- IN | OUT | SYS
  message TEXT,
  meta JSONB,
  created_at TIMESTAMP DEFAULT now()
);
