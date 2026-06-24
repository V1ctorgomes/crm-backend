export function onlyDigits(s: string): string {
  return String(s || '').replace(/\D/g, '');
}

export function isValidCpf(cpf: string): boolean {
  const n = onlyDigits(cpf);
  if (n.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(n)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(n.charAt(i), 10) * (10 - i);
  let d1 = 11 - (sum % 11);
  if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(n.charAt(9), 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(n.charAt(i), 10) * (11 - i);
  let d2 = 11 - (sum % 11);
  if (d2 >= 10) d2 = 0;
  return d2 === parseInt(n.charAt(10), 10);
}

export function isValidCnpj(cnpj: string): boolean {
  const n = onlyDigits(cnpj);
  if (n.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(n)) return false;
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let t = 0;
  for (let i = 0; i < 12; i++) t += parseInt(n.charAt(i), 10) * w1[i];
  let d1 = t % 11 < 2 ? 0 : 11 - (t % 11);
  if (d1 !== parseInt(n.charAt(12), 10)) return false;
  t = 0;
  for (let i = 0; i < 13; i++) t += parseInt(n.charAt(i), 10) * w2[i];
  let d2 = t % 11 < 2 ? 0 : 11 - (t % 11);
  return d2 === parseInt(n.charAt(13), 10);
}

export function isValidCpfOrCnpj(value: string): boolean {
  const n = onlyDigits(value);
  if (n.length === 11) return isValidCpf(n);
  if (n.length === 14) return isValidCnpj(n);
  return false;
}
