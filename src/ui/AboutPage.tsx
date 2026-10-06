import { useEffect, useRef } from 'react';
import type { ProjectIndex } from '../data/projects';
import { formatDate } from './format';

interface Props {
  projects: ProjectIndex;
  onClose: () => void;
}

const REPD_ATTRIBUTION =
  'Contains public sector information licensed under the Open Government Licence v3.0.';
const ONS_ATTRIBUTION =
  'Source: Office for National Statistics licensed under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right 2024.';

export function AboutPage({ projects, onClose }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="about" role="dialog" aria-modal="true" aria-labelledby="about-title">
      <div className="about-inner">
        <button type="button" className="card-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 id="about-title" ref={headingRef} tabIndex={-1}>
          About the data
        </h2>

        <p>
          This map shows renewable generation and storage projects in Great Britain and how far each
          has got, from planning to operation. It is an unofficial personal project. It shows the
          most recent published data, which is updated every few months, so it is not a live picture
          of the pipeline.
        </p>

        <h3>Sources</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Used for</th>
                <th scope="col">Licence</th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <a href={projects.source.page} target="_blank" rel="noreferrer">
                    Renewable Energy Planning Database
                  </a>{' '}
                  (DESNZ)
                </td>
                <td>Projects, locations, planning status and dates</td>
                <td>Open Government Licence v3.0</td>
                <td>Quarterly. Current release published {formatDate(projects.source.updated)}.</td>
              </tr>
              <tr>
                <td>Countries boundaries, December 2024 (ONS)</td>
                <td>The coastline of Great Britain</td>
                <td>Open Government Licence v3.0</td>
                <td>When ONS republishes</td>
              </tr>
              <tr>
                <td>Natural Earth</td>
                <td>Land outside Great Britain, shown in grey</td>
                <td>Public domain</td>
                <td>Rarely</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="attribution">{REPD_ATTRIBUTION}</p>
        <p className="attribution">{ONS_ATTRIBUTION}</p>
        <p className="attribution">Made with Natural Earth.</p>

        <h3>How stages are worked out</h3>
        <p>
          Each project gets one headline stage from its REPD status. Applications submitted or under
          appeal are <strong>In planning</strong>. Projects awaiting construction are{' '}
          <strong>Consented</strong>. Then come <strong>Under construction</strong> and{' '}
          <strong>Operational</strong>. Projects that were refused, withdrawn, abandoned or whose
          permission expired are treated as stalled. Stalled and decommissioned projects are kept in
          the data but not shown on the map. <strong>Early development</strong> will be filled in
          once grid connection data is added.
        </p>

        <h3>What is not shown</h3>
        <p>
          Projects in Northern Ireland, and technologies such as biomass and energy from waste, are
          outside the scope of this map. Records with no published location or capacity are kept in
          the data but cannot be placed on the map. Nothing is estimated: where a value is missing,
          the card says “Not published”.
        </p>

        <h3>Corrections and matching</h3>
        <p>
          A small number of REPD records have their coordinates the wrong way round. Where the
          address and postcode make the right location clear, the map corrects it and the project
          card says so. Phases of the same project are linked when their names match once words such
          as “Phase 2” or “Extension” are removed and they are close together. These links are a
          best guess and may contain errors.
        </p>

        <h3>Disclaimer</h3>
        <p>
          This is not an official source. The data may contain errors, including errors from
          matching across sources. Check the original sources before relying on any figure.
        </p>
      </div>
    </div>
  );
}
