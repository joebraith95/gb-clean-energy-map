import { useEffect, useRef } from 'react';
import type { InterconnectorFile } from '../data/interconnectors';
import type { ProjectIndex } from '../data/projects';
import { formatDate } from './format';

interface Props {
  projects: ProjectIndex;
  links: InterconnectorFile;
  onClose: () => void;
}

const REPD_ATTRIBUTION =
  'Contains public sector information licensed under the Open Government Licence v3.0.';
const ONS_ATTRIBUTION =
  'Source: Office for National Statistics licensed under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right 2024.';
const NESO_ATTRIBUTION = 'Supported by National Energy SO Open Data';
const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

export function AboutPage({ projects, links, onClose }: Props) {
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
                <td>
                  <a href={links.source.page} target="_blank" rel="noreferrer">
                    Interconnector Register
                  </a>{' '}
                  (NESO)
                </td>
                <td>Interconnector capacity, status and GB connection site</td>
                <td>NESO Open Data Licence</td>
                <td>Twice a week</td>
              </tr>
              {projects.connectionSource && (
                <tr>
                  <td>
                    <a href={projects.connectionSource.page} target="_blank" rel="noreferrer">
                      TEC register
                    </a>{' '}
                    (NESO)
                  </td>
                  <td>Grid connection agreements, Gate 2 status and contracted dates</td>
                  <td>NESO Open Data Licence</td>
                  <td>Several times a week. The map refreshes weekly.</td>
                </tr>
              )}
              <tr>
                <td>
                  <a
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noreferrer"
                  >
                    OpenStreetMap
                  </a>
                </td>
                <td>Interconnector landing points and grid connection substations</td>
                <td>Open Database Licence (ODbL)</td>
                <td>Checked when the interconnector list is updated</td>
              </tr>
              <tr>
                <td>Ofgem decisions</td>
                <td>Interconnector milestones under the cap and floor regime</td>
                <td>Open Government Licence v3.0</td>
                <td>As decisions are published</td>
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
        <p className="attribution">{NESO_ATTRIBUTION}.</p>
        <p className="attribution">
          Interconnector landing points and connection substations {OSM_ATTRIBUTION}, available
          under the Open Database Licence.
        </p>
        <p className="attribution">Made with Natural Earth.</p>

        <h3>How stages are worked out</h3>
        <p>
          Each project gets one headline stage from its REPD status. Applications submitted or under
          appeal are <strong>In planning</strong>. Projects awaiting construction are{' '}
          <strong>Consented</strong>. Then come <strong>Under construction</strong> and{' '}
          <strong>Operational</strong>. Projects that were refused, withdrawn, abandoned or whose
          permission expired are treated as stalled. Stalled and decommissioned projects are kept in
          the data but not shown on the map. <strong>Early development</strong> means a project has
          a grid connection agreement but has not yet applied for planning permission; these come
          from the NESO TEC register (see below).
        </p>

        <h3>Grid connections</h3>
        <p>
          The connection badge on a project card comes from the NESO Transmission Entry Capacity
          (TEC) register, which lists agreements to connect to the transmission network.{' '}
          <strong>Energised</strong> means the register shows the connection as built and REPD shows
          the project as operational; where they disagree, REPD wins.{' '}
          <strong>Gate 2 contracted</strong> means the project holds a Gate 2 agreement under the
          reformed connections process; the card then shows the connection site and the contracted
          date. A contracted date is the date in the agreement, not a forecast, and it never moves a
          project to a different stage. Everything else reads <strong>Not published</strong>,
          including projects with a Gate 1 agreement and most smaller projects, which connect to the
          local distribution network instead.
        </p>
        <p>
          The TEC register has no locations or REPD references, so each agreement is matched to a
          REPD record by its name, technology and capacity, and only where one record clearly fits.
          Some matches are checked by hand. A match can still be wrong, and a project with no clear
          match reads Not published.
        </p>
        <p>
          Projects in the TEC register that are not in REPD are added to the map too. Their stage
          comes from the register: a project still scoping its connection is{' '}
          <strong>Early development</strong>, and later ones take the same stages as REPD projects.
          The register does not say where a project is, so it is drawn at its grid connection
          substation, located from OpenStreetMap, and the card says so. Projects that share a
          substation are spread around it. A project is left off the map when its substation is not
          built yet or cannot be found, or when a REPD record looks like the same project, so
          nothing is shown twice. Storage is only called a battery when the project name says so;
          otherwise it is “Storage (type not published)”.
        </p>

        <h3>Interconnectors</h3>
        <p>
          Interconnectors are part of the flexibility layer, so they appear when storage and
          flexibility are switched on. The map shows those that are built, under construction, or
          approved in principle by Ofgem. Each one is drawn from its GB landing point as a straight
          dashed line towards the other country; this is a schematic, not the real cable route.
          Where no converter station exists yet, the landing point is the grid connection site named
          by NESO. Interconnectors with no published landing point are kept in the data but not
          drawn.
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
