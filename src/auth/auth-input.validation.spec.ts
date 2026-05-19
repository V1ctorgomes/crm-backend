import { BadRequestException } from '@nestjs/common';
import {
  AUTH_PASSWORD_MAX,
  AUTH_PASSWORD_MIN,
  assertPassword,
  assertRegisterName,
  normalizeEmail,
} from './auth-input.validation';

describe('auth-input.validation', () => {
  it('normaliza e valida email', () => {
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
    expect(() => normalizeEmail('invalid')).toThrow(BadRequestException);
  });

  it('valida limites de palavra-passe', () => {
    expect(() => assertPassword('short')).toThrow(BadRequestException);
    expect(() => assertPassword('a'.repeat(AUTH_PASSWORD_MAX + 1))).toThrow(BadRequestException);
    expect(assertPassword('a'.repeat(AUTH_PASSWORD_MIN))).toHaveLength(AUTH_PASSWORD_MIN);
  });

  it('valida nome de registo', () => {
    expect(() => assertRegisterName('a')).toThrow(BadRequestException);
    expect(assertRegisterName('Ana Silva')).toBe('Ana Silva');
  });
});
