import { normalizeWebhookEvent } from '../common/evolution-webhook.util';

export function parseWebhookEnvelope(payload: any): { instanceName: string; eventName: string } | null {
  if (!payload || !payload.event) {
    return null;
  }
  return {
    instanceName: String(payload.instance || ''),
    eventName: normalizeWebhookEvent(payload.event),
  };
}

export function parseConnectionState(payload: any): string {
  const data = payload.data;
  return String(
    (data && typeof data === 'object' && (data as Record<string, unknown>).state) ||
      (data && typeof data === 'object' && (data as Record<string, unknown>).status) ||
      payload.state ||
      'unknown',
  );
}

export const MESSAGE_WEBHOOK_EVENTS = ['messages.upsert', 'messages.update', 'send.message'] as const;

export type MessageWebhookEvent = (typeof MESSAGE_WEBHOOK_EVENTS)[number];

export function isMessageWebhookEvent(eventName: string): eventName is MessageWebhookEvent {
  return (MESSAGE_WEBHOOK_EVENTS as readonly string[]).includes(eventName);
}

export function extractMessageData(payload: any): any | null {
  if (!payload?.data) return null;
  const payloadData = payload.data;
  const msgData = Array.isArray(payloadData) ? payloadData[0] : payloadData;
  if (!msgData?.key) return null;
  return msgData;
}
