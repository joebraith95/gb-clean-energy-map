import { useEffect, useRef, useState } from 'react';
import { TextureStyle } from 'pixi.js';
import type { ProjectIndex } from '../data/projects';
import { ZoomControls } from '../ui/ZoomControls';
import type { GridFile } from './grid';
import { ZOOM_LEVELS } from './levels';
import { MapView } from './MapView';

// Pixel-perfect rendering: nearest-neighbour sampling for every texture.
TextureStyle.defaultOptions.scaleMode = 'nearest';

interface Props {
  grid: GridFile;
  projects: ProjectIndex;
  onSelect: (index: number | null) => void;
}

/** Mounts the PixiJS map. React owns the UI around it; MapView owns the canvas. */
export function MapCanvas({ grid, projects, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapView | null>(null);
  const onSelectRef = useRef(onSelect);
  const [level, setLevel] = useState(0);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let view: MapView | null = null;

    MapView.create(host, grid, projects, {
      onSelect: (index) => onSelectRef.current(index),
      onLevelChange: setLevel,
    }).then((created) => {
      if (cancelled) {
        created.destroy();
        return;
      }
      view = created;
      viewRef.current = created;
    });

    return () => {
      cancelled = true;
      view?.destroy();
      viewRef.current = null;
    };
  }, [grid, projects]);

  return (
    <div className="map-frame">
      <div
        ref={hostRef}
        className="map-host"
        tabIndex={0}
        role="application"
        aria-label="Map of clean energy projects in Great Britain. Use plus and minus to zoom and the arrow keys to pan."
      />
      <ZoomControls
        level={level}
        levels={ZOOM_LEVELS.length}
        onZoomIn={() => viewRef.current?.zoomIn()}
        onZoomOut={() => viewRef.current?.zoomOut()}
      />
    </div>
  );
}
