// Marker artwork, drawn on a canvas from the theme tokens: a round badge in the stage colour with
// a dark technology icon, plain dots for small projects, and the ring around the selected marker.
// The map and the card both draw from here, so they always match.

import { mapColours, markerInk, stageColours, type Stage } from '../theme/tokens';
import type { TechKind } from './kinds';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Widths of the light outer ring and the dark edge inside it, in CSS pixels. */
const RING = 1.5;
const EDGE = 1;
/** Gap between a marker and the selection ring around it, in CSS pixels. */
const SELECTION_GAP = 3;
const SELECTION_WIDTH = 2;

/** Diameter (CSS px) of the selection ring image for a marker of the given diameter. */
export function selectionSize(markerSize: number): number {
  return markerSize + 2 * (SELECTION_GAP + SELECTION_WIDTH + EDGE);
}

/** The light ring, dark edge and stage-coloured face shared by dots and badges. */
function drawFace(ctx: Context, size: number, scale: number, stage: Stage): number {
  const centre = (size * scale) / 2;
  const disc = (radius: number, colour: string) => {
    ctx.beginPath();
    ctx.arc(centre, centre, radius, 0, 2 * Math.PI);
    ctx.fillStyle = colour;
    ctx.fill();
  };
  ctx.clearRect(0, 0, size * scale, size * scale);
  disc(centre, mapColours.markerRing);
  disc(centre - RING * scale, markerInk);
  const face = centre - (RING + EDGE) * scale;
  disc(face, stageColours[stage]);
  return face;
}

/** A plain dot: `size` CSS pixels across, drawn at `scale` canvas pixels per CSS pixel. */
export function drawDot(ctx: Context, size: number, scale: number, stage: Stage): void {
  drawFace(ctx, size, scale, stage);
}

/**
 * A badge with the technology icon. `turn` (radians) rotates a turbine's blades; other icons
 * ignore it.
 */
export function drawBadge(
  ctx: Context,
  size: number,
  scale: number,
  kind: TechKind,
  stage: Stage,
  turn = 0,
): void {
  const face = drawFace(ctx, size, scale, stage);
  const centre = (size * scale) / 2;
  ctx.save();
  // Icons are drawn in a square from -1 to 1 that fills the badge's face.
  ctx.translate(centre, centre);
  ctx.scale(face, face);
  ctx.strokeStyle = markerInk;
  ctx.fillStyle = markerInk;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  GLYPHS[kind](ctx, turn);
  ctx.restore();
}

/** The ring drawn around the selected marker. */
export function drawSelection(ctx: Context, markerSize: number, scale: number): void {
  const size = selectionSize(markerSize) * scale;
  const centre = size / 2;
  const ring = (width: number, colour: string) => {
    ctx.beginPath();
    ctx.arc(centre, centre, centre - (EDGE + SELECTION_WIDTH / 2) * scale, 0, 2 * Math.PI);
    ctx.lineWidth = width * scale;
    ctx.strokeStyle = colour;
    ctx.stroke();
  };
  ctx.clearRect(0, 0, size, size);
  ring(SELECTION_WIDTH + 2 * EDGE, markerInk);
  ring(SELECTION_WIDTH, mapColours.markerRing);
}

function line(ctx: Context, width: number, ...points: [number, number][]): void {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.lineWidth = width;
  ctx.stroke();
}

const GLYPHS: Record<TechKind, (ctx: Context, turn: number) => void> = {
  // A turbine: tower, hub and three blades.
  wind(ctx, turn) {
    const hub: [number, number] = [0, -0.14];
    line(ctx, 0.13, hub, [0, 0.64]);
    for (let blade = 0; blade < 3; blade++) {
      const angle = turn + (blade * 2 * Math.PI) / 3 - Math.PI / 2;
      line(ctx, 0.15, hub, [hub[0] + 0.52 * Math.cos(angle), hub[1] + 0.52 * Math.sin(angle)]);
    }
    ctx.beginPath();
    ctx.arc(hub[0], hub[1], 0.11, 0, 2 * Math.PI);
    ctx.fill();
  },
  // A panel of six cells on a stand.
  solar(ctx) {
    ctx.lineWidth = 0.11;
    ctx.strokeRect(-0.56, -0.44, 1.12, 0.7);
    line(ctx, 0.08, [-0.19, -0.44], [-0.19, 0.26]);
    line(ctx, 0.08, [0.19, -0.44], [0.19, 0.26]);
    line(ctx, 0.08, [-0.56, -0.09], [0.56, -0.09]);
    line(ctx, 0.11, [0, 0.26], [0, 0.56]);
    line(ctx, 0.11, [-0.26, 0.56], [0.26, 0.56]);
  },
  // A battery, part charged.
  battery(ctx) {
    ctx.lineWidth = 0.12;
    ctx.strokeRect(-0.34, -0.42, 0.68, 1.02);
    ctx.fillRect(-0.15, -0.62, 0.3, 0.2);
    ctx.fillRect(-0.2, 0.02, 0.4, 0.44);
  },
  // A water drop, for hydro and pumped storage.
  hydro(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, -0.64);
    ctx.bezierCurveTo(0.2, -0.3, 0.46, -0.02, 0.46, 0.2);
    ctx.arc(0, 0.2, 0.46, 0, Math.PI);
    ctx.bezierCurveTo(-0.46, -0.02, -0.2, -0.3, 0, -0.64);
    ctx.fill();
  },
  // Two waves, for tidal and wave power.
  tidal(ctx) {
    for (const y of [-0.2, 0.26]) {
      ctx.beginPath();
      ctx.moveTo(-0.6, y);
      ctx.quadraticCurveTo(-0.45, y - 0.3, -0.3, y);
      ctx.quadraticCurveTo(-0.15, y + 0.3, 0, y);
      ctx.quadraticCurveTo(0.15, y - 0.3, 0.3, y);
      ctx.quadraticCurveTo(0.45, y + 0.3, 0.6, y);
      ctx.lineWidth = 0.14;
      ctx.stroke();
    }
  },
  hydrogen(ctx) {
    line(ctx, 0.17, [-0.3, -0.46], [-0.3, 0.46]);
    line(ctx, 0.17, [0.3, -0.46], [0.3, 0.46]);
    line(ctx, 0.17, [-0.3, 0], [0.3, 0]);
  },
  // Two-way arrows: power flows both ways.
  interconnector(ctx) {
    line(ctx, 0.13, [-0.5, -0.24], [0.5, -0.24]);
    line(ctx, 0.13, [0.26, -0.48], [0.5, -0.24], [0.26, 0]);
    line(ctx, 0.13, [0.5, 0.26], [-0.5, 0.26]);
    line(ctx, 0.13, [-0.26, 0.02], [-0.5, 0.26], [-0.26, 0.5]);
  },
};
