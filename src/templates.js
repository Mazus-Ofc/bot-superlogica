"use strict";

const ASK_CPF =
  "Para continuar, me envie seu *CPF* (apenas números).\nEx.: 12345678909";
const CPF_INVALIDO = "CPF inválido. Envie apenas números (11 dígitos).";
const SEM_BOLETOS =
  "Não encontrei boletos em aberto para esse CPF nessa empresa.";
const HANDOFF_MSG =
  "Certo! Vou repassar seu atendimento pra nossa equipe humana. Você pode continuar mandando mensagens aqui que eles vão responder.";
const ENCERRADO = "Atendimento encerrado. 👋";

function menu(empresaNome = null) {
  const header = empresaNome
    ? `*🤖 Bot Superlógica*\nEmpresa atual: *${empresaNome}*\n`
    : `*🤖 Bot Superlógica*\n`;
  return (
    header +
    [
      "",
      "*Como posso ajudar?*",
      "1) Consultar boletos (2ª via)",
      "2) Falar com atendimento humano",
      "3) Trocar/Selecionar empresa",
      "",
      "_Responda com o número da opção._",
    ].join("\n")
  ).trim();
}

function empresasDisponiveis(empresas = []) {
  if (!Array.isArray(empresas) || empresas.length === 0) {
    return (
      "*Empresas disponíveis:*\n(nenhuma cadastrada)\n\n" +
      "_Cadastre pelo painel/DB antes de usar._"
    );
  }
  const lista = empresas
    .map((e, i) => {
      const nome = e?.nome ?? e?.fantasia ?? e?.razao ?? e?.slug ?? String(e);
      return `*${i + 1}.* ${nome}`;
    })
    .join("\n");

  return (
    `*Empresas disponíveis:*\n${lista}\n\n` +
    "_Responda com o número da empresa ou digite o nome._"
  );
}

function escolherEmpresa(empresas = []) {
  if (!Array.isArray(empresas) || empresas.length === 0) {
    return (
      "*Escolher empresa:*\n(nenhuma cadastrada)\n\n" +
      "_Cadastre pelo painel/DB antes de usar._"
    );
  }
  const lista = empresas
    .map((e, i) => {
      const nome = e?.nome ?? e?.fantasia ?? e?.razao ?? e?.slug ?? String(e);
      return `*${i + 1}.* ${nome}`;
    })
    .join("\n");

  return (
    `*Escolher empresa*\n${lista}\n\n` +
    "_Responda com o número da empresa ou digite o nome._"
  );
}

function pedirCpf() { return ASK_CPF; }
function buscandoBoletos(empresaNome) { return `🔎 Buscando boletos na empresa *${empresaNome}*...`; }
function nenhumBoleto() { return SEM_BOLETOS; }
function boletosEncontrados(qtd) { return `Encontrei *${qtd}* boleto(s). Enviando os detalhes...`; }

function boletoItem({ nossoNumero, vencimento, valor, link }) {
  const valorFmt =
    typeof valor === "number"
      ? valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : valor;
  return [
    `• *Nosso número:* ${nossoNumero ?? "-"}`,
    `  *Vencimento:* ${vencimento ?? "-"}`,
    `  *Valor:* ${valorFmt ?? "-"}`,
    link ? `  *2ª via:* ${link}` : null,
  ].filter(Boolean).join("\n");
}

const erroGenerico = "⚠️ Ocorreu um erro ao processar sua solicitação. Tente novamente em instantes.";

module.exports = {
  ASK_CPF, CPF_INVALIDO, SEM_BOLETOS, HANDOFF_MSG, ENCERRADO,
  menu, empresasDisponiveis, escolherEmpresa, pedirCpf, buscandoBoletos,
  nenhumBoleto, boletosEncontrados, boletoItem, erroGenerico,
};
