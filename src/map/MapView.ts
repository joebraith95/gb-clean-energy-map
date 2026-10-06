// The PixiJS map: land grid, project markers, snap zoom and panning.
// Every cell and marker edge lands on a whole physical pixel, so nothing is ever smoothed.

import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { ProjectIndex } from '../data/projects';
import { palette, stageColours } from '../theme/tokens';
import { GB_LAND, OTHER_LAND, SEA, decodeLevel, type GridFile } from './grid';
import { gridTexture } from './gridTexture';
import {
  ZOOM_LEVELS,
  anchorOffset,
  clampAxis,
  nationalScale,
  physicalScale,
  screenToBng,
  snap,
} from './levels';
import { TIER_SIZES, buildMarkers, type Marker } from './markers';

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

export interface MapViewEvents {
  onSelect: (index: number | null) => void;
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
  private readonly markerLayer = new Graphics();
  private readonly highlight = new Graphics();
  private landTextures: Texture[] = [];
  private landCells: Uint8Array[] = [];

  private level = 0;
  private national = 1;
  private dpr = 1;
  private offset: Point = { x: 0, y: 0 };
  private markers: Marker[] = [];
  private selected: number | null = null;
  private include: (index: number) => boolean = () => true;

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
    private readonly events: MapViewEvents,
  ) {}

  static async create(
    host: HTMLElement,
    grid: GridFile,
    projects: ProjectIndex,
    events: MapViewEvents,
  ): Promise<MapView> {
    const view = new MapView(host, grid, projects, events);
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
    });
    this.landTextures = this.grid.levels.map((level) => gridTexture(level, LAND_COLOURS));
    this.landCells = this.grid.levels.map(decodeLevel);

    this.world.addChild(this.land, this.markerLayer, this.highlight);
    this.app.stage.addChild(this.world);
    this.host.appendChild(this.app.canvas);
    this.bindInput();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.national = nationalScale(this.host.clientWidth, this.host.clientHeight, this.dpr);
    this.render();
  }

  destroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.app.destroy(true, { children: true, texture: true });
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

  /** Redraws markers with a new filter, for example from the filter panel. */
  setFilter(include: (index: number) => boolean): void {
    this.include = include;
    this.drawMarkers();
  }

  select(index: number | null): void {
    this.selected = index;
    this.drawHighlight();
    this.events.onSelect(index);
  }

  private get cssPerCell(): number {
    return physicalScale(ZOOM_LEVELS[this.level], this.national) / this.dpr;
  }

  private get view(): { width: number; height: number } {
    return { width: this.app.screen.width, height: this.app.screen.height };
  }

  private zoomTo(target: number, anchor?: Point): void {
    const next = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, target));
    if (next === this.level) return;
    const screen = anchor ?? { x: this.view.width / 2, y: this.view.height / 2 };
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
    this.land.texture = this.landTextures[this.level];
    this.land.scale.set(this.cssPerCell);
    this.drawMarkers();
    this.applyOffset();
  }

  private applyOffset(): void {
    const level = this.grid.levels[this.level];
    this.offset = {
      x: clampAxis(this.offset.x, level.cols * this.cssPerCell, this.view.width),
      y: clampAxis(this.offset.y, level.rows * this.cssPerCell, this.view.height),
    };
    this.world.position.set(snap(this.offset.x, this.dpr), snap(this.offset.y, this.dpr));
  }

  private markerBox(marker: Marker): { left: number; top: number; size: number } {
    const size = Math.max(2, Math.round(TIER_SIZES[marker.tier] * this.dpr)) / this.dpr;
    const css = this.cssPerCell;
    return {
      left: snap((marker.col + 0.5) * css - size / 2, this.dpr),
      top: snap((marker.row + 0.5) * css - size / 2, this.dpr),
      size,
    };
  }

  private drawMarkers(): void {
    const gridLevel = this.grid.levels[this.level];
    this.markers = buildMarkers(
      this.projects,
      ZOOM_LEVELS[this.level],
      { cells: this.landCells[this.level], cols: gridLevel.cols, rows: gridLevel.rows },
      this.include,
    );
    const outline = 1 / this.dpr;
    const g = this.markerLayer.clear();
    for (const marker of this.markers) {
      const { left, top, size } = this.markerBox(marker);
      g.rect(left - outline, top - outline, size + 2 * outline, size + 2 * outline).fill(
        palette.seaDeep,
      );
      g.rect(left, top, size, size).fill(stageColours[marker.stage]);
    }
    this.drawHighlight();
  }

  private drawHighlight(): void {
    const g = this.highlight.clear();
    const marker = this.markers.find((m) => m.index === this.selected);
    if (!marker) return;
    const { left, top, size } = this.markerBox(marker);
    const gap = 2 / this.dpr;
    const width = Math.max(1, Math.round(this.dpr)) / this.dpr;
    g.rect(
      left - gap - width,
      top - gap - width,
      size + 2 * (gap + width),
      size + 2 * (gap + width),
    ).stroke({ color: palette.ink, width, alignment: 1 });
  }

  /** Topmost marker within reach of a screen point. */
  private markerAt(screen: Point): number | null {
    const x = screen.x - this.world.position.x;
    const y = screen.y - this.world.position.y;
    let best: number | null = null;
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
        best = this.markers[i].index;
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
