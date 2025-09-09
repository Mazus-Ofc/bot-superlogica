function neutralBrand(name) {
  return name ? `da *${name}*` : 'da empresa';
}

function menu(empresaName=null) {
  return `Olá! Eu sou o assistente ${neutralBrand(empresaName)}.
1 - 2ª via de boletos
2 - Atendimento humano
3 - Trocar empresa (se você atende mais de uma)
Digite o número da opção.`;
}

const ASK_CPF = 'Perfeito! Me envie seu *CPF* (apenas números).';
const CPF_INVALIDO = 'Hmm… esse CPF parece inválido. Tente novamente (apenas números).';
const SEM_BOLETOS = 'Não encontrei boletos em aberto para este CPF. Você pode tentar outro CPF, escolher atendimento humano (opção 2) ou enviar /encerrar';
const HANDOFF_MSG = 'Tudo certo! Vou te colocar com o atendimento humano. Quando quiser voltar ao bot, envie */encerrar*.';
const ENCERRADO = 'Atendimento encerrado. Precisa de mais alguma coisa?';

function escolherEmpresa(lista) {
  if (!lista || !lista.length) return 'Não há empresas vinculadas ao seu número no momento.';
  const linhas = lista.map((t,i)=> `${i+1}) ${t.nome}`);
  return '*Empresas disponíveis:*
' + linhas.join('\n') + '\n\nEnvie o número da empresa.';
}

module.exports = {
  menu, ASK_CPF, CPF_INVALIDO, SEM_BOLETOS, HANDOFF_MSG, ENCERRADO, escolherEmpresa
};
