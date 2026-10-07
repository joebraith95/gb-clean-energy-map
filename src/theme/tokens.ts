// All colours used by the map and UI. Nothing else should hard-code a colour.
// Stage colours started from the Okabe-Ito colour-blind safe set and were tuned so every pair, and
// each against land, stays clearly apart under protan, deutan and tritan vision (see colourCheck.test.ts).

export const palette = {
  sea: '#1d2b53',
  seaDeep: '#14203f',
  land: '#40651d',
  landEdge: '#2f4b15',
  // Land outside GB (Ireland, France, Isle of Man, Channel Islands): scenery only, kept muted.
  otherLand: '#4a4f5c',
  ink: '#f4f1e8',
  inkMuted: '#b8b3a6',
  panel: '#101624',
  panelEdge: '#2a3550',
} as const;

export const stageColours = {
  early_development: '#bc82b1',
  in_planning: '#d38326',
  consented: '#5bd9ff',
  under_construction: '#ede668',
  operational: '#28a16d',
} as const;

/** Dark ink for sprite glyphs and marker outlines. */
export const spriteInk = '#101624';

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
}
