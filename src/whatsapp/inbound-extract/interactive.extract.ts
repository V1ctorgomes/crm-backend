import { asObj } from './proto.util';
import type { ExtractedInboundMessage } from './types';
import { extractPollFromContainer } from './poll.extract';

export function tryExtractInteractive(inner: Record<string, unknown>): ExtractedInboundMessage | null {
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

  return null;
}
