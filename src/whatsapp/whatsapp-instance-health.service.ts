import { Injectable } from '@nestjs/common';

export type InstanceHealthLevel = 'ok' | 'warning' | 'critical';

export type InstanceHealthSnapshot = {
  instanceName: string;
  level: InstanceHealthLevel;
  message: string;
  failuresLastHour: number;
  successesLastHour: number;
  disconnectsLastHour: number;
  failureRatePercent: number;
  lastFailureAt: string | null;
  lastDisconnectAt: string | null;
  lastConnectionState: string | null;
};

type HealthEvent =
  | { at: number; kind: 'send_ok' }
  | { at: number; kind: 'send_fail' }
  | { at: number; kind: 'disconnect'; state: string };

const WINDOW_MS = 60 * 60 * 1000;
const MAX_EVENTS = 300;

@Injectable()
export class WhatsappInstanceHealthService {
  private readonly events = new Map<string, HealthEvent[]>();
  private readonly lastConnectionState = new Map<string, string>();

  recordSendSuccess(instanceName: string): void {
    this.push(instanceName, { at: Date.now(), kind: 'send_ok' });
  }

  recordSendFailure(instanceName: string): void {
    this.push(instanceName, { at: Date.now(), kind: 'send_fail' });
  }

  recordConnectionUpdate(instanceName: string, state: string): void {
    const normalized = String(state || '').trim().toLowerCase();
    if (!normalized) return;
    this.lastConnectionState.set(instanceName, normalized);
    const disconnected =
      normalized.includes('close') ||
      normalized.includes('disconnect') ||
      normalized === 'closed' ||
      normalized === 'refused';
    if (disconnected) {
      this.push(instanceName, { at: Date.now(), kind: 'disconnect', state: normalized });
    }
  }

  getSnapshot(instanceName: string): InstanceHealthSnapshot {
    const now = Date.now();
    const list = this.prune(instanceName, now);
    const inWindow = list.filter((e) => e.at >= now - WINDOW_MS);

    let successes = 0;
    let failures = 0;
    let disconnects = 0;
    let lastFailureAt: number | null = null;
    let lastDisconnectAt: number | null = null;
    for (const e of inWindow) {
      if (e.kind === 'send_ok') successes += 1;
      if (e.kind === 'send_fail') {
        failures += 1;
        lastFailureAt = e.at;
      }
      if (e.kind === 'disconnect') {
        disconnects += 1;
        lastDisconnectAt = e.at;
      }
    }

    const lastConnectionState = this.lastConnectionState.get(instanceName) ?? null;

    const attempts = successes + failures;
    const failureRatePercent =
      attempts > 0 ? Math.round((failures / attempts) * 100) : 0;

    const level = this.computeLevel(failures, disconnects, failureRatePercent, attempts);
    const message = this.buildMessage(level, failures, disconnects, failureRatePercent);

    return {
      instanceName,
      level,
      message,
      failuresLastHour: failures,
      successesLastHour: successes,
      disconnectsLastHour: disconnects,
      failureRatePercent,
      lastFailureAt: lastFailureAt ? new Date(lastFailureAt).toISOString() : null,
      lastDisconnectAt: lastDisconnectAt ? new Date(lastDisconnectAt).toISOString() : null,
      lastConnectionState,
    };
  }

  private computeLevel(
    failures: number,
    disconnects: number,
    failureRatePercent: number,
    attempts: number,
  ): InstanceHealthLevel {
    if (failures >= 10 || disconnects >= 5) return 'critical';
    if (attempts >= 5 && failureRatePercent >= 50) return 'critical';
    if (failures >= 3 || disconnects >= 2) return 'warning';
    if (attempts >= 4 && failureRatePercent >= 25) return 'warning';
    return 'ok';
  }

  private buildMessage(
    level: InstanceHealthLevel,
    failures: number,
    disconnects: number,
    failureRatePercent: number,
  ): string {
    if (level === 'ok') {
      return 'Linha estável na última hora.';
    }
    if (level === 'critical') {
      return `Linha em risco: ${failures} falha(s) de envio e ${disconnects} desligamento(s) na última hora (${failureRatePercent}% falhas). Reduza o volume e verifique a Evolution.`;
    }
    return `Atenção: ${failures} falha(s) de envio ou ${disconnects} desligamento(s) recente(s). Evite enviar muitas mensagens seguidas.`;
  }

  private push(instanceName: string, event: HealthEvent): void {
    const key = instanceName.trim();
    if (!key) return;
    const list = this.events.get(key) ?? [];
    list.push(event);
    if (list.length > MAX_EVENTS) {
      list.splice(0, list.length - MAX_EVENTS);
    }
    this.events.set(key, list);
  }

  private prune(instanceName: string, now: number): HealthEvent[] {
    const list = this.events.get(instanceName) ?? [];
    const cutoff = now - WINDOW_MS;
    const kept = list.filter((e) => e.at >= cutoff);
    this.events.set(instanceName, kept);
    return kept;
  }
}
