// The MapLibre map: satellite imagery, region lines and place names, with project markers,
// interconnector cables and event effects drawn over them.
// Project data stays in British National Grid; positions are converted as they are drawn.

import {
  Map as MapLibreMap,
  Marker as MapMarker,
  type GeoJSONSource,
  type PointLike,
  type StyleImageInterface,
  setWorkerUrl,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre finds its worker script relative to its own file, which a bundled build moves, so the
// bundler is asked for the worker's address instead.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { Interconnector } from '../data/interconnectors';
import type { ProjectIndex } from '../data/projects';
import { stageColours, type Stage } from '../theme/tokens';
import {
  EFFECT_MS,
  STAGGER_MS,
  STILL_MS,
  pickOnLoad,
  type EffectKind,
  type EventCandidate,
} from './animations';
import { bngToLonLat } from './bng';
import { dashPattern, pulseDirection } from './cables';
import { drawBadge, drawDot, drawSelection, selectionSize } from './icons';
import { TECH_KINDS, type TechKind } from './kinds';
import {
  GB_BOUNDS,
  MAX_ZOOM,
  MIN_ZOOM,
  NO_INSETS,
  ZOOM_BANDS,
  bandIndex,
  type Insets,
} from './levels';
import {
  FIRST_BADGE_TIER,
  MARKER_SIZES,
  buildLinkMarkers,
  buildMarkers,
  sameSelection,
  spreadOffset,
  type Marker,
  type Selection,
} from './markers';
import { LAYERS, SOURCES, mapStyle, markerScale } from './style';

setWorkerUrl(workerUrl);

/** How far the map can be panned, as [west, south, east, north]: GB and its neighbours. */
const MAX_BOUNDS: [number, number, number, number] = [-32, 38, 28, 70];
/** Space left around Great Britain when the map opens (CSS px). */
const FIT_PADDING = 16;
/** Extra reach (CSS px) around small markers so they are easy to tap. */
const TAP_REACH = 8;
/** Time between animation steps: cable dashes move and turbine blades turn (ms). */
const TICK_MS = 120;
/** Time for a turbine's blades to turn once (ms). */
const TURN_MS = 5000;
/** Space kept between a revealed marker and the edge of the visible map (CSS px). */
const REVEAL_MARGIN = 32;

/** What an effect plays on: the selection and its stage colour. */
export interface EffectTarget {
  selection: Selection;
  colour: string;
}

/** Which sets of region lines are drawn. */
export interface LineChoice {
  regions: boolean;
  dno: boolean;
}

export interface MapViewEvents {
  onSelect: (selection: Selection | null) => void;
  /** The zoom band changed, or the map reached or left the end of its zoom range. */
  onZoomChange: (zoom: { band: number; canZoomIn: boolean; canZoomOut: boolean }) => void;
}

interface Point {
  x: number;
  y: number;
}

interface Drawn extends Marker {
  lonLat: [number, number];
  offset: [number, number];
}

function iconName(marker: { kind: TechKind; stage: Stage; tier: number }): string {
  return marker.tier < FIRST_BADGE_TIER
    ? `dot-${marker.stage}-${marker.tier}`
    : `${marker.kind}-${marker.stage}-${marker.tier}`;
}

function pointFeature(marker: Drawn, icon: string) {
  return {
    type: 'Feature' as const,
    properties: { icon, mw: marker.mw, dx: marker.offset[0], dy: marker.offset[1] },
    geometry: { type: 'Point' as const, coordinates: marker.lonLat },
  };
}

/** A turbine badge whose blades turn: the map redraws it whenever `turn` has changed. */
class TurningBadge implements StyleImageInterface {
  readonly width: number;
  readonly height: number;
  data: Uint8ClampedArray;
  private readonly context: CanvasRenderingContext2D;
  private drawn = -1;
  turn = 0;

  constructor(
    private readonly size: number,
    private readonly scale: number,
    private readonly stage: Stage,
  ) {
    this.width = this.height = size * scale;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = this.width;
    this.context = canvas.getContext('2d', { willReadFrequently: true })!;
    this.data = new Uint8ClampedArray(this.width * this.height * 4);
    this.render();
  }

  render(): boolean {
    if (this.turn === this.drawn) return false;
    this.drawn = this.turn;
    drawBadge(this.context, this.size, this.scale, 'wind', this.stage, this.turn);
    this.data = this.context.getImageData(0, 0, this.width, this.height).data;
    return true;
  }
}

export class MapView {
  private readonly map: MapLibreMap;
  private readonly motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly turbineImages: TurningBadge[] = [];
  private readonly effects = new Set<{ marker: MapMarker; timer: number }>();
  private tickTimer: number | undefined;
  private pulseStep = 0;
  private ready = false;
  private destroyed = false;

  private band: number;
  private insets: Insets = NO_INSETS;
  private markers: Drawn[] = [];
  private hasTurbines = false;
  private hasMovingCables = false;
  /** Live interconnector flows in MW (positive means importing), or null when unknown. */
  private flows: Record<string, number> | null = null;
  private lines: LineChoice = { regions: true, dno: true };
  private selected: Selection | null = null;
  private include: (index: number) => boolean = () => true;
  private includeLink: (index: number) => boolean = () => true;
  private zoomState = '';
  /** True while the map still shows its opening view of the whole of Great Britain. */
  private fitted = true;
  /** Removes listeners on the host element, which outlives this view. */
  private readonly hostListeners = new AbortController();

  private constructor(
    host: HTMLElement,
    private readonly projects: ProjectIndex,
    private readonly links: Interconnector[],
    private readonly events: MapViewEvents,
    label: string,
  ) {
    this.map = new MapLibreMap({
      container: host,
      style: mapStyle(),
      bounds: GB_BOUNDS,
      fitBoundsOptions: { padding: FIT_PADDING },
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      maxBounds: MAX_BOUNDS,
      // North stays up: the map is flat and never rotates or tilts.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      renderWorldCopies: false,
      // Sources are credited in the map's own credit line and on the About page.
      attributionControl: false,
    });
    this.map.touchZoomRotate.disableRotation();
    this.map.keyboard.disableRotation();
    this.map.getCanvas().setAttribute('aria-label', label);
    this.band = bandIndex(this.map.getZoom());
  }

  static create(
    host: HTMLElement,
    projects: ProjectIndex,
    links: Interconnector[],
    events: MapViewEvents,
    label: string,
  ): Promise<MapView> {
    const view = new MapView(host, projects, links, events, label);
    return new Promise((resolve) => {
      view.map.once('style.load', () => {
        if (!view.destroyed) view.init(host);
        resolve(view);
      });
    });
  }

  private init(host: HTMLElement): void {
    this.addImages();
    this.ready = true;
    this.applyLines();
    this.drawMarkers();
    this.reportZoom();

    this.map.on('zoom', () => {
      const band = bandIndex(this.map.getZoom());
      if (band !== this.band) {
        const before = ZOOM_BANDS[this.band];
        const after = ZOOM_BANDS[band];
        this.band = band;
        if (before.minMw !== after.minMw || before.clusterPhases !== after.clusterPhases) {
          this.drawMarkers();
        }
      }
      this.reportZoom();
    });
    // Until the viewer moves the map, it keeps the whole of Great Britain in view at any size.
    const stopFitting = () => {
      this.fitted = false;
    };
    for (const gesture of ['dragstart', 'wheel', 'touchstart'] as const) {
      this.map.on(gesture, stopFitting);
    }
    host.addEventListener('keydown', stopFitting, { signal: this.hostListeners.signal });
    this.map.on('resize', () => {
      if (this.fitted) this.map.fitBounds(GB_BOUNDS, { padding: FIT_PADDING, animate: false });
    });
    this.map.on('click', (event) => this.select(this.markerAt(event.point)));
    this.map.on('mouseenter', LAYERS.markers, () => {
      this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', LAYERS.markers, () => {
      this.map.getCanvas().style.cursor = '';
    });
    host.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') this.select(null);
      },
      { signal: this.hostListeners.signal },
    );
    this.tickTimer = window.setInterval(() => this.tick(), TICK_MS);
  }

  destroy(): void {
    this.destroyed = true;
    this.hostListeners.abort();
    window.clearInterval(this.tickTimer);
    for (const effect of this.effects) window.clearTimeout(effect.timer);
    this.map.remove();
  }

  /** Marker images for every stage, size and technology, at the screen's pixel density. */
  private addImages(): void {
    const scale = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const add = (name: string, size: number, draw: () => void) => {
      canvas.width = canvas.height = size * scale;
      draw();
      this.map.addImage(name, context.getImageData(0, 0, canvas.width, canvas.height), {
        pixelRatio: scale,
      });
    };
    MARKER_SIZES.forEach((size, tier) => {
      add(`selection-${tier}`, selectionSize(size), () => drawSelection(context, size, scale));
      for (const stage of Object.keys(stageColours) as Stage[]) {
        if (tier < FIRST_BADGE_TIER) {
          add(`dot-${stage}-${tier}`, size, () => drawDot(context, size, scale, stage));
          continue;
        }
        for (const kind of TECH_KINDS) {
          const name = iconName({ kind, stage, tier });
          // Only operational turbines turn, as they are the ones generating.
          if (kind === 'wind' && stage === 'operational') {
            const image = new TurningBadge(size, scale, stage);
            this.turbineImages.push(image);
            this.map.addImage(name, image, { pixelRatio: scale });
          } else {
            add(name, size, () => drawBadge(context, size, scale, kind, stage));
          }
        }
      }
    });
  }

  /**
   * Moves the dashes along cables that are carrying power and turns the blades of operational
   * turbines, unless the viewer prefers reduced motion.
   */
  private tick(): void {
    if (this.motionQuery.matches || document.visibilityState !== 'visible') return;
    if (this.hasMovingCables) {
      this.pulseStep += 1;
      this.map.setPaintProperty(LAYERS.cablesOut, 'line-dasharray', dashPattern(this.pulseStep));
      this.map.setPaintProperty(LAYERS.cablesIn, 'line-dasharray', dashPattern(-this.pulseStep));
    }
    if (this.hasTurbines) {
      const turn = ((performance.now() % TURN_MS) / TURN_MS) * 2 * Math.PI;
      for (const image of this.turbineImages) image.turn = turn;
      this.map.triggerRepaint();
    }
  }

  zoomIn(): void {
    this.fitted = false;
    this.map.zoomIn();
  }

  zoomOut(): void {
    this.fitted = false;
    this.map.zoomOut();
  }

  private reportZoom(): void {
    const zoom = this.map.getZoom();
    const state = {
      band: this.band,
      canZoomIn: zoom < this.map.getMaxZoom() - 0.01,
      canZoomOut: zoom > this.map.getMinZoom() + 0.01,
    };
    const key = JSON.stringify(state);
    if (key === this.zoomState) return;
    this.zoomState = key;
    this.events.onZoomChange(state);
  }

  /** Live interconnector flows; cables pulse inwards for imports and outwards for exports. */
  setFlows(flows: Record<string, number> | null): void {
    this.flows = flows;
    this.drawCables();
  }

  /** Redraws markers with new filters, for example from the filter panel. */
  setFilter(include: (index: number) => boolean, includeLink: (index: number) => boolean): void {
    this.include = include;
    this.includeLink = includeLink;
    this.drawMarkers();
  }

  /** Shows or hides each set of region lines, with its names. */
  setLines(lines: LineChoice): void {
    this.lines = lines;
    this.applyLines();
  }

  private applyLines(): void {
    if (!this.ready) return;
    const show = (layers: readonly string[], visible: boolean) => {
      for (const layer of layers) {
        this.map.setLayoutProperty(layer, 'visibility', visible ? 'visible' : 'none');
      }
    };
    show(LAYERS.regions, this.lines.regions);
    show(LAYERS.dno, this.lines.dno);
  }

  /**
   * Shows a selection made outside the map (for example from a card link) without raising
   * onSelect, and pans to the marker if it is drawn but off screen.
   */
  showSelection(selection: Selection | null): void {
    if (sameSelection(selection, this.selected)) return;
    this.selected = selection;
    this.drawSelected();
    this.revealSelected();
  }

  /**
   * Tells the map which parts of it are covered by the card or filter panel, so it can keep the
   * selection in the uncovered part.
   */
  setInsets(insets: Insets): void {
    this.insets = insets;
    this.revealSelected();
  }

  /**
   * Plays the opening sequence: recent qualifying events visible at the current zoom, largest
   * first, staggered. Events whose marker is not drawn or is covered are skipped.
   */
  playOnLoad(candidates: EventCandidate<EffectTarget>[]): void {
    const picked = pickOnLoad(candidates, (target) => this.isOnScreen(target.selection));
    picked.forEach((c, i) => {
      const marker = this.find(c.target.selection);
      if (marker) this.addEffect(marker, c.kind, c.target.colour, i * STAGGER_MS);
    });
  }

  /**
   * Shows an event picked in the feed: if the marker is not drawn at this zoom because of the
   * band's capacity floor, zooms in to the first band that draws it, then plays the effect (if
   * the event has one).
   */
  playEvent(selection: Selection, kind: EffectKind | null, colour: string): void {
    let marker = this.find(selection);
    if (!marker) {
      for (let band = this.band + 1; band < ZOOM_BANDS.length && !marker; band++) {
        marker = this.build(band).find((m) => sameSelection(m, selection));
        if (marker) {
          this.fitted = false;
          this.map.jumpTo({ center: marker.lonLat, zoom: ZOOM_BANDS[band].minZoom });
          this.revealSelected();
        }
      }
    }
    if (marker && kind) this.addEffect(marker, kind, colour, 0);
  }

  select(selection: Selection | null): void {
    this.selected = selection;
    this.drawSelected();
    this.events.onSelect(selection);
  }

  private find(selection: Selection | null): Drawn | undefined {
    return this.markers.find((m) => sameSelection(m, selection));
  }

  /** Where a marker's centre is drawn, in CSS px from the map's top-left corner. */
  private screenPoint(marker: Drawn): Point {
    const point = this.map.project(marker.lonLat);
    const scale = markerScale(this.map.getZoom());
    return { x: point.x + marker.offset[0] * scale, y: point.y + marker.offset[1] * scale };
  }

  /** The part of the view not covered by panels, in CSS px. */
  private get visibleArea(): { left: number; top: number; right: number; bottom: number } {
    const canvas = this.map.getContainer();
    return {
      left: this.insets.left,
      top: this.insets.top,
      right: canvas.clientWidth - this.insets.right,
      bottom: canvas.clientHeight - this.insets.bottom,
    };
  }

  private isOnScreen(selection: Selection): boolean {
    const marker = this.find(selection);
    if (!marker) return false;
    const { x, y } = this.screenPoint(marker);
    const area = this.visibleArea;
    return x >= area.left && x <= area.right && y >= area.top && y <= area.bottom;
  }

  /** Pans the selected marker into the uncovered part of the map if it is hidden or near an edge. */
  private revealSelected(): void {
    const marker = this.find(this.selected);
    if (!marker) return;
    const { x, y } = this.screenPoint(marker);
    const area = this.visibleArea;
    const hidden =
      x < area.left + REVEAL_MARGIN ||
      y < area.top + REVEAL_MARGIN ||
      x > area.right - REVEAL_MARGIN ||
      y > area.bottom - REVEAL_MARGIN;
    if (!hidden) return;
    this.fitted = false;
    this.map.panBy([x - (area.left + area.right) / 2, y - (area.top + area.bottom) / 2], {
      duration: this.motionQuery.matches ? 0 : 300,
    });
  }

  /** Plays an effect around a marker, in the new stage's colour, after `delay` ms. */
  private addEffect(marker: Drawn, kind: EffectKind, colour: string, delay: number): void {
    const element = document.createElement('div');
    const size = MARKER_SIZES[marker.tier];
    element.className = `map-effect map-effect-${kind.replaceAll('_', '-')}`;
    element.style.setProperty('--effect-colour', colour);
    element.style.setProperty('--effect-size', `${size}px`);
    element.style.setProperty('--effect-delay', `${delay}ms`);
    const effect = {
      marker: new MapMarker({ element, offset: marker.offset as PointLike })
        .setLngLat(marker.lonLat)
        .addTo(this.map),
      timer: window.setTimeout(
        () => {
          effect.marker.remove();
          this.effects.delete(effect);
        },
        delay + (this.motionQuery.matches ? STILL_MS : EFFECT_MS),
      ),
    };
    this.effects.add(effect);
  }

  /** Markers for a zoom band, with their map positions. */
  private build(band: number): Drawn[] {
    return buildMarkers(this.projects, ZOOM_BANDS[band], this.include)
      .concat(buildLinkMarkers(this.links, ZOOM_BANDS[band], this.includeLink))
      .map((marker) => ({
        ...marker,
        lonLat: bngToLonLat(marker.x, marker.y),
        offset: spreadOffset(marker),
      }));
  }

  private drawMarkers(): void {
    if (!this.ready) return;
    this.markers = this.build(this.band);
    this.hasTurbines = this.markers.some(
      (m) => m.kind === 'wind' && m.stage === 'operational' && m.tier >= FIRST_BADGE_TIER,
    );
    this.source(SOURCES.markers).setData({
      type: 'FeatureCollection',
      features: this.markers.map((marker) => pointFeature(marker, iconName(marker))),
    });
    this.drawCables();
    this.drawSelected();
  }

  /** Dashed cables from each landing point to the partner end, in the stage's colour. */
  private drawCables(): void {
    if (!this.ready) return;
    const features = this.links.flatMap((link, i) => {
      if (!link.gbEnd || !link.partnerEnd || !link.stage || !this.includeLink(i)) return [];
      return [
        {
          type: 'Feature' as const,
          properties: {
            colour: stageColours[link.stage],
            direction: pulseDirection(link.stage, this.flows?.[link.id]),
          },
          geometry: {
            type: 'LineString' as const,
            coordinates: [
              bngToLonLat(link.gbEnd.x, link.gbEnd.y),
              bngToLonLat(link.partnerEnd.x, link.partnerEnd.y),
            ],
          },
        },
      ];
    });
    this.hasMovingCables = features.some((f) => f.properties.direction !== 0);
    this.source(SOURCES.cables).setData({ type: 'FeatureCollection', features });
  }

  private drawSelected(): void {
    if (!this.ready) return;
    const marker = this.find(this.selected);
    this.source(SOURCES.selection).setData({
      type: 'FeatureCollection',
      features: marker ? [pointFeature(marker, `selection-${marker.tier}`)] : [],
    });
  }

  private source(id: string): GeoJSONSource {
    return this.map.getSource(id) as GeoJSONSource;
  }

  /** The marker nearest a screen point, if one is within reach. */
  private markerAt(screen: Point): Selection | null {
    let best: Drawn | null = null;
    let bestDistance = Infinity;
    const scale = markerScale(this.map.getZoom());
    // Markers are sorted smallest first, so on a tie the one drawn on top wins.
    for (const marker of this.markers) {
      const centre = this.screenPoint(marker);
      const reach = Math.max((MARKER_SIZES[marker.tier] * scale) / 2, TAP_REACH);
      const dx = Math.abs(screen.x - centre.x);
      const dy = Math.abs(screen.y - centre.y);
      if (dx > reach || dy > reach) continue;
      const distance = dx * dx + dy * dy;
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = marker;
      }
    }
    return best && { source: best.source, index: best.index };
  }
}
