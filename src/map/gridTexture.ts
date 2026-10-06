import { Texture } from 'pixi.js';
import { decodeLevel, type GridLevel } from './grid';

/** One texel per cell, coloured from theme tokens. Scale it by an integer with nearest-neighbour sampling. */
export function gridTexture(level: GridLevel, colours: Record<number, string>): Texture {
  const cells = decodeLevel(level);
  const canvas = document.createElement('canvas');
  canvas.width = level.cols;
  canvas.height = level.rows;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(level.cols, level.rows);
  const rgb = Object.fromEntries(Object.entries(colours).map(([k, hex]) => [k, hexToRgb(hex)]));
  for (let i = 0; i < cells.length; i++) {
    const [r, g, b] = rgb[cells[i]];
    image.data.set([r, g, b, 255], i * 4);
  }
  context.putImageData(image, 0, 0);
  return Texture.from(canvas);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
