import { BadRequestException } from '@nestjs/common';
import { assertBoundedText, CRM_TEXT_SHORT_MAX } from '../common/text-bounds';

export type SanitizedCustomerInput = {
  name: string;
  email: string;
  phone?: string;
  company?: string;
};

export function sanitizeCustomerInput(data: Record<string, unknown>): SanitizedCustomerInput {
  const name = assertBoundedText(data.name, 'Nome', CRM_TEXT_SHORT_MAX, { min: 2 });
  const emailRaw =
    data.email != null ? String(data.email).trim().toLowerCase() : '';
  const phoneRaw = data.phone != null ? String(data.phone).trim() : '';
  const companyRaw =
    data.company != null
      ? String(data.company).trim()
      : data.notes != null
        ? String(data.notes).trim()
        : '';

  if (!emailRaw || emailRaw.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    throw new BadRequestException('E-mail inválido.');
  }
  if (phoneRaw && phoneRaw.length > 32) {
    throw new BadRequestException('Telefone demasiado longo.');
  }
  if (companyRaw.length > CRM_TEXT_SHORT_MAX) {
    throw new BadRequestException(`Empresa não pode exceder ${CRM_TEXT_SHORT_MAX} caracteres.`);
  }

  return {
    name,
    email: emailRaw,
    phone: phoneRaw || undefined,
    company: companyRaw || undefined,
  };
}
