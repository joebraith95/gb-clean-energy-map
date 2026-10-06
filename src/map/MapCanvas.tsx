import { useEffect, useRef } from 'react';
import { Application, Sprite, TextureStyle } from 'pixi.js';
import { palette } from '../theme/tokens';
import { GB_LAND, OTHER_LAND, SEA, loadGrid } from './grid';
import { gridTexture } from './gridTexture';
import { ZOOM_LEVELS } from './levels';

// Pixel-perfect rendering: nearest-neighbour sampling for every texture.
TextureStyle.defaultOptions.scaleMode = 'nearest';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const LAND_COLOURS = {
  [SEA]: palette.sea,
  [GB_LAND]: palette.land,
  [OTHER_LAND]: palette.otherLand,
};

/** Mounts the PixiJS map. React owns the UI around it; this component owns the canvas. */
export function MapCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const app = new Application();
    let cancelled = false;

    Promise.all([
      app.init({ antialias: false, resolution: 1, background: palette.sea, resizeTo: host }),
      loadGrid(),
    ]).then(([, grid]) => {
      if (cancelled) {
        app.destroy(true);
        return;
      }
      host.appendChild(app.canvas);
      app.ticker.maxFPS = reducedMotion ? 1 : 30;

      // National view only for now; zoom levels and panning arrive in phase 1 step 3.
      const level = ZOOM_LEVELS[0];
      const land = new Sprite(gridTexture(grid.levels[0], LAND_COLOURS));
      land.scale.set(level.scale);
      land.position.set(Math.max(0, Math.floor((app.screen.width - land.width) / 2)), 0);
      app.stage.addChild(land);
    });

    return () => {
      cancelled = true;
      if (app.renderer) app.destroy(true);
    };
  }, []);

  return <div ref={hostRef} className="map-host" />;
}
