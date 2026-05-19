import { parseWhatsAppExistsResult, isWhatsAppNumberCheckEnabled } from './whatsapp-number-check.util';

describe('whatsapp-number-check.util', () => {
  it('parseWhatsAppExistsResult lê exists', () => {
    expect(
      parseWhatsAppExistsResult([{ exists: true, number: '5511999999999' }], '5511999999999'),
    ).toBe(true);
    expect(
      parseWhatsAppExistsResult([{ exists: false, number: '5511888888888' }], '5511888888888'),
    ).toBe(false);
  });

  it('isWhatsAppNumberCheckEnabled respeita env', () => {
    const prev = process.env.WHATSAPP_NUMBER_CHECK_ENABLED;
    process.env.WHATSAPP_NUMBER_CHECK_ENABLED = 'false';
    expect(isWhatsAppNumberCheckEnabled()).toBe(false);
    process.env.WHATSAPP_NUMBER_CHECK_ENABLED = prev;
  });
});
