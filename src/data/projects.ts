// Map index written by pipeline/output.py: columnar arrays, one entry per kept REPD record.

import { dataUrl } from '../config';
import type { Stage } from '../theme/tokens';

export interface ProjectIndex {
  source: { name: string; page: string; file: string; updated: string | null };
  technologies: string[];
  stages: (Stage | 'stalled' | 'decommissioned')[];
  hiddenReasons: string[];
  detailShards: number;
  id: number[];
  name: string[];
  x: (number | null)[];
  y: (number | null)[];
  mw: (number | null)[];
  /** Index into `technologies`. */
  tech: number[];
  /** 1 for the flexibility layer (storage, interconnectors), 0 for generation. */
  flex: number[];
  /** Index into `stages`, or -1 if none. */
  stage: number[];
  /** Index into `hiddenReasons`, or -1 if the project can be drawn. */
  hidden: number[];
}

export async function loadProjects(): Promise<ProjectIndex> {
  const response = await fetch(dataUrl('projects.json'));
  if (!response.ok) throw new Error(`Could not load projects.json (${response.status})`);
  return response.json();
}

/** Technologies that sit at sea, so they are never moved onto a nearby land cell. */
export const MARINE_TECHNOLOGIES = new Set([
  'Wind Offshore',
  'Tidal Stream',
  'Tidal Lagoon',
  'Shoreline Wave',
]);
