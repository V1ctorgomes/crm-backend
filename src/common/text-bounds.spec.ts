import { BadRequestException } from '@nestjs/common';
import { assertBoundedText, assertOptionalBoundedText } from './text-bounds';

describe('text-bounds', () => {
  it('exige texto quando required', () => {
    expect(() => assertBoundedText('', 'Nota', 100)).toThrow(BadRequestException);
  });

  it('aplica máximo', () => {
    expect(() => assertBoundedText('x'.repeat(11), 'Nota', 10)).toThrow(BadRequestException);
    expect(assertBoundedText('ok', 'Nota', 10)).toBe('ok');
  });

  it('opcional respeita máximo', () => {
    expect(assertOptionalBoundedText('', 'Motivo', 5)).toBeUndefined();
    expect(() => assertOptionalBoundedText('abcdef', 'Motivo', 5)).toThrow(BadRequestException);
  });
});
