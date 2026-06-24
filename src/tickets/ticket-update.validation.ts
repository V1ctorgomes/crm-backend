import { HttpException, HttpStatus } from '@nestjs/common';
import { isValidCpfOrCnpj, onlyDigits } from '../common/cpf-cnpj.validation';
import { isValidEmail } from '../common/email.validation';
import { minText } from './ticket-validation-shared';

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
