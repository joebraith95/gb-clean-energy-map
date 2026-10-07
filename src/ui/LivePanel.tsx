import { useEffect, useState } from 'react';
import type { Interconnector } from '../data/interconnectors';
import {
  formatTime,
  isFresh,
  loadRegions,
  mixRows,
  type Credit,
  type NationalLive,
  type RegionsLive,
} from '../data/live';
import { fuelColours } from '../theme/tokens';
import { formatMw } from './format';

interface Props {
  national: NationalLive | null;
  nationalError: string | null;
  links: Interconnector[];
  onClose: () => void;
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

/** "Importing 349 MW", "Exporting 198 MW" or "No flow". */
export function flowLabel(mw: number): string {
  if (mw > 0) return `Importing ${formatMw(mw)}`;
  if (mw < 0) return `Exporting ${formatMw(-mw)}`;
  return 'No flow';
}

export function LivePanel({ national, nationalError, links, onClose }: Props) {
  const [regions, setRegions] = useState<RegionsLive | null>(null);
  const [regionsError, setRegionsError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    const load = () =>
      loadRegions()
        .then((r) => current && setRegions(r))
        .catch((e: Error) => current && setRegionsError(e.message));
    load();
    const timer = window.setInterval(
      () => document.visibilityState === 'visible' && load(),
      300_000,
    );
    return () => {
      current = false;
      window.clearInterval(timer);
    };
  }, []);

  const rows = national ? mixRows(national) : [];
  const mix = national?.mix;
  const flows = isFresh(mix) ? mix.data.interconnectors : null;
  const net = flows ? Object.values(flows).reduce((sum, mw) => sum + mw, 0) : 0;
  const credits: Credit[] = [...(national?.credits ?? []), ...(regions?.credits ?? [])];

  return (
    <aside className="panel live" aria-labelledby="live-title">
      <div className="panel-head">
        <h2 id="live-title">Live</h2>
        <button type="button" className="card-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {!national && !nationalError && <p className="muted">Loading live data…</p>}
      {(nationalError || (national && !isFresh(national.mix))) && (
        <p className="muted">Live data unavailable right now. The rest of the map still works.</p>
      )}

      {isFresh(mix) && (
        <section>
          <h3>Generation now</h3>
          <p className="muted">
            {formatTime(mix.data.time)} UK time
            {mix.stale && ', the latest figures received: the source is not responding'}
          </p>
          <div className="mix-bar" role="img" aria-label="Share of generation by fuel">
            {rows.map((r) => (
              <span
                key={r.key}
                style={{ flexGrow: r.mw, background: fuelColours[r.key] }}
                title={`${r.label}: ${percent(r.share)}`}
              />
            ))}
          </div>
          <table className="live-table">
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>
                    <span
                      className="swatch"
                      style={{ background: fuelColours[r.key] }}
                      aria-hidden="true"
                    />
                    {r.label}
                  </td>
                  <td>{formatMw(r.mw)}</td>
                  <td>{percent(r.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">
            Wind covers transmission-connected farms only; smaller farms are not metered in real
            time. Solar is an estimate.
          </p>
        </section>
      )}

      {flows && (
        <section>
          <h3>Interconnectors</h3>
          <p>
            Net: <strong>{flowLabel(net)}</strong>
          </p>
          <table className="live-table">
            <tbody>
              {links
                .filter((l) => flows[l.id] !== undefined)
                .map((l) => (
                  <tr key={l.id}>
                    <td>
                      {l.name} <span className="muted">({l.partner})</span>
                    </td>
                    <td colSpan={2}>{flowLabel(flows[l.id])}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h3>Regions</h3>
        {!regions && !regionsError && <p className="muted">Loading regions…</p>}
        {(regionsError || (regions && !isFresh(regions.regions))) && (
          <p className="muted">Regional data unavailable right now.</p>
        )}
        {regions && isFresh(regions.regions) && (
          <>
            <p className="muted">
              Forecast carbon intensity, {formatTime(regions.regions.data.from)} to{' '}
              {formatTime(regions.regions.data.to)} UK time
            </p>
            <table className="live-table">
              <thead>
                <tr>
                  <th scope="col">Region</th>
                  <th scope="col">gCO₂/kWh</th>
                  <th scope="col">Main sources</th>
                </tr>
              </thead>
              <tbody>
                {regions.regions.data.regions.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>
                      {r.intensity} <span className="muted">({r.index})</span>
                    </td>
                    <td>
                      {Object.entries(r.mix)
                        .filter(([, share]) => share >= 1)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 2)
                        .map(([fuel, share]) => `${fuel} ${Math.round(share)}%`)
                        .join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      {credits.length > 0 && (
        <footer className="card-footer">
          {credits.map((c) => (
            <p key={c.source}>
              <a href={c.licence} target="_blank" rel="noreferrer">
                {c.text}
              </a>
            </p>
          ))}
        </footer>
      )}
    </aside>
  );
}
