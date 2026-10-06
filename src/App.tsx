import { useEffect, useState } from 'react';
import { loadProjects, type ProjectIndex } from './data/projects';
import { loadGrid, type GridFile } from './map/grid';
import { MapCanvas } from './map/MapCanvas';

interface MapData {
  grid: GridFile;
  projects: ProjectIndex;
}

export function App() {
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([loadGrid(), loadProjects()])
      .then(([grid, projects]) => setData({ grid, projects }))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>GB Clean Energy Map</h1>
      </header>
      <main className="app-main">
        {data && <MapCanvas grid={data.grid} projects={data.projects} onSelect={setSelected} />}
        {!data && !error && <p className="status">Loading map data…</p>}
        {error && <p className="status">The map data could not be loaded. {error}</p>}
      </main>
      {/* Placeholder until the project card arrives in phase 1 step 5. */}
      {data && selected !== null && (
        <div className="selection" aria-live="polite">
          {data.projects.name[selected]} · {data.projects.mw[selected]} MW
        </div>
      )}
    </div>
  );
}
