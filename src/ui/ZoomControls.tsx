interface Props {
  /** Name of the current zoom band, for example "Regional". */
  name: string;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export function ZoomControls({ name, canZoomIn, canZoomOut, onZoomIn, onZoomOut }: Props) {
  return (
    <div className="zoom-controls" role="group" aria-label="Zoom">
      <button type="button" onClick={onZoomIn} disabled={!canZoomIn} aria-label="Zoom in">
        +
      </button>
      <span className="zoom-level" aria-live="polite">
        {name}
      </span>
      <button type="button" onClick={onZoomOut} disabled={!canZoomOut} aria-label="Zoom out">
        −
      </button>
    </div>
  );
}
