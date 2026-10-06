import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadChanges, type Change, type ChangeFile } from './data/changes';
import { loadInterconnectors, type InterconnectorFile } from './data/interconnectors';
import { loadProjects, type ProjectIndex } from './data/projects';
import { loadGrid, type GridFile } from './map/grid';
import { MapCanvas } from './map/MapCanvas';
import type { Selection } from './map/markers';
import { AboutPage } from './ui/AboutPage';
import { FeedPanel } from './ui/FeedPanel';
import { FilterPanel } from './ui/FilterPanel';
import { DEFAULT_FILTERS, makeInclude, makeIncludeLink, type Filters } from './ui/filters';
import { InterconnectorCard } from './ui/InterconnectorCard';
import { ProjectCard } from './ui/ProjectCard';

interface MapData {
  grid: GridFile;
  projects: ProjectIndex;
  links: InterconnectorFile;
}

const ABOUT_HASH = '#about';
/** Shareable links: ?project=<REPD ID> or ?interconnector=<id>. */
const PROJECT_PARAM = 'project';
const LINK_PARAM = 'interconnector';
/** Matches the CSS breakpoint below which panels are bottom sheets. */
const NARROW = '(max-width: 767px)';

function selectionFromUrl(data: MapData): Selection | null {
  const params = new URLSearchParams(window.location.search);
  const project = data.projects.id.indexOf(Number(params.get(PROJECT_PARAM)));
  if (project >= 0) return { source: 'project', index: project };
  const link = data.links.interconnectors.findIndex((l) => l.id === params.get(LINK_PARAM));
  if (link >= 0) return { source: 'interconnector', index: link };
  return null;
}

export function App() {
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  /** The side panel (bottom sheet on phones): filters or the change feed, one at a time. */
  const [panel, setPanel] = useState<'filters' | 'feed' | null>(null);
  const [changes, setChanges] = useState<ChangeFile | null>(null);
  const [changesError, setChangesError] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(() => window.location.hash === ABOUT_HASH);

  useEffect(() => {
    Promise.all([loadGrid(), loadProjects(), loadInterconnectors()])
      .then(([grid, projects, links]) => {
        const loaded = { grid, projects, links };
        setData(loaded);
        setSelected(selectionFromUrl(loaded));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // The change list is not needed for the first view, so it loads after the map data.
  useEffect(() => {
    if (!data) return;
    loadChanges()
      .then(setChanges)
      .catch((e: Error) => setChangesError(e.message));
  }, [data]);

  // Keep the address shareable: it names the open project or interconnector, if any.
  useEffect(() => {
    if (!data) return;
    const url = new URL(window.location.href);
    url.searchParams.delete(PROJECT_PARAM);
    url.searchParams.delete(LINK_PARAM);
    if (selected?.source === 'project') {
      url.searchParams.set(PROJECT_PARAM, String(data.projects.id[selected.index]));
    } else if (selected?.source === 'interconnector') {
      url.searchParams.set(LINK_PARAM, data.links.interconnectors[selected.index].id);
    }
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
  const includeLink = useMemo(
    () => (data ? makeIncludeLink(data.links.interconnectors, filters) : () => false),
    [data, filters],
  );
  const indexById = useMemo(() => new Map(data?.projects.id.map((id, i) => [id, i]) ?? []), [data]);

  const closeCard = useCallback(() => setSelected(null), []);
  // On narrow screens the card and the side panel share the bottom sheet, so one closes the other.
  const select = useCallback((selection: Selection | null) => {
    setSelected(selection);
    if (selection !== null && window.matchMedia(NARROW).matches) setPanel(null);
  }, []);
  const selectProject = useCallback(
    (index: number) => select({ source: 'project', index }),
    [select],
  );
  const togglePanel = useCallback((which: 'filters' | 'feed') => {
    setPanel((open) => {
      if (open !== which && window.matchMedia(NARROW).matches) setSelected(null);
      return open === which ? null : which;
    });
  }, []);
  const closePanel = useCallback(() => setPanel(null), []);

  const selectionForChange = useCallback(
    (change: Change): Selection | null => {
      if (!data) return null;
      if (change.source === 'project') {
        const index = indexById.get(Number(change.id));
        return index === undefined ? null : { source: 'project', index };
      }
      const index = data.links.interconnectors.findIndex((l) => l.id === change.id);
      return index < 0 ? null : { source: 'interconnector', index };
    },
    [data, indexById],
  );
  const openChange = useCallback(
    (change: Change) => select(selectionForChange(change)),
    [select, selectionForChange],
  );
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
            aria-expanded={panel === 'filters'}
            onClick={() => togglePanel('filters')}
          >
            Filters
          </button>
          <button
            type="button"
            className="button"
            aria-expanded={panel === 'feed'}
            aria-label="What changed"
            onClick={() => togglePanel('feed')}
          >
            Changes
          </button>
          <a className="button" href={ABOUT_HASH}>
            About
          </a>
        </nav>
      </header>

      <main
        className={`app-main${selected !== null ? ' card-open' : ''}${panel ? ' panel-open' : ''}`}
      >
        {data && (
          <MapCanvas
            grid={data.grid}
            projects={data.projects}
            links={data.links.interconnectors}
            include={include}
            includeLink={includeLink}
            selected={selected}
            onSelect={select}
          />
        )}
        {!data && !error && <p className="status">Loading map data…</p>}
        {error && <p className="status">The map data could not be loaded. {error}</p>}

        {data && panel === 'filters' && (
          <FilterPanel
            projects={data.projects}
            links={data.links.interconnectors}
            filters={filters}
            onChange={setFilters}
            onClose={closePanel}
          />
        )}
        {data && panel === 'feed' && (
          <FeedPanel
            changes={changes}
            error={changesError}
            filters={filters}
            canOpen={(change) => selectionForChange(change) !== null}
            onOpen={openChange}
            onClose={closePanel}
          />
        )}
        {data && selected?.source === 'project' && (
          <ProjectCard
            key={data.projects.id[selected.index]}
            projects={data.projects}
            index={selected.index}
            indexById={indexById}
            onSelect={selectProject}
            onClose={closeCard}
          />
        )}
        {data && selected?.source === 'interconnector' && (
          <InterconnectorCard
            link={data.links.interconnectors[selected.index]}
            source={data.links.source}
            onClose={closeCard}
          />
        )}

        <p className="credit">
          Data: DESNZ, NESO, ONS, OS (OGL), © OpenStreetMap contributors.{' '}
          <a href={ABOUT_HASH}>About the data</a>
        </p>
      </main>

      {data && aboutOpen && (
        <AboutPage projects={data.projects} links={data.links} onClose={closeAbout} />
      )}
    </div>
  );
}
