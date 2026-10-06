import { useEffect, useRef } from 'react';
import { Application, Graphics, TextureStyle } from 'pixi.js';
import { palette } from '../theme/tokens';

// Pixel-perfect rendering: nearest-neighbour sampling for every texture.
TextureStyle.defaultOptions.scaleMode = 'nearest';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Mounts the PixiJS map. React owns the UI around it; this component owns the canvas. */
export function MapCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const app = new Application();
    let cancelled = false;

    app
      .init({ antialias: false, resolution: 1, background: palette.sea, resizeTo: host })
      .then(() => {
        if (cancelled) {
          app.destroy(true);
          return;
        }
        host.appendChild(app.canvas);
        app.ticker.maxFPS = reducedMotion ? 1 : 30;
        app.stage.addChild(checkerboard());
      });

    return () => {
      cancelled = true;
      if (app.renderer) app.destroy(true);
    };
  }, []);

  return <div ref={hostRef} className="map-host" />;
}

// Scaffold placeholder: a checkerboard to confirm crisp, unsmoothed pixels. Replaced in step 3.
function checkerboard(): Graphics {
  const g = new Graphics();
  const cell = 4;
  for (let row = 0; row < 40; row++) {
    for (let col = 0; col < 40; col++) {
      g.rect(col * cell, row * cell, cell, cell).fill(
        (row + col) % 2 ? palette.land : palette.landEdge,
      );
    }
  }
  g.position.set(16, 16);
  return g;
}
