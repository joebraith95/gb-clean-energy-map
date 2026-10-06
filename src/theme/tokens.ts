// All colours used by the map and UI. Nothing else should hard-code a colour.
// Stage colours are a draft based on the Okabe-Ito colour-blind safe set; checked in phase 1 step 4.

export const palette = {
  sea: '#1d2b53',
  seaDeep: '#14203f',
  land: '#3e7a3a',
  landEdge: '#2c5a2a',
  ink: '#f4f1e8',
  inkMuted: '#b8b3a6',
  panel: '#101624',
  panelEdge: '#2a3550',
} as const;

export const stageColours = {
  early_development: '#cc79a7',
  in_planning: '#e69f00',
  consented: '#56b4e9',
  under_construction: '#f0e442',
  operational: '#009e73',
} as const;

export type Stage = keyof typeof stageColours;

/** Exposes the tokens as CSS custom properties (for example --color-panel) so CSS never hard-codes colours. */
export function applyCssTokens(root: HTMLElement): void {
  for (const [name, value] of Object.entries(palette))
    root.style.setProperty(`--color-${name}`, value);
  for (const [name, value] of Object.entries(stageColours))
    root.style.setProperty(`--stage-${name.replaceAll('_', '-')}`, value);
}
