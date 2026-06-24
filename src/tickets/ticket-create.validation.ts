import { HttpException, HttpStatus } from '@nestjs/common';
import { isValidCpf, isValidCpfOrCnpj, onlyDigits } from '../common/cpf-cnpj.validation';
import { isValidEmail } from '../common/email.validation';

const FIELD_TEXT_MAX = 200;

function minText(v: string, label: string): void {
  const t = v.trim();
  if (!t) throw new HttpException(`O campo «${label}» é obrigatório.`, HttpStatus.BAD_REQUEST);
  if (t.length < 2) throw new HttpException(`O campo «${label}» deve ter pelo menos 2 caracteres.`, HttpStatus.BAD_REQUEST);
  if (t.length > FIELD_TEXT_MAX) {
    throw new HttpException(
      `O campo «${label}» não pode exceder ${FIELD_TEXT_MAX} caracteres.`,
      HttpStatus.BAD_REQUEST,
    );
  }
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

  const rawCompany = data.companyId === undefined || data.companyId === null ? '' : String(data.companyId).trim();
  const companyId = rawCompany === '' ? null : rawCompany;

  if (companyId) {
    minText(String(data.nome || ''), 'Empresa (cliente)');
  } else {
    minText(String(data.nome || ''), 'Nome completo');
  }

  const email = String(data.email || '').trim().toLowerCase();
  if (!email) throw new HttpException('O e-mail é obrigatório.', HttpStatus.BAD_REQUEST);
  if (!isValidEmail(email)) {
    throw new HttpException('Indique um e-mail válido (ex.: nome@empresa.pt).', HttpStatus.BAD_REQUEST);
  }

  const taxDigits = onlyDigits(String(data.cpf || ''));
  if (!taxDigits) {
    throw new HttpException(
      companyId ? 'O CPF do solicitante é obrigatório.' : 'O CPF ou CNPJ é obrigatório.',
      HttpStatus.BAD_REQUEST,
    );
  }
  if (companyId) {
    if (taxDigits.length !== 11) {
      throw new HttpException('O CPF do solicitante deve ter 11 dígitos.', HttpStatus.BAD_REQUEST);
    }
    if (!isValidCpf(taxDigits)) {
      throw new HttpException('CPF do solicitante inválido (dígitos verificadores incorretos).', HttpStatus.BAD_REQUEST);
    }
  } else {
    if (taxDigits.length !== 11 && taxDigits.length !== 14) {
      throw new HttpException('CPF deve ter 11 dígitos ou CNPJ 14 dígitos.', HttpStatus.BAD_REQUEST);
    }
    if (!isValidCpfOrCnpj(taxDigits)) {
      throw new HttpException('CPF ou CNPJ inválido (dígitos verificadores incorretos).', HttpStatus.BAD_REQUEST);
    }
  }

  minText(String(data.marca || ''), 'Marca');
  minText(String(data.modelo || ''), 'Modelo');
  minText(String(data.customerType || ''), 'Tipo de cliente');
  minText(String(data.ticketType || ''), 'Tipo de solicitação');

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
  companyId: string | null | undefined;
};

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

export { onlyDigits };
