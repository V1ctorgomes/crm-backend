import { asObj } from './proto.util';
import type { ExtractedInboundMessage } from './types';

export function tryExtractMedia(inner: Record<string, unknown>): ExtractedInboundMessage | null {
  const ptv = asObj(inner.ptvMessage);
  if (ptv) {
    const mimeType = ptv.mimetype ? String(String(ptv.mimetype).split(';')[0]) : 'video/mp4';
    return {
      text: String(ptv.caption || ''),
      fallbackSidebar: 'Nota de vídeo',
      isMedia: true,
      mimeType,
      fileName: 'nota_de_video.mp4',
      mediaObject: ptv,
      messageKind: 'video_note',
      skipPersist: false,
    };
  }

  const album = asObj(inner.albumMessage);
  if (album) {
    const rawItems = (album as { items?: unknown }).items;
    const items = Array.isArray(rawItems) ? rawItems.length : 0;
    const line = items > 0 ? `🖼️ Álbum (${items} itens)` : '🖼️ Álbum de fotos';
    return {
      text: line,
      fallbackSidebar: '🖼️ Álbum',
      isMedia: false,
      mediaObject: null,
      messageKind: 'album',
      skipPersist: false,
    };
  }

  const mediaObject =
    inner.imageMessage || inner.videoMessage || inner.documentMessage || inner.audioMessage || null;

  if (mediaObject && typeof mediaObject === 'object') {
    const mo = asObj(mediaObject);
    const mimeType = mo?.mimetype ? String(String(mo.mimetype).split(';')[0]) : 'application/octet-stream';
    const ext = mimeType.split('/')[1] || 'bin';
    const fileName = mo?.fileName ? String(mo.fileName) : `arquivo.${ext}`;
    const cap = mo?.caption != null ? String(mo.caption) : '';
    const fallbackSidebar = inner.imageMessage
      ? 'Imagem'
      : inner.documentMessage
        ? 'Documento'
        : inner.audioMessage
          ? 'Áudio'
          : inner.videoMessage
            ? 'Vídeo'
            : 'Mídia';
    return {
      text: cap,
      fallbackSidebar,
      isMedia: true,
      mimeType,
      fileName,
      mediaObject,
      messageKind: 'media',
      skipPersist: false,
    };
  }

  return null;
}
