import { useEffect, useRef, useState } from 'react';
import { TextureStyle } from 'pixi.js';
import type { Interconnector } from '../data/interconnectors';
import type { ProjectIndex } from '../data/projects';
import { ZoomControls } from '../ui/ZoomControls';
import type { GridFile } from './grid';
import { ZOOM_LEVELS } from './levels';
import type { Selection } from './markers';
import { MapView } from './MapView';

// Pixel-perfect rendering: nearest-neighbour sampling for every texture.
TextureStyle.defaultOptions.scaleMode = 'nearest';

interface Props {
  grid: GridFile;
  projects: ProjectIndex;
  links: Interconnector[];
  /** Filter predicates; new functions redraw the markers. */
  include: (index: number) => boolean;
  includeLink: (index: number) => boolean;
  selected: Selection | null;
  onSelect: (selection: Selection | null) => void;
}

/** Mounts the PixiJS map. React owns the UI around it; MapView owns the canvas. */
export function MapCanvas({
  grid,
  projects,
  links,
  include,
  includeLink,
  selected,
  onSelect,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapView | null>(null);
  const latest = useRef({ include, includeLink, selected, onSelect });
  const [level, setLevel] = useState(0);

  useEffect(() => {
    latest.current = { include, includeLink, selected, onSelect };
  }, [include, includeLink, selected, onSelect]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let view: MapView | null = null;

    MapView.create(host, grid, projects, links, {
      onSelect: (selection) => latest.current.onSelect(selection),
      onLevelChange: setLevel,
    }).then((created) => {
      if (cancelled) {
        created.destroy();
        return;
      }
      view = created;
      viewRef.current = created;
      created.setFilter(latest.current.include, latest.current.includeLink);
      created.showSelection(latest.current.selected);
    });

    return () => {
      cancelled = true;
      view?.destroy();
      viewRef.current = null;
    };
  }, [grid, projects, links]);

  useEffect(() => {
    viewRef.current?.setFilter(include, includeLink);
  }, [include, includeLink]);

  useEffect(() => {
    viewRef.current?.showSelection(selected);
  }, [selected]);

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
