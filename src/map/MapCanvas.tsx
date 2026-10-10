import { useEffect, useRef, useState } from 'react';
import type { Interconnector } from '../data/interconnectors';
import type { ProjectIndex } from '../data/projects';
import { ZoomControls } from '../ui/ZoomControls';
import type { EffectKind, EventCandidate } from './animations';
import { ZOOM_BANDS } from './levels';
import type { Selection } from './markers';
import { MapView, type EffectTarget, type LineChoice } from './MapView';
import { useOverlayInsets } from './useOverlayInsets';

const MAP_LABEL =
  'Map of clean energy projects in Great Britain. Use plus and minus to zoom and the arrow keys to pan.';

interface Props {
  projects: ProjectIndex;
  links: Interconnector[];
  /** Filter predicates; new functions redraw the markers. */
  include: (index: number) => boolean;
  includeLink: (index: number) => boolean;
  selected: Selection | null;
  onSelect: (selection: Selection | null) => void;
  /** Recent events to play once when the map opens, or null until they have loaded. */
  openingEvents: EventCandidate<EffectTarget>[] | null;
  /** An event picked in the feed; a new object plays it. */
  play: { selection: Selection; kind: EffectKind | null; colour: string } | null;
  /** Live interconnector flows in MW (positive means importing), or null when unknown. */
  flows: Record<string, number> | null;
  /** Which sets of region lines are drawn. */
  lines: LineChoice;
}

/** Mounts the map. React owns the UI around it; MapView owns the canvas. */
export function MapCanvas({
  projects,
  links,
  include,
  includeLink,
  selected,
  onSelect,
  openingEvents,
  play,
  flows,
  lines,
}: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapView | null>(null);
  const insets = useOverlayInsets(frameRef);
  const latest = useRef({ include, includeLink, selected, onSelect, insets, lines });
  const [zoom, setZoom] = useState({ band: 0, canZoomIn: true, canZoomOut: true });
  const [ready, setReady] = useState(false);
  const openingPlayed = useRef(false);

  useEffect(() => {
    latest.current = { include, includeLink, selected, onSelect, insets, lines };
  }, [include, includeLink, selected, onSelect, insets, lines]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let view: MapView | null = null;

    MapView.create(
      host,
      projects,
      links,
      {
        onSelect: (selection) => latest.current.onSelect(selection),
        onZoomChange: setZoom,
      },
      MAP_LABEL,
    ).then((created) => {
      if (cancelled) {
        created.destroy();
        return;
      }
      view = created;
      viewRef.current = created;
      created.setLines(latest.current.lines);
      created.setFilter(latest.current.include, latest.current.includeLink);
      created.showSelection(latest.current.selected);
      created.setInsets(latest.current.insets);
      setReady(true);
    });

    return () => {
      cancelled = true;
      view?.destroy();
      viewRef.current = null;
      setReady(false);
    };
  }, [projects, links]);

  useEffect(() => {
    viewRef.current?.setFilter(include, includeLink);
  }, [include, includeLink]);

  useEffect(() => {
    viewRef.current?.showSelection(selected);
  }, [selected]);

  useEffect(() => {
    viewRef.current?.setLines(lines);
  }, [lines]);

  // The opening sequence plays once, as soon as both the map and the change list are ready.
  useEffect(() => {
    if (!ready || !openingEvents || openingPlayed.current) return;
    openingPlayed.current = true;
    viewRef.current?.playOnLoad(openingEvents);
  }, [ready, openingEvents]);

  useEffect(() => {
    if (ready && play) viewRef.current?.playEvent(play.selection, play.kind, play.colour);
  }, [ready, play]);

  useEffect(() => {
    if (ready) viewRef.current?.setFlows(flows);
  }, [ready, flows]);

  // Keep the selected project clear of the card or filter panel covering part of the map.
  useEffect(() => {
    viewRef.current?.setInsets(insets);
  }, [insets]);

  return (
    <div ref={frameRef} className="map-frame">
      <div ref={hostRef} className="map-host" />
      <ZoomControls
        name={ZOOM_BANDS[zoom.band].name}
        canZoomIn={zoom.canZoomIn}
        canZoomOut={zoom.canZoomOut}
        onZoomIn={() => viewRef.current?.zoomIn()}
        onZoomOut={() => viewRef.current?.zoomOut()}
      />
    </div>
  );
}
