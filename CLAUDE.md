# GB Clean Energy Map

A personal project, shared publicly. A satellite map of Great Britain showing renewable, storage and interconnector projects through their lifecycle, with a live layer for generation. Region lines and place names sit over the imagery. The information comes first; the map is there to give it a real setting, never at the cost of readability.

The full product spec is in `docs/SPEC.md`. Read it before starting any new feature or phase.

## Stack

- Front end: Vite, React, TypeScript
- Map rendering: MapLibre GL JS. Satellite imagery is Sentinel-2 cloudless (EOX), place names are OpenStreetMap vector tiles from OpenFreeMap; neither needs a key. No roads or other street-map layers.
- Data pipeline: Python (pandas, pyproj), run on a schedule by GitHub Actions, writing static JSON
- Live data: a Cloudflare Worker that calls third-party APIs and caches responses
- Hosting: Cloudflare Pages

## Repo layout (target)

```
/pipeline      Python ingest, cleaning, stage mapping, change detection
/data          Generated JSON (projects, details, changes, interconnectors, boundaries) and snapshots/ (stage snapshots and the spotted-change log); served as Vite's public dir
/functions     Cloudflare Pages Functions (the Worker) for live data, served at /api
/src           Front end
  /data        Loading and types for the generated JSON
  /map         MapLibre view and style, zoom bands, marker icons, animations
  /ui          Filters, project card, change feed, about page
  /theme       Palette tokens, fonts
/assets        Boundary source files for the region lines
/docs          SPEC.md and notes
```

Marker icons are drawn in code (`src/map/icons.ts`) on a canvas, coloured from theme tokens, not stored as image files. The map style is in `src/map/style.ts`.

## Commands

Front end (repo root):
- `npm run dev`: dev server at http://localhost:5173
- `npm run build`: type-check and build to `dist/`
- `npm test`: Vitest
- `npm run lint` / `npm run format`: ESLint / Prettier
- `npm run dev:api`: build, then serve the site and live API with wrangler at http://localhost:8788; `npm run dev` proxies `/api` to it

Pipeline (repo root, using the venv at `pipeline/.venv`):
- Set up once: `python -m venv pipeline/.venv` then `pipeline/.venv/Scripts/python -m pip install -r pipeline/requirements.txt`
- Run: `pipeline/.venv/Scripts/python -m pipeline.run --report` (downloads the latest REPD, Interconnector Register and TEC register; add `--offline` to reuse the cached copies in `pipeline/raw/`)
- TEC matching: fixes go in `pipeline/tec_matches.json`; each run writes `pipeline/raw/tec-match-review.csv` for checking matches by hand
- Connection sites: `pipeline/.venv/Scripts/python -m pipeline.substation_candidates` (add `--fetch` to re-download OpenStreetMap substations) rewrites `pipeline/substations.json`; check it before committing
- Region lines: `pipeline/.venv/Scripts/python -m pipeline.build_boundaries` (add `--fetch` to re-download the ONS and NESO boundary sources into `assets/boundaries/`) rewrites `data/boundaries.json`
- Tests: `pipeline/.venv/Scripts/python -m pytest pipeline`

Deploy: pushing to `main` deploys the site through Cloudflare Pages (build `npm run build`, output `dist`, Node version from `.node-version`). GitHub Actions run CI on every push and refresh `data/` every Monday (`.github/workflows/`). Stop the dev server before `npm ci` on Windows, or locked files break the install.

Worker deploy: the live API in `functions/` deploys with the site on every push to `main`; no separate step.

## Rules

**Data**
- Never invent or estimate data. A missing field shows "Not published".
- Data stays in British National Grid (EPSG:27700), as its sources publish it. The map converts to longitude and latitude only as it draws (`src/map/bng.ts`); `data/boundaries.json` is the one file stored in longitude and latitude.
- Stalled projects are hidden on the map but always kept in the data.
- A connection date is always labelled "Contracted date", never "expected", and never moves a project to a later stage.
- The stage model and source mappings in SPEC.md are the single source of truth. If source data doesn't fit them, stop and ask rather than adding a new stage.
- When changing the pipeline, run it on the current data and show the before and after counts per stage and technology.

**Rendering and design**
- The map is flat and north-up: no rotation or tilt. Zoom is smooth; the zoom bands in `src/map/levels.ts` decide which projects are drawn.
- Every marker has a light ring and a dark edge so it reads on any imagery. Lines and lettering over the imagery get a dark casing or halo for the same reason.
- One typeface (the body font) throughout.
- All colours come from the tokens in `/src/theme`. Stage colours must stay distinguishable for colour-blind users.
- Mobile first: everything must work at 380px wide.
- Respect `prefers-reduced-motion`.

**Live data**
- The browser never calls third-party data APIs directly. Everything goes through the Worker. Map tiles (imagery, place names, fonts) are the exception: the browser loads them straight from EOX and OpenFreeMap.
- Only show a live section where live data genuinely exists. No empty states for projects without it.

**Copy**
- British English, plain language, no em dashes.

## Workflow

- Build in the phases set out in SPEC.md. Don't start a phase until the previous phase meets its "done when" criteria.
- Ask before adding a new dependency.
- Items under "To verify" in SPEC.md must be checked against the live source before code depends on them.
