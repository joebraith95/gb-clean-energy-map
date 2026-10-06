// Interconnectors written by pipeline/interconnectors.py.

import { dataUrl } from '../config';
import type { Stage } from '../theme/tokens';

export interface LinkEnd {
  name: string;
  /** 'converter', 'converter_under_construction' or 'connection_substation'. Null for partner ends. */
  kind: string | null;
  /** OpenStreetMap feature the location comes from. */
  osm: string;
  /** British National Grid metres. */
  x: number;
  y: number;
}

export interface Milestone {
  type: string;
  label: string;
  date: string;
  source: string;
}

export interface Interconnector {
  id: string;
  name: string;
  partner: string;
  stage: Stage | null;
  registerStatus: string;
  importMw: number | null;
  exportMw: number | null;
  connectionSite: string | null;
  gate: string | null;
  contractedDate: string | null;
  commissioned: string | null;
  gbEnd: LinkEnd | null;
  partnerEnd: LinkEnd | null;
  milestones: Milestone[];
  sources: string[];
}

export interface InterconnectorFile {
  source: { name: string; page: string; file: string };
  interconnectors: Interconnector[];
}

export async function loadInterconnectors(): Promise<InterconnectorFile> {
  const response = await fetch(dataUrl('interconnectors.json'));
  if (!response.ok) throw new Error(`Could not load interconnectors.json (${response.status})`);
  return response.json();
}

/** The larger of import and export capacity, used for marker size and the capacity filter. */
export function linkCapacity(link: Interconnector): number | null {
  const values = [link.importMw, link.exportMw].filter((v): v is number => v !== null);
  return values.length ? Math.max(...values) : null;
}
