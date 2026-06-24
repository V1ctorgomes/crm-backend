/** Re-exporta submódulos de extração inbound para compatibilidade. */
export type { ExtractedInboundMessage } from './inbound-extract';
export { extractInboundMessageContent, unwrapProtoMessage } from './inbound-extract';
