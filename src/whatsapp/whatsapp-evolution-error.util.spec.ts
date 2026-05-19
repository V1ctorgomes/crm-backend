import { evolutionErrorDetail, isEvolutionRateLimitError } from './whatsapp-evolution-error.util';

describe('whatsapp-evolution-error.util', () => {
  it('detecta 429 como rate limit', () => {
    expect(isEvolutionRateLimitError({ response: { status: 429 } })).toBe(true);
  });

  it('detecta mensagem rate limit no corpo', () => {
    expect(isEvolutionRateLimitError({ response: { data: { message: 'Rate limit exceeded' } } })).toBe(
      true,
    );
  });

  it('evolutionErrorDetail extrai string', () => {
    expect(evolutionErrorDetail({ response: { data: { message: 'Falhou' } } })).toBe('Falhou');
  });
});
