"use strict";

const Templates = {
  // === MENUS / AJUDA ===
  menu: (empresaNome) =>
    `
*${empresaNome ? empresaNome + " | " : ""}Menu principal*
1) 2ª via de boletos
2) Falar com atendimento
3) Trocar/Escolher empresa

_Responda com **1**, **2** ou **3**._`.trim(),

  help: () =>
    `
*🤖 Bot Superlógica — Ajuda*
Use os números para navegar:
1) 2ª via de boletos
2) Falar com atendimento
3) Trocar/Escolher empresa

_Comandos rápidos:_
• *empresa* — listar empresas disponíveis
• *cpf* — informar seu CPF
• *boleto* — buscar 2ª via dos boletos
• */encerrar* — sair do atendimento humano e voltar ao menu
`.trim(),

  // === STRINGS USADAS PELO FLUXO (bot.js) ===
  ASK_CPF: `Para continuar, me envie seu *CPF* (apenas números).\nEx.: 12345678909`,
  CPF_INVALIDO: `CPF inválido. Envie apenas números (11 dígitos).`,
  SEM_BOLETOS: `Não encontrei boletos em aberto para esse CPF nessa empresa.`,
  HANDOFF_MSG: `Beleza! Encaminhei seu pedido para o atendimento humano. Assim que possível alguém te responde por aqui.\nPara voltar ao menu a qualquer momento, envie */encerrar*.`,
  ENCERRADO: `Atendimento humano encerrado.`,

  // === LISTAS DE EMPRESAS ===
  empresasDisponiveis: (empresas = []) => {
    if (!Array.isArray(empresas) || empresas.length === 0) {
      return `*Empresas disponíveis:*\n(nenhuma cadastrada)\n\n_Cadastre pelo painel/DB antes de usar._`;
    }
    const lista = empresas
      .map((e, i) => {
        const nome = e?.nome ?? e?.fantasia ?? e?.razao ?? e?.slug ?? String(e);
        return `*${i + 1}.* ${nome}`;
      })
      .join("\n");

    return `*Empresas disponíveis:*\n${lista}\n\n_Responda com o número da empresa (ex.: 1, 2, 3...)._`;
  },

  // Usada quando o fluxo pede explicitamente a escolha de empresa
  escolherEmpresa: (empresas = []) => {
    if (!Array.isArray(empresas) || empresas.length === 0) {
      return `*Escolher empresa:*\n(nenhuma cadastrada)\n\n_Cadastre pelo painel/DB antes de usar._`;
    }
    const lista = empresas
      .map((e, i) => {
        const nome = e?.nome ?? e?.fantasia ?? e?.razao ?? e?.slug ?? String(e);
        return `*${i + 1}.* ${nome}`;
      })
      .join("\n");

    return `*Escolher empresa*\n${lista}\n\n_Responda com o número da empresa (ex.: 1, 2, 3...) ou digite o nome._`;
  },

  // === MENSAGENS DO FLUXO DE BOLETOS ===
  buscandoBoletos: (empresaNome) =>
    `🔎 Buscando boletos na empresa *${empresaNome}*...`,

  boletosEncontrados: (qtd) =>
    `Encontrei *${qtd}* boleto(s). Enviando os detalhes...`,

  nenhumBoleto: () =>
    `Não encontrei boletos em aberto para esse CPF nessa empresa.`,

  boletoItem: ({ nossoNumero, vencimento, valor, link }) => {
    const valorFmt =
      typeof valor === "number"
        ? valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : valor;
    return [
      `• *Nosso número:* ${nossoNumero ?? "-"}`,
      `  *Vencimento:* ${vencimento ?? "-"}`,
      `  *Valor:* ${valorFmt ?? "-"}`,
      link ? `  *2ª via:* ${link}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  },

  // === ERROS / ENCERRAMENTO ===
  erroGenerico: () =>
    `⚠️ Ocorreu um erro ao processar sua solicitação. Tente novamente em instantes.`,

  encerrar: () => `Atendimento encerrado. 👋`,
};

// Compatibilidade com chamadas antigas que usavam "menu()"
Templates.menu = Templates.menu;

module.exports = Templates;
