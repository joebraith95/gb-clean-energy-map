// Map extent, fixed zoom levels and the pixel maths that keeps every cell an integer number of
// physical screen pixels. All map coordinates are British National Grid (EPSG:27700) metres.

export const EXTENT = { minX: 0, minY: 0, maxX: 760_000, maxY: 1_230_000 } as const;

export interface ZoomLevel {
  /** Size of the grid that places markers, in metres. */
  cellMetres: number;
  /**
   * Size of the land texture's cells, in metres: the finest land grid is 500m, so deeper levels
   * draw it with bigger pixels. Always a whole multiple of cellMetres.
   */
  landMetres: number;
  /** Physical pixels per cell, as a multiple of the national view's fitted scale. */
  scaleFactor: number;
  /** Smallest capacity (MW) drawn at this level, so the national view shows larger projects only. */
  minMw: number;
  /** Draw the phases of one project as a single marker. */
  clusterPhases: boolean;
}

// Seven fixed levels; each roughly doubles the detail of the one before.
export const ZOOM_LEVELS: readonly ZoomLevel[] = [
  { cellMetres: 4000, landMetres: 4000, scaleFactor: 1, minMw: 50, clusterPhases: true },
  { cellMetres: 2000, landMetres: 2000, scaleFactor: 1, minMw: 5, clusterPhases: false },
  { cellMetres: 1000, landMetres: 1000, scaleFactor: 1.5, minMw: 0, clusterPhases: false },
  { cellMetres: 500, landMetres: 500, scaleFactor: 1.5, minMw: 0, clusterPhases: false },
  { cellMetres: 250, landMetres: 500, scaleFactor: 1.5, minMw: 0, clusterPhases: false },
  { cellMetres: 125, landMetres: 500, scaleFactor: 1.5, minMw: 0, clusterPhases: false },
  { cellMetres: 62.5, landMetres: 500, scaleFactor: 1.5, minMw: 0, clusterPhases: false },
];

/** Names for the zoom readout, one per level. */
export const LEVEL_NAMES = ['National', 'Regional', 'Local', 'District', 'Town', 'Village', 'Site'];

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

/** Parts of the view covered by panels (CSS px from each edge). */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Keeps the map in the visible part of one axis: the view minus the space covered at its
 * start and end. A map smaller than that space is centred in it; a larger one can be panned
 * until its edge meets the edge of the visible space, so every point can be brought into view.
 */
export function clampAxis(
  offset: number,
  mapSize: number,
  viewSize: number,
  coveredStart = 0,
  coveredEnd = 0,
): number {
  const visible = viewSize - coveredStart - coveredEnd;
  if (mapSize <= visible) return coveredStart + (visible - mapSize) / 2;
  return Math.min(coveredStart, Math.max(viewSize - coveredEnd - mapSize, offset));
}
