import { BadRequestException } from '@nestjs/common';
import { assertUuidParam } from './uuid-param';

describe('uuid-param', () => {
  it('aceita UUID válido', () => {
    expect(assertUuidParam('550e8400-e29b-41d4-a716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('rejeita valor inválido', () => {
    expect(() => assertUuidParam('not-a-uuid')).toThrow(BadRequestException);
  });
});
