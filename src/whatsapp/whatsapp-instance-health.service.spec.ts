import { WhatsappInstanceHealthService } from './whatsapp-instance-health.service';

describe('WhatsappInstanceHealthService', () => {
  it('passa a warning após falhas repetidas', () => {
    const svc = new WhatsappInstanceHealthService();
    const name = 'inst-test';
    svc.recordSendFailure(name);
    svc.recordSendFailure(name);
    svc.recordSendFailure(name);
    const snap = svc.getSnapshot(name);
    expect(snap.level).toBe('warning');
    expect(snap.failuresLastHour).toBe(3);
  });

  it('permanece ok com sucessos', () => {
    const svc = new WhatsappInstanceHealthService();
    const name = 'inst-ok';
    svc.recordSendSuccess(name);
    expect(svc.getSnapshot(name).level).toBe('ok');
  });
});
