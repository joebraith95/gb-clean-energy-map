import { useEffect, useState } from 'react';
import { formatTime, isFresh, loadUnit, type UnitLive } from '../data/live';
import { palette, stageColours } from '../theme/tokens';
import { formatMw } from './format';

const BAR = 2;
const HEIGHT = 32;

/**
 * Live section for a wind farm with mapped BM units: the latest scheduled output and a 24-hour
 * pixel sparkline. Only rendered for projects in data/bmu-map.json.
 */
export function LiveOutput({ repdId }: { repdId: number }) {
  const [unit, setUnit] = useState<UnitLive | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    loadUnit(repdId)
      .then((u) => current && setUnit(u))
      .catch((e: Error) => current && setError(e.message));
    return () => {
      current = false;
    };
  }, [repdId]);

  const output = unit?.output;
  const points = isFresh(output) ? output.data.points : [];
  const peak = Math.max(1, ...points.map((p) => p.mw ?? 0));

  return (
    <section className="live-section">
      <h3>Live</h3>
      {!unit && !error && <p className="muted">Loading live output…</p>}
      {(error || (unit && !isFresh(output))) && (
        <p className="muted">Live data unavailable right now.</p>
      )}
      {unit && isFresh(output) && (
        <>
          {output.data.latest ? (
            <p>
              {unit.label}: <strong>{formatMw(output.data.latest.mw)}</strong> at{' '}
              {formatTime(output.data.latest.time)}
              {output.stale && (
                <span className="muted"> (latest received; source not responding)</span>
              )}
            </p>
          ) : (
            <p className="muted">No scheduled output published for the last 24 hours.</p>
          )}
          <svg
            className="sparkline"
            width={points.length * BAR}
            height={HEIGHT}
            viewBox={`0 0 ${points.length * BAR} ${HEIGHT}`}
            shapeRendering="crispEdges"
            role="img"
            aria-label={`Scheduled output over the last 24 hours, peaking at ${formatMw(peak)}`}
          >
            <rect width={points.length * BAR} height={HEIGHT} fill={palette.panelEdge} />
            {points.map((p, i) =>
              p.mw === null ? null : (
                <rect
                  key={p.time}
                  x={i * BAR}
                  y={HEIGHT - Math.round((p.mw / peak) * HEIGHT)}
                  width={BAR}
                  height={Math.round((p.mw / peak) * HEIGHT)}
                  fill={stageColours.operational}
                />
              ),
            )}
          </svg>
          <p className="muted small">
            Last 24 hours. This is the output Elexon expects from the farm&apos;s own schedule and
            any instructions to change it, not metered output. Live output is only available for
            large transmission-connected wind farms.
            {unit.note && ` ${unit.note}`}
          </p>
        </>
      )}
    </section>
  );
}
