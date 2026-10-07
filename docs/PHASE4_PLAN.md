# Phase 4 plan: connection data

Goal (from SPEC.md): TEC register and Gate 2 matching, the Early development stage, and a "Gate 2 contracted only" filter.
*Done when:* matched projects show a correct connection badge, and unmatched projects show "Not published".

Decisions made on 7 October 2026:
- TEC-only projects are drawn at their **connection substation**, located from OpenStreetMap and kept in a hand-checked file, as interconnectors already are. The card says the dot marks the substation, not the site.
- **Every unmatched "Scoping" row** in an included technology becomes Early development, whatever its Gate.

## What the live register looks like (5 October 2026 release)

Checked against `tec-register-05-october-2026.csv` from the NESO CKAN package `cbd45e54-e6e2-4a38-99f1-8de6fd96d7c1`.

- 2,196 rows, 15 columns: Project Name, Customer Name, Connection Site, Stage, MW Connected, MW Increase / Decrease, Cumulative Total Capacity (MW), MW Effective From, Project Status, Agreement Type, HOST TO, Plant Type, Project ID, Project Number, Gate.
- Reads cleanly as `utf-8-sig`.
- Project Status: Scoping 1,386, Built 381, Consents Approved 213, Awaiting Consents 172, Under Construction/Commissioning 44.
- Gate: blank 1,313, Gate 1 771, Gate 2 112. Most Built rows have a blank Gate (373 of 381), so "Energised" has to come from Project Status, not Gate.
- Gate 2 by status: Consents Approved 74, Under Construction 28, Built 6, Scoping 3, Awaiting Consents 1.
- **Project ID is not unique.** 122 projects have more than one row, one per capacity tranche (Stage 1, 2, 3...). Tranches often differ in status and Gate: Arecleoch stage 1 is Built and stage 2 (+216MW) is Scoping; Pencloe stage 1 is a Gate 2 wind farm and stage 2 a Gate 1 battery extension. Project Number is unique per row except for one excluded gas project.
- **Plant Type is often a list**, for example "Energy Storage System;PV Array (Photo Voltaic/solar)" (430 rows). Some include Demand, CCGT, OCGT or Reactive Compensation.
- 1,247 distinct connection sites in total; 863 among Scoping rows. Names vary in form ("Berkswell GSP", "North Humber Connection Node C 132kV Substation", "17 ACRES BESS 275KV SUBSTATION").
- Agreement Type: Direct Connection 1,740, Embedded 456.

## Workstreams

### 1. TEC ingest (`pipeline/tec.py`)
- Find the latest CSV through the CKAN `package_show` call, as `interconnectors.py` does for the Interconnector Register. Cache to `pipeline/raw/tec-register.csv` plus a source JSON, and honour `--offline`.
- Clean headers and values the same way as REPD. Stop the pipeline on missing columns or an unknown Project Status or Gate value.
- Group rows by Project ID but **keep each row as a tranche** with its own status, Gate, capacity and date, because tranches can be at different stages. Step 2 decides how tranches match REPD records (an extension tranche may be a separate REPD record).
- Technology from Plant Type: map each part to a technology tag. Demand, Reactive Compensation and Substation are ignored. A project with any fossil, nuclear or thermal part (for example a gas plant with a battery) is out of scope, as is one with nothing left. Interconnector rows are left to the Interconnector Register.

### 2. Matching TEC to REPD (`pipeline/tec_match.py`)
The register has no coordinates or REPD IDs, so:
- **Candidates:** REPD records whose technology is compatible with one of the TEC row's plant types.
- **Score:** normalised project name (reuse `phases.base_name`, plus TEC-specific noise such as "BESS", "Energy Storage", "Solar Farm", kV ratings), capacity within a tolerance, and connection site words appearing in the REPD name or address.
- **Accept** only a clear, unambiguous top match. Anything ambiguous stays unmatched and goes in the pipeline report for review. An unmatched project reads "Not published", which is the safe failure.
- **Overrides:** `pipeline/tec_matches.json`, hand-maintained, to force or forbid a pairing. Each entry names the TEC Project ID, the REPD ID (or `null` to forbid), and the reason. As with corrections, an override whose TEC project has gone from the register is skipped and flagged.
- One TEC project can cover several REPD phases, and a hybrid TEC project can cover separate solar and battery REPD records. Allow one-to-many from TEC to REPD; flag many-to-one for review.
- Run the matcher on the live data and review the report, especially every Gate 2 and Built row (about 490), before the badge goes live.

### 3. Connection badge
For each REPD record and interconnector:
- **Energised:** matched TEC project is Built.
- **Gate 2 contracted:** matched TEC project has Gate 2; carries the contracted date (MW Effective From, labelled "Contracted date") and connection site.
- **Not published:** everything else, including Gate 1 and blank Gate.
- The badge never changes the headline stage. If TEC says Built but REPD says Consented, keep Consented and list the mismatch in the report.

### 4. Early development stage
- Unmatched TEC projects with status Scoping and an included technology become records with stage Early development. ID scheme `tec-<Project ID>`, shareable as `?project=tec-<Project ID>`.
- Unmatched rows with other statuses are shown too (your answer, 7 October), using existing stages only, as the Interconnector Register already does: Awaiting Consents = In planning, Consents Approved = Consented, Under Construction/Commissioning = Under construction, Built = Operational. Add this mapping to SPEC.md when it is built.
- Risk: a project REPD does hold, but the matcher missed, would appear twice. So an unmatched past-scoping project that has any plausible REPD candidate stays hidden until reviewed in `tec_matches.json`; only ones with no plausible candidate are drawn straight away.
- Hybrid projects with no REPD match are one record (your answer), using the generation technology over storage.
- Interconnector Register entries that are scoping only arrive here as Early development, per the Interconnectors section of the spec.

### 5. Locating connection substations (`pipeline/substations.json`)
- A hand-checked file mapping each connection site name to an OpenStreetMap feature (type and ID) and its BNG coordinates, with the date checked. Same pattern as `interconnectors.json`.
- A helper script, `pipeline/substation_candidates.py`, queries Overpass for `power=substation` features and proposes matches by normalised name. It writes candidates for review; it never writes `substations.json` itself. Same pattern as `bmu_candidates.py`.
- Sites with no confirmed location: projects stay in the data and are hidden with the reason "connection site not located", listed in the report.
- Several projects share many substations, so the existing per-level marker placement needs to spread or cluster them. Check the worst stacks (largest number of projects per site) at each zoom level.
- Scope is about 863 sites. Start with sites serving the most Early development capacity, and ship once coverage is good, with the rest hidden and reported.

### 6. Front end
- Types in `src/data/projects.ts`: connection `{ badge, gate, contractedDate, site, tecProjectNumber }` and a `locatedAt: "substation"` flag.
- `ProjectCard.tsx`: real badge in place of the fixed "Not published" chip (line 99); connection site and contracted date for Gate 2 only; for TEC-only projects, "Location: connection substation (not the project site)", "Matched to TEC register by name" where relevant, and the TEC source in the footer.
- Progress bar shows step 1 for Early development.
- Filters: Early development joins the stage list (only when present, per the existing rule); new **"Gate 2 contracted only"** toggle, applied to projects and interconnectors. It hides everything without a Gate 2 badge, including Early development (your answer). Energised projects are not Gate 2 contracted, so they are hidden too; check this reads sensibly once built.
- Theme: Early development already has a stage colour if phase 1 defined all five; otherwise add one and recheck colour-blind distinguishability.
- About page: TEC register attribution ("Supported by National Energy SO Open Data") and a line on how matching and substation locations work.

### 7. Change feed
- Snapshot keys gain `tec-*` IDs. On the first run with TEC data, about 1,000 records would appear as "added". Proposal: write that first snapshot as a baseline and log no spotted changes for TEC-only records in that run.
- Later: a TEC-only project that gains a REPD match disappears from Early development and its REPD record appears. Record this as a stage change from Early development to the REPD stage rather than "removed" plus "added", using the match to link the two IDs.
- Badge changes (for example, newly Gate 2 or newly energised) go in the feed too (your answer), as a new "Connection" type. They are found by comparing snapshots, so the snapshot gains the badge per record.

### 8. Pipeline, CI and docs
- `pipeline/run.py`: fetch TEC, match, attach badges, build Early development records; report adds TEC counts, match rates by technology and Gate, review lists, and hidden reasons.
- `refresh-data.yml` already runs weekly; TEC refresh rides along. Twice-weekly refresh is possible later but not needed for "done".
- Tests: ingest (BOM, staged rows, plant type lists), matcher scoring and override handling, badge rules, substation lookup, feed baseline. Front-end tests for the filter and card.
- Update SPEC.md (Early development from TEC, substation placement, match rules, ID scheme) and CLAUDE.md (new files and commands).
- Before and after counts per stage and technology from a full run, as CLAUDE.md requires.

## Suggested order
1. Ingest and collapse, with tests.
2. Matcher and override file; review the report together, focusing on Gate 2 and Built rows.
3. Badges on the card and the Gate 2 filter. **This alone meets the "done when" line.** Ship it.
4. Substation candidates and the first batch of checked locations.
5. Early development records, map drawing, stacking at substations, feed baseline. Ship.
6. Fill in remaining substations over time.

## Answers (7 October 2026)
1. Unmatched TEC projects past scoping: show them, mapped to existing stages (see workstream 4).
2. Hybrid projects with no REPD match: one record.
3. "Gate 2 contracted only" hides Early development too.
4. Badge changes go in the feed.
