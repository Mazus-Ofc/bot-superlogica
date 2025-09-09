function onlyDigits(s='') { return s.replace(/\D/g, ''); }

function validaCPF(cpf) {
  cpf = onlyDigits(cpf || '');
  if (cpf.length !== 11 || /(\d)\1{10}/.test(cpf)) return false;
  let soma = 0;
  for (let i=0;i<9;i++) soma += parseInt(cpf[i])*(10-i);
  let d1 = 11 - (soma % 11); d1 = d1 > 9 ? 0 : d1;
  soma = 0;
  for (let i=0;i<10;i++) soma += parseInt(cpf[i])*(11-i);
  let d2 = 11 - (soma % 11); d2 = d2 > 9 ? 0 : d2;
  return cpf[9] == d1 && cpf[10] == d2;
}

function normalizeWaId(phone) {
  const d = onlyDigits(phone);
  if (d.startswith && d.startswith('55')) return d + '@c.us';
  if (d.slice(0,2) === '55') return d + '@c.us';
  return '55' + d + '@c.us';
}

module.exports = { onlyDigits, validaCPF, normalizeWaId };
