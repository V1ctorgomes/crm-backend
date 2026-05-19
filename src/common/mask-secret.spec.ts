import { isMaskedSecretInput, maskSecret, MASKED_SECRET_PLACEHOLDER } from './mask-secret';

describe('mask-secret', () => {
  it('mascara segredos', () => {
    expect(maskSecret('abcdefghijklmnop')).toBe(`${MASKED_SECRET_PLACEHOLDER}mnop`);
  });

  it('detecta input mascarado', () => {
    expect(isMaskedSecretInput(`${MASKED_SECRET_PLACEHOLDER}abcd`)).toBe(true);
    expect(isMaskedSecretInput('new-secret-value')).toBe(false);
  });
});
