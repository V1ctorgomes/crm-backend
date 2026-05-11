export const TICKET_CATALOG_CATEGORIES = ['MARCA', 'MODELO', 'CUSTOMER_TYPE', 'TICKET_TYPE'] as const;
export type TicketCatalogCategory = (typeof TICKET_CATALOG_CATEGORIES)[number];

export function isTicketCatalogCategory(v: string): v is TicketCatalogCategory {
  return (TICKET_CATALOG_CATEGORIES as readonly string[]).includes(v);
}
