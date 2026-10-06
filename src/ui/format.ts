// Display formatting. British English throughout.

export const NOT_PUBLISHED = 'Not published';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "3 Aug 2026" from an ISO date, or "Not published". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return NOT_PUBLISHED;
  return dateFormat.format(new Date(`${iso}T00:00:00Z`));
}

/** "49.9 MW", "1,200 MW", or "Not published". */
export function formatMw(mw: number | null | undefined): string {
  if (mw === null || mw === undefined) return NOT_PUBLISHED;
  return `${mw.toLocaleString('en-GB', { maximumFractionDigits: 2 })} MW`;
}

export function orNotPublished(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === '' ? NOT_PUBLISHED : String(value);
}
