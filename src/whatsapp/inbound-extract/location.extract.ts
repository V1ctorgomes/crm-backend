import { asObj, toFiniteNumber } from './proto.util';
import type { ExtractedInboundMessage } from './types';

export function tryExtractLocation(inner: Record<string, unknown>): ExtractedInboundMessage | null {
  const loc = asObj(inner.locationMessage);
  if (loc) {
    const lat = toFiniteNumber(loc.degreesLatitude);
    const lng = toFiniteNumber(loc.degreesLongitude);
    const name = loc.name ? String(loc.name) : '';
    const addr = loc.address ? String(loc.address) : '';
    const maps =
      lat != null &&
      lng != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
        ? `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`
        : '';
    const parts: string[] = ['📍 Localização'];
    if (name) parts.push(name);
    if (addr) parts.push(addr);
    if (maps) parts.push(maps);
    const line = parts.join('\n');
    return {
      text: line,
      fallbackSidebar: '📍 Localização',
      isMedia: false,
      mediaObject: null,
      messageKind: 'location',
      skipPersist: false,
    };
  }

  const live = asObj(inner.liveLocationMessage);
  if (live) {
    const line = '📍 Localização em tempo real partilhada';
    return {
      text: line,
      fallbackSidebar: '📍 Ao vivo',
      isMedia: false,
      mediaObject: null,
      messageKind: 'live_location',
      skipPersist: false,
    };
  }

  return null;
}
