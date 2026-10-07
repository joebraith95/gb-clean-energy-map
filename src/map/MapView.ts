// The PixiJS map: land grid, project markers, snap zoom and panning.
// Every cell and marker edge lands on a whole physical pixel, so nothing is ever smoothed.
// Frames are drawn on demand (and for the turbine animation), not on a constant loop.

import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Interconnector } from '../data/interconnectors';
import type { ProjectIndex } from '../data/projects';
import { palette, spriteInk, stageColours } from '../theme/tokens';
import { GB_LAND, OTHER_LAND, SEA, decodeLevel, type GridFile } from './grid';
import { gridTexture } from './gridTexture';
import {
  NO_INSETS,
  ZOOM_LEVELS,
  anchorOffset,
  clampAxis,
  nationalScale,
  physicalScale,
  screenToBng,
  snap,
  type Insets,
} from './levels';
import {
  FRAMES,
  FRAME_MS,
  STAGGER_MS,
  STILL_MS,
  effectPixels,
  pickOnLoad,
  stillPixels,
  type EffectKind,
  type EventCandidate,
} from './animations';
import { cableCells, isDash, pulseDirection, type CableCell } from './cables';
import {
  DOT_SIZES,
  FIRST_SPRITE_TIER,
  buildLinkMarkers,
  buildMarkers,
  sameSelection,
  type Marker,
  type Selection,
} from './markers';
import { TILE_SIZE, tileTexture } from './sprites';

const LAND_COLOURS = {
  [SEA]: palette.sea,
  [GB_LAND]: palette.land,
  [OTHER_LAND]: palette.otherLand,
};

/** Pointer travel (CSS px) below which a press counts as a tap rather than a drag. */
const TAP_SLOP = 6;
/** Extra reach (CSS px) around small markers so they are easy to tap. */
const TAP_REACH = 8;
/** Pinch distance ratio that triggers one zoom step. */
const PINCH_STEP = 1.5;
/** Minimum gap between wheel-triggered zoom steps (ms). */
const WHEEL_COOLDOWN = 250;
/** Time between turbine blade frames (ms). */
const SPIN_INTERVAL = 450;

/** What an effect plays on: the selection and its stage colour. */
export interface EffectTarget {
  selection: Selection;
  colour: string;
}

export interface MapViewEvents {
  onSelect: (selection: Selection | null) => void;
  onLevelChange: (level: number) => void;
}

interface Point {
  x: number;
  y: number;
}

export class MapView {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly land = new Sprite();
  private readonly cableLayer = new Graphics();
  private readonly markerLayer = new Graphics();
  private readonly spriteLayer = new Container();
  private readonly highlight = new Graphics();
  private readonly effectLayer = new Graphics();
  private effects: { selection: Selection; kind: EffectKind; colour: string; startAt: number }[] =
    [];
  private effectTimer: number | undefined;
  private turbines: { sprite: Sprite; marker: Marker; pixelSize: number }[] = [];
  private spinFrame = 0;
  private spinTimer: number | undefined;
  private readonly motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private renderQueued = false;
  private landTextures: Texture[] = [];
  private landCells: Uint8Array[] = [];
  /** For each zoom level, the index of the land grid it draws. */
  private landFor: number[] = [];

  private level = 0;
  private national = 1;
  private dpr = 1;
  private offset: Point = { x: 0, y: 0 };
  private insets: Insets = NO_INSETS;
  private markers: Marker[] = [];
  private cables: { cells: CableCell[]; stage: Marker['stage']; direction: -1 | 0 | 1 }[] = [];
  /** Live interconnector flows in MW (positive means importing), or null when unknown. */
  private flows: Record<string, number> | null = null;
  private pulsePhase = 0;
  private selected: Selection | null = null;
  private include: (index: number) => boolean = () => true;
  private includeLink: (index: number) => boolean = () => true;

  private pointers = new Map<number, Point>();
  private dragStart: Point | null = null;
  private dragMoved = false;
  private pinchDistance = 0;
  private lastWheel = 0;
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;

  private constructor(
    private readonly host: HTMLElement,
    private readonly grid: GridFile,
    private readonly projects: ProjectIndex,
    private readonly links: Interconnector[],
    private readonly events: MapViewEvents,
  ) {}

  static async create(
    host: HTMLElement,
    grid: GridFile,
    projects: ProjectIndex,
    links: Interconnector[],
    events: MapViewEvents,
  ): Promise<MapView> {
    const view = new MapView(host, grid, projects, links, events);
    await view.init();
    return view;
  }

  private async init(): Promise<void> {
    this.dpr = window.devicePixelRatio || 1;
    await this.app.init({
      width: this.host.clientWidth,
      height: this.host.clientHeight,
      resolution: this.dpr,
      autoDensity: true,
      antialias: false,
      background: palette.sea,
      autoStart: false,
    });
    this.app.ticker.stop();
    this.landTextures = this.grid.levels.map((level) => gridTexture(level, LAND_COLOURS));
    this.landCells = this.grid.levels.map(decodeLevel);
    this.landFor = ZOOM_LEVELS.map((level) => {
      const index = this.grid.levels.findIndex((g) => g.cellMetres === level.landMetres);
      if (index < 0) throw new Error(`No ${level.landMetres}m land grid in grid.json`);
      return index;
    });

    this.world.addChild(
      this.land,
      this.cableLayer,
      this.markerLayer,
      this.spriteLayer,
      this.highlight,
      this.effectLayer,
    );
    this.app.stage.addChild(this.world);
    this.host.appendChild(this.app.canvas);
    this.bindInput();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.national = nationalScale(this.host.clientWidth, this.host.clientHeight, this.dpr);
    this.render();
    this.spinTimer = window.setInterval(() => this.spin(), SPIN_INTERVAL);
  }

  destroy(): void {
    this.destroyed = true;
    window.clearInterval(this.spinTimer);
    window.clearInterval(this.effectTimer);
    this.resizeObserver?.disconnect();
    // Sprite tile textures are shared through a cache, so only the land textures are destroyed here.
    for (const texture of this.landTextures) texture.destroy(true);
    this.app.destroy(true, { children: true, texture: false });
  }

  private requestRender(): void {
    if (this.renderQueued || this.destroyed) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      if (!this.destroyed) this.app.render();
    });
  }

  /**
   * Turns the blades of operational turbines and moves the pulse along operational cables,
   * unless the viewer prefers reduced motion.
   */
  private spin(): void {
    if (this.motionQuery.matches) return;
    if (this.cables.some((c) => c.direction !== 0)) {
      this.pulsePhase += 1;
      this.drawCables();
    }
    if (this.turbines.length === 0) return;
    this.spinFrame = 1 - this.spinFrame;
    for (const { sprite, marker, pixelSize } of this.turbines) {
      sprite.texture = tileTexture(marker.kind, this.spinFrame, marker.stage, pixelSize);
    }
    this.requestRender();
  }

  get levelIndex(): number {
    return this.level;
  }

  zoomIn(anchor?: Point): void {
    this.zoomTo(this.level + 1, anchor);
  }

  zoomOut(anchor?: Point): void {
    this.zoomTo(this.level - 1, anchor);
  }

  /** Live interconnector flows; cables pulse inwards for imports and outwards for exports. */
  setFlows(flows: Record<string, number> | null): void {
    this.flows = flows;
    this.drawMarkers();
  }

  /** Redraws markers with new filters, for example from the filter panel. */
  setFilter(include: (index: number) => boolean, includeLink: (index: number) => boolean): void {
    this.include = include;
    this.includeLink = includeLink;
    this.drawMarkers();
  }

  /**
   * Shows a selection made outside the map (for example from a card link) without raising
   * onSelect, and pans to the marker if it is drawn but off screen.
   */
  showSelection(selection: Selection | null): void {
    if (sameSelection(selection, this.selected)) return;
    this.selected = selection;
    this.drawHighlight();
    this.revealSelected();
  }

  /**
   * Tells the map which parts of it are covered by the card or filter panel. The map can then
   * pan far enough to show anything in the uncovered part, and keeps the selection in view.
   */
  setInsets(insets: Insets): void {
    this.insets = insets;
    this.applyOffset();
    this.revealSelected();
  }

  /**
   * Plays the opening sequence: recent qualifying events visible at the current zoom, largest
   * first, staggered. Events whose marker is not drawn or is covered are skipped.
   */
  playOnLoad(candidates: EventCandidate<EffectTarget>[]): void {
    const picked = pickOnLoad(candidates, (target) => this.isOnScreen(target.selection));
    const now = performance.now();
    picked.forEach((c, i) =>
      this.addEffect(c.target.selection, c.kind, c.target.colour, now + i * STAGGER_MS),
    );
  }

  /**
   * Shows an event picked in the feed: if the marker is not drawn at this zoom because of the
   * level's capacity floor, zooms in until it is, then plays the effect (if the event has one).
   */
  playEvent(selection: Selection, kind: EffectKind | null, colour: string): void {
    if (!this.markers.some((m) => sameSelection(m, selection))) {
      for (let level = this.level + 1; level < ZOOM_LEVELS.length; level++) {
        this.zoomTo(level);
        if (this.markers.some((m) => sameSelection(m, selection))) break;
      }
      this.revealSelected();
    }
    if (kind) this.addEffect(selection, kind, colour, performance.now());
  }

  private isOnScreen(selection: Selection): boolean {
    const marker = this.markers.find((m) => sameSelection(m, selection));
    if (!marker) return false;
    const { left, top, size } = this.markerBox(marker);
    const x = this.world.position.x + left + size / 2;
    const y = this.world.position.y + top + size / 2;
    const area = this.visibleArea;
    return x >= area.left && x <= area.right && y >= area.top && y <= area.bottom;
  }

  private addEffect(selection: Selection, kind: EffectKind, colour: string, startAt: number): void {
    this.effects.push({ selection, kind, colour, startAt });
    if (this.effectTimer === undefined) {
      this.effectTimer = window.setInterval(() => this.drawEffects(), FRAME_MS);
    }
    this.drawEffects();
  }

  /** Draws running effects; under reduced motion, a still outline instead of moving frames. */
  private drawEffects(): void {
    const now = performance.now();
    const still = this.motionQuery.matches;
    const length = still ? STILL_MS : FRAMES * FRAME_MS;
    this.effects = this.effects.filter((e) => now - e.startAt < length);
    const g = this.effectLayer.clear();
    for (const effect of this.effects) {
      if (now < effect.startAt) continue;
      const marker = this.markers.find((m) => sameSelection(m, effect.selection));
      if (!marker) continue;
      const { left, top, size } = this.markerBox(marker);
      const unit =
        (marker.tier < FIRST_SPRITE_TIER
          ? Math.max(1, Math.round(this.dpr))
          : this.spritePixelSize(marker)) / this.dpr;
      const cx = left + size / 2;
      const cy = top + size / 2;
      const frame = Math.floor((now - effect.startAt) / FRAME_MS);
      const pixels = still ? stillPixels() : effectPixels(effect.kind, frame);
      for (const [px, py] of pixels) {
        g.rect(
          snap(cx + px * unit - unit / 2, this.dpr),
          snap(cy + py * unit - unit / 2, this.dpr),
          unit,
          unit,
        ).fill(effect.colour);
      }
    }
    if (this.effects.length === 0) {
      window.clearInterval(this.effectTimer);
      this.effectTimer = undefined;
    }
    this.requestRender();
  }

  /** Pans the selected marker into the uncovered part of the map if it is hidden or near an edge. */
  private revealSelected(): void {
    const marker = this.markers.find((m) => sameSelection(m, this.selected));
    if (!marker) return;
    const { left, top, size } = this.markerBox(marker);
    const x = this.world.position.x + left + size / 2;
    const y = this.world.position.y + top + size / 2;
    const margin = 32;
    const area = this.visibleArea;
    const hidden =
      x < area.left + margin ||
      y < area.top + margin ||
      x > area.right - margin ||
      y > area.bottom - margin;
    if (!hidden) return;
    this.offset = {
      x: (area.left + area.right) / 2 - (left + size / 2),
      y: (area.top + area.bottom) / 2 - (top + size / 2),
    };
    this.applyOffset();
  }

  /** The part of the view not covered by panels, in CSS px. */
  private get visibleArea(): { left: number; top: number; right: number; bottom: number } {
    return {
      left: this.insets.left,
      top: this.insets.top,
      right: this.view.width - this.insets.right,
      bottom: this.view.height - this.insets.bottom,
    };
  }

  select(selection: Selection | null): void {
    this.selected = selection;
    this.drawHighlight();
    this.events.onSelect(selection);
  }

  private get cssPerCell(): number {
    return physicalScale(ZOOM_LEVELS[this.level], this.national) / this.dpr;
  }

  /** CSS pixels per land texture cell at the current level. */
  private get cssPerLandCell(): number {
    const level = ZOOM_LEVELS[this.level];
    return this.cssPerCell * (level.landMetres / level.cellMetres);
  }

  private get view(): { width: number; height: number } {
    return { width: this.app.screen.width, height: this.app.screen.height };
  }

  private zoomTo(target: number, anchor?: Point): void {
    const next = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, target));
    if (next === this.level) return;
    const area = this.visibleArea;
    const screen = anchor ?? { x: (area.left + area.right) / 2, y: (area.top + area.bottom) / 2 };
    const bng = screenToBng(screen, this.offset, ZOOM_LEVELS[this.level], this.cssPerCell);
    this.level = next;
    this.offset = anchorOffset(screen, bng, ZOOM_LEVELS[next], this.cssPerCell);
    this.render();
    this.events.onLevelChange(next);
  }

  private resize(): void {
    if (this.destroyed) return;
    const { clientWidth: width, clientHeight: height } = this.host;
    if (width === 0 || height === 0) return;
    const centre = { x: this.view.width / 2, y: this.view.height / 2 };
    const bng = screenToBng(centre, this.offset, ZOOM_LEVELS[this.level], this.cssPerCell);
    this.app.renderer.resize(width, height);
    this.national = nationalScale(width, height, this.dpr);
    this.offset = anchorOffset(
      { x: width / 2, y: height / 2 },
      bng,
      ZOOM_LEVELS[this.level],
      this.cssPerCell,
    );
    this.render();
  }

  private render(): void {
    this.land.texture = this.landTextures[this.landFor[this.level]];
    this.land.scale.set(this.cssPerLandCell);
    this.drawMarkers();
    this.applyOffset();
  }

  private applyOffset(): void {
    const level = this.grid.levels[this.landFor[this.level]];
    this.offset = {
      x: clampAxis(
        this.offset.x,
        level.cols * this.cssPerLandCell,
        this.view.width,
        this.insets.left,
        this.insets.right,
      ),
      y: clampAxis(
        this.offset.y,
        level.rows * this.cssPerLandCell,
        this.view.height,
        this.insets.top,
        this.insets.bottom,
      ),
    };
    this.world.position.set(snap(this.offset.x, this.dpr), snap(this.offset.y, this.dpr));
    this.requestRender();
  }

  /** Physical pixels per sprite art pixel. The largest tier doubles, except on the national view. */
  private spritePixelSize(marker: Marker): number {
    const doubled = marker.tier > FIRST_SPRITE_TIER && this.level > 0;
    return Math.max(1, Math.round(this.dpr)) * (doubled ? 2 : 1);
  }

  private markerBox(marker: Marker): { left: number; top: number; size: number } {
    const size =
      marker.tier < FIRST_SPRITE_TIER
        ? Math.max(2, Math.round(DOT_SIZES[marker.tier] * this.dpr)) / this.dpr
        : (TILE_SIZE * this.spritePixelSize(marker)) / this.dpr;
    const css = this.cssPerCell;
    return {
      left: snap((marker.col + 0.5) * css - size / 2, this.dpr),
      top: snap((marker.row + 0.5) * css - size / 2, this.dpr),
      size,
    };
  }

  private drawMarkers(): void {
    const landIndex = this.landFor[this.level];
    const gridLevel = this.grid.levels[landIndex];
    this.markers = buildMarkers(
      this.projects,
      ZOOM_LEVELS[this.level],
      { cells: this.landCells[landIndex], cols: gridLevel.cols, rows: gridLevel.rows },
      this.include,
    ).concat(buildLinkMarkers(this.links, ZOOM_LEVELS[this.level], this.includeLink));
    this.cables = this.links.flatMap((link, i) => {
      if (!link.gbEnd || !link.partnerEnd || !link.stage || !this.includeLink(i)) return [];
      const cells = cableCells(
        link.gbEnd,
        link.partnerEnd,
        gridLevel,
        gridLevel.cols,
        gridLevel.rows,
      );
      return [
        { cells, stage: link.stage, direction: pulseDirection(link.stage, this.flows?.[link.id]) },
      ];
    });
    this.drawCables();
    const outline = 1 / this.dpr;
    const g = this.markerLayer.clear();
    for (const child of this.spriteLayer.removeChildren()) child.destroy();
    this.turbines = [];
    for (const marker of this.markers) {
      const { left, top, size } = this.markerBox(marker);
      if (marker.tier < FIRST_SPRITE_TIER) {
        g.rect(left - outline, top - outline, size + 2 * outline, size + 2 * outline).fill(
          spriteInk,
        );
        g.rect(left, top, size, size).fill(stageColours[marker.stage]);
        continue;
      }
      const pixelSize = this.spritePixelSize(marker);
      const sprite = new Sprite(tileTexture(marker.kind, this.spinFrame, marker.stage, pixelSize));
      sprite.scale.set(1 / this.dpr);
      sprite.position.set(left, top);
      this.spriteLayer.addChild(sprite);
      if (marker.kind === 'wind' && marker.stage === 'operational') {
        this.turbines.push({ sprite, marker, pixelSize });
      }
    }
    this.drawHighlight();
  }

  /** Dashed pixel cables, pulsing in the direction power is flowing. */
  private drawCables(): void {
    const g = this.cableLayer.clear();
    // Cables are drawn on the land grid, so they stay a sensible number of cells long.
    const css = this.cssPerLandCell;
    for (const cable of this.cables) {
      const phase = this.pulsePhase * cable.direction;
      for (const { col, row, step } of cable.cells) {
        if (step === 0 || !isDash(step, phase)) continue;
        g.rect(col * css, row * css, css, css).fill(stageColours[cable.stage]);
      }
    }
    this.requestRender();
  }

  private drawHighlight(): void {
    const g = this.highlight.clear();
    const marker = this.markers.find((m) => sameSelection(m, this.selected));
    if (!marker) {
      this.requestRender();
      return;
    }
    const { left, top, size } = this.markerBox(marker);
    const gap = 2 / this.dpr;
    const width = Math.max(1, Math.round(this.dpr)) / this.dpr;
    g.rect(
      left - gap - width,
      top - gap - width,
      size + 2 * (gap + width),
      size + 2 * (gap + width),
    ).stroke({ color: palette.ink, width, alignment: 1 });
    this.requestRender();
  }

  /** Topmost marker within reach of a screen point. */
  private markerAt(screen: Point): Selection | null {
    const x = screen.x - this.world.position.x;
    const y = screen.y - this.world.position.y;
    let best: Selection | null = null;
    let bestDistance = Infinity;
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const { left, top, size } = this.markerBox(this.markers[i]);
      const reach = Math.max(size / 2, TAP_REACH);
      const dx = Math.abs(x - (left + size / 2));
      const dy = Math.abs(y - (top + size / 2));
      if (dx > reach || dy > reach) continue;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { source: this.markers[i].source, index: this.markers[i].index };
      }
    }
    return best;
  }

  private bindInput(): void {
    const canvas = this.app.canvas;
    canvas.style.touchAction = 'none';
    const local = (event: PointerEvent | WheelEvent): Point => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    canvas.addEventListener('pointerdown', (event) => {
      canvas.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, local(event));
      if (this.pointers.size === 1) {
        this.dragStart = local(event);
        this.dragMoved = false;
      } else if (this.pointers.size === 2) {
        this.pinchDistance = this.pointerSpread();
        this.dragMoved = true;
      }
    });

    canvas.addEventListener('pointermove', (event) => {
      const previous = this.pointers.get(event.pointerId);
      if (!previous) return;
      const point = local(event);
      this.pointers.set(event.pointerId, point);

      if (this.pointers.size === 1 && this.dragStart) {
        if (Math.hypot(point.x - this.dragStart.x, point.y - this.dragStart.y) > TAP_SLOP) {
          this.dragMoved = true;
        }
        if (this.dragMoved) {
          this.offset = {
            x: this.offset.x + point.x - previous.x,
            y: this.offset.y + point.y - previous.y,
          };
          this.applyOffset();
        }
      } else if (this.pointers.size === 2) {
        const spread = this.pointerSpread();
        const ratio = spread / this.pinchDistance;
        if (ratio > PINCH_STEP || ratio < 1 / PINCH_STEP) {
          this.zoomTo(this.level + (ratio > 1 ? 1 : -1), this.pointerMidpoint());
          this.pinchDistance = spread;
        }
      }
    });

    const release = (event: PointerEvent) => {
      if (!this.pointers.has(event.pointerId)) return;
      this.pointers.delete(event.pointerId);
      if (this.pointers.size === 0) {
        if (!this.dragMoved && event.type === 'pointerup') this.select(this.markerAt(local(event)));
        this.dragStart = null;
      }
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        const now = performance.now();
        if (now - this.lastWheel < WHEEL_COOLDOWN || event.deltaY === 0) return;
        this.lastWheel = now;
        this.zoomTo(this.level + (event.deltaY < 0 ? 1 : -1), local(event));
      },
      { passive: false },
    );

    this.host.addEventListener('keydown', (event) => {
      const step = 0.25;
      const pan = (dx: number, dy: number) => {
        this.offset = { x: this.offset.x + dx, y: this.offset.y + dy };
        this.applyOffset();
      };
      switch (event.key) {
        case '+':
        case '=':
          this.zoomIn();
          break;
        case '-':
          this.zoomOut();
          break;
        case 'ArrowLeft':
          pan(this.view.width * step, 0);
          break;
        case 'ArrowRight':
          pan(-this.view.width * step, 0);
          break;
        case 'ArrowUp':
          pan(0, this.view.height * step);
          break;
        case 'ArrowDown':
          pan(0, -this.view.height * step);
          break;
        case 'Escape':
          this.select(null);
          break;
        default:
          return;
      }
      event.preventDefault();
    });
  }

  private pointerSpread(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private pointerMidpoint(): Point {
    const [a, b] = [...this.pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
}
