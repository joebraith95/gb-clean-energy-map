// Map index and card details written by pipeline/output.py.

import { dataUrl } from '../config';
import type { Stage } from '../theme/tokens';

export type AnyStage = Stage | 'stalled' | 'decommissioned';

/** A REPD Ref ID, or "tec-" and a TEC register Project ID for a project not in REPD. */
export type ProjectId = number | string;

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

/** Columnar arrays, one entry per kept record: REPD records, then TEC-only projects. */
export interface ProjectIndex {
  source: { name: string; page: string; file: string; updated: string | null };
  /** The TEC register the connection badges come from. */
  connectionSource: { name: string; page: string; file: string } | null;
  connectionBadges: ConnectionBadge[];
  technologies: string[];
  stages: AnyStage[];
  hiddenReasons: string[];
  detailShards: number;
  id: ProjectId[];
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
  /** Projects placed at the same connection substation share a number, or -1. */
  site: number[];
}

/** Card fields for one REPD record. Null means not published in the source. */
export interface RepdDetails {
  kind: 'repd';
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

/** Card fields for a TEC register project with no REPD record. */
export interface TecDetails {
  kind: 'tec';
  tecProjectId: string;
  customer: string | null;
  connectionSite: string | null;
  hostTo: string | null;
  agreementType: string | null;
  /** Technology tags from the register, for example "solar" and "storage". */
  technologies: string[];
  /** The OpenStreetMap substation the project is drawn at, if located. */
  substation: { name: string; osm: string } | null;
  tranches: {
    stage: number | null;
    status: string;
    gate: string | null;
    changeMw: number | null;
    cumulativeMw: number | null;
    /** Gate 2 tranches only. */
    contractedDate: string | null;
  }[];
  connection: Connection | null;
}

export type ProjectDetails = RepdDetails | TecDetails;

/** Detail shard for an ID. Kept in step with shard_for in pipeline/output.py. */
export function shardFor(id: ProjectId, shards: number): number {
  if (typeof id === 'number') return id % shards;
  let sum = 0;
  for (const c of id) sum += c.charCodeAt(0);
  return sum % shards;
}

/** Reads a project ID from a share link: digits are a REPD ID, anything else a TEC-only ID. */
export function parseProjectId(value: string | null): ProjectId | null {
  if (!value) return null;
  return /^\d+$/.test(value) ? Number(value) : value;
}

export async function loadProjects(): Promise<ProjectIndex> {
  const response = await fetch(dataUrl('projects.json'));
  if (!response.ok) throw new Error(`Could not load projects.json (${response.status})`);
  return response.json();
}

const shardCache = new Map<number, Promise<Record<string, ProjectDetails>>>();

/** Card details for one project, loading only the shard that holds it. */
export async function loadDetails(id: ProjectId, shards: number): Promise<ProjectDetails> {
  const shard = shardFor(id, shards);
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
  if (!details) throw new Error(`No details for project ${id}`);
  return details;
}

/** Technologies that sit at sea, so they are never moved onto a nearby land cell. */
export const MARINE_TECHNOLOGIES = new Set([
  'Wind Offshore',
  'Tidal Stream',
  'Tidal Lagoon',
  'Shoreline Wave',
  'Tidal',
]);
