import { asObj, normalizeWhatsAppTime, toFiniteNumber } from './proto.util';
import type { ExtractedInboundMessage } from './types';

function buildEventLines(ev: Record<string, unknown>): string[] {
  const title = ev.name ? String(ev.name) : 'Evento';
  const desc = ev.description ? String(ev.description) : '';
  const start = normalizeWhatsAppTime(ev.startTime);
  const end = normalizeWhatsAppTime(ev.endTime);
  const joinLink = ev.joinLink ? String(ev.joinLink) : '';
  const loc = asObj(ev.location);
  const lines: string[] = [`📅 ${title}`];
  if (desc) lines.push(desc);
  if (start) lines.push(`Começa: ${start.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}`);
  if (end) lines.push(`Termina: ${end.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}`);
  if (joinLink) lines.push(joinLink);
  if (loc) {
    const lat = toFiniteNumber(loc.degreesLatitude);
    const lng = toFiniteNumber(loc.degreesLongitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      lines.push(`https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`);
    }
  }
  if (ev.isCanceled === true) lines.push('(Cancelado)');
  return lines;
}

export function tryExtractEvent(inner: Record<string, unknown>): ExtractedInboundMessage | null {
  const ev = asObj(inner.eventMessage);
  if (ev) {
    const title = ev.name ? String(ev.name) : 'Evento';
    const line = buildEventLines(ev).join('\n');
    return {
      text: line,
      fallbackSidebar: `📅 ${title}`,
      isMedia: false,
      mediaObject: null,
      messageKind: 'event',
      skipPersist: false,
    };
  }

  if (inner.encEventResponseMessage) {
    const line = '📅 Participação num evento';
    return {
      text: line,
      fallbackSidebar: line,
      isMedia: false,
      mediaObject: null,
      messageKind: 'event',
      skipPersist: false,
    };
  }

  const schedCall = asObj(inner.scheduledCallCreationMessage);
  if (schedCall) {
    const title = schedCall.title ? String(schedCall.title) : 'Chamada agendada';
    const ts = normalizeWhatsAppTime(schedCall.scheduledTimestampMs);
    const line =
      `📞 ${title}` +
      (ts ? `\n${ts.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}` : '');
    return {
      text: line,
      fallbackSidebar: `📞 ${title}`,
      isMedia: false,
      mediaObject: null,
      messageKind: 'event',
      skipPersist: false,
    };
  }

  return null;
}

export function tryExtractUnknownEvent(inner: Record<string, unknown>): ExtractedInboundMessage | null {
  const unknownEventKey = Object.keys(inner).find(
    (k) => k !== 'encEventResponseMessage' && /eventmessage$/i.test(k),
  );
  if (!unknownEventKey) return null;
  const ev2 = asObj(inner[unknownEventKey]);
  if (!ev2 || Object.keys(ev2).length === 0) return null;
  const title = ev2.name ? String(ev2.name) : 'Evento';
  const line = buildEventLines(ev2).join('\n');
  return {
    text: line,
    fallbackSidebar: `📅 ${title}`,
    isMedia: false,
    mediaObject: null,
    messageKind: 'event',
    skipPersist: false,
  };
}
