# 07. Prediction Log format and Collector

Two parts: (A) a shared record format every tool writes, and (B) a small Collector tool that merges records from many students and tools. Mockup: `mockups/07-prediction-log.html`.

## 1. Purpose

Every tool in this package asks students to predict before they run. The log keeps those predictions, the model values and any measured lab values in one format, so a teacher can see across a whole unit how close students get, where they struggle, and whether they improve with attempts.

### Learning and teaching targets

- Students see their own prediction history and improvement.
- Teachers see class patterns by problem, tool and module without a server or accounts.

## 2. Scope

In version 1: the record format, per-tool export and copy, the Collector (merge, dedupe, filter, summarize, export). No server, no accounts, all local.

## 3. Part A: record format

### 3.1 Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| schema | string | yes | Always `"prediction-log"` |
| schemaVersion | integer | yes | 1 |
| tool | string | yes | For example `"Shaft and Beam Workbench"` |
| toolVersion | string | yes | Semantic version of the tool |
| student | string | yes | From the tool's Name field. May be blank; then `"unnamed"` |
| team | string | no | |
| classPeriod | string | no | |
| problemId | string | yes | Challenge ID, or `"sandbox"` plus a short hash of inputs |
| quantity | string | yes | For example `"safety factor n"` |
| unit | string | yes | Display unit, empty string for unitless |
| predicted | number | yes | In the display unit |
| model | number or null | yes | Tool's value, same unit |
| measured | number or null | no | Lab value entered by student |
| pctPredVsModel | number or null | yes | (predicted − model) ÷ model × 100; null if model is 0 or null |
| pctMeasVsModel | number or null | no | (measured − model) ÷ model × 100; null if either is missing or model is 0 |
| attempt | integer | yes | Starts at 1 per student, problem and quantity |
| timestamp | string | yes | ISO 8601 with time zone offset |
| inputs | object | yes | Snapshot of all tool inputs in SI with a units map |
| note | string | no | Student's one-sentence explanation of any gap |

### 3.2 File forms

- JSON: an object `{ schema, schemaVersion, records: [...] }`.
- CSV: one row per record, header row with the field names above, `inputs` serialized as compact JSON in one quoted cell. RFC 4180 quoting (commas, quotes and line breaks inside fields quoted, quotes doubled). UTF-8 with byte order mark so spreadsheets read names correctly.

### 3.3 Tool responsibilities

- Write a record on every Check in predict-first mode.
- Let the student add a measured value and a note to any record afterwards.
- Offer Export prediction log (JSON and CSV) and Copy last row (tab-separated, for pasting into a shared spreadsheet).
- Keep records in local storage until the student clears them.

## 4. Part B: Collector tool

### 4.1 Interactions

1. Drag and drop or pick any number of JSON or CSV prediction-log files.
2. The Collector merges them, removes exact duplicates (same student, tool, problemId, quantity, attempt and timestamp), and lists files that failed to read with the reason.
3. Filter by module, tool, problem, quantity, student, team, class period, date range.
4. Views:
   - Table of records, sortable.
   - Problem summary: per problem and quantity, number of students, first-attempt median absolute percent difference, share within 5% on first attempt, median attempts to reach within 5%.
   - Student summary: per student, problems attempted, median absolute percent difference on first attempts, trend over time.
   - Measured versus model: for records with measured values, a scatter of pctMeasVsModel by problem, which shows where the model and the lab disagree (useful for discussing friction and efficiency).
5. Export merged CSV and a printable summary.

### 4.2 Privacy

Nothing leaves the browser. A banner says so. A Clear loaded data button empties the page.

## 5. Test cases

| ID | Setup | Expected |
|---|---|---|
| PL-1 | predicted 3.8, model 4.10 | pctPredVsModel = −7.32 |
| PL-2 | predicted 22, model 22.56 | −2.48 |
| PL-3 | predicted 95, model 84.05 | +13.0 |
| PL-4 | model 0 | pctPredVsModel null, shown as "not defined" |
| PL-5 | Student name `O'Brien, Ana "AJ"` exported to CSV and reloaded | Name round-trips exactly |
| PL-6 | Same file loaded twice | Record count unchanged after second load; dedupe message shows count removed |
| PL-7 | File with schemaVersion 2 | Warning "made by a newer tool version; some fields may be ignored," loads known fields |
| PL-8 | Malformed JSON | Listed as failed with reason, other files still load |
| PL-9 | Three attempts: 30%, 12%, 3% off | Attempts to within 5% = 3 |
| PL-10 | 500 files, 20,000 records | Loads and summarizes in under 3 s on a Chromebook |
| PL-11 | CSV opened in Google Sheets and saved back as CSV | Collector reads it back without loss |

## 6. Acceptance criteria

- [ ] The format is implemented as a small shared module or documented template that tools 01 to 06 and both existing tools copy exactly.
- [ ] All test cases pass.
- [ ] Summary percentages use median absolute percent difference, not mean, and the help panel explains why (a few wild predictions should not swamp the picture).
