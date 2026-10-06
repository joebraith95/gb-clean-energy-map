// Map extent, fixed zoom levels and the pixel maths that keeps every cell an integer number of
// physical screen pixels. All map coordinates are British National Grid (EPSG:27700) metres.

export const EXTENT = { minX: 0, minY: 0, maxX: 760_000, maxY: 1_230_000 } as const;

export interface ZoomLevel {
  /** Size of one map cell in metres. */
  cellMetres: number;
  /** Physical pixels per cell, as a multiple of the national view's fitted scale. */
  scaleFactor: number;
  /** Smallest capacity (MW) drawn at this level, so the national view shows larger projects only. */
  minMw: number;
}

// Draft values: national, regional, local.
export const ZOOM_LEVELS: readonly ZoomLevel[] = [
  { cellMetres: 4000, scaleFactor: 1, minMw: 30 },
  { cellMetres: 2000, scaleFactor: 1, minMw: 5 },
  { cellMetres: 1000, scaleFactor: 1.5, minMw: 0 },
];

export function gridSize(level: ZoomLevel): { cols: number; rows: number } {
  return {
    cols: Math.ceil((EXTENT.maxX - EXTENT.minX) / level.cellMetres),
    rows: Math.ceil((EXTENT.maxY - EXTENT.minY) / level.cellMetres),
  };
}

/** Grid cell for a BNG point. Row 0 is the northern edge, so rows run down the screen. */
export function bngToCell(x: number, y: number, level: ZoomLevel): { col: number; row: number } {
  return {
    col: Math.floor((x - EXTENT.minX) / level.cellMetres),
    row: Math.floor((EXTENT.maxY - y) / level.cellMetres),
  };
}

/**
 * Physical pixels per cell for the national view: the largest integer that fits the whole map
 * in the viewport, and never less than 1.
 */
export function nationalScale(viewWidth: number, viewHeight: number, dpr: number): number {
  const { cols, rows } = gridSize(ZOOM_LEVELS[0]);
  return Math.max(1, Math.floor(Math.min((viewWidth * dpr) / cols, (viewHeight * dpr) / rows)));
}

/** Integer physical pixels per cell at a level. */
export function physicalScale(level: ZoomLevel, national: number): number {
  return Math.max(1, Math.round(national * level.scaleFactor));
}

/** Rounds a CSS pixel value to the nearest whole physical pixel. */
export function snap(value: number, dpr: number): number {
  return Math.round(value * dpr) / dpr;
}

/**
 * Map offset (CSS px) that keeps a BNG point under a screen point after a zoom.
 * `cssPerCell` is the new level's scale in CSS pixels.
 */
export function anchorOffset(
  screen: { x: number; y: number },
  bng: { x: number; y: number },
  level: ZoomLevel,
  cssPerCell: number,
): { x: number; y: number } {
  return {
    x: screen.x - ((bng.x - EXTENT.minX) / level.cellMetres) * cssPerCell,
    y: screen.y - ((EXTENT.maxY - bng.y) / level.cellMetres) * cssPerCell,
  };
}

/** BNG point under a screen point. */
export function screenToBng(
  screen: { x: number; y: number },
  offset: { x: number; y: number },
  level: ZoomLevel,
  cssPerCell: number,
): { x: number; y: number } {
  return {
    x: EXTENT.minX + ((screen.x - offset.x) / cssPerCell) * level.cellMetres,
    y: EXTENT.maxY - ((screen.y - offset.y) / cssPerCell) * level.cellMetres,
  };
}

/**
 * Keeps the map on screen along one axis. A map smaller than the view is centred; a larger
 * one can be panned until its edge meets the view's edge.
 */
export function clampAxis(offset: number, mapSize: number, viewSize: number): number {
  if (mapSize <= viewSize) return (viewSize - mapSize) / 2;
  return Math.min(0, Math.max(viewSize - mapSize, offset));
}
