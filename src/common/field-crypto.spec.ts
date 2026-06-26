import { encryptField, decryptField } from './field-crypto';

describe('field-crypto', () => {
  const prev = process.env.FIELD_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.FIELD_ENCRYPTION_KEY = 'test-field-encryption-key-min-32-chars!!';
  });

  afterEach(() => {
    process.env.FIELD_ENCRYPTION_KEY = prev;
  });

  it('encripta e desencripta', () => {
    const enc = encryptField('minha-api-key-secreta');
    expect(enc).toMatch(/^enc:v1:/);
    expect(decryptField(enc)).toBe('minha-api-key-secreta');
  });

  it('mantém legado em texto claro', () => {
    expect(decryptField('plaintext-key')).toBe('plaintext-key');
  });
});
