# Bot de Boletos via WhatsApp + Superlógica (Multi-tenant)

## Recursos
- Multi-empresa (tokens da Superlógica por **tenant**).
- Mensagens **neutras**; nome da empresa aparece quando o contato seleciona/tem padrão.
- Menu WhatsApp com **3 opções**:
  1) 2ª via de boletos
  2) Atendimento humano (/encerrar para voltar)
  3) Trocar empresa (selecionar outra empresa vinculada)
- Handoff humano com auto-reativação após **12h**.
- Endpoints admin para cadastrar **usuários**, **tenants** (empresas), **sessões WhatsApp** e atribuir tenant padrão por número.
- Docker + docker-compose.

## Subida rápida
```bash
cp .env.example .env
docker compose up -d --build
docker compose logs -f bot  # escanear QR da sessão DEFAULT_WA_SESSION
curl http://localhost:3000/health
```

## Endpoints Admin (header: X-Admin-Token)
- `POST /admin/users` → cria usuário lógico (dono/gestor).
- `POST /admin/tenants` → cria empresa (nome, base, tokens, condominio_id opc.).
- `POST /admin/wa-sessions` → registra sessão WhatsApp e (opcionalmente) vincula a um tenant.
- `POST /admin/assign-default-tenant` → define tenant padrão para um número (ex.: +55...).
- `POST /admin/boletos/disparar` → consulta 2ª via por CPF e retorna JSON.

## Observações
- Endpoint real para **boletos por CPF** varia por produto (Condomínios/Imobiliárias/Assinaturas). Ajuste `src/superlogica.js` conforme seu contrato.
- Para multi-sessões de WhatsApp simultâneas, suba múltiplos processos ou estenda `wa.js` para gerenciar várias sessões.
