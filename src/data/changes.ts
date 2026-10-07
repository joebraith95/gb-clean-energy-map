// The "what changed" list written by pipeline/changes.py.

import { dataUrl } from '../config';
import type { AnyStage, ConnectionBadge } from './projects';

export type ChangeType =
  | 'application_submitted'
  | 'appeal_lodged'
  | 'consented'
  | 'refused'
  | 'withdrawn'
  | 'construction_started'
  | 'operational'
  | 'permission_expired'
  | 'added'
  | 'removed'
  | 'stage_changed'
  | 'connection_changed';

export interface Change {
  /** ISO date: the event date from REPD, or the run that spotted the change. */
  date: string;
  dateKind: 'event' | 'spotted';
  /** Where a spotted change was seen, for example "the July 2026 REPD release". */
  spottedIn?: string;
  source: 'project' | 'interconnector';
  /** REPD ID or TEC-only ID ("tec-...") for projects, interconnector id for interconnectors. */
  id: number | string;
  type: ChangeType;
  from?: AnyStage | null;
  /** The headline stage after the change, or null if the record was removed. */
  stage: AnyStage | null;
  name: string | null;
  technology: string | null;
  mw: number | null;
  /** For connection_changed: the badge before and after; absent means not published. */
  fromConnection?: Exclude<ConnectionBadge, 'not_published'> | null;
  connection?: Exclude<ConnectionBadge, 'not_published'> | null;
}

export interface ChangeFile {
  windowMonths: number;
  changes: Change[];
}

export async function loadChanges(): Promise<ChangeFile> {
  const response = await fetch(dataUrl('changes.json'));
  if (!response.ok) throw new Error(`Could not load changes.json (${response.status})`);
  return response.json();
}

/** Events that play an animation on the map: consent, construction start and energisation. */
export const ANIMATED_TYPES = new Set<ChangeType>(['consented', 'construction_started', 'operational']);
/** Smallest project (MW) whose events animate. */
export const ANIMATION_MIN_MW = 5;

export function isAnimated(change: Change): boolean {
  return (
    change.dateKind === 'event' &&
    ANIMATED_TYPES.has(change.type) &&
    change.mw !== null &&
    change.mw >= ANIMATION_MIN_MW
  );
}
