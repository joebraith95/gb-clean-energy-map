// The icon each technology is drawn with, on the map and on the card.

export type TechKind =
  'wind' | 'solar' | 'battery' | 'hydro' | 'tidal' | 'hydrogen' | 'interconnector';

export const TECH_KINDS: readonly TechKind[] = [
  'wind',
  'solar',
  'battery',
  'hydro',
  'tidal',
  'hydrogen',
  'interconnector',
];

const KIND_BY_TECHNOLOGY: Record<string, TechKind> = {
  'Wind Onshore': 'wind',
  'Wind Offshore': 'wind',
  'Solar Photovoltaics': 'solar',
  Battery: 'battery',
  'Liquid Air Energy Storage': 'battery',
  'Compressed Air Energy Storage': 'battery',
  Flywheels: 'battery',
  Hydrogen: 'hydrogen',
  'Small Hydro': 'hydro',
  'Large Hydro': 'hydro',
  'Pumped Storage Hydroelectricity': 'hydro',
  // TEC-only projects, where the register gives less detail than REPD.
  Hydro: 'hydro',
  Tidal: 'tidal',
  'Storage (type not published)': 'battery',
  'Tidal Stream': 'tidal',
  'Tidal Lagoon': 'tidal',
  'Shoreline Wave': 'tidal',
};

export function techKind(technology: string): TechKind {
  const kind = KIND_BY_TECHNOLOGY[technology];
  if (!kind) throw new Error(`No icon for technology: ${technology}`);
  return kind;
}
