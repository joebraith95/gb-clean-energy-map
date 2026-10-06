const LEVEL_NAMES = ['National', 'Regional', 'Local'];

interface Props {
  level: number;
  levels: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export function ZoomControls({ level, levels, onZoomIn, onZoomOut }: Props) {
  return (
    <div className="zoom-controls" role="group" aria-label="Zoom">
      <button type="button" onClick={onZoomIn} disabled={level >= levels - 1} aria-label="Zoom in">
        +
      </button>
      <span className="zoom-level" aria-live="polite">
        {LEVEL_NAMES[level]}
      </span>
      <button type="button" onClick={onZoomOut} disabled={level <= 0} aria-label="Zoom out">
        −
      </button>
    </div>
  );
}
