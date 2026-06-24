import type { ExtractedInboundMessage } from './types';
import { tryExtractSkipOrProtocol, tryExtractReaction } from './skip.extract';
import { tryExtractSticker } from './sticker.extract';
import { tryExtractLocation } from './location.extract';
import { tryExtractContact } from './contact.extract';
import { tryExtractEvent, tryExtractUnknownEvent } from './event.extract';
import { tryExtractPoll, tryExtractUnknownPoll } from './poll.extract';
import { tryExtractInteractive } from './interactive.extract';
import { tryExtractMedia } from './media.extract';
import { tryExtractText, unsupportedMessage } from './text.extract';

function firstMatch(
  inner: Record<string, unknown>,
  extractors: Array<(inner: Record<string, unknown>) => ExtractedInboundMessage | null>,
): ExtractedInboundMessage | null {
  for (const extract of extractors) {
    const result = extract(inner);
    if (result) return result;
  }
  return null;
}

export function extractInboundMessageContent(inner: Record<string, unknown>): ExtractedInboundMessage {
  const result = firstMatch(inner, [
    tryExtractSkipOrProtocol,
    tryExtractReaction,
    tryExtractSticker,
    tryExtractLocation,
    tryExtractContact,
    tryExtractEvent,
    tryExtractInteractive,
    tryExtractPoll,
    tryExtractMedia,
    tryExtractText,
    tryExtractUnknownPoll,
    tryExtractUnknownEvent,
  ]);
  return result ?? unsupportedMessage();
}
