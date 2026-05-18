/** Alinhado ao mínimo do frontend (`MIN_DELETE_REASON_LENGTH`). */
export const DELETE_REASON_MIN_LEN = 10;

export const DeletionResourceType = {
  TICKET: 'TICKET',
  TICKET_FILE: 'TICKET_FILE',
  TICKET_NOTE: 'TICKET_NOTE',
  TICKET_TASK: 'TICKET_TASK',
  TICKET_STAGE: 'TICKET_STAGE',
  USER: 'USER',
  CONTACT: 'CONTACT',
  COMPANY: 'COMPANY',
  CONTACT_COMPANY_LINK: 'CONTACT_COMPANY_LINK',
  INSTANCE: 'INSTANCE',
  WHATSAPP_CONVERSATION: 'WHATSAPP_CONVERSATION',
  WHATSAPP_MESSAGE: 'WHATSAPP_MESSAGE',
} as const;

export type DeletionResourceTypeKey = (typeof DeletionResourceType)[keyof typeof DeletionResourceType];
