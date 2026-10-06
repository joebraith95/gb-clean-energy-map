// Map extent and fixed zoom levels, in British National Grid (EPSG:27700) metres.

export const EXTENT = { minX: 0, minY: 0, maxX: 760_000, maxY: 1_230_000 } as const;

export interface ZoomLevel {
  /** Size of one map cell in metres. */
  cellMetres: number;
  /** Integer screen pixels per cell. */
  scale: number;
}

// Draft values, tuned in phase 1 step 3.
export const ZOOM_LEVELS: readonly ZoomLevel[] = [
  { cellMetres: 4000, scale: 2 },
  { cellMetres: 2000, scale: 2 },
  { cellMetres: 1000, scale: 3 },
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
