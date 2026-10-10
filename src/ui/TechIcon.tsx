import { useEffect, useRef } from 'react';
import { drawBadge } from '../map/icons';
import type { TechKind } from '../map/kinds';
import type { Stage } from '../theme/tokens';

const SIZE = 32;

/** The map's badge for a technology and stage, drawn for the card. */
export function TechIcon({ kind, stage }: { kind: TechKind; stage: Stage }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scale = Math.ceil(window.devicePixelRatio || 1);

  useEffect(() => {
    const context = ref.current?.getContext('2d');
    if (context) drawBadge(context, SIZE, scale, kind, stage);
  }, [kind, stage, scale]);

  return (
    <canvas
      ref={ref}
      className="tech-icon"
      width={SIZE * scale}
      height={SIZE * scale}
      style={{ width: SIZE, height: SIZE }}
      aria-hidden="true"
    />
  );
}
