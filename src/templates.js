"use strict";

const Templates = {
  help: () => `
*🤖 Bot Superlógica — Ajuda*
• *empresa* — listar empresas disponíveis
• *cpf* — informar seu CPF para localizar boletos
• *boleto* — buscar 2ª via dos boletos
• *sair* — encerrar atendimento

_Envie uma das opções acima ou siga as instruções que eu mandar._`.trim(),

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

    return `*Empresas disponíveis:*\n${lista}\n\n_Responda com o número da empresa ou digite o nome._`;
  },

  // Nova: usada quando o fluxo pede explicitamente para o usuário escolher a empresa
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

    return `*Escolher empresa*\n${lista}\n\n_Responda com o número da empresa ou digite o nome._`;
  },

  pedirCpf: () => `
Para continuar, me envie seu *CPF* (apenas números).
Ex.: 12345678909`.trim(),

  cpfInvalido: () => `CPF inválido. Envie apenas números (11 dígitos).`,

  buscandoBoletos: (empresaNome) =>
    `🔎 Buscando boletos na empresa *${empresaNome}*...`,

  nenhumBoleto: () =>
    `Não encontrei boletos em aberto para esse CPF nessa empresa.`,

  boletosEncontrados: (qtd) =>
    `Encontrei *${qtd}* boleto(s). Enviando os detalhes...`,

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

  erroGenerico: () =>
    `⚠️ Ocorreu um erro ao processar sua solicitação. Tente novamente em instantes.`,

  encerrar: () => `Atendimento encerrado. 👋`,
};

// Alias para compatibilidade com chamadas antigas
Templates.menu = Templates.help;

module.exports = Templates;
