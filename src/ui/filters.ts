// Filter state and the predicate the map uses to decide which projects to draw.

import { linkCapacity, type Interconnector } from '../data/interconnectors';
import type { ProjectIndex } from '../data/projects';
import type { Stage } from '../theme/tokens';

export interface TechGroup {
  key: string;
  label: string;
  technologies: string[];
  /** Part of the flexibility layer, shown only when that layer is on. */
  flexibility: boolean;
}

export const TECH_GROUPS: TechGroup[] = [
  { key: 'onshore', label: 'Onshore wind', technologies: ['Wind Onshore'], flexibility: false },
  { key: 'offshore', label: 'Offshore wind', technologies: ['Wind Offshore'], flexibility: false },
  { key: 'solar', label: 'Solar', technologies: ['Solar Photovoltaics'], flexibility: false },
  {
    key: 'hydro',
    label: 'Hydro',
    technologies: ['Small Hydro', 'Large Hydro'],
    flexibility: false,
  },
  {
    key: 'marine',
    label: 'Tidal and wave',
    technologies: ['Tidal Stream', 'Tidal Lagoon', 'Shoreline Wave'],
    flexibility: false,
  },
  { key: 'battery', label: 'Batteries', technologies: ['Battery'], flexibility: true },
  {
    key: 'pumped',
    label: 'Pumped storage',
    technologies: ['Pumped Storage Hydroelectricity'],
    flexibility: true,
  },
  {
    key: 'otherStorage',
    label: 'Other storage',
    technologies: ['Liquid Air Energy Storage', 'Compressed Air Energy Storage', 'Flywheels'],
    flexibility: true,
  },
  { key: 'hydrogen', label: 'Hydrogen', technologies: ['Hydrogen'], flexibility: true },
  // Not a REPD technology: interconnectors come from their own file.
  { key: 'interconnectors', label: 'Interconnectors', technologies: [], flexibility: true },
];

export const STAGE_ORDER: Stage[] = [
  'early_development',
  'in_planning',
  'consented',
  'under_construction',
  'operational',
];

export const STAGE_LABELS: Record<Stage, string> = {
  early_development: 'Early development',
  in_planning: 'In planning',
  consented: 'Consented',
  under_construction: 'Under construction',
  operational: 'Operational',
};

/** Capacity slider stops in MW. */
export const CAPACITY_STEPS = [0, 1, 5, 10, 50, 100, 300, 1000];

export interface Filters {
  techGroups: string[];
  stages: Stage[];
  flexibility: boolean;
  minMw: number;
  /** Only projects with a Gate 2 connection agreement that is not yet energised. */
  gate2Only: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  techGroups: TECH_GROUPS.map((g) => g.key),
  stages: [...STAGE_ORDER],
  flexibility: false,
  minMw: 1,
  gate2Only: false,
};

/** Same rule as the interconnector card's badge: Built means energised, which comes first. */
export function linkIsGate2(link: Interconnector): boolean {
  return link.gate === '2' && link.registerStatus !== 'Built';
}

export function makeInclude(projects: ProjectIndex, filters: Filters): (index: number) => boolean {
  const allowedTech = new Set<number>();
  for (const group of TECH_GROUPS) {
    if (!filters.techGroups.includes(group.key)) continue;
    if (group.flexibility && !filters.flexibility) continue;
    for (const technology of group.technologies) {
      const t = projects.technologies.indexOf(technology);
      if (t >= 0) allowedTech.add(t);
    }
  }
  const allowedStage = new Set(
    filters.stages.map((s) => projects.stages.indexOf(s)).filter((s) => s >= 0),
  );
  const gate2 = projects.connectionBadges.indexOf('gate2');
  return (i) =>
    allowedTech.has(projects.tech[i]) &&
    allowedStage.has(projects.stage[i]) &&
    (projects.mw[i] ?? 0) >= filters.minMw &&
    (!filters.gate2Only || projects.conn[i] === gate2);
}

export function makeIncludeLink(
  links: Interconnector[],
  filters: Filters,
): (index: number) => boolean {
  const on = filters.flexibility && filters.techGroups.includes('interconnectors');
  return (i) => {
    const link = links[i];
    const mw = linkCapacity(link);
    return (
      on &&
      link.stage !== null &&
      filters.stages.includes(link.stage) &&
      mw !== null &&
      mw >= filters.minMw &&
      (!filters.gate2Only || linkIsGate2(link))
    );
  };
}

/** Interconnectors that can be drawn (they have a GB landing point) and pass the filters. */
export function countLinksShown(links: Interconnector[], filters: Filters): number {
  const include = makeIncludeLink(links, filters);
  return links.filter((link, i) => link.gbEnd !== null && include(i)).length;
}

/** Projects that can be drawn and pass the filters, at any zoom level. */
export function countShown(projects: ProjectIndex, filters: Filters): number {
  const include = makeInclude(projects, filters);
  let count = 0;
  for (let i = 0; i < projects.id.length; i++) {
    if (projects.hidden[i] < 0 && include(i)) count++;
  }
  return count;
}

/** Stages that have at least one drawable project, so the panel never offers an empty choice. */
export function stagesPresent(projects: ProjectIndex): Stage[] {
  const present = new Set<number>();
  for (let i = 0; i < projects.id.length; i++) {
    if (projects.hidden[i] < 0) present.add(projects.stage[i]);
  }
  return STAGE_ORDER.filter((s) => present.has(projects.stages.indexOf(s)));
}
