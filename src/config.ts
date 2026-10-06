// Site-wide settings. Moving to a custom domain only changes these environment values.

export const SITE_URL: string = import.meta.env.VITE_SITE_URL ?? '';
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api';

/** Root-relative URL for a file in the generated data folder. */
export function dataUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}
