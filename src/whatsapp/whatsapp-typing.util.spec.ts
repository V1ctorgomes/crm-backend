import { isTypingDelayEnabled, PRESENCE_PULSE_MS } from './whatsapp-typing.util';

describe('whatsapp-typing.util', () => {
  it('pulso de presença tem duração fixa', () => {
    expect(PRESENCE_PULSE_MS).toBeGreaterThan(3000);
  });

  it('isTypingDelayEnabled respeita env', () => {
    const prev = process.env.WHATSAPP_TYPING_DELAY;
    process.env.WHATSAPP_TYPING_DELAY = 'false';
    expect(isTypingDelayEnabled()).toBe(false);
    process.env.WHATSAPP_TYPING_DELAY = prev;
  });
});
