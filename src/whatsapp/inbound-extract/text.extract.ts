import { asObj } from './proto.util';
import type { ExtractedInboundMessage } from './types';

export function tryExtractText(inner: Record<string, unknown>): ExtractedInboundMessage | null {
  const conv = inner.conversation != null ? String(inner.conversation) : '';
  const extMsg = asObj(inner.extendedTextMessage);
  const extText = extMsg?.text != null ? String(extMsg.text) : '';
  const text = conv || extText;
  if (!text) return null;
  return {
    text,
    fallbackSidebar: text.length > 80 ? `${text.slice(0, 80)}…` : text,
    isMedia: false,
    mediaObject: null,
    messageKind: 'text',
    skipPersist: false,
  };
}

export function unsupportedMessage(): ExtractedInboundMessage {
  return {
    text: 'Mensagem não suportada',
    fallbackSidebar: 'Mensagem',
    isMedia: false,
    mediaObject: null,
    messageKind: 'unsupported',
    skipPersist: false,
  };
}
