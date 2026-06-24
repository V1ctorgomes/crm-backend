import { asObj } from './proto.util';
import type { ExtractedInboundMessage } from './types';

export function tryExtractSticker(inner: Record<string, unknown>): ExtractedInboundMessage | null {
  const sticker = asObj(inner.stickerMessage);
  if (!sticker) return null;
  const mimeType = sticker.mimetype ? String(String(sticker.mimetype).split(';')[0]) : 'image/webp';
  return {
    text: String(sticker.caption || ''),
    fallbackSidebar: 'Figurinha',
    isMedia: true,
    mimeType,
    fileName: 'figurinha.webp',
    mediaObject: sticker,
    messageKind: 'sticker',
    skipPersist: false,
  };
}
