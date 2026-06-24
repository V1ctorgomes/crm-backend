export function conversasPath(userId: string, contactNumber: string): string {
  const uid = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const num = String(contactNumber).replace(/\D/g, '');
  return `${uid}/conversas/${num}`;
}

export function solicitacoesTicketPath(userId: string, ticketId: string): string {
  const uid = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const tid = String(ticketId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${uid}/solicitacoes/${tid}`;
}

export function perfilPath(userId: string): string {
  const uid = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${uid}/perfil`;
}
