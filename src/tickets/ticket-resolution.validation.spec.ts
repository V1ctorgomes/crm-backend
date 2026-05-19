import { HttpException } from '@nestjs/common';
import {
  TICKET_RESOLUTION_REASON_MAX,
  TICKET_RESOLUTION_REASON_MIN,
  assertResolutionReasonWhenArchiving,
} from './ticket-resolution.validation';

describe('assertResolutionReasonWhenArchiving', () => {
  it('exige desfecho SUCCESS ou CANCELLED ao arquivar', () => {
    expect(() => assertResolutionReasonWhenArchiving(true, undefined, 'texto ok')).toThrow(HttpException);
    expect(() => assertResolutionReasonWhenArchiving(true, 'INVALID', 'texto ok')).toThrow(HttpException);
  });

  it('exige justificativa com tamanho mínimo', () => {
    expect(() =>
      assertResolutionReasonWhenArchiving(true, 'SUCCESS', 'a'.repeat(TICKET_RESOLUTION_REASON_MIN - 1)),
    ).toThrow(HttpException);
  });

  it('rejeita justificativa acima do máximo', () => {
    expect(() =>
      assertResolutionReasonWhenArchiving(true, 'CANCELLED', 'a'.repeat(TICKET_RESOLUTION_REASON_MAX + 1)),
    ).toThrow(HttpException);
  });

  it('aceita justificativa válida', () => {
    const text = 'a'.repeat(TICKET_RESOLUTION_REASON_MIN);
    expect(assertResolutionReasonWhenArchiving(true, 'SUCCESS', text)).toBe(text);
  });

  it('restaurar arquivo não exige justificativa', () => {
    expect(assertResolutionReasonWhenArchiving(false, 'SUCCESS', undefined)).toBeUndefined();
  });
});
