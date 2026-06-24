import { asObj } from './proto.util';
import type { ExtractedInboundMessage } from './types';
import { skippedMessage } from './types';

export function tryExtractSkipOrProtocol(inner: Record<string, unknown>): ExtractedInboundMessage | null {
  if (
    inner.senderKeyDistributionMessage ||
    inner.deviceSentMessage ||
    inner.messageHistoryBundle ||
    inner.encReactionMessage
  ) {
    return skippedMessage();
  }

  const protocol = asObj(inner.protocolMessage);
  if (protocol) {
    return skippedMessage();
  }

  return null;
}

export function tryExtractReaction(inner: Record<string, unknown>): ExtractedInboundMessage | null {
  const reaction = asObj(inner.reactionMessage);
  if (!reaction) return null;
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
