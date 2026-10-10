// Zoom bands: the map zooms smoothly, and each band decides which projects are drawn.

export interface ZoomBand {
  /** Shown in the zoom readout. */
  name: string;
  /** Map zoom at which the band starts. */
  minZoom: number;
  /** Smallest capacity (MW) drawn in this band, so the national view shows larger projects only. */
  minMw: number;
  /** Draw the phases of one project as a single marker. */
  clusterPhases: boolean;
}

// Seven bands from the whole of Great Britain down to a single site.
export const ZOOM_BANDS: readonly ZoomBand[] = [
  { name: 'National', minZoom: 0, minMw: 50, clusterPhases: true },
  { name: 'Regional', minZoom: 6.5, minMw: 5, clusterPhases: false },
  { name: 'Local', minZoom: 8, minMw: 0, clusterPhases: false },
  { name: 'District', minZoom: 9.5, minMw: 0, clusterPhases: false },
  { name: 'Town', minZoom: 11, minMw: 0, clusterPhases: false },
  { name: 'Village', minZoom: 12.5, minMw: 0, clusterPhases: false },
  { name: 'Site', minZoom: 14, minMw: 0, clusterPhases: false },
];

export const MIN_ZOOM = 4;
/** The imagery is 10 metres a pixel, so there is nothing more to see beyond this. */
export const MAX_ZOOM = 15;

/**
 * The area the map opens on, as [west, south, east, north] in degrees: Scilly to Shetland, and
 * east past the Dogger Bank wind farms.
 */
export const GB_BOUNDS: [number, number, number, number] = [-8.2, 49.8, 3.2, 60.9];

/** Index of the band a map zoom falls in. */
export function bandIndex(zoom: number): number {
  let index = 0;
  for (let i = 1; i < ZOOM_BANDS.length; i++) {
    if (zoom >= ZOOM_BANDS[i].minZoom) index = i;
  }
  return index;
}

/** Parts of the view covered by panels (CSS px from each edge). */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
