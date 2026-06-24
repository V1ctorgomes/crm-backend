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

export function skippedMessage(): ExtractedInboundMessage {
  return {
    text: '',
    fallbackSidebar: '',
    isMedia: false,
    mediaObject: null,
    messageKind: null,
    skipPersist: true,
  };
}
