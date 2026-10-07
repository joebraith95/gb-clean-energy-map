import { useEffect } from 'react';
import type { Interconnector, InterconnectorFile } from '../data/interconnectors';
import { STAGE_LABELS, STAGE_ORDER } from './filters';
import { NOT_PUBLISHED, formatDate, formatMw, orNotPublished } from './format';
import { formatTime } from '../data/live';
import { flowLabel } from './LivePanel';
import { TechIcon } from './TechIcon';

interface Props {
  link: Interconnector;
  source: InterconnectorFile['source'];
  onClose: () => void;
  /** Live flow in MW (positive means importing) and its time, when known. */
  flow: { mw: number; time: string } | null;
}

const END_NOTES: Record<string, string> = {
  converter: '',
  converter_under_construction: ' (under construction)',
  connection_substation: ' (grid connection point; no converter station built yet)',
};

/** The date that evidences each progress step: Ofgem milestones, or the year it entered service. */
function stepDate(stage: string, link: Interconnector): string | null {
  const milestone = (type: string) => link.milestones.find((m) => m.type === type)?.date ?? null;
  switch (stage) {
    case 'in_planning':
      return milestone('ipa');
    case 'consented':
      return milestone('fpa');
    default:
      return null;
  }
}

function connectionBadge(link: Interconnector): string {
  if (link.registerStatus === 'Built') return 'Energised';
  if (link.gate === '2')
    return `Gate 2 contracted. Contracted date ${formatDate(link.contractedDate)}`;
  return NOT_PUBLISHED;
}

export function InterconnectorCard({ link, source, onClose, flow }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const reached = link.stage ? STAGE_ORDER.indexOf(link.stage) : -1;

  return (
    <aside className="card" aria-labelledby="card-title">
      <button
        type="button"
        className="card-close"
        onClick={onClose}
        aria-label="Close interconnector"
      >
        ×
      </button>

      <header className="card-top">
        {link.stage && <TechIcon kind="interconnector" stage={link.stage} />}
        <div>
          <h2 id="card-title" className="card-name">
            {link.name}
          </h2>
          <p className="card-sub">Interconnector to {link.partner}</p>
        </div>
      </header>

      <div className="card-chips">
        {link.stage ? (
          <span
            className="chip"
            style={{ background: `var(--stage-${link.stage.replaceAll('_', '-')})` }}
          >
            {STAGE_LABELS[link.stage]}
          </span>
        ) : (
          <span className="chip chip-off-track">Stage not published</span>
        )}
        <span className="chip chip-outline">Connection: {connectionBadge(link)}</span>
      </div>

      {flow && (
        <p>
          Now: <strong>{flowLabel(flow.mw)}</strong>{' '}
          <span className="muted">(Elexon, {formatTime(flow.time)} UK time)</span>
        </p>
      )}

      <ol className="progress" aria-label="Progress">
        {STAGE_ORDER.map((stage, i) => {
          const date = stepDate(stage, link);
          const done = i <= reached;
          return (
            <li key={stage} className={done ? 'done' : ''}>
              <span className="progress-label">{STAGE_LABELS[stage]}</span>
              {done && date && <span className="progress-date">{formatDate(date)}</span>}
              {done && stage === 'operational' && link.commissioned && (
                <span className="progress-date">{link.commissioned}</span>
              )}
            </li>
          );
        })}
      </ol>

      <dl className="card-details">
        <dt>Import capacity</dt>
        <dd>{formatMw(link.importMw)}</dd>
        <dt>Export capacity</dt>
        <dd>{formatMw(link.exportMw)}</dd>
        <dt>GB connection site</dt>
        <dd>{orNotPublished(link.connectionSite)}</dd>
        <dt>GB landing point</dt>
        <dd>
          {link.gbEnd ? (
            <>
              <a href={link.gbEnd.osm} target="_blank" rel="noreferrer">
                {link.gbEnd.name}
              </a>
              {END_NOTES[link.gbEnd.kind ?? ''] ?? ''}
            </>
          ) : (
            NOT_PUBLISHED
          )}
        </dd>
        <dt>{link.partner} landing point</dt>
        <dd>
          {link.partnerEnd ? (
            <a href={link.partnerEnd.osm} target="_blank" rel="noreferrer">
              {link.partnerEnd.name}
            </a>
          ) : (
            NOT_PUBLISHED
          )}
        </dd>
        <dt>In service since</dt>
        <dd>{orNotPublished(link.commissioned)}</dd>
      </dl>

      {link.milestones.length > 0 && (
        <section className="card-phases">
          <h3>Ofgem milestones</h3>
          <ul>
            {link.milestones.map((m) => (
              <li key={m.type}>
                <a href={m.source} target="_blank" rel="noreferrer">
                  {m.label}
                </a>
                , {formatDate(m.date)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!link.gbEnd && (
        <p className="card-notes">
          No GB landing point has been published yet, so this interconnector is not drawn on the
          map.
        </p>
      )}

      <footer className="card-footer">
        Capacity, status and connection site:{' '}
        <a href={source.page} target="_blank" rel="noreferrer">
          {source.name}
        </a>
        . Landing points: © OpenStreetMap contributors. The cable on the map is a straight schematic
        line, not the real route.
        {link.sources.length > 0 && (
          <>
            {' '}
            Also:{' '}
            {link.sources.map((url, i) => (
              <span key={url}>
                {i > 0 && ', '}
                <a href={url} target="_blank" rel="noreferrer">
                  {new URL(url).hostname.replace(/^www\./, '')}
                </a>
              </span>
            ))}
            .
          </>
        )}
      </footer>
    </aside>
  );
}
