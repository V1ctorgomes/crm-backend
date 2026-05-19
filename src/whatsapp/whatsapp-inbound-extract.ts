/** Extração de texto / mídia / tipo semântico a partir do nó `message` (proto Evolution / Baileys). */

export type ExtractedInboundMessage = {
  text: string;
  fallbackSidebar: string;
  isMedia: boolean;
  mimeType?: string;
  fileName?: string;
  mediaObject: unknown | null;
  messageKind: string | null;
  /** true = não criar linha em Message (protocolo, revogação, chaves, etc.) */
  skipPersist: boolean;
};

function asObj(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

export function unwrapProtoMessage(message: unknown): Record<string, unknown> {
  let cur = asObj(message) || {};
  for (let depth = 0; depth < 8; depth++) {
    const vm = asObj(cur.viewOnceMessage);
    const vm2 = asObj(cur.viewOnceMessageV2);
    const ep = asObj(cur.ephemeralMessage);
    const dwc = asObj(cur.documentWithCaptionMessage);
    const next =
      (vm && asObj(vm.message)) ||
      (vm2 && asObj(vm2.message)) ||
      (ep && asObj(ep.message)) ||
      (dwc && asObj(dwc.message));
    if (!next || Object.keys(next).length === 0) break;
    cur = next;
  }
  return cur;
}

export function extractInboundMessageContent(inner: Record<string, unknown>): ExtractedInboundMessage {
  const skip = (): ExtractedInboundMessage => ({
    text: '',
    fallbackSidebar: '',
    isMedia: false,
    mediaObject: null,
    messageKind: null,
    skipPersist: true,
  });

  if (
    inner.senderKeyDistributionMessage ||
    inner.deviceSentMessage ||
    inner.messageHistoryBundle ||
    inner.encReactionMessage
  ) {
    return skip();
  }

  const protocol = asObj(inner.protocolMessage);
  if (protocol) {
    return skip();
  }

  const reaction = asObj(inner.reactionMessage);
  if (reaction) {
    const emoji = String(reaction.text || '❤️').trim() || '❤️';
    const line = `Reagiu com ${emoji}`;
    return {
      text: line,
      fallbackSidebar: line,
      isMedia: false,
      mediaObject: null,
      messageKind: 'reaction',
      skipPersist: false,
    };
  }

  const sticker = asObj(inner.stickerMessage);
  if (sticker) {
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

  const loc = asObj(inner.locationMessage);
  if (loc) {
    const lat = Number(loc.degreesLatitude);
    const lng = Number(loc.degreesLongitude);
    const name = loc.name ? String(loc.name) : '';
    const addr = loc.address ? String(loc.address) : '';
    const maps =
      Number.isFinite(lat) && Number.isFinite(lng)
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

  const oneContact = asObj(inner.contactMessage);
  if (oneContact) {
    const vcard = oneContact.vcard ? String(oneContact.vcard) : '';
    const dn = oneContact.displayName ? String(oneContact.displayName) : '';
    let line = '📇 Contacto';
    if (dn) line += `: ${dn}`;
    if (vcard && !dn) line += `\n${vcard.slice(0, 800)}`;
    return {
      text: line,
      fallbackSidebar: '📇 Contacto',
      isMedia: false,
      mediaObject: null,
      messageKind: 'contact',
      skipPersist: false,
    };
  }

  const multi = asObj(inner.contactsArrayMessage);
  if (multi) {
    const contacts = Array.isArray(multi.contacts) ? (multi.contacts as unknown[]) : [];
    const names = contacts
      .map((c) => {
        const ob = asObj(c);
        return ob?.displayName ? String(ob.displayName) : '';
      })
      .filter(Boolean);
    const n = names.length || contacts.length || 0;
    const line =
      `📇 ${n} contacto(s) partilhado(s)` + (names.length ? `\n${names.slice(0, 12).join(', ')}` : '');
    return {
      text: line,
      fallbackSidebar: '📇 Contactos',
      isMedia: false,
      mediaObject: null,
      messageKind: 'contacts',
      skipPersist: false,
    };
  }

  const poll = asObj(inner.pollCreationMessage);
  if (poll) {
    const name = poll.name ? String(poll.name) : 'Inquérito';
    const opts = Array.isArray(poll.options) ? (poll.options as unknown[]) : [];
    const labels = opts
      .map((o) => {
        const ob = asObj(o);
        if (ob?.optionName != null) return String(ob.optionName);
        if (typeof o === 'string') return o;
        return '';
      })
      .filter(Boolean);
    const line =
      `🗳️ ${name}` + (labels.length ? `\n${labels.slice(0, 12).map((l) => `• ${l}`).join('\n')}` : '');
    return {
      text: line,
      fallbackSidebar: `🗳️ ${name}`,
      isMedia: false,
      mediaObject: null,
      messageKind: 'poll',
      skipPersist: false,
    };
  }

  if (inner.pollUpdateMessage) {
    const line = '🗳️ Participou num inquérito';
    return {
      text: line,
      fallbackSidebar: line,
      isMedia: false,
      mediaObject: null,
      messageKind: 'poll_vote',
      skipPersist: false,
    };
  }

  const btn = asObj(inner.buttonsResponseMessage);
  if (btn) {
    const sel = btn.selectedDisplayText ? String(btn.selectedDisplayText) : '';
    const line = sel ? `🔘 ${sel}` : '🔘 Resposta a botões';
    return {
      text: line,
      fallbackSidebar: sel || 'Resposta',
      isMedia: false,
      mediaObject: null,
      messageKind: 'interactive',
      skipPersist: false,
    };
  }

  const listR = asObj(inner.listResponseMessage);
  if (listR) {
    const title = listR.title ? String(listR.title) : '';
    const single = asObj(listR.singleSelectReply);
    const rowId = single?.selectedRowId ? String(single.selectedRowId) : '';
    const line = `📋 ${title || 'Lista'}` + (rowId ? `\n${rowId}` : '');
    return {
      text: line.trim() || '📋 Resposta a lista',
      fallbackSidebar: title || '📋 Lista',
      isMedia: false,
      mediaObject: null,
      messageKind: 'interactive',
      skipPersist: false,
    };
  }

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

  const conv = inner.conversation != null ? String(inner.conversation) : '';
  const extMsg = asObj(inner.extendedTextMessage);
  const extText = extMsg?.text != null ? String(extMsg.text) : '';
  const text = conv || extText;
  if (text) {
    return {
      text,
      fallbackSidebar: text.length > 80 ? `${text.slice(0, 80)}…` : text,
      isMedia: false,
      mediaObject: null,
      messageKind: 'text',
      skipPersist: false,
    };
  }

  return {
    text: 'Mensagem não suportada',
    fallbackSidebar: 'Mensagem',
    isMedia: false,
    mediaObject: null,
    messageKind: 'unsupported',
    skipPersist: false,
  };
}
