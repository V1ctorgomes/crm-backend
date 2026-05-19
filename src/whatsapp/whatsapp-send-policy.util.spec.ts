import { computeBackoffMs, getSendMaxPerMinute, getSendMinIntervalMs } from './whatsapp-send-policy.util';

describe('whatsapp-send-policy.util', () => {
  it('computeBackoffMs cresce e tem teto', () => {
    expect(computeBackoffMs(0)).toBeGreaterThan(0);
    expect(computeBackoffMs(10)).toBeLessThanOrEqual(30_000);
  });

  it('getSendMaxPerMinute tem valor por defeito', () => {
    const prev = process.env.WHATSAPP_SEND_MAX_PER_MINUTE;
    delete process.env.WHATSAPP_SEND_MAX_PER_MINUTE;
    expect(getSendMaxPerMinute()).toBe(25);
    process.env.WHATSAPP_SEND_MAX_PER_MINUTE = prev;
  });

  it('getSendMinIntervalMs tem valor por defeito', () => {
    const prev = process.env.WHATSAPP_SEND_MIN_INTERVAL_MS;
    delete process.env.WHATSAPP_SEND_MIN_INTERVAL_MS;
    expect(getSendMinIntervalMs()).toBe(1500);
    process.env.WHATSAPP_SEND_MIN_INTERVAL_MS = prev;
  });
});
