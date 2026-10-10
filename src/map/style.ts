// The map style: satellite imagery, region lines, place names, and the (initially empty) layers
// the project data is drawn into. Everything here is static; MapView fills in the data.

import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { dataUrl } from '../config';
import { mapColours, palette } from '../theme/tokens';
import { DASH, GAP } from './cables';
import { IMAGERY_YEAR } from './imagery';

const IMAGERY_TILES = `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${IMAGERY_YEAR}_3857/default/g/{z}/{y}/{x}.jpg`;
/** Deepest zoom with real detail (10 metres a pixel); beyond it the map enlarges these tiles. */
const IMAGERY_MAX_ZOOM = 14;

// Place names: OpenStreetMap data as vector tiles from OpenFreeMap, which needs no key.
const PLACES_TILEJSON = 'https://tiles.openfreemap.org/planet';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const REGULAR = ['Noto Sans Regular'];
const BOLD = ['Noto Sans Bold'];

/** Layer ids MapView refers to. */
export const LAYERS = {
  markers: 'markers',
  selection: 'selection',
  cablesOut: 'cables-out',
  cablesIn: 'cables-in',
  regions: ['region-casing', 'region-lines', 'region-names'],
  dno: ['dno-casing', 'dno-lines', 'dno-names'],
} as const;

export const SOURCES = { markers: 'markers', selection: 'selection', cables: 'cables' } as const;

const EMPTY = { type: 'FeatureCollection' as const, features: [] };

/** Markers shrink a little on the national view, where they are closest together. */
const SCALE_STOPS = { fromZoom: 4, fromScale: 0.42, toZoom: 7.5, toScale: 1 };
const MARKER_SCALE: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  SCALE_STOPS.fromZoom,
  SCALE_STOPS.fromScale,
  SCALE_STOPS.toZoom,
  SCALE_STOPS.toScale,
];

/** The size markers (and their offsets) are drawn at, as a share of full size. */
export function markerScale(zoom: number): number {
  const { fromZoom, fromScale, toZoom, toScale } = SCALE_STOPS;
  const t = Math.max(0, Math.min(1, (zoom - fromZoom) / (toZoom - fromZoom)));
  return fromScale + t * (toScale - fromScale);
}
/** Largest offset (CSS px) a marker can be given to fan out a shared substation. */
const MAX_OFFSET = 2000;
/**
 * Reads a marker's pixel offset from its `dx` and `dy` properties. Feature properties cannot hold
 * arrays, so the pair is rebuilt by interpolating between the four corners of a square.
 */
const MARKER_OFFSET: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['get', 'dx'],
  -MAX_OFFSET,
  [
    'interpolate',
    ['linear'],
    ['get', 'dy'],
    -MAX_OFFSET,
    ['literal', [-MAX_OFFSET, -MAX_OFFSET]],
    MAX_OFFSET,
    ['literal', [-MAX_OFFSET, MAX_OFFSET]],
  ],
  MAX_OFFSET,
  [
    'interpolate',
    ['linear'],
    ['get', 'dy'],
    -MAX_OFFSET,
    ['literal', [MAX_OFFSET, -MAX_OFFSET]],
    MAX_OFFSET,
    ['literal', [MAX_OFFSET, MAX_OFFSET]],
  ],
];

const NAME: ExpressionSpecification = ['coalesce', ['get', 'name:en'], ['get', 'name']];

function placeNames(
  id: string,
  classes: string[],
  minzoom: number,
  sizes: [number, number, number, number],
  font: string[],
): LayerSpecification {
  return {
    id,
    type: 'symbol',
    source: 'places',
    'source-layer': 'place',
    minzoom,
    filter: ['in', ['get', 'class'], ['literal', classes]],
    layout: {
      'text-field': NAME,
      'text-font': font,
      'text-size': ['interpolate', ['linear'], ['zoom'], sizes[0], sizes[1], sizes[2], sizes[3]],
      'text-max-width': 8,
      // More important places (lower rank) claim their space first.
      'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
      'text-padding': 4,
    },
    paint: {
      'text-color': mapColours.placeName,
      'text-halo-color': mapColours.casing,
      'text-halo-width': 1.4,
      'text-halo-blur': 0.4,
    },
  };
}

function boundaryLayers(
  kind: 'region' | 'dno',
  colour: string,
  dashed: boolean,
): LayerSpecification[] {
  const lines: ExpressionSpecification = [
    'all',
    ['==', ['get', 'kind'], kind],
    ['==', ['geometry-type'], 'LineString'],
  ];
  const width: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 5, 1.1, 10, 2.2];
  return [
    {
      id: `${kind}-casing`,
      type: 'line',
      source: 'boundaries',
      filter: lines,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': mapColours.casing,
        'line-opacity': 0.55,
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3, 10, 5],
      },
    },
    {
      id: `${kind}-lines`,
      type: 'line',
      source: 'boundaries',
      filter: lines,
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': colour,
        'line-opacity': 0.9,
        'line-width': width,
        ...(dashed ? { 'line-dasharray': [3, 2.5] } : {}),
      },
    },
  ];
}

function boundaryNames(
  kind: 'region' | 'dno',
  colour: string,
  minzoom: number,
): LayerSpecification {
  return {
    id: `${kind}-names`,
    type: 'symbol',
    source: 'boundaries',
    minzoom,
    maxzoom: 9,
    filter: ['all', ['==', ['get', 'kind'], kind], ['==', ['geometry-type'], 'Point']],
    layout: {
      'text-field': ['upcase', ['get', 'name']],
      'text-font': BOLD,
      'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 9, 14],
      'text-letter-spacing': 0.12,
      'text-max-width': 7,
      'text-padding': 6,
    },
    paint: {
      'text-color': colour,
      'text-opacity': 0.9,
      'text-halo-color': mapColours.casing,
      'text-halo-width': 1.4,
    },
  };
}

function cableLayer(id: string, direction: -1 | 0 | 1): LayerSpecification {
  return {
    id,
    type: 'line',
    source: SOURCES.cables,
    filter: ['==', ['get', 'direction'], direction],
    paint: {
      'line-color': ['get', 'colour'],
      'line-width': 2.5,
      'line-dasharray': [DASH, GAP],
    },
  };
}

function markerLayer(id: string, source: string): LayerSpecification {
  return {
    id,
    type: 'symbol',
    source,
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': MARKER_SCALE,
      'icon-offset': MARKER_OFFSET,
      // Every project is drawn, however close its neighbours, and never hides a place name.
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      // Larger projects on top.
      'symbol-sort-key': ['get', 'mw'],
    },
  };
}

export function mapStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    // Dash patterns step rather than cross-fade, so moving cables stay crisp.
    transition: { duration: 0, delay: 0 },
    sources: {
      imagery: {
        type: 'raster',
        tiles: [IMAGERY_TILES],
        tileSize: 256,
        maxzoom: IMAGERY_MAX_ZOOM,
      },
      places: { type: 'vector', url: PLACES_TILEJSON },
      // An absolute address, because the map loads this file from its worker.
      boundaries: {
        type: 'geojson',
        data: new URL(dataUrl('boundaries.json'), window.location.href).href,
      },
      [SOURCES.cables]: { type: 'geojson', data: EMPTY },
      [SOURCES.markers]: { type: 'geojson', data: EMPTY },
      [SOURCES.selection]: { type: 'geojson', data: EMPTY },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': palette.sea } },
      { id: 'imagery', type: 'raster', source: 'imagery' },
      ...boundaryLayers('dno', mapColours.dnoLine, true),
      ...boundaryLayers('region', mapColours.regionLine, false),
      {
        id: 'cable-casing',
        type: 'line',
        source: SOURCES.cables,
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': mapColours.casing, 'line-opacity': 0.6, 'line-width': 5 },
      },
      cableLayer('cables-still', 0),
      cableLayer(LAYERS.cablesOut, 1),
      cableLayer(LAYERS.cablesIn, -1),
      // Names: later layers claim their space first, so cities win over area names.
      boundaryNames('dno', mapColours.dnoLine, 6),
      boundaryNames('region', mapColours.regionLine, 5.5),
      placeNames(
        'place-hamlets',
        ['hamlet', 'isolated_dwelling'],
        12.5,
        [12.5, 10, 15, 13],
        REGULAR,
      ),
      placeNames(
        'place-suburbs',
        ['suburb', 'quarter', 'neighbourhood'],
        11,
        [11, 10, 15, 13],
        REGULAR,
      ),
      placeNames('place-villages', ['village'], 9.5, [9.5, 10, 15, 15], REGULAR),
      placeNames('place-towns', ['town'], 7, [7, 11, 14, 18], REGULAR),
      placeNames('place-cities', ['city'], 4, [4, 11, 12, 22], BOLD),
      markerLayer(LAYERS.markers, SOURCES.markers),
      markerLayer(LAYERS.selection, SOURCES.selection),
    ],
  };
}
