// Pixel-art sprites, defined as character grids so they stay crisp and take their colours from tokens.
// Each sprite is a tile: a dark outline, the stage colour as background, and a dark technology glyph.

import { Texture } from 'pixi.js';
import { spriteInk, stageColours, type Stage } from '../theme/tokens';

export type SpriteKind =
  'wind' | 'solar' | 'battery' | 'hydro' | 'tidal' | 'hydrogen' | 'interconnector';

/** Glyph grid size; the tile adds a one-pixel outline on each side. */
export const GLYPH_SIZE = 7;
export const TILE_SIZE = GLYPH_SIZE + 2;

// 'k' is ink, '.' is the stage colour. Wind has two frames for the spinning blades.
export const GLYPHS: Record<SpriteKind, string[][]> = {
  wind: [
    ['...k...', '...k...', '...k...', '..kkk..', '.k.k.k.', '...k...', '..kkk..'],
    ['.k...k.', '..k.k..', '...k...', '...k...', '...k...', '...k...', '..kkk..'],
  ],
  solar: [['.......', 'kkkkkkk', 'k.k.k.k', 'kkkkkkk', 'k.k.k.k', 'kkkkkkk', '.k...k.']],
  battery: [['..kkk..', '.kkkkk.', '.k...k.', '.kkkkk.', '.k...k.', '.kkkkk.', '.kkkkk.']],
  hydro: [['...k...', '..kkk..', '.kkkkk.', 'kkkkkkk', 'kkk.kkk', '.kk.kk.', '..kkk..']],
  tidal: [['.......', '.kk....', 'k..k..k', '....kk.', '.kk....', 'k..k..k', '....kk.']],
  hydrogen: [['.......', '.k...k.', '.k...k.', '.kkkkk.', '.k...k.', '.k...k.', '.......']],
  // Two-way arrows: power flows both ways.
  interconnector: [['..k....', '.kkkkkk', '..k....', '.......', '....k..', 'kkkkkk.', '....k..']],
};

const KIND_BY_TECHNOLOGY: Record<string, SpriteKind> = {
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
  'Tidal Stream': 'tidal',
  'Tidal Lagoon': 'tidal',
  'Shoreline Wave': 'tidal',
};

export function spriteKind(technology: string): SpriteKind {
  const kind = KIND_BY_TECHNOLOGY[technology];
  if (!kind) throw new Error(`No sprite for technology: ${technology}`);
  return kind;
}

/** Tile pixels as colour strings (or null for transparent), row by row. Pure, so it can be tested. */
export function tilePixels(kind: SpriteKind, frame: number, stage: Stage): string[][] {
  const glyph = GLYPHS[kind][frame % GLYPHS[kind].length];
  const pixels: string[][] = [];
  for (let row = 0; row < TILE_SIZE; row++) {
    const line: string[] = [];
    for (let col = 0; col < TILE_SIZE; col++) {
      const edge = row === 0 || col === 0 || row === TILE_SIZE - 1 || col === TILE_SIZE - 1;
      const cell = edge ? 'k' : glyph[row - 1][col - 1];
      line.push(cell === 'k' ? spriteInk : stageColours[stage]);
    }
    pixels.push(line);
  }
  return pixels;
}

const cache = new Map<string, Texture>();

/** A tile texture where each art pixel is `pixelSize` physical pixels. Cached. */
export function tileTexture(
  kind: SpriteKind,
  frame: number,
  stage: Stage,
  pixelSize: number,
): Texture {
  const key = `${kind}:${frame}:${stage}:${pixelSize}`;
  let texture = cache.get(key);
  if (!texture) {
    const pixels = tilePixels(kind, frame, stage);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TILE_SIZE * pixelSize;
    const context = canvas.getContext('2d')!;
    pixels.forEach((line, row) =>
      line.forEach((colour, col) => {
        context.fillStyle = colour;
        context.fillRect(col * pixelSize, row * pixelSize, pixelSize, pixelSize);
      }),
    );
    texture = Texture.from(canvas);
    cache.set(key, texture);
  }
  return texture;
}

export function clearSpriteCache(): void {
  for (const texture of cache.values()) texture.destroy(true);
  cache.clear();
}
