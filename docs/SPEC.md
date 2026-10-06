# GB Clean Energy Map: product spec

## Purpose

A public, personal project showing where clean energy projects in Great Britain are being built, how far along they are, and what the system is generating right now. It should show what has changed recently, not pretend the pipeline data is live.

**In scope:** Great Britain only. Renewables, storage, interconnectors.
**Out of scope for now:** Northern Ireland, demand projects, contested technologies (see below), user accounts.

## Data sources

| Source | Used for | Refresh | Phase |
|---|---|---|---|
| REPD (DESNZ) | Projects, locations, planning status, stage dates | Quarterly | 1 |
| Hand-curated interconnector file | Landing points, partner country, capacity, milestones | Manual | 1 |
| NESO TEC register | Transmission connection contracts and dates | Frequent | 4 |
| NESO TEC register, `Gate` column | Gate 1 or Gate 2 status (blank until the agreement is countersigned) | Twice weekly | 4 |
| Elexon Insights API | Generation by fuel type, interconnector flows, large wind farm output | Near real time | 3 |
| NESO Carbon Intensity API | Regional mix and carbon intensity | Half-hourly | 3 |
| Sheffield Solar PV_Live | National and regional solar estimate | Half-hourly | 3 |
| DNO embedded capacity registers | Distribution connection data | Varies | Optional |

## Technologies

**Included**
- Generation: onshore wind, offshore wind, solar, hydro, tidal, wave
- Flexibility layer (own toggle): batteries, pumped storage, other storage types in REPD, interconnectors

**Excluded:** biomass, energy from waste, landfill gas, anaerobic digestion, sewage gas, advanced conversion technologies, geothermal, hot dry rocks, fuel cells, heat pumps, unknown.

**REPD `Technology Type` values (July 2026 release)**
- Generation: Wind Onshore, Wind Offshore, Solar Photovoltaics, Small Hydro, Large Hydro, Tidal Stream, Tidal Lagoon, Shoreline Wave
- Flexibility: Battery, Pumped Storage Hydroelectricity, Liquid Air Energy Storage, Compressed Air Energy Storage, Flywheels, Hydrogen
- Excluded: Biomass (dedicated), Biomass (co-firing), EfW Incineration, Landfill Gas, Anaerobic Digestion, Sewage Sludge Digestion, Advanced Conversion Technologies, Geothermal, Hot Dry Rocks (HDR), Fuel Cell (Hydrogen), Air Source Heat Pumps, Unknown
- Any value not listed here stops the pipeline with an error rather than being guessed.

## Stage model

### Headline stage (drives map colour and animations)

1. Early development
2. In planning
3. Consented
4. Under construction
5. Operational (including partly energised)

Off track, hidden on the map but kept in the data: **Stalled**, **Decommissioned**.

### REPD status mapping (verified against the July 2026 release)

Mapped from the `Development Status (short)` column. The long `Development Status` column has inconsistent spellings and is not used. "Appeal Granted" and Secretary of State outcomes are already folded into the short values.

| REPD status (short) | Headline stage |
|---|---|
| Application Submitted, Appeal Lodged | In planning |
| Awaiting Construction (and any "appeal granted" equivalent) | Consented |
| Under Construction | Under construction |
| Operational | Operational |
| Application Refused, Application Withdrawn, Appeal Refused, Appeal Withdrawn, Planning Permission Expired, Abandoned | Stalled |
| Decommissioned | Decommissioned |
| No Application Required | Use the latest stage date present. If none, keep in the data but hide from the map |
| Revised | Superseded record, exclude |

Early development is mainly populated from the TEC register in phase 4.

### REPD file handling

- Latin-1 encoding. Numbers may contain thousands separators. Dates are dd/mm/yyyy.
- Strip whitespace from every header and value, and match columns by their stripped names (some headers contain trailing or double spaces).
- `X-coordinate` and `Y-coordinate` are British National Grid for GB rows. Northern Ireland rows use Irish Grid and are excluded, as the map covers Great Britain only.

### Connection badge (shown on the card, separate from the headline stage)

- **Not published:** no connection data (expected for most distribution-connected projects)
- **Gate 2 contracted:** with contracted date
- **Energised**

"Contracted" means Gate 2 only.

### Interconnectors

Ofgem cap and floor milestones mapped onto the same headline stages:
- Initial project assessment approved: In planning
- Final project assessment and main consents: Consented
- Construction: Under construction
- Commissioned: Operational

The milestones themselves appear on the card.

### Phased projects

One dot per phase (one REPD row). The card links to sibling phases. Clustered at national zoom.

## Display rules

- Default capacity filter: 1MW and above, adjustable with a slider. All REPD rows are ingested regardless.
- Filters: technology, headline stage, flexibility layer toggle, capacity.
- Zoom: three fixed levels. National view shows larger projects only; smaller projects appear as you zoom in. Exact cell sizes and per-level capacity thresholds to be tuned in phase 1.
- The map extent must include offshore wind areas as far out as Dogger Bank.
- Capacity is shown by sprite size in three or four tiers.
- Rows with no coordinates or no published capacity are kept in the data but not shown on the map. Nothing is estimated to fill the gap.

## Project card

**Top**
- Name, technology icon, capacity (MW)
- Headline stage chip, connection badge
- Five-step progress bar with dates on completed steps

**Details**
- Local authority, region, onshore or offshore
- Operator or developer
- Dates: application submitted, consented, construction start, operational
- Planning reference, linked to the planning portal where possible
- Connection site and contracted date (Gate 2 projects only)
- Links to sibling phases

**Live (only where it exists)**
- Current output and 24-hour sparkline

**Footer**
- Source and last updated date

## Design

- Flat, top-down pixel-art map of GB, like an old game overworld
- Sprites: turbine with two-frame spinning blades, solar panel, battery, hydro, tidal; interconnectors as dashed cables pulsing out to sea
- Retro-feeling palette, checked for colour-blind safety, rather than copying a console palette exactly
- Pixel font (for example Press Start 2P) for titles only; clean sans-serif for everything else

## Change feed and animations

- Each pipeline run is saved as a snapshot. Changes are found by comparing headline stages per REPD Ref ID.
- Animated events, for projects of 5MW or more: consent granted, construction start, energisation.
- Every stage change, of any size, appears in the "what changed" feed.

## Live layer

- National generation mix and interconnector flows (flow direction animated on the cables)
- Regional mix and carbon intensity
- Output for large wind farms registered in the Balancing Mechanism, using a hand-maintained file that maps BM unit IDs to REPD records
- The UI makes clear that live output is only available for large transmission-connected sites
- Per-unit output comes from Elexon Final Physical Notifications (FPN) adjusted by Bid-Offer Acceptances (BOALF). Metered output (B1610) is published about five days late, so it is not used for the live layer. The card labels this figure "Scheduled output (Elexon)", never as metered output
- National generation mix comes from Elexon's generation by fuel type data (FUELINST)

## Attribution and disclaimer

- "About the data" page: each source, its licence, its refresh frequency
- One-line credit in the map footer
- Disclaimer: unofficial, may contain errors from matching across sources

| Source | Licence | Required wording |
|---|---|---|
| REPD (DESNZ) | Open Government Licence v3.0 | "Contains public sector information licensed under the Open Government Licence v3.0." |
| NESO data portal (TEC register) | NESO Open Data Licence v1.0 | "Supported by National Energy SO Open Data" |
| NESO Carbon Intensity API | CC BY 4.0 | Credit "Carbon Intensity API (NESO)" with a link to the licence |
| Elexon Insights / BMRS | BMRS data licence | "Contains BMRS data © Elexon Limited copyright and database right [year]", linked to the licence |
| Sheffield Solar PV_Live | CC BY 4.0 | "PV_Live by Sheffield Solar is licensed under CC BY 4.0" |

## Hosting and domain

The site starts on Cloudflare Pages and will later move to a custom domain. To make that move a configuration change only:

- All asset and data paths are relative to the site root. No hard-coded `*.pages.dev` addresses anywhere.
- The site's public URL (canonical link, social share tags, About page) is set in one config value.
- The front end reads the Worker's base URL from an environment variable. Once the domain is on Cloudflare, the Worker is served at `/api/*` on the same domain, so the browser only ever calls the site's own origin.
- Moving to the domain means adding it as a Pages custom domain and adding a Worker route. No code changes.

## Phases

**1. Static map**
Pipeline for REPD and the interconnector file, pixel GB grid at three zoom levels, sprites, filters, project card, about page.
*Done when:* all included REPD projects of 1MW or more appear in the right place with the right stage, filters work, and the card works at 380px.

**2. Change feed and animations**
Snapshots, change detection, feed panel, pixel animations.
*Done when:* two consecutive pipeline runs produce a correct change list and animations play for qualifying events.

**3. Live layer**
Worker, national and regional data, interconnector flows, wind farm output for mapped BM units.
*Done when:* live data refreshes without the browser calling third-party APIs, and the site works normally if a source is down.

**4. Connection data**
TEC register and Gate 2 matching, early development stage, "Gate 2 contracted only" filter.
The TEC register has no coordinates or REPD IDs, so matching uses project name, connection site, plant type and capacity, plus a hand-maintained override file. Read it as `utf-8-sig` (the first header carries a byte order mark).
*Done when:* matched projects show a correct connection badge, and unmatched projects show "Not published".

## To verify before building

Checked on 6 October 2026: REPD columns and status values, TEC register Gate flag, Elexon per-unit dataset, licence wording. Findings are recorded in the sections above.

- Which large wind farms to include in the BM unit mapping file (phase 3). Starting point: wind farms of 100MW or more with transmission (`T_`) BM units.
