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
| NESO Gate 2 outcomes | Gate 2 status | To verify | 4 |
| Elexon Insights API | Generation by fuel type, interconnector flows, large wind farm output | Near real time | 3 |
| NESO Carbon Intensity API | Regional mix and carbon intensity | Half-hourly | 3 |
| Sheffield Solar PV_Live | National and regional solar estimate | Half-hourly | 3 |
| DNO embedded capacity registers | Distribution connection data | Varies | Optional |

## Technologies

**Included**
- Generation: onshore wind, offshore wind, solar, hydro, tidal, wave
- Flexibility layer (own toggle): batteries, pumped storage, other storage types in REPD, interconnectors

**Excluded:** biomass, energy from waste, landfill gas, anaerobic digestion, sewage gas, advanced conversion technologies.

## Stage model

### Headline stage (drives map colour and animations)

1. Early development
2. In planning
3. Consented
4. Under construction
5. Operational (including partly energised)

Off track, hidden on the map but kept in the data: **Stalled**, **Decommissioned**.

### REPD status mapping (draft, to verify against the latest release)

| REPD status | Headline stage |
|---|---|
| Application Submitted, Appeal Lodged | In planning |
| Awaiting Construction (and any "appeal granted" equivalent) | Consented |
| Under Construction | Under construction |
| Operational | Operational |
| Application Refused, Application Withdrawn, Appeal Refused, Appeal Withdrawn, Planning Permission Expired, Abandoned | Stalled |
| Decommissioned | Decommissioned |
| No Application Required | Use the latest stage date present |
| Revised | Superseded record, exclude |

Early development is mainly populated from the TEC register in phase 4.

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

## Attribution and disclaimer

- "About the data" page: each source, its licence, its refresh frequency
- One-line credit in the map footer
- Disclaimer: unofficial, may contain errors from matching across sources

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
*Done when:* matched projects show a correct connection badge, and unmatched projects show "Not published".

## To verify before building

- Current REPD status values and column names
- Whether the TEC register carries a Gate 2 flag, or where Gate 2 outcomes are published
- Which Elexon dataset gives per-unit output closest to real time (some are published with a delay)
- Exact licence and attribution wording for each source
- Which large wind farms to include in the BM unit mapping file
