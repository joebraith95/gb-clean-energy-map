# GB Clean Energy Map

A personal project, shared publicly. A pixel-art (8-bit style) flat map of Great Britain showing renewable, storage and interconnector projects through their lifecycle, with a live layer for generation. The information comes first; the retro look is there to make it fun, never at the cost of readability.

The full product spec is in `docs/SPEC.md`. Read it before starting any new feature or phase.

## Stack

- Front end: Vite, React, TypeScript
- Map rendering: PixiJS on a canvas (no MapLibre or street tiles; the map is a stylised GB grid)
- Data pipeline: Python (pandas, pyproj), run on a schedule by GitHub Actions, writing static JSON
- Live data: a Cloudflare Worker that calls third-party APIs and caches responses
- Hosting: Cloudflare Pages

## Repo layout (target)

```
/pipeline      Python ingest, cleaning, stage mapping, change detection
/data          Generated JSON (projects, details, changes, interconnectors, grid) and snapshots/ (stage snapshots and the spotted-change log); served as Vite's public dir
/functions     Cloudflare Pages Functions (the Worker) for live data, served at /api
/src           Front end
  /data        Loading and types for the generated JSON
  /map         PixiJS renderer, grid levels, sprites, animations
  /ui          Filters, project card, change feed, about page
  /theme       Palette tokens, fonts
/assets        Sprite sheets, GB grid source files
/docs          SPEC.md and notes
```

Sprites are defined in code (`src/map/sprites.ts`) as character grids coloured from theme tokens, not as image files.

## Commands

Front end (repo root):
- `npm run dev`: dev server at http://localhost:5173
- `npm run build`: type-check and build to `dist/`
- `npm test`: Vitest
- `npm run lint` / `npm run format`: ESLint / Prettier
- `npm run dev:api`: build, then serve the site and live API with wrangler at http://localhost:8788; `npm run dev` proxies `/api` to it

Pipeline (repo root, using the venv at `pipeline/.venv`):
- Set up once: `python -m venv pipeline/.venv` then `pipeline/.venv/Scripts/python -m pip install -r pipeline/requirements.txt`
- Run: `pipeline/.venv/Scripts/python -m pipeline.run --report` (downloads the latest REPD; add `--offline` to reuse the cached copy in `pipeline/raw/`)
- Land grid: `pipeline/.venv/Scripts/python -m pipeline.build_grid` (add `--fetch` to re-download the coastline sources into `assets/grid/`)
- Tests: `pipeline/.venv/Scripts/python -m pytest pipeline`

Deploy: pushing to `main` deploys the site through Cloudflare Pages (build `npm run build`, output `dist`, Node version from `.node-version`). GitHub Actions run CI on every push and refresh `data/` every Monday (`.github/workflows/`). Stop the dev server before `npm ci` on Windows, or locked files break the install.

Worker deploy: the live API in `functions/` deploys with the site on every push to `main`; no separate step.

## Rules

**Data**
- Never invent or estimate data. A missing field shows "Not published".
- Coordinates stay in British National Grid (EPSG:27700) from source to screen. Only interconnector partner countries need anything else.
- Stalled projects are hidden on the map but always kept in the data.
- A connection date is always labelled "Contracted date", never "expected", and never moves a project to a later stage.
- The stage model and source mappings in SPEC.md are the single source of truth. If source data doesn't fit them, stop and ask rather than adding a new stage.
- When changing the pipeline, run it on the current data and show the before and after counts per stage and technology.

**Rendering and design**
- Pixel-perfect rendering: nearest-neighbour scaling, integer zoom factors, no anti-aliasing on map or sprites.
- Zoom snaps between the fixed levels in SPEC.md. No smooth zoom.
- Pixel font for titles and headings only. All numbers and card text use the clean body font.
- All colours come from the tokens in `/src/theme`. Stage colours must stay distinguishable for colour-blind users.
- Mobile first: everything must work at 380px wide.
- Respect `prefers-reduced-motion`.

**Live data**
- The browser never calls third-party APIs directly. Everything goes through the Worker.
- Only show a live section where live data genuinely exists. No empty states for projects without it.

**Copy**
- British English, plain language, no em dashes.

## Workflow

- Build in the phases set out in SPEC.md. Don't start a phase until the previous phase meets its "done when" criteria.
- Ask before adding a new dependency.
- Items under "To verify" in SPEC.md must be checked against the live source before code depends on them.
