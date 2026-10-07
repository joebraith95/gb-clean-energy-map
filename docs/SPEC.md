# GB Clean Energy Map: product spec

## Purpose

A public, personal project showing where clean energy projects in Great Britain are being built, how far along they are, and what the system is generating right now. It should show what has changed recently, not pretend the pipeline data is live.

**In scope:** Great Britain only. Renewables, storage, interconnectors.
**Out of scope for now:** Northern Ireland, demand projects, contested technologies (see below), user accounts.

## Data sources

| Source | Used for | Refresh | Phase |
|---|---|---|---|
| REPD (DESNZ) | Projects, locations, planning status, stage dates | Quarterly | 1 |
| Hand-curated interconnector file (`pipeline/interconnectors.json`) | Partner country, landing points, Ofgem milestones | Manual | 1 |
| NESO Interconnector Register | Interconnector capacity, status, connection site, Gate | Twice weekly | 1 |
| OpenStreetMap | Interconnector landing points (converter stations and substations) | Checked by hand when the curated file changes | 1 |
| ONS Countries (December 2024) Boundaries UK BGC | GB coastline for the land grid (already in BNG) | When ONS republishes | 1 |
| Natural Earth 1:10m admin 0 map units | Non-GB land drawn as muted scenery (Ireland, France, Isle of Man) | Rarely | 1 |
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

Early development is populated from the TEC register (see "TEC-only projects").

### TEC status mapping (for TEC projects with no REPD record)

Mapped from `Project Status` of the furthest tranche, onto the same stages REPD uses:

| TEC status | Headline stage |
|---|---|
| Scoping | Early development |
| Awaiting Consents | In planning |
| Consents Approved | Consented |
| Under Construction/Commissioning | Under construction |
| Built | Operational |

### REPD file handling

- Windows-1252 encoding (it contains curly apostrophes and en dashes, so Latin-1 is not enough). Numbers may contain thousands separators. Dates are dd/mm/yyyy, and any other date format stops the pipeline.
- Strip whitespace from every header and value and collapse repeated spaces, then match columns by their cleaned names (some headers contain trailing or double spaces).
- "NA", "N/A" and "n/a" are treated as blank, which means "Not published".
- `X-coordinate` and `Y-coordinate` are British National Grid for GB rows. Northern Ireland rows use Irish Grid and are excluded, as the map covers Great Britain only.
- The consented date shown is the final grant: the latest of planning permission granted, appeal granted and Secretary of State granted.
- The pipeline finds the latest CSV through the GOV.UK content API for the publication page.

### Corrections

Clear errors in source data (for example X and Y swapped) can be fixed in a hand-maintained file, `pipeline/corrections.json`. Rules:
- Each correction names the REPD ID, the field, the value found in REPD, the corrected value, and the reason.
- A correction is applied only while REPD still holds the value it was written against. If REPD changes that value, the correction is skipped and the pipeline report flags it for review.
- Only fix errors with clear evidence. Never use corrections to fill in missing data.
- The project card notes any corrected field, for example "Location corrected from REPD (X and Y were swapped)".

### Connection badge (shown on the card, separate from the headline stage)

- **Not published:** no connection data (expected for most distribution-connected projects)
- **Gate 2 contracted:** with contracted date
- **Energised**

"Contracted" means Gate 2 only.

How the badge is worked out (`pipeline/connection.py`), from the TEC register matches below:
- **Energised** when any matched TEC tranche is Built and REPD says Operational. Most Built rows have a blank Gate, so this comes from Project Status, not Gate. Where TEC says Built but REPD does not say Operational, REPD wins: the record is not shown as energised, and the rules below apply.
- **Gate 2 contracted** otherwise, when any matched tranche has Gate 2. The card shows that tranche's connection site and the earliest contracted date among the Gate 2 tranches.
- **Not published** for everything else, including Gate 1, a blank Gate and unmatched records.
- The badge never changes the headline stage. Records built in TEC but not Operational in REPD are listed in the pipeline report.

### TEC register

- **Tranches.** Projects with staged capacity have one row per tranche, and tranches can differ in status and Gate (a built wind farm with a scoping extension), so each row is kept as a tranche under its Project ID (`pipeline/tec.py`).
- **Scope.** Plant Type can list several parts. Demand, Reactive Compensation and Substation are ignored. A project with any fossil, nuclear or thermal part is out of scope, as is one with nothing left. Interconnector rows come from the Interconnector Register instead.
- **Matching** (`pipeline/tec_match.py`). A TEC project matches a REPD record of a compatible technology on the distinctive words of the name (rarer words count for more) and on capacity, and only when one record clearly fits: an exact name with at least half the capacity, a close name with capacity within 10%, a TEC name found inside an address-style REPD name with capacity within 10%, or, for a multi-technology project, one exact-name record per technology whose capacities add up. A candidate is never accepted automatically when extension or repowering wording differs, when its REPD stage is more than one step ahead of the TEC status, or when its capacity is not published. Several TEC projects can match one REPD record (offshore wind farms are often split into A, B and C connections).
- **Overrides.** `pipeline/tec_matches.json` forces a TEC project onto a list of REPD IDs (an empty list confirms it is not in REPD) or stops it matching one REPD ID. Each entry gives a reason. An entry whose TEC project or REPD record has gone is skipped and flagged in the report.
- **Review.** Every run writes `pipeline/raw/tec-match-review.csv` with each project's match or best candidates.

### TEC-only projects

TEC projects that match no REPD record become map records of their own (`pipeline/tec_records.py`), with the ID `tec-<Project ID>`, shareable as `?project=tec-<Project ID>`.
- **Stage** from the TEC status mapping above.
- **Technology.** One record per project, even when it lists several technologies: generation comes before storage (offshore wind, onshore wind, solar, hydro, tidal, then pumped storage, liquid air, hydrogen, other storage). "Energy Storage System" is a Battery only when the project name says battery or BESS; otherwise it is "Storage (type not published)", in the Other storage group. TEC "Hydro" and "Tidal" do not say small or large, stream or lagoon, so they keep those names and join the Hydro and Tidal and wave groups.
- **Capacity** is the final cumulative TEC capacity.
- **Location** is the located connection substation (below). Projects sharing a substation fan out around it when drawn, largest in the centre, spaced by the largest marker's size so they separate at every zoom level.
- **Badge.** Energised when a tranche is Built, otherwise Gate 2 contracted when a tranche has Gate 2, otherwise Not published.
- **Not drawn, but kept in the data** when the connection site is not located, when capacity is not published, or when a REPD record looks like the same project but was not matched (name score of 0.6 or more, or the name found inside the REPD name, with at least half the capacity). Drawing both would show one project twice. A `tec_matches.json` entry confirming the project is not in REPD lifts this.
- **Card.** Says the project is not in REPD and is drawn at its connection substation, not at the project site. Shows the developer, technologies, connection site, connection type, TEC status and Gate (or each tranche), the contracted date for Gate 2 only, and credits NESO and OpenStreetMap.

### Locating connection sites

TEC projects with no REPD record are placed at their connection substation (`pipeline/substations.py`), and the card says the dot marks the substation, not the project.
- **Source.** OpenStreetMap substations at 132kV or above, or tagged as transmission. `python -m pipeline.substation_candidates --fetch` downloads them from the Overpass API and writes `pipeline/substations.json`, which is checked by hand before it is committed. The weekly run only reads that file, so a new connection site stays unlocated until the script is run again.
- **Matching.** A site is located only when its name, with voltages, bracketed notes and generic words ("Substation", "GSP", "Supergrid" and so on) removed, exactly matches such a substation in the right transmission owner's area (NGET, SPT or SHET, by rough northing), and every match lies within 5km of the others.
- **Never guessed.** Planned sites ("Connection Node", "not yet constructed") stay unlocated, as do names with no match or with matches far apart. Their projects are kept in the data but not drawn, and the pipeline report counts them.
- **Hand entries** in `pipeline/substations.json` have `"method": "hand"` and a reason, and later runs keep them.
- **Check.** For TEC projects that do match REPD, the distance between the REPD location and the located substation is a test of the substation choice: half are within 3km.

### Interconnectors

Ofgem cap and floor milestones mapped onto the same headline stages:
- Initial project assessment approved: In planning
- Final project assessment and main consents: Consented
- Construction: Under construction
- Commissioned: Operational

The milestones themselves appear on the card.

How the data is put together:
- **Register.** The NESO Interconnector Register supplies contracted import and export capacity, status, GB connection site, Gate and contracted date. "Built" in the register means Operational and "Under Construction/Commissioning" means Under construction, whatever the milestones say.
- **Curated file.** `pipeline/interconnectors.json` adds what the register lacks: partner country, landing points (OpenStreetMap features, checked by hand), the year a link entered service, and Ofgem milestones with their decision pages. An `fpa` milestone is only recorded once main consents are also in place.
- **Matching.** A curated interconnector missing from the register stops the pipeline.
- **Scope.** Built links, links under construction, and links Ofgem has approved in principle. Other register entries (scoping only) belong to Early development and arrive with phase 4.
- **Landing points.** Where no converter station exists yet, the GB landing point is the connection substation named in the register, and the card says so. Interconnectors with no published landing point are kept in the data but not drawn.
- **Drawing.** Each interconnector is a straight dashed pixel line from the GB landing point towards the partner end, clipped to the map. The card calls it a schematic, not the real route. Operational cables pulse outwards; there is no animation under `prefers-reduced-motion`.
- **Filtering.** Interconnectors are part of the flexibility layer, with their own "Interconnectors" filter. Their capacity for filtering and marker size is the larger of import and export.
- **Connection badge.** "Energised" when the register says Built, "Gate 2 contracted" with the contracted date for Gate 2, otherwise "Not published".
- **Sharing.** A link can be shared as `?interconnector=<id>`.

### Phased projects

One dot per phase (one REPD row). The card links to sibling phases. Clustered at national zoom.

REPD has no field linking phases, so the pipeline (`pipeline/phases.py`) groups records that:
- share a technology,
- have matching names once phase and extension wording ("Phase 2", "Extension II") and generic words ("wind farm", "solar park", "battery storage") are removed,
- include at least one name that mentions a phase or extension,
- each sit within 10km of another member.

`pipeline/phase_links.json` adds or removes links by hand. The card labels the list "Other phases (matched by name)". At national zoom, phases that pass the filters become one marker at the largest phase, sized and thresholded by their combined capacity.

## Display rules

- Default capacity filter: 1MW and above, adjustable with a slider. All REPD rows are ingested regardless.
- Filters: technology, headline stage, flexibility layer toggle, capacity.
  - Technology groups: onshore wind, offshore wind, solar, hydro, tidal and wave; with the flexibility layer on, also batteries, pumped storage, other storage and hydrogen. TEC-only "Hydro", "Tidal" and "Storage (type not published)" join hydro, tidal and wave, and other storage.
  - The flexibility layer is off when the map opens.
  - Stage choices only list stages that have projects on the map (no empty options).
  - Capacity slider stops: all sizes, 1, 5, 10, 50, 100, 300 and 1,000MW.
  - "Gate 2 contracted only" shows only projects and interconnectors whose badge is Gate 2 contracted, so it also hides energised projects and Early development. The feed panel does not apply it.
- A project can be shared as `?project=<REPD ID>`, which opens its card.
- On screens narrower than 768px the card and filters are bottom sheets and only one is open at a time; on wider screens they are side panels and can be open together.
- Zoom: seven fixed levels (National, Regional, Local, District, Town, Village, Site), each roughly doubling the detail of the one before; values in `src/map/levels.ts`.
  - National uses 4km cells and shows 50MW or more; Regional uses 2km cells and shows 5MW or more; Local (1km) and deeper show every size.
  - Each level places markers on its own grid (down to 62.5m at Site), so nearby projects separate as you zoom.
  - Land is drawn from the 4km, 2km, 1km and 500m grids; deeper levels draw the 500m grid with bigger pixels, which keeps the largest land texture (1,520 x 2,460) inside the 4,096-pixel limit of many phones.
  - The national view uses the largest whole number of physical pixels per cell that fits the screen, and every other level is a fixed multiple of it, so every cell is a whole number of physical pixels at any screen density.
- Zoom controls: plus and minus buttons, mouse wheel, pinch, and the + and - keys, each moving one level and keeping the point under the cursor or fingers fixed. Drag or the arrow keys to pan.
- Onshore projects whose cell is sea but next to the coast are drawn on the nearest land cell at that level. This affects drawing only; the data keeps REPD's coordinates.
- The map extent must include offshore wind areas as far out as Dogger Bank.
- Capacity is shown in four tiers: under 10MW a 3px stage-coloured dot, 10 to 50MW a 5px dot, 50 to 300MW a 9px sprite tile, and 300MW or more the same tile at double size (single size on the national view, to limit clutter).
- Rows with no coordinates, coordinates outside the map extent, or no published capacity are kept in the data but not shown on the map. Nothing is estimated to fill the gap, and the pipeline report lists each hidden reason.
- Map extent: BNG x 0 to 760,000 and y 0 to 1,230,000 (Scilly to Shetland, east past Dogger Bank).
- Land grid: cells of 4km, 2km, 1km and 500m. GB land and other land are sampled every 250m, and a cell counts as land when at least 40% of its samples are land. Only GB land is drawn in the main land colour.

## Project card

**Top**
- Name, technology icon, capacity (MW)
- Headline stage chip, connection badge
- Five-step progress bar with dates on completed steps

**Details**
- Local authority, region, onshore or offshore
- Operator or developer
- Dates: application submitted, consented, construction start, operational
- Planning reference, linked to the planning portal where possible (phase 1 shows the reference as text: each of the hundreds of planning authorities has its own portal and REPD holds no links)
- Connection site and contracted date (Gate 2 projects only)
- Links to sibling phases

**Live (only where it exists)**
- Current output and 24-hour sparkline

**Footer**
- Source and last updated date

The project name uses the body font rather than the pixel font, because long names in the pixel font are hard to read. "Onshore" or "Offshore" is shown for wind only, as REPD states it only through the technology. The card notes when connection data was matched by name, and that the match may be wrong.

## Design

- Flat, top-down pixel-art map of GB, like an old game overworld
- Sprites: turbine with two-frame spinning blades, solar panel, battery, hydro, tidal; interconnectors as dashed cables pulsing out to sea
- Retro-feeling palette, checked for colour-blind safety, rather than copying a console palette exactly. A test (`src/theme/colourCheck.test.ts`) simulates protan, deutan and tritan vision and requires every pair of stage colours, and each against land, to differ by at least 20 (CIE76).
- Sprite tiles: a dark outline, the stage colour as background, and a dark technology glyph (turbine, solar panel, battery for all non-hydrogen storage, hydrogen "H", water drop for hydro and pumped storage, waves for tidal and wave). Defined as character grids in `src/map/sprites.ts`.
- Only operational wind turbines spin, as they are the ones generating. No animation under `prefers-reduced-motion`.
- Pixel font (for example Press Start 2P) for titles only; clean sans-serif for everything else

## Change feed and animations

- Each pipeline run is saved as a snapshot. Changes are found by comparing headline stages per REPD Ref ID.
- Animated events, for projects of 5MW or more: consent granted, construction start, energisation.
- Every stage change, of any size, appears in the "what changed" feed.

GOV.UK redirects superseded REPD files to the latest release, so past releases cannot be fetched. The feed therefore combines two sources (`pipeline/events.py`, `pipeline/changes.py`).

**Dated events from the current release.** Taken from REPD's own date columns, for the 12 months up to the release date:

| Event | REPD date columns |
|---|---|
| Application submitted | Planning Application Submitted |
| Appeal lodged | Appeal Lodged |
| Consent granted | Planning Permission Granted, Appeal Granted, Secretary of State - Granted |
| Refused | Planning Permission Refused, Appeal Refused, Secretary of State - Refusal |
| Withdrawn | Planning Application Withdrawn, Appeal Withdrawn |
| Construction started | Under Construction |
| Now operational | Operational |
| Permission expired | Planning Permission Expired |

Rules for dated events:
- Dates after the release date cannot have happened yet. They are ignored and counted in the pipeline report.
- "Planning Permission Expired" is a deadline. It only counts as an event once the date has passed and the status is "Planning Permission Expired".

**Spotted changes.** Each run writes a snapshot (`data/snapshots/<date>.json`, the headline stage of every project and interconnector), but only when a stage differs from the latest snapshot. Each difference that no dated event explains goes into `data/snapshots/spotted.json`, dated with the run and labelled with its source (for example "the July 2026 REPD release"). This covers records added or removed, abandoned and decommissioned projects, and interconnector stage changes.

**TEC-only records and connection badges.** Snapshots also record each record's connection badge.
- The first snapshot that contains TEC-only records sets their baseline: they are not all logged as new.
- A TEC-only record that disappears because its project is now matched to a REPD record is not a change.
- Badge changes on records present in both snapshots are logged as "connection_changed", spotted in the TEC register. The feed's type filter has a Connections option for them. A snapshot written before badges were recorded sets the badges' baseline.

**The change list.** `data/changes.json` is rebuilt every run: the dated events plus spotted changes from the last 12 months, newest first. Two runs on unchanged sources produce byte-identical output.

**The feed panel** applies the same technology, flexibility and capacity filters as the map, so by default it lists projects of 1MW and above. It does not apply the stage filter, so refusals and withdrawals still show; it has its own type filter (All, Consents, Construction, Operational, Planning) instead. Tapping an entry opens its card. If the project is not drawn at the current zoom because of the level's capacity floor, the map zooms in until it is.

**Animations** (`src/map/animations.ts`). They play for dated consent, construction-start and operational events of 5MW or more:
- **Consent:** an expanding square ring.
- **Construction:** blinking scaffold corners.
- **Operational:** eight sparks.

Each effect is drawn in the new stage's colour, lasts about 1.2 seconds, and scales with the marker so it clears the tile.

When effects play:
- **When the map opens:** events from the three months before the newest event that are on screen and pass the filters play once, largest first, staggered, at most 30.
- **From the feed:** an animated event replays when picked.
- **Reduced motion:** under `prefers-reduced-motion`, a still outline shows for three seconds instead.

## Live layer

- National generation mix and interconnector flows (flow direction animated on the cables)
- Regional mix and carbon intensity
- Output for large wind farms registered in the Balancing Mechanism, using a hand-maintained file that maps BM unit IDs to REPD records (`pipeline/bmu_map.json`, published as `data/bmu-map.json`). It covers all 48 operational wind farms of 100MW or more in REPD (96 units), each match checked by name, operator and capacity. `pipeline/bmu_candidates.py` suggests matches for review. Where Elexon's units cannot be split between REPD phases (Race Bank, Clyde and its extension, the Whitelee extension), one entry covers both records and the card says the output is for all of them. A mapped REPD ID missing from the data, or a unit used twice, stops the pipeline.
- The UI makes clear that live output is only available for large transmission-connected sites
- Per-unit output comes from Elexon Final Physical Notifications (FPN) adjusted by Bid-Offer Acceptances (BOALF). Metered output (B1610) is published about five days late, so it is not used for the live layer. The card labels this figure "Scheduled output (Elexon)", never as metered output
- National generation mix comes from Elexon's generation by fuel type data (FUELINST)

**Server.** The Worker is a set of Cloudflare Pages Functions in `functions/`, deployed with the site and served at `/api` on its own address. Shared parsing logic in `functions/lib/` is unit-tested against recorded responses.

| Endpoint | Sources | Fresh for |
|---|---|---|
| `/api/live/national` | Elexon FUELINST (latest 5-minute period, with signed interconnector flows) and PV_Live national solar | 5 min (solar 10 min) |
| `/api/live/regions` | Carbon Intensity regional forecast (14 DNO regions) | 30 min |
| `/api/live/unit?repd=<id>` | Elexon PN and BOALF for each mapped unit, last 24 hours | 10 min |

**Interconnector flows.** FUELINST codes map to interconnectors as follows: INTFR is IFA, INTIFA2 is IFA2, INTELEC is ElecLink, INTNED is BritNed, INTNEM is Nemo, INTNSL is North Sea Link, INTVKL is Viking, INTIRL is Moyle, INTEW is East West and INTGRNL is Greenlink. A positive value means Great Britain is importing. FUELINST's wind figure covers transmission-metered wind only.

**Scheduled output.** Sampled every 15 minutes. At each moment, a unit's level is the latest accepted bid or offer (BOALF) covering that time, otherwise its Physical Notification. Levels are summed across the farm's units. A sample is left empty, never shown as zero, unless every unit has a level. Only REPD IDs in `data/bmu-map.json` are served, so the endpoint cannot be used as an open proxy.

**In the interface.**
- **Live panel** (header button): generation now as a pixel bar and table, each interconnector's import or export with the net flow, and the 14 regions with forecast intensity and main sources. Times are in UK time and each source is credited. National figures refresh every 5 minutes while the page is visible.
- **Cables:** while live flows are known, cables pulse inwards when Great Britain is importing, outwards when exporting, and stay still with no flow. Without live data they keep the Phase 2 behaviour. The interconnector card shows "Now: importing (or exporting) X MW".
- **Wind farm cards:** a Live section appears only for mapped farms, with the latest scheduled output, a 24-hour pixel sparkline, and the note that live output is only available for large transmission-connected wind farms.

**When a source is down.** Each source is fetched with an 8-second timeout and cached separately in Cloudflare's cache. If a fetch fails, the last good copy (kept for 6 hours) is served marked `stale`. With no copy available, that part is `null` with a reason, and the page hides it. One failing source never affects the others.

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
| ONS country boundaries | Open Government Licence v3.0 | "Source: Office for National Statistics licensed under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right 2024." |
| Natural Earth | Public domain | None required; credited as "Made with Natural Earth" |
| NESO Interconnector Register | NESO Open Data Licence v1.0 | "Supported by National Energy SO Open Data" |
| OpenStreetMap | Open Database Licence (ODbL) | "© OpenStreetMap contributors", linked to openstreetmap.org/copyright. `data/interconnectors.json` is a derived database and is shared under the ODbL. |
| Ofgem decisions | Open Government Licence v3.0 | Linked from each milestone on the card |

## Hosting and domain

The site starts on Cloudflare Pages and will later move to a custom domain. To make that move a configuration change only:

- All asset and data paths are relative to the site root. No hard-coded `*.pages.dev` addresses anywhere.
- The site's public URL (canonical link, social share tags, About page) is set in one config value: `VITE_SITE_URL` in `.env.production`.
- The front end reads the Worker's base URL from an environment variable. Once the domain is on Cloudflare, the Worker is served at `/api/*` on the same domain, so the browser only ever calls the site's own origin.
- Moving to the domain means adding it as a Pages custom domain, adding a Worker route, and changing `VITE_SITE_URL`. No other code changes.

**Current setup (live since 6 October 2026)**
- Site: https://gb-clean-energy-map.pages.dev, deployed by Cloudflare Pages from the `main` branch of https://github.com/joebraith95/gb-clean-energy-map (build `npm run build`, output `dist`, Node from `.node-version`).
- GitHub Actions: CI on every push; the data refresh every Monday at 06:00 UTC commits changes to `data/`, which triggers a deploy.

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

- Which large wind farms to include in the BM unit mapping file: done 6 October 2026 (all 48 operational wind farms of 100MW or more).
