# Exercise analytics and weekly weight trends

Open **Πρόοδος → Ασκήσεις** for the exercise explorer, personal records, target attainment, round consistency, and links to saved workout details. **Πρόοδος → Βάρος** keeps the existing measurement/goal tools and adds weekly trends. Analytics derive from saved records on the device; no migration, additional subscription, effort rating, or new workout input is required.

## Scope and access

Coaches and spectators can compare both athletes using the completed workout details already available to them. Athletes analyze their own detailed workouts. Existing shared body-weight visibility remains unchanged. Analytics do not fetch private coach notes, expose live workouts, grant additional permissions, or write training records. History and weigh-in edits/deletions recalculate the derived results. The account-scoped offline workspace also supports analytics without internet.

## Filters and source inspection

Select an exercise, athlete, and period: all history, the last 28/84 calendar days including today, or an inclusive custom date range. Exercise filters are retained in the URL across reloads and returning from history. Saved workouts on the same date remain separate observations. Charts use consecutive workout positions, with actual dates labelled; they do not imply equal calendar intervals.

Click or keyboard-activate a chart point, a record's source, or a session button to inspect its saved workout. Exact values and missing/skipped states also appear in tables. The exercise explorer preserves athlete colors and uses different line styles. Lines do not connect missing observations, and empty histories have no sample records or zero-valued performance charts.

## Exercise identity and eligible observations

An exercise series uses its movement ID, normalized name/equipment, metric, load flag, and unilateral convention. Different names, equipment, units, or side conventions are separate series. Changes to prescribed targets alone stay in the same series, while target calculations use each workout's saved prescription. Historical and alternative exercises remain selectable. Exercises with different IDs are not automatically merged by matching names.

Only saved completed/partial workouts are eligible. Active workouts and workout deletion markers are excluded. A valid completed set in a partial workout still contributes. Expected sets come from the saved program, actual participants, and selected alternatives. Orphan results, inconsistent row identities, invalid numbers, missing required load, and out-of-range values cannot create records.

## Calculations

| Display | Definition |
| --- | --- |
| Maximum weight per session | Maximum logged kg per dumbbell among valid completed sets of that exercise |
| Mean value per completed set | Arithmetic mean of valid completed rep/second values; for unilateral exercises, use the smaller side count |
| Target attainment | Valid completed sets reaching at least their saved target ÷ valid completed sets × 100 |
| Completed/planned sets | Valid completed sets ÷ all expected sets of that exercise for the selected athlete and saved workouts |
| Load record | Highest logged load with at least the user-selected rep/second threshold |
| Rep/duration record | Highest recorded value at exactly the chosen load; for unloaded exercises, highest recorded value in the selected series |
| Round change | (Last-round value − first-round value) ÷ first-round value × 100, within one session/station/slot |

Target attainment is unknown when no valid set is completed; it is not displayed as 0%. Skips, missing results, and invalid records stay visible in the planned denominator and are not converted into zero performance. Attainment can be 100% while only one of three planned sets was completed, so both measures are shown together.

For unilateral movements, the primary value means per side. A blank other-side value follows the existing same-count convention; an entered different count is retained and the smaller count governs attainment/records. The app does not infer left/right orientation. Weights retain the existing per-dumbbell convention; no external-load volume or strength estimate is inferred.

Records use the selected date window. Equal records retain the earliest eligible occurrence. Timed-exercise duration is labelled as the maximum recorded duration, without treating longer fixed intervals as automatically better. A load record can instead require the prescribed duration.

Round change requires at least two rounds, every expected round completed, and identical load and target. Otherwise the chart/table retain the actual observations and explain why a percentage is unavailable. The value describes recorded round-to-round change, not a physiological fatigue diagnosis.

## Weekly weight trends

Weeks run Monday–Sunday using the application's Athens date convention. The selected period is shared with the original weight chart. Multiple measurements on one day are first averaged, then the selected weekly mean or median is calculated across those daily averages. Every measured day has equal weight. Record IDs are deduplicated by revision, and invalid/future measurements are excluded.

Each weekly value shows measured-day and source-measurement counts. Missing weeks are null, never zero or interpolated. Week-to-week changes require observations in both adjacent calendar weeks. Current weeks and weeks cut by the date range are labelled partial. A single measured day is displayed with its count rather than implying a full week of evidence.

The original chart shows the last entered measurement per day and its existing kg/percentage modes. Weekly trends show kg and use an explicitly labelled adaptive vertical scale. Weight changes are not interpreted as body-fat changes.

## Verification

Calculation tests cover historical targets, variants, per-side counts, partial/deleted/active sessions, invalid/orphan records, date boundaries, load-matched records, round comparisons, daily averaging, medians, duplicate IDs, missing weeks, and partial periods. Browser checks exercise roles, filter persistence, chart/history links, records, corrections/deletions, timed/unloaded exercises, empty data, and responsive layouts. Production PWA checks use an isolated local-mode build and verify that exercise analytics and weekly trends survive offline reloads. Tests do not modify real account history.
