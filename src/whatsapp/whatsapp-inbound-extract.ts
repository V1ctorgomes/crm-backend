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
    const fp = asObj(cur.futureProofMessage);
    const next =
      (vm && asObj(vm.message)) ||
      (vm2 && asObj(vm2.message)) ||
      (ep && asObj(ep.message)) ||
      (dwc && asObj(dwc.message)) ||
      (fp && asObj(fp.message));
    if (!next || Object.keys(next).length === 0) break;
    cur = next;
  }
  return cur;
}

/** Número, string numérica, ou objeto estilo protobufjs Long `{ low, high }` (timestamps WA). */
function toFiniteNumber(u: unknown): number | null {
  if (typeof u === 'number' && Number.isFinite(u)) return u;
  if (typeof u === 'string' && u.trim() !== '') {
    const n = Number(u);
    return Number.isFinite(n) ? n : null;
  }
  const o = asObj(u);
  if (o && typeof o.low === 'number') {
    const low = o.low >>> 0;
    const high = typeof o.high === 'number' ? o.high | 0 : 0;
    const sum = high * 0x100000000 + low;
    return Number.isFinite(sum) ? sum : null;
  }
  return null;
}

/** Segundos ou milissegundos Unix → Date */
function normalizeWhatsAppTime(u: unknown): Date | null {
  const n = toFiniteNumber(u);
  if (n == null || n <= 0) return null;
  const ms = n < 1e11 ? n * 1000 : n;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

function optionLabelFromPollOption(o: unknown): string {
  if (typeof o === 'string') return o.trim();
  const ob = asObj(o);
  if (!ob) return '';
  for (const k of ['optionName', 'name', 'text', 'label', 'title'] as const) {
    if (ob[k] != null && String(ob[k]).trim()) return String(ob[k]).trim();
  }
  return '';
}

/** Evolution / WA podem usar pollCreationMessage, V2 ou V3. */
function coercePollContainer(inner: Record<string, unknown>): Record<string, unknown> | null {
  for (const k of ['pollCreationMessage', 'pollCreationMessageV3', 'pollCreationMessageV2'] as const) {
    const p = asObj(inner[k]);
    if (p && Object.keys(p).length > 0) return p;
  }
  return null;
}

function extractPollFromContainer(poll: Record<string, unknown>): ExtractedInboundMessage {
  const pc = asObj(poll.pollContent);
  const src: Record<string, unknown> = pc ? { ...poll, ...pc } : poll;
  const name =
    [src.name, src.messageName, src.title, src.pollName, src.question]
      .map((x) => (x != null ? String(x).trim() : ''))
      .find(Boolean) || 'Inquérito';
  const rawOpts =
    (Array.isArray(src.options) && src.options) ||
    (Array.isArray(src.pollOptions) && src.pollOptions) ||
    (Array.isArray(src.selectableOptions) && src.selectableOptions) ||
    [];
  const labels = (rawOpts as unknown[]).map(optionLabelFromPollOption).filter(Boolean);
  const line =
    `🗳️ ${name}` + (labels.length ? `\n${labels.slice(0, 20).map((l) => `• ${l}`).join('\n')}` : '');
  return {
    text: line,
    fallbackSidebar: `🗳️ ${name}`,
    isMedia: false,
    mediaObject: null,
    messageKind: 'poll',
    skipPersist: false,
  };
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

  const ev = asObj(inner.eventMessage);
  if (ev) {
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
        lines.push(
          `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`,
        );
      }
    }
    if (ev.isCanceled === true) lines.push('(Cancelado)');
    const line = lines.join('\n');
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

  const inter = asObj(inner.interactiveMessage);
  if (inter) {
    const native = asObj(inter.nativeFlowMessage);
    const buttons = native && Array.isArray(native.buttons) ? (native.buttons as unknown[]) : [];
    for (const b of buttons) {
      const bo = asObj(b);
      const j = bo?.buttonParamsJson != null ? String(bo.buttonParamsJson) : '';
      if (!j || j.length < 2) continue;
      try {
        const parsed = JSON.parse(j) as Record<string, unknown>;
        const hasValues = Array.isArray(parsed.values) && (parsed.values as unknown[]).length > 0;
        const hasOptions = Array.isArray(parsed.options) && (parsed.options as unknown[]).length > 0;
        const looksPoll =
          hasValues ||
          hasOptions ||
          parsed.type === 'poll' ||
          (typeof parsed.flow_id === 'string' && parsed.flow_id.toLowerCase().includes('poll'));
        if (looksPoll) {
          return extractPollFromContainer({
            name: parsed.name ?? parsed.title ?? parsed.question ?? parsed.pollName,
            options: hasValues
              ? (parsed.values as unknown[]).map((v) =>
                  typeof v === 'string' ? { optionName: v } : v,
                )
              : hasOptions
                ? parsed.options
                : undefined,
          } as Record<string, unknown>);
        }
      } catch {
        /* ignorar JSON inválido */
      }
    }
    const body = asObj(inter.body);
    const textBody = body?.text != null ? String(body.text) : '';
    const header = asObj(inter.header);
    const headerTitle = header?.title != null ? String(header.title) : '';
    const line = [headerTitle, textBody].filter((x) => x.trim()).join('\n').trim();
    if (line) {
      return {
        text: line,
        fallbackSidebar: headerTitle || '📋 Interactivo',
        isMedia: false,
        mediaObject: null,
        messageKind: 'interactive',
        skipPersist: false,
      };
    }
  }

  const pollContainer = coercePollContainer(inner);
  if (pollContainer) {
    return extractPollFromContainer(pollContainer);
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

  const unknownPollKey = Object.keys(inner).find((k) => /^pollCreationMessage/i.test(k));
  if (unknownPollKey) {
    const p = asObj(inner[unknownPollKey]);
    if (p) return extractPollFromContainer(p);
  }

  const unknownEventKey = Object.keys(inner).find(
    (k) => k !== 'encEventResponseMessage' && /eventmessage$/i.test(k),
  );
  if (unknownEventKey) {
    const ev2 = asObj(inner[unknownEventKey]);
    if (ev2 && Object.keys(ev2).length > 0) {
      const title = ev2.name ? String(ev2.name) : 'Evento';
      const desc = ev2.description ? String(ev2.description) : '';
      const start = normalizeWhatsAppTime(ev2.startTime);
      const end = normalizeWhatsAppTime(ev2.endTime);
      const joinLink = ev2.joinLink ? String(ev2.joinLink) : '';
      const loc2 = asObj(ev2.location);
      const lines: string[] = [`📅 ${title}`];
      if (desc) lines.push(desc);
      if (start) lines.push(`Começa: ${start.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}`);
      if (end) lines.push(`Termina: ${end.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}`);
      if (joinLink) lines.push(joinLink);
      if (loc2) {
        const la = toFiniteNumber(loc2.degreesLatitude);
        const ln = toFiniteNumber(loc2.degreesLongitude);
        if (la != null && ln != null && Number.isFinite(la) && Number.isFinite(ln)) {
          lines.push(`https://www.google.com/maps?q=${encodeURIComponent(`${la},${ln}`)}`);
        }
      }
      if (ev2.isCanceled === true) lines.push('(Cancelado)');
      const line = lines.join('\n');
      return {
        text: line,
        fallbackSidebar: `📅 ${title}`,
        isMedia: false,
        mediaObject: null,
        messageKind: 'event',
        skipPersist: false,
      };
    }
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
