import { useMemo, useState } from 'react';
import type { Change, ChangeFile } from '../data/changes';
import { FEED_TYPES, changeLabel, filterChanges, groupByMonth, type FeedType } from './feed';
import type { Filters } from './filters';
import { formatDate, formatMw } from './format';

interface Props {
  changes: ChangeFile | null;
  error: string | null;
  filters: Filters;
  /** Whether a change's project or interconnector can be opened on the map. */
  canOpen: (change: Change) => boolean;
  onOpen: (change: Change) => void;
  onClose: () => void;
}

const PAGE = 50;

export function FeedPanel({ changes, error, filters, canOpen, onOpen, onClose }: Props) {
  const [feedType, setFeedType] = useState<FeedType>('all');
  const [shown, setShown] = useState(PAGE);

  const matching = useMemo(
    () => (changes ? filterChanges(changes.changes, filters, feedType) : []),
    [changes, filters, feedType],
  );
  const groups = groupByMonth(matching.slice(0, shown));

  return (
    <aside className="panel feed" aria-labelledby="feed-title">
      <div className="panel-head">
        <h2 id="feed-title">What changed</h2>
        <button type="button" className="card-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {error && <p className="card-error">The change list could not be loaded. {error}</p>}
      {!changes && !error && <p className="muted">Loading changes…</p>}

      {changes && (
        <>
          <p className="muted">
            Stage and grid connection changes in the last {changes.windowMonths} months, for
            projects that match your filters. Dates come from the Renewable Energy Planning
            Database; changes it does not date are marked with the release or register they were
            spotted in.
          </p>

          <div className="feed-types" role="group" aria-label="Type of change">
            {(Object.keys(FEED_TYPES) as FeedType[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`feed-type${key === feedType ? ' active' : ''}`}
                aria-pressed={key === feedType}
                onClick={() => {
                  setFeedType(key);
                  setShown(PAGE);
                }}
              >
                {FEED_TYPES[key].label}
              </button>
            ))}
          </div>

          <p className="muted" aria-live="polite">
            {matching.length.toLocaleString('en-GB')} changes
          </p>

          {groups.map((group) => (
            <section key={group.month} className="feed-month">
              <h3>{group.month}</h3>
              <ul>
                {group.changes.map((change) => (
                  <li key={`${change.source}:${change.id}:${change.type}:${change.date}`}>
                    <FeedItem change={change} canOpen={canOpen(change)} onOpen={onOpen} />
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {shown < matching.length && (
            <button type="button" className="button" onClick={() => setShown(shown + PAGE)}>
              Show more
            </button>
          )}
        </>
      )}
    </aside>
  );
}

function FeedItem({
  change,
  canOpen,
  onOpen,
}: {
  change: Change;
  canOpen: boolean;
  onOpen: (change: Change) => void;
}) {
  const when =
    change.dateKind === 'event' ? formatDate(change.date) : `Spotted in ${change.spottedIn}`;
  const stageVar = change.stage ? `var(--stage-${change.stage.replaceAll('_', '-')})` : undefined;
  const body = (
    <>
      <span className="feed-label">
        <span className="swatch" style={{ background: stageVar }} aria-hidden="true" />
        {changeLabel(change)}
      </span>
      <span className="feed-name">{change.name ?? 'Name not published'}</span>
      <span className="feed-meta">
        {when} · {change.technology} · {formatMw(change.mw)}
      </span>
    </>
  );
  return canOpen ? (
    <button type="button" className="feed-item" onClick={() => onOpen(change)}>
      {body}
    </button>
  ) : (
    <div className="feed-item">{body}</div>
  );
}
