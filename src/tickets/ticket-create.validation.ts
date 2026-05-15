import { HttpException, HttpStatus } from '@nestjs/common';

export function onlyDigits(s: string): string {
  return String(s || '').replace(/\D/g, '');
}

function isValidEmail(email: string): boolean {
  const e = email.trim();
  if (e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(e);
}

function isValidCpf(cpf: string): boolean {
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

function isValidCnpj(cnpj: string): boolean {
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

function isValidCpfOrCnpj(value: string): boolean {
  const n = onlyDigits(value);
  if (n.length === 11) return isValidCpf(n);
  if (n.length === 14) return isValidCnpj(n);
  return false;
}

function minText(v: string, label: string): void {
  const t = v.trim();
  if (!t) throw new HttpException(`O campo «${label}» é obrigatório.`, HttpStatus.BAD_REQUEST);
  if (t.length < 2) throw new HttpException(`O campo «${label}» deve ter pelo menos 2 caracteres.`, HttpStatus.BAD_REQUEST);
}

export type SanitizedCreateTicket = {
  contactNumber: string;
  nome: string;
  email: string;
  cpf: string;
  marca: string;
  modelo: string;
  customerType: string;
  ticketType: string;
  stageId: string;
  companyId: string | null;
};

/** Lança HttpException 400 com mensagem em português se inválido. */
export function sanitizeAndAssertCreateTicket(data: {
  contactNumber?: string;
  nome?: string;
  email?: string;
  cpf?: string;
  marca?: string;
  modelo?: string;
  customerType?: string;
  ticketType?: string;
  stageId?: string;
  companyId?: string | null;
}): SanitizedCreateTicket {
  if (!String(data.contactNumber || '').trim()) {
    throw new HttpException('O número de contato é obrigatório.', HttpStatus.BAD_REQUEST);
  }
  const contactNumber = onlyDigits(String(data.contactNumber || ''));
  if (!contactNumber || contactNumber.length < 10) {
    throw new HttpException('Número de contato inválido (mínimo 10 dígitos).', HttpStatus.BAD_REQUEST);
  }

  const stageId = String(data.stageId || '').trim();
  if (!stageId) {
    throw new HttpException('Fase (stageId) é obrigatória.', HttpStatus.BAD_REQUEST);
  }

  minText(String(data.nome || ''), 'Nome completo');

  const email = String(data.email || '').trim().toLowerCase();
  if (!email) throw new HttpException('O e-mail é obrigatório.', HttpStatus.BAD_REQUEST);
  if (!isValidEmail(email)) {
    throw new HttpException('Indique um e-mail válido (ex.: nome@empresa.pt).', HttpStatus.BAD_REQUEST);
  }

  const taxDigits = onlyDigits(String(data.cpf || ''));
  if (!taxDigits) throw new HttpException('O CPF ou CNPJ é obrigatório.', HttpStatus.BAD_REQUEST);
  if (taxDigits.length !== 11 && taxDigits.length !== 14) {
    throw new HttpException('CPF deve ter 11 dígitos ou CNPJ 14 dígitos.', HttpStatus.BAD_REQUEST);
  }
  if (!isValidCpfOrCnpj(taxDigits)) {
    throw new HttpException('CPF ou CNPJ inválido (dígitos verificadores incorretos).', HttpStatus.BAD_REQUEST);
  }

  minText(String(data.marca || ''), 'Marca');
  minText(String(data.modelo || ''), 'Modelo');
  minText(String(data.customerType || ''), 'Tipo de cliente');
  minText(String(data.ticketType || ''), 'Tipo de solicitação');

  const rawCompany = data.companyId === undefined || data.companyId === null ? '' : String(data.companyId).trim();
  const companyId = rawCompany === '' ? null : rawCompany;

  return {
    contactNumber,
    nome: String(data.nome).trim(),
    email,
    cpf: taxDigits,
    marca: String(data.marca).trim(),
    modelo: String(data.modelo).trim(),
    customerType: String(data.customerType).trim(),
    ticketType: String(data.ticketType).trim(),
    stageId,
    companyId,
  };
}

export type SanitizedUpdateTicket = {
  nome: string;
  email: string;
  cpf: string;
  marca: string;
  modelo: string;
  customerType: string;
  ticketType: string;
  /** `string`: nova empresa; `null`: desvincular; `undefined`: manter como está. */
  companyId: string | null | undefined;
};

/** Actualiza dados da OS e do contacto; não altera número nem fase. */
export function sanitizeAndAssertUpdateTicket(data: {
  nome?: string;
  email?: string;
  cpf?: string;
  marca?: string;
  modelo?: string;
  customerType?: string;
  ticketType?: string;
  companyId?: string | null;
}): SanitizedUpdateTicket {
  minText(String(data.nome || ''), 'Nome completo');

  const email = String(data.email || '').trim().toLowerCase();
  if (!email) throw new HttpException('O e-mail é obrigatório.', HttpStatus.BAD_REQUEST);
  if (!isValidEmail(email)) {
    throw new HttpException('Indique um e-mail válido (ex.: nome@empresa.pt).', HttpStatus.BAD_REQUEST);
  }

  const taxDigits = onlyDigits(String(data.cpf || ''));
  if (!taxDigits) throw new HttpException('O CPF ou CNPJ é obrigatório.', HttpStatus.BAD_REQUEST);
  if (taxDigits.length !== 11 && taxDigits.length !== 14) {
    throw new HttpException('CPF deve ter 11 dígitos ou CNPJ 14 dígitos.', HttpStatus.BAD_REQUEST);
  }
  if (!isValidCpfOrCnpj(taxDigits)) {
    throw new HttpException('CPF ou CNPJ inválido (dígitos verificadores incorretos).', HttpStatus.BAD_REQUEST);
  }

  minText(String(data.marca || ''), 'Marca');
  minText(String(data.modelo || ''), 'Modelo');
  minText(String(data.customerType || ''), 'Tipo de cliente');
  minText(String(data.ticketType || ''), 'Tipo de solicitação');

  let companyId: string | null | undefined;
  if (data.companyId === undefined) {
    companyId = undefined;
  } else if (data.companyId === null) {
    companyId = null;
  } else {
    const trimmed = String(data.companyId).trim();
    companyId = trimmed === '' ? null : trimmed;
  }

  return {
    nome: String(data.nome).trim(),
    email,
    cpf: taxDigits,
    marca: String(data.marca).trim(),
    modelo: String(data.modelo).trim(),
    customerType: String(data.customerType).trim(),
    ticketType: String(data.ticketType).trim(),
    companyId,
  };
}
