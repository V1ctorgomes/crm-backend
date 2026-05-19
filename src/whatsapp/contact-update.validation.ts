import { BadRequestException } from '@nestjs/common';
import { assertBoundedText, CRM_TEXT_SHORT_MAX } from '../common/text-bounds';

export type SanitizedContactUpdate = {
  name?: string;
  email?: string;
  cpf?: string;
};

export function sanitizeContactUpdate(data: Record<string, unknown>): SanitizedContactUpdate {
  const out: SanitizedContactUpdate = {};
  if (data.name !== undefined) {
    out.name = assertBoundedText(data.name, 'Nome', CRM_TEXT_SHORT_MAX, { min: 1 });
  }
  if (data.email !== undefined) {
    const email = String(data.email).trim().toLowerCase();
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw new BadRequestException('E-mail inválido.');
    }
    out.email = email || undefined;
  }
  const taxRaw = data.cpf !== undefined ? data.cpf : data.cnpj;
  if (taxRaw !== undefined) {
    const cpf = String(taxRaw).replace(/\D/g, '');
    if (cpf && (cpf.length < 11 || cpf.length > 14)) {
      throw new BadRequestException('CPF/CNPJ inválido.');
    }
    out.cpf = cpf || undefined;
  }
  return out;
}
