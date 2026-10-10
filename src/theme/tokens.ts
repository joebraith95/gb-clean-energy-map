// All colours used by the map and UI. Nothing else should hard-code a colour.
// Stage colours started from the Okabe-Ito colour-blind safe set and were tuned so every pair, and
// each against the dark marker ink, stays clearly apart under protan, deutan and tritan vision (see
// colourCheck.test.ts). Markers sit on satellite imagery, so each also has a light ring and a dark edge.

export const palette = {
  // Shown behind the satellite imagery while it loads.
  sea: '#0b1a2b',
  ink: '#f4f1e8',
  inkMuted: '#b8b3a6',
  panel: '#101624',
  panelEdge: '#2a3550',
} as const;

/** Lines and lettering drawn over the satellite imagery. */
export const mapColours = {
  // Nations and English regions.
  regionLine: '#ffffff',
  // Electricity distribution (DNO) licence areas.
  dnoLine: '#ffb454',
  // Dark edge under lines and around lettering, so both read on bright and dark ground alike.
  casing: '#0a101c',
  placeName: '#ffffff',
  // Light outer ring that lifts markers off the imagery.
  markerRing: '#f4f1e8',
} as const;

export const stageColours = {
  early_development: '#bc82b1',
  in_planning: '#d38326',
  consented: '#5bd9ff',
  under_construction: '#ede668',
  operational: '#28a16d',
} as const;

/** Dark ink for marker icons and outlines. */
export const markerInk = '#101624';

export type Stage = keyof typeof stageColours;

/** Fuel colours for the live mix bar. Each row is also labelled, so colour is never the only cue. */
export const fuelColours: Record<string, string> = {
  wind: '#5bd9ff',
  solar: '#ede668',
  nuclear: '#bc82b1',
  gas: '#d38326',
  biomass: '#8a6d3b',
  hydro: '#2f7fd1',
  pumped: '#1f5aa0',
  imports: '#b8b3a6',
  coal: '#4a4f5c',
  oil: '#6b4a3a',
  other: '#7a7f8c',
};

/** Exposes the tokens as CSS custom properties (for example --color-panel) so CSS never hard-codes colours. */
export function applyCssTokens(root: HTMLElement): void {
  for (const [name, value] of Object.entries(palette))
    root.style.setProperty(`--color-${name}`, value);
  for (const [name, value] of Object.entries(stageColours))
    root.style.setProperty(`--stage-${name.replaceAll('_', '-')}`, value);
  for (const [name, value] of Object.entries(mapColours))
    root.style.setProperty(`--map-${name}`, value);
}
