import { describe, expect, it } from 'vitest';
import { techKind } from './kinds';

describe('techKind', () => {
  it('maps every included REPD technology to an icon', () => {
    for (const technology of [
      'Wind Onshore',
      'Wind Offshore',
      'Solar Photovoltaics',
      'Small Hydro',
      'Large Hydro',
      'Tidal Stream',
      'Tidal Lagoon',
      'Shoreline Wave',
      'Battery',
      'Pumped Storage Hydroelectricity',
      'Liquid Air Energy Storage',
      'Compressed Air Energy Storage',
      'Flywheels',
      'Hydrogen',
    ]) {
      expect(() => techKind(technology)).not.toThrow();
    }
    expect(() => techKind('Fusion')).toThrow();
  });
});
