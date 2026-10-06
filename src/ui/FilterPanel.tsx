import type { ProjectIndex } from '../data/projects';
import type { Stage } from '../theme/tokens';
import {
  CAPACITY_STEPS,
  DEFAULT_FILTERS,
  STAGE_LABELS,
  TECH_GROUPS,
  countShown,
  stagesPresent,
  type Filters,
} from './filters';

interface Props {
  projects: ProjectIndex;
  filters: Filters;
  onChange: (filters: Filters) => void;
  onClose: () => void;
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function FilterPanel({ projects, filters, onChange, onClose }: Props) {
  const shown = countShown(projects, filters);
  const stepIndex = Math.max(0, CAPACITY_STEPS.indexOf(filters.minMw));

  const techList = (flexibility: boolean) =>
    TECH_GROUPS.filter((g) => g.flexibility === flexibility).map((group) => (
      <label key={group.key} className="check">
        <input
          type="checkbox"
          checked={filters.techGroups.includes(group.key)}
          onChange={() =>
            onChange({ ...filters, techGroups: toggle(filters.techGroups, group.key) })
          }
        />
        {group.label}
      </label>
    ));

  return (
    <aside className="panel" aria-labelledby="filters-title">
      <div className="panel-head">
        <h2 id="filters-title">Filters</h2>
        <button type="button" className="card-close" onClick={onClose} aria-label="Close filters">
          ×
        </button>
      </div>
      <p className="muted" aria-live="polite">
        {shown.toLocaleString('en-GB')} projects match. The national view shows those of 50 MW or
        more.
      </p>

      <fieldset>
        <legend>Generation</legend>
        {techList(false)}
      </fieldset>

      <fieldset>
        <legend>Flexibility</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={filters.flexibility}
            onChange={() => onChange({ ...filters, flexibility: !filters.flexibility })}
          />
          Show storage and flexibility
        </label>
        {filters.flexibility && <div className="indent">{techList(true)}</div>}
      </fieldset>

      <fieldset>
        <legend>Stage</legend>
        {stagesPresent(projects).map((stage: Stage) => (
          <label key={stage} className="check">
            <input
              type="checkbox"
              checked={filters.stages.includes(stage)}
              onChange={() => onChange({ ...filters, stages: toggle(filters.stages, stage) })}
            />
            <span
              className="swatch"
              style={{ background: `var(--stage-${stage.replaceAll('_', '-')})` }}
              aria-hidden="true"
            />
            {STAGE_LABELS[stage]}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Capacity</legend>
        <label className="slider">
          <span>
            {filters.minMw === 0
              ? 'All sizes'
              : `${filters.minMw.toLocaleString('en-GB')} MW and above`}
          </span>
          <input
            type="range"
            min={0}
            max={CAPACITY_STEPS.length - 1}
            step={1}
            value={stepIndex}
            aria-valuetext={filters.minMw === 0 ? 'All sizes' : `${filters.minMw} MW and above`}
            onChange={(e) =>
              onChange({ ...filters, minMw: CAPACITY_STEPS[Number(e.target.value)] })
            }
          />
        </label>
      </fieldset>

      <button type="button" className="button" onClick={() => onChange(DEFAULT_FILTERS)}>
        Reset filters
      </button>
    </aside>
  );
}
