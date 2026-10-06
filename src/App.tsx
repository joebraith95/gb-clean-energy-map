import { MapCanvas } from './map/MapCanvas';

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>GB Clean Energy Map</h1>
      </header>
      <main className="app-main">
        <MapCanvas />
      </main>
    </div>
  );
}
