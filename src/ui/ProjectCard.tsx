import { useEffect, useState } from 'react';
import {
  loadDetails,
  type Connection,
  type ConnectionBadge,
  type ProjectDetails,
  type ProjectIndex,
} from '../data/projects';
import { spriteKind } from '../map/sprites';
import type { Stage } from '../theme/tokens';
import { STAGE_LABELS, STAGE_ORDER } from './filters';
import { NOT_PUBLISHED, formatDate, formatMw, orNotPublished } from './format';
import { LiveOutput } from './LiveOutput';
import { TechIcon } from './TechIcon';

interface Props {
  projects: ProjectIndex;
  index: number;
  /** Position in the index arrays for each REPD ID. */
  indexById: Map<number, number>;
  onSelect: (index: number) => void;
  onClose: () => void;
  /** Whether this project has mapped BM units, so a live section can be shown. */
  hasLive: boolean;
}

const OFF_TRACK_LABELS: Record<string, string> = {
  stalled: 'Stalled',
  decommissioned: 'Decommissioned',
};

const BADGE_LABELS: Record<ConnectionBadge, string> = {
  not_published: NOT_PUBLISHED,
  gate2: 'Gate 2 contracted',
  energised: 'Energised',
};

/** How the TEC register projects were linked to this record, in plain words. */
function matchNote(connection: Connection): string {
  const names = connection.tec.map((t) => t.name).join(', ');
  const byHand = connection.tec.every((t) => t.matchedBy === 'override');
  return byHand
    ? `Connection data from the NESO TEC register (${names}), linked to this record by hand.`
    : `Connection data from the NESO TEC register (${names}), matched to this record by name and capacity. The match may be wrong.`;
}

/** The date that evidences each step of the progress bar. Early development has none in REPD. */
function stepDate(stage: Stage, details: ProjectDetails): string | null {
  switch (stage) {
    case 'in_planning':
      return details.dates.submitted;
    case 'consented':
      return details.dates.consented;
    case 'under_construction':
      return details.dates.constructionStart;
    case 'operational':
      return details.dates.operational;
    default:
      return null;
  }
}

export function ProjectCard({ projects, index, indexById, onSelect, onClose, hasLive }: Props) {
  const id = projects.id[index];
  const [details, setDetails] = useState<ProjectDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The parent keys this component by project, so state starts fresh for each one.
  useEffect(() => {
    let current = true;
    loadDetails(id, projects.detailShards)
      .then((d) => current && setDetails(d))
      .catch((e: Error) => current && setError(e.message));
    return () => {
      current = false;
    };
  }, [id, projects.detailShards]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const technology = projects.technologies[projects.tech[index]];
  const anyStage = projects.stage[index] >= 0 ? projects.stages[projects.stage[index]] : null;
  const onTrack = anyStage && anyStage in STAGE_LABELS ? (anyStage as Stage) : null;
  const stageLabel = onTrack
    ? STAGE_LABELS[onTrack]
    : anyStage
      ? OFF_TRACK_LABELS[anyStage]
      : 'Stage not published';
  const reached = onTrack ? STAGE_ORDER.indexOf(onTrack) : -1;
  const badge = projects.connectionBadges[projects.conn[index]] ?? 'not_published';
  const connection = details?.connection ?? null;

  return (
    <aside className="card" aria-labelledby="card-title">
      <button type="button" className="card-close" onClick={onClose} aria-label="Close project">
        ×
      </button>

      <header className="card-top">
        {onTrack && <TechIcon kind={spriteKind(technology)} stage={onTrack} />}
        <div>
          <h2 id="card-title" className="card-name">
            {projects.name[index]}
          </h2>
          <p className="card-sub">
            {technology} · {formatMw(projects.mw[index])}
          </p>
        </div>
      </header>

      <div className="card-chips">
        <span
          className={`chip ${onTrack ? '' : 'chip-off-track'}`}
          style={onTrack ? { background: `var(--stage-${onTrack.replaceAll('_', '-')})` } : {}}
        >
          {stageLabel}
        </span>
        <span className="chip chip-outline">Connection: {BADGE_LABELS[badge]}</span>
      </div>

      {details && (
        <ol className="progress" aria-label="Progress">
          {STAGE_ORDER.map((stage, i) => {
            const date = stepDate(stage, details);
            const done = onTrack ? i <= reached : Boolean(date);
            return (
              <li key={stage} className={done ? 'done' : ''}>
                <span className="progress-label">{STAGE_LABELS[stage]}</span>
                {done && date && <span className="progress-date">{formatDate(date)}</span>}
              </li>
            );
          })}
        </ol>
      )}

      {error && <p className="card-error">Details could not be loaded. {error}</p>}
      {!details && !error && <p className="card-loading">Loading details…</p>}

      {details && (
        <>
          {details.corrections.length > 0 && (
            <ul className="card-notes">
              {details.corrections.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}

          <dl className="card-details">
            <dt>Local planning authority</dt>
            <dd>{orNotPublished(details.planningAuthority)}</dd>
            <dt>Region</dt>
            <dd>{orNotPublished(details.region)}</dd>
            {details.offshore !== null && (
              <>
                <dt>Location</dt>
                <dd>{details.offshore ? 'Offshore' : 'Onshore'}</dd>
              </>
            )}
            <dt>Operator or developer</dt>
            <dd>{orNotPublished(details.operator)}</dd>
            <dt>Application submitted</dt>
            <dd>{formatDate(details.dates.submitted)}</dd>
            <dt>Consented</dt>
            <dd>{formatDate(details.dates.consented)}</dd>
            <dt>Construction started</dt>
            <dd>{formatDate(details.dates.constructionStart)}</dd>
            <dt>Operational</dt>
            <dd>{formatDate(details.dates.operational)}</dd>
            <dt>Planning reference</dt>
            <dd>{orNotPublished(details.planningRef)}</dd>
            {details.storageType && (
              <>
                <dt>Storage type</dt>
                <dd>{details.storageType}</dd>
              </>
            )}
            {connection?.badge === 'gate2' && (
              <>
                <dt>Connection site</dt>
                <dd>{orNotPublished(connection.site)}</dd>
                <dt>Contracted date</dt>
                <dd>{formatDate(connection.contractedDate)}</dd>
              </>
            )}
          </dl>

          {connection && <p className="card-note muted small">{matchNote(connection)}</p>}

          {hasLive && <LiveOutput repdId={id} />}

          {details.phases && details.phases.length > 0 && (
            <section className="card-phases">
              <h3>Other phases (matched by name)</h3>
              <ul>
                {details.phases.map((phaseId) => {
                  const phaseIndex = indexById.get(phaseId);
                  if (phaseIndex === undefined) return null;
                  return (
                    <li key={phaseId}>
                      <button type="button" className="link" onClick={() => onSelect(phaseIndex)}>
                        {projects.name[phaseIndex]}
                      </button>{' '}
                      <span className="muted">{formatMw(projects.mw[phaseIndex])}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <footer className="card-footer">
            Source:{' '}
            <a href={projects.source.page} target="_blank" rel="noreferrer">
              Renewable Energy Planning Database (DESNZ)
            </a>
            {projects.source.updated && <>, published {formatDate(projects.source.updated)}</>}.
            REPD ID {id}. Record last updated {formatDate(details.recordUpdated)}.
            {connection && projects.connectionSource && (
              <>
                {' '}
                Connection:{' '}
                <a href={projects.connectionSource.page} target="_blank" rel="noreferrer">
                  TEC register (NESO)
                </a>
                . Supported by National Energy SO Open Data.
              </>
            )}
          </footer>
        </>
      )}
    </aside>
  );
}
