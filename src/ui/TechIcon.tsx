import { useEffect, useRef } from 'react';
import { TILE_SIZE, tilePixels, type SpriteKind } from '../map/sprites';
import type { Stage } from '../theme/tokens';

const SCALE = 3;

/** The map sprite tile, drawn at a whole-pixel scale for the card. */
export function TechIcon({ kind, stage }: { kind: SpriteKind; stage: Stage }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const context = ref.current?.getContext('2d');
    if (!context) return;
    tilePixels(kind, 0, stage).forEach((line, row) =>
      line.forEach((colour, col) => {
        context.fillStyle = colour;
        context.fillRect(col * SCALE, row * SCALE, SCALE, SCALE);
      }),
    );
  }, [kind, stage]);

  return (
    <canvas
      ref={ref}
      className="tech-icon"
      width={TILE_SIZE * SCALE}
      height={TILE_SIZE * SCALE}
      aria-hidden="true"
    />
  );
}
