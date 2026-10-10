# GB Clean Energy Map

A satellite map of Great Britain showing renewable, storage and interconnector projects and how far each has got, from planning to operation. An unofficial personal project.

The product spec is in [docs/SPEC.md](docs/SPEC.md), and working notes for contributors (including Claude Code) are in [CLAUDE.md](CLAUDE.md).

## How it works

- `pipeline/` (Python) downloads the Renewable Energy Planning Database and the NESO Interconnector Register, applies the stage rules in the spec, and writes static JSON to `data/`.
- `src/` (Vite, React, TypeScript, MapLibre GL JS) draws the projects from that JSON over satellite imagery, with region lines and place names.
- A GitHub Action reruns the pipeline every Monday and commits any changes; Cloudflare Pages deploys each commit to `main`.

## Running it locally

See the Commands section of [CLAUDE.md](CLAUDE.md). In short: `npm install` then `npm run dev`.

## Data sources and licences

| Source | Licence |
|---|---|
| Renewable Energy Planning Database (DESNZ) | Open Government Licence v3.0 |
| NESO Interconnector Register | NESO Open Data Licence v1.0. Supported by National Energy SO Open Data. |
| ONS International Territorial Level 1 boundaries (January 2025) | Open Government Licence v3.0. Contains OS data © Crown copyright and database right 2025. |
| NESO DNO licence area boundaries | NESO Open Data Licence v1.0. Supported by National Energy SO Open Data. |
| Sentinel-2 cloudless imagery (EOX) | CC BY-NC-SA 4.0, for non-commercial use. Sentinel-2 cloudless by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2025). |
| OpenStreetMap (place names via OpenFreeMap, interconnector landing points) | Open Database Licence. © OpenStreetMap contributors. `data/interconnectors.json` is a derived database and is available under the ODbL. |
| Ofgem decisions | Open Government Licence v3.0 |

## Licence for the code

No licence has been chosen yet, so the code is © the author, all rights reserved. The data files keep the licences of their sources, listed above.

## Disclaimer

This is not an official source and may contain errors, including errors from matching across sources. Check the original sources before relying on any figure.
