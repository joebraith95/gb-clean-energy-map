import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadProjects, type ProjectIndex } from './data/projects';
import { loadGrid, type GridFile } from './map/grid';
import { MapCanvas } from './map/MapCanvas';
import { AboutPage } from './ui/AboutPage';
import { FilterPanel } from './ui/FilterPanel';
import { DEFAULT_FILTERS, makeInclude, type Filters } from './ui/filters';
import { ProjectCard } from './ui/ProjectCard';

interface MapData {
  grid: GridFile;
  projects: ProjectIndex;
}

const ABOUT_HASH = '#about';
const PROJECT_PARAM = 'project';
/** Matches the CSS breakpoint below which panels are bottom sheets. */
const NARROW = '(max-width: 767px)';

export function App() {
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(() => window.location.hash === ABOUT_HASH);

  useEffect(() => {
    Promise.all([loadGrid(), loadProjects()])
      .then(([grid, projects]) => {
        setData({ grid, projects });
        // A shared link such as ?project=2541 opens that project's card.
        const shared = Number(new URLSearchParams(window.location.search).get(PROJECT_PARAM));
        const index = projects.id.indexOf(shared);
        if (index >= 0) setSelected(index);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // Keep the address shareable: it names the open project, if any.
  useEffect(() => {
    if (!data) return;
    const url = new URL(window.location.href);
    if (selected === null) url.searchParams.delete(PROJECT_PARAM);
    else url.searchParams.set(PROJECT_PARAM, String(data.projects.id[selected]));
    history.replaceState(null, '', url);
  }, [data, selected]);

  useEffect(() => {
    const onHash = () => setAboutOpen(window.location.hash === ABOUT_HASH);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const include = useMemo(
    () => (data ? makeInclude(data.projects, filters) : () => false),
    [data, filters],
  );
  const indexById = useMemo(() => new Map(data?.projects.id.map((id, i) => [id, i]) ?? []), [data]);

  const closeCard = useCallback(() => setSelected(null), []);
  // On narrow screens the card and filter panel share the bottom sheet, so one closes the other.
  const selectProject = useCallback((index: number | null) => {
    setSelected(index);
    if (index !== null && window.matchMedia(NARROW).matches) setFiltersOpen(false);
  }, []);
  const toggleFilters = useCallback(() => {
    setFiltersOpen((open) => {
      if (!open && window.matchMedia(NARROW).matches) setSelected(null);
      return !open;
    });
  }, []);
  const closeAbout = useCallback(() => {
    history.replaceState(null, '', window.location.pathname + window.location.search);
    setAboutOpen(false);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>GB Clean Energy Map</h1>
        <nav className="header-actions">
          <button
            type="button"
            className="button"
            aria-expanded={filtersOpen}
            onClick={toggleFilters}
          >
            Filters
          </button>
          <a className="button" href={ABOUT_HASH}>
            About
          </a>
        </nav>
      </header>

      <main
        className={`app-main${selected !== null ? ' card-open' : ''}${filtersOpen ? ' panel-open' : ''}`}
      >
        {data && (
          <MapCanvas
            grid={data.grid}
            projects={data.projects}
            include={include}
            selected={selected}
            onSelect={selectProject}
          />
        )}
        {!data && !error && <p className="status">Loading map data…</p>}
        {error && <p className="status">The map data could not be loaded. {error}</p>}

        {data && filtersOpen && (
          <FilterPanel
            projects={data.projects}
            filters={filters}
            onChange={setFilters}
            onClose={() => setFiltersOpen(false)}
          />
        )}
        {data && selected !== null && (
          <ProjectCard
            key={data.projects.id[selected]}
            projects={data.projects}
            index={selected}
            indexById={indexById}
            onSelect={selectProject}
            onClose={closeCard}
          />
        )}

        <p className="credit">
          Data: DESNZ REPD, ONS, OS (OGL). <a href={ABOUT_HASH}>About the data</a>
        </p>
      </main>

      {data && aboutOpen && <AboutPage projects={data.projects} onClose={closeAbout} />}
    </div>
  );
}
