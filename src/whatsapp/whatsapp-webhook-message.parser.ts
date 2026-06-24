import {
  buildScopedMessageId,
  contactKeyFromRemoteJid,
  isGroupRemoteJid,
} from './whatsapp-contact-jid.util';
import { extractInboundMessageContent, unwrapProtoMessage } from './whatsapp-inbound-extract';
import type { MessageWebhookEvent } from './whatsapp-webhook-connection.parser';

export type ParsedInboundMessage = {
  remoteJid: string;
  contactNumber: string;
  isGroupJid: boolean;
  isFromMe: boolean;
  waId: string | undefined;
  participantJid: string;
  pushName: string;
  groupSenderLabel: string | undefined;
  isSelfEchoEvent: boolean;
  primaryScopedWaId: string | undefined;
  extracted: ReturnType<typeof extractInboundMessageContent>;
  inner: ReturnType<typeof unwrapProtoMessage>;
  text: string;
  mimeType: string | undefined;
  fileName: string | undefined;
  isMedia: boolean;
  fallbackSidebarText: string;
};

export function parseInboundMessage(msgData: any, eventName: MessageWebhookEvent, primaryUserId: string): ParsedInboundMessage | null {
  const remoteJid = String(msgData.key.remoteJid || '');
  if (!remoteJid || remoteJid === 'status@broadcast') return null;

  const isGroupJid = isGroupRemoteJid(remoteJid);
  const contactNumber = contactKeyFromRemoteJid(remoteJid);
  const isFromMe = Boolean(msgData.key.fromMe);
  const waId = msgData.key.id ? String(msgData.key.id) : undefined;
  const participantJid = msgData.key?.participant ? String(msgData.key.participant) : '';
  const pushName = msgData.pushName ? String(msgData.pushName) : contactNumber;
  const groupSenderLabel =
    isGroupJid && !isFromMe
      ? (() => {
          const byPush = String(pushName || '').trim();
          if (byPush && byPush !== contactNumber) return byPush;
          const tail = participantJid.split('@')[0];
          return tail || undefined;
        })()
      : undefined;
  const isSelfEchoEvent = eventName === 'send.message';
  const primaryScopedWaId = waId ? buildScopedMessageId(primaryUserId, waId) : undefined;

  const msgRaw = msgData.message;
  if (!msgRaw || typeof msgRaw !== 'object' || Object.keys(msgRaw).length === 0) {
    return null;
  }

  const inner = unwrapProtoMessage(msgRaw);
  const extracted = extractInboundMessageContent(inner);
  if (extracted.skipPersist) {
    return null;
  }

  let text = extracted.text;
  const mimeType = extracted.mimeType;
  const fileName = extracted.fileName;
  const isMedia = extracted.isMedia;
  const fallbackSidebarText = extracted.fallbackSidebar;

  if (!text && !isMedia) text = 'Mensagem não suportada';

  return {
    remoteJid,
    contactNumber,
    isGroupJid,
    isFromMe,
    waId,
    participantJid,
    pushName,
    groupSenderLabel,
    isSelfEchoEvent,
    primaryScopedWaId,
    extracted,
    inner,
    text,
    mimeType,
    fileName,
    isMedia,
    fallbackSidebarText,
  };
}
