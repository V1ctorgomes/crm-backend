import { asObj } from './proto.util';
import type { ExtractedInboundMessage } from './types';

export function tryExtractContact(inner: Record<string, unknown>): ExtractedInboundMessage | null {
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

  return null;
}
