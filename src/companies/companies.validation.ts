import { HttpException, HttpStatus } from '@nestjs/common';

export function onlyDigits(s: string): string {
  return String(s || '').replace(/\D/g, '');
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
  const d2 = t % 11 < 2 ? 0 : 11 - (t % 11);
  return d2 === parseInt(n.charAt(13), 10);
}

export type CompanyInput = {
  legalName?: string;
  tradeName?: string | null;
  cnpj?: string;
};

export type SanitizedCompany = {
  legalName: string;
  tradeName: string | null;
  cnpj: string;
};

/** Sanitiza e valida razão social, nome fantasia (opcional) e CNPJ; 400 se inválido. */
export function sanitizeAndAssertCompany(data: CompanyInput): SanitizedCompany {
  const legalName = String(data.legalName || '').trim();
  if (legalName.length < 2) {
    throw new HttpException('A Razão Social deve ter pelo menos 2 caracteres.', HttpStatus.BAD_REQUEST);
  }
  if (legalName.length > 200) {
    throw new HttpException('A Razão Social é demasiado longa.', HttpStatus.BAD_REQUEST);
  }
  const tradeRaw = data.tradeName === undefined || data.tradeName === null ? '' : String(data.tradeName).trim();
  const tradeName = tradeRaw === '' ? null : tradeRaw;
  if (tradeName && tradeName.length > 200) {
    throw new HttpException('O Nome Fantasia é demasiado longo.', HttpStatus.BAD_REQUEST);
  }

  const cnpj = onlyDigits(String(data.cnpj || ''));
  if (cnpj.length !== 14) {
    throw new HttpException('O CNPJ deve ter 14 dígitos.', HttpStatus.BAD_REQUEST);
  }
  if (!isValidCnpj(cnpj)) {
    throw new HttpException('CNPJ inválido (dígitos verificadores incorrectos).', HttpStatus.BAD_REQUEST);
  }

  return { legalName, tradeName, cnpj };
}
