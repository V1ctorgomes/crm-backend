import {
  computeTypingDelayMs,
  TYPING_DELAY_MS_MAX,
  TYPING_DELAY_MS_MIN,
} from './whatsapp-typing.util';

describe('whatsapp-typing.util', () => {
  it('não fica abaixo do mínimo', () => {
    expect(computeTypingDelayMs('oi')).toBeGreaterThanOrEqual(TYPING_DELAY_MS_MIN);
  });

  it('cresce com o tamanho do texto', () => {
    const short = computeTypingDelayMs('a'.repeat(50));
    const long = computeTypingDelayMs('a'.repeat(500));
    expect(long).toBeGreaterThan(short);
  });

  it('respeita o máximo', () => {
    expect(computeTypingDelayMs('a'.repeat(5000))).toBe(TYPING_DELAY_MS_MAX);
  });
});
