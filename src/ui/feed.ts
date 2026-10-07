// Filtering, labelling and grouping for the "what changed" feed.

import type { Change, ChangeType } from '../data/changes';
import { STAGE_LABELS, TECH_GROUPS, type Filters } from './filters';

export const FEED_TYPES = {
  all: { label: 'All', types: null },
  consents: { label: 'Consents', types: ['consented'] },
  construction: { label: 'Construction', types: ['construction_started'] },
  operational: { label: 'Operational', types: ['operational'] },
  planning: {
    label: 'Planning',
    types: ['application_submitted', 'appeal_lodged', 'refused', 'withdrawn', 'permission_expired'],
  },
  connections: { label: 'Connections', types: ['connection_changed'] },
} satisfies Record<string, { label: string; types: ChangeType[] | null }>;

export type FeedType = keyof typeof FEED_TYPES;

const TYPE_LABELS: Record<ChangeType, string> = {
  application_submitted: 'Application submitted',
  appeal_lodged: 'Appeal lodged',
  consented: 'Consent granted',
  refused: 'Refused',
  withdrawn: 'Withdrawn',
  construction_started: 'Construction started',
  operational: 'Now operational',
  permission_expired: 'Permission expired',
  added: 'New',
  removed: 'Removed',
  stage_changed: 'Stage changed',
  connection_changed: 'Connection changed',
};

const CONNECTION_LABELS: Record<string, string> = {
  gate2: 'Gate 2 contracted',
  energised: 'Connection energised',
};

const OFF_TRACK_LABELS: Record<string, string> = {
  stalled: 'stalled',
  decommissioned: 'decommissioned',
};

/** Plain-English label for a change, for example "Consent granted" or "Now stalled". */
export function changeLabel(change: Change): string {
  const register =
    change.source === 'interconnector'
      ? 'the NESO register'
      : isTecOnly(change)
        ? 'the TEC register'
        : 'REPD';
  if (change.type === 'added') return `New in ${register}`;
  if (change.type === 'removed') return `Removed from ${register}`;
  if (change.type === 'connection_changed') {
    return change.connection
      ? CONNECTION_LABELS[change.connection]
      : 'Connection no longer published';
  }
  if (change.type === 'stage_changed' && change.stage) {
    const stage =
      change.stage in STAGE_LABELS
        ? STAGE_LABELS[change.stage as keyof typeof STAGE_LABELS].toLowerCase()
        : OFF_TRACK_LABELS[change.stage];
    return `Now ${stage}`;
  }
  return TYPE_LABELS[change.type];
}

/** A project from the TEC register that is not in REPD. */
function isTecOnly(change: Change): boolean {
  return typeof change.id === 'string' && change.id.startsWith('tec-');
}

/** Technologies the feed shows, from the map's technology and flexibility filters. */
function allowedTechnologies(filters: Filters): Set<string> {
  const allowed = new Set<string>();
  for (const group of TECH_GROUPS) {
    if (!filters.techGroups.includes(group.key)) continue;
    if (group.flexibility && !filters.flexibility) continue;
    group.technologies.forEach((t) => allowed.add(t));
    if (group.key === 'interconnectors') allowed.add('Interconnector');
  }
  return allowed;
}

/**
 * Changes that match the map's technology, flexibility and capacity filters and the feed's
 * type filter. The map's stage filter is not applied: refusals and withdrawals would vanish.
 * A change with no published capacity only shows when the capacity filter is "All sizes".
 */
export function filterChanges(changes: Change[], filters: Filters, feedType: FeedType): Change[] {
  const technologies = allowedTechnologies(filters);
  const types: readonly ChangeType[] | null = FEED_TYPES[feedType].types;
  return changes.filter((change) => {
    if (types && !types.includes(change.type)) return false;
    if (!change.technology || !technologies.has(change.technology)) return false;
    if (filters.minMw > 0 && (change.mw === null || change.mw < filters.minMw)) return false;
    return true;
  });
}

const monthFormat = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Consecutive changes grouped under their month, for example "July 2026". */
export function groupByMonth(changes: Change[]): { month: string; changes: Change[] }[] {
  const groups: { month: string; changes: Change[] }[] = [];
  for (const change of changes) {
    const month = monthFormat.format(new Date(`${change.date}T00:00:00Z`));
    const last = groups.at(-1);
    if (last && last.month === month) last.changes.push(change);
    else groups.push({ month, changes: [change] });
  }
  return groups;
}
