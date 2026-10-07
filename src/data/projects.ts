// Map index and card details written by pipeline/output.py.

import { dataUrl } from '../config';
import type { Stage } from '../theme/tokens';

export type AnyStage = Stage | 'stalled' | 'decommissioned';

export type ConnectionBadge = 'not_published' | 'gate2' | 'energised';

/** Connection details from the NESO TEC register, for records matched to it. */
export interface Connection {
  badge: 'gate2' | 'energised';
  /** Gate 2 only. Always labelled "Contracted date". */
  contractedDate: string | null;
  /** Gate 2 only. */
  site: string | null;
  /** The TEC register projects matched to this record, and how each was matched. */
  tec: { name: string; projectId: string; matchedBy: string }[];
}

/** Columnar arrays, one entry per kept REPD record. */
export interface ProjectIndex {
  source: { name: string; page: string; file: string; updated: string | null };
  /** The TEC register the connection badges come from. */
  connectionSource: { name: string; page: string; file: string } | null;
  connectionBadges: ConnectionBadge[];
  technologies: string[];
  stages: AnyStage[];
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
  /** Phase group shared by phases of one project, or -1. */
  group: number[];
  /** Index into `connectionBadges`; 0 means not published. */
  conn: number[];
}

/** Card fields for one project. Null means not published in the source. */
export interface ProjectDetails {
  operator: string | null;
  storageType: string | null;
  repdStatus: string;
  address: string | null;
  county: string | null;
  region: string | null;
  country: string;
  postcode: string | null;
  planningAuthority: string | null;
  planningRef: string | null;
  appealRef: string | null;
  offshore: boolean | null;
  turbines: number | null;
  dates: {
    submitted: string | null;
    consented: string | null;
    constructionStart: string | null;
    operational: string | null;
  };
  recordUpdated: string | null;
  corrections: string[];
  /** REPD IDs of other phases of the same project. */
  phases?: number[];
  /** Null when no connection data is published for the project. */
  connection: Connection | null;
}

export async function loadProjects(): Promise<ProjectIndex> {
  const response = await fetch(dataUrl('projects.json'));
  if (!response.ok) throw new Error(`Could not load projects.json (${response.status})`);
  return response.json();
}

const shardCache = new Map<number, Promise<Record<string, ProjectDetails>>>();

/** Card details for one REPD ID, loading only the shard that holds it. */
export async function loadDetails(id: number, shards: number): Promise<ProjectDetails> {
  const shard = id % shards;
  let request = shardCache.get(shard);
  if (!request) {
    request = fetch(dataUrl(`details/${String(shard).padStart(2, '0')}.json`)).then((r) => {
      if (!r.ok) throw new Error(`Could not load project details (${r.status})`);
      return r.json();
    });
    request.catch(() => shardCache.delete(shard));
    shardCache.set(shard, request);
  }
  const details = (await request)[String(id)];
  if (!details) throw new Error(`No details for REPD ${id}`);
  return details;
}

/** Technologies that sit at sea, so they are never moved onto a nearby land cell. */
export const MARINE_TECHNOLOGIES = new Set([
  'Wind Offshore',
  'Tidal Stream',
  'Tidal Lagoon',
  'Shoreline Wave',
]);
