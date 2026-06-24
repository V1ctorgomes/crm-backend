import { asObj } from './proto.util';
import type { ExtractedInboundMessage } from './types';

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
export function coercePollContainer(inner: Record<string, unknown>): Record<string, unknown> | null {
  for (const k of ['pollCreationMessage', 'pollCreationMessageV3', 'pollCreationMessageV2'] as const) {
    const p = asObj(inner[k]);
    if (p && Object.keys(p).length > 0) return p;
  }
  return null;
}

export function extractPollFromContainer(poll: Record<string, unknown>): ExtractedInboundMessage {
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

export function tryExtractPoll(inner: Record<string, unknown>): ExtractedInboundMessage | null {
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

  return null;
}

export function tryExtractUnknownPoll(inner: Record<string, unknown>): ExtractedInboundMessage | null {
  const unknownPollKey = Object.keys(inner).find((k) => /^pollCreationMessage/i.test(k));
  if (!unknownPollKey) return null;
  const p = asObj(inner[unknownPollKey]);
  if (!p) return null;
  return extractPollFromContainer(p);
}
