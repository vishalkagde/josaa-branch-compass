# JoSAA Branch Predictor - Requirements Document

## 1. Purpose

Build a parent-friendly JoSAA branch discovery website that helps families quickly answer:

> "Given my child's rank, which IIT branches were within reach in JoSAA 2025 Round 1, shown in a sensible college order?"

The first version will focus on the institute type **Indian Institute of Technology**. Parents should not need to manually open the JoSAA Opening/Closing Rank page for every IIT, every branch, and every seat category.

## 2. Problem Statement

The official JoSAA Opening and Closing Ranks page requires users to repeatedly select:

- Round
- Institute Type
- Institute Name
- Academic Program
- Seat Type / Category

This works for exact lookups, but it is painful for discovery. A parent usually starts with a rank, not a branch. They need a ranked list of IITs and academic programs where JoSAA 2025 closing rank data suggests the student may have a chance.

Example:

- Student rank: `8000`
- Desired institute type: `Indian Institute of Technology`
- Seat type: `OPEN`, `OBC-NCL`, `EWS`, `SC`, `ST`, etc.
- Round: `1`
- Expected output: all IIT branches whose previous-year closing rank is in or near the student's range, sorted by NIRF Engineering rank of the institute.

## 3. Target Users

- Parents of JEE Advanced qualified students.
- Students comparing realistic IIT branch options.
- Counselors who need quick shortlist generation during counselling.

## 4. Data Sources

### 4.1 JoSAA Opening and Closing Ranks

Primary source:

- Official JoSAA Opening and Closing Ranks page: https://josaa.admissions.nic.in/applicant/SeatAllotmentResult/CurrentORCR.aspx

Required fields:

- Year
- Round number
- Institute type
- Institute name
- Academic program name
- Quota
- Seat type / category
- Gender
- Opening rank
- Closing rank

Notes:

- For OPEN seats, JoSAA ranks represent CRL.
- For EWS, OBC-NCL, SC, and ST seats, JoSAA ranks represent category ranks.
- For PwD seats, ranks represent PwD ranks within the respective category.
- A rank suffix `P` means the rank is from the Preparatory Rank List.

### 4.2 NIRF Engineering Ranking

Primary source:

- Official NIRF Engineering Ranking 2025: https://www.nirfindia.org/Rankings/2025/EngineeringRanking.html

For V1, use NIRF Engineering ranking as the default college ordering. When the selected institute type is IIT, show only IITs but preserve their relative NIRF Engineering order.

Example order for top IITs based on NIRF Engineering 2025:

1. Indian Institute of Technology Madras
2. Indian Institute of Technology Delhi
3. Indian Institute of Technology Bombay
4. Indian Institute of Technology Kanpur
5. Indian Institute of Technology Kharagpur
6. Indian Institute of Technology Roorkee
7. Indian Institute of Technology Hyderabad
8. Indian Institute of Technology Guwahati
9. Indian Institute of Technology (Banaras Hindu University) Varanasi
10. Indian Institute of Technology Indore

## 5. Product Scope

### 5.1 V1 Scope

The first release should support:

- Institute type: `Indian Institute of Technology`
- Data year: `2025`
- Default round: `1`
- User-entered rank
- Round selection, with Round 1 preselected and editable
- Seat type / category selection
- Optional gender filter, if JoSAA data includes gender-specific rows
- Result list sorted by NIRF Engineering rank
- Branches filtered by previous-year closing rank logic
- Clear display of opening rank, closing rank, IIT name, program name, seat type, quota, gender, and round

### 5.2 Future Scope

Later versions may support:

- Year selection, such as `2024`, `2025`, and future years
- NIT, IIIT, IIEST, and GFTI institute types
- Multiple years of JoSAA cutoffs
- Trend view across years
- State / city filters
- Branch family filters, such as CSE, Electrical, Mechanical, Civil, Chemical, Aerospace
- Preference list builder
- Export to CSV/PDF
- Saved shortlists
- "Ambitious / realistic / safe" grouping
- Custom ranking order instead of only NIRF

## 6. User Inputs

### 6.1 Required Inputs

- `Rank`
  - Numeric input.
  - Meaning depends on selected seat type:
    - OPEN: CRL
    - OBC-NCL / EWS / SC / ST: respective category rank
    - PwD: respective PwD rank

- `Round`
  - Dropdown values: `1` to `6`
  - Default value: `1`
  - Parents can change the round if they want to compare later counselling rounds.

- `Institute Type`
  - V1 fixed/default value: `Indian Institute of Technology`

- `Seat Type / Category`
  - Dropdown based on JoSAA available values.
  - Examples: `OPEN`, `OPEN (PwD)`, `EWS`, `EWS (PwD)`, `OBC-NCL`, `OBC-NCL (PwD)`, `SC`, `SC (PwD)`, `ST`, `ST (PwD)`.

### 6.2 Optional Inputs

- `Gender`
  - Values should match JoSAA data, such as `Gender-Neutral` and `Female-only`.
  - Default: show all gender pools, grouped or clearly labeled.

- `Rank Window`
  - Default: include programs whose closing rank is greater than or equal to `rank - 2000`.
  - Example: for rank `8000`, include programs with closing rank `>= 6000`.
  - This captures both realistic and slightly aspirational options.

- `Result Strictness`
  - `Aspirational`: closing rank between `rank - 2000` and `rank - 1`
  - `Likely`: closing rank greater than or equal to user's rank
  - `All in window`: both aspirational and likely

## 7. Result Filtering Logic

### 7.1 Core Rule

Given:

- User rank = `R`
- Rank window = `W`
- Minimum closing rank = `R - W`

Show rows where:

```text
closing_rank >= R - W
```

For example:

- User rank: `8000`
- Window: `2000`
- Show branches where previous-year closing rank is `>= 6000`

### 7.2 Result Classification

Each row should be classified:

- `Aspirational`: closing rank is below user rank but within the configured window.
- `In range`: closing rank is greater than or equal to user rank.
- `Very safe by rank`: closing rank is much greater than user rank, configurable later.

This classification is only an indicator based on historical data. It is not a guarantee of admission.

### 7.3 Rank Parsing

Opening and closing ranks should be stored as structured values:

- `rank_value`: numeric value
- `is_preparatory`: boolean, true when JoSAA rank has suffix `P`
- `raw_rank`: original JoSAA string

Rows with preparatory ranks should be included but visibly marked.

## 8. Sorting Logic

Default sort order:

1. NIRF Engineering rank of institute, ascending
2. Within each institute, closing rank ascending or branch family priority

Recommended V1 behavior:

- Group results by IIT.
- IIT groups appear in NIRF order.
- Within each IIT, show the most competitive branches first by closing rank ascending.

This makes the page read naturally:

- IIT Madras
- IIT Delhi
- IIT Bombay
- IIT Kanpur
- IIT Kharagpur
- and so on

## 9. User Experience Requirements

### 9.1 Main Page

The first screen should be the actual predictor tool, not a marketing page.

Core layout:

- Top filter bar for rank, round, institute type, seat type, gender, and rank window
- Result summary showing total matching programs
- Results grouped by institute in NIRF order
- Each institute section shows NIRF rank, city/state, and matching program count
- Each branch row shows academic program, opening rank, closing rank, quota, seat type, gender, and confidence label

### 9.2 Parent-Friendly Copy

The interface should use simple labels:

- "Your rank"
- "Seat category"
- "Round"
- "Show branches from closing rank"
- "Aspirational"
- "In range"

Avoid counselling jargon where possible. When jargon is necessary, explain it in compact helper text.

### 9.3 Result States

The app should handle:

- No rank entered
- Invalid rank
- No matching branches
- Data still loading
- Data source unavailable
- JoSAA/NIRF name mismatch

## 10. Non-Functional Requirements

### 10.1 Accuracy

- Data must preserve raw JoSAA values.
- Any normalization should be traceable back to raw source rows.
- NIRF names and JoSAA institute names may differ, so maintain a mapping table.

### 10.2 Performance

- Filtering should feel instant after data is loaded.
- V1 can use static JSON generated from source data.
- No backend is required for the first prototype if data is preprocessed.

### 10.3 Maintainability

- Keep data ingestion separate from UI logic.
- Store source year and round in every cutoff row.
- Avoid hard-coding a single JoSAA source URL into the UI, because older years such as 2024 may come from a different website or archived source.
- Keep institute ranking data in a separate normalized file.
- Include a clear script or process for refreshing JoSAA and NIRF data.

### 10.4 Trust and Disclaimer

The app must clearly state:

- Results are based on historical JoSAA opening/closing ranks.
- Closing ranks change every year.
- This is a guidance tool, not an admission guarantee.
- Users should verify final choices on official JoSAA sources.

## 11. Data Model

### 11.1 Institute

```json
{
  "id": "iit-madras",
  "josaa_name": "Indian Institute of Technology Madras",
  "nirf_name": "Indian Institute of Technology Madras",
  "institute_type": "Indian Institute of Technology",
  "city": "Chennai",
  "state": "Tamil Nadu",
  "nirf_engineering_rank": 1,
  "nirf_score": 88.72
}
```

### 11.2 Cutoff Row

```json
{
  "year": 2025,
  "round": 1,
  "institute_id": "iit-madras",
  "institute_name": "Indian Institute of Technology Madras",
  "program_name": "Civil Engineering (4 Years, Bachelor of Technology)",
  "quota": "AI",
  "seat_type": "OPEN",
  "gender": "Gender-Neutral",
  "opening_rank_raw": "1234",
  "opening_rank": 1234,
  "closing_rank_raw": "8000",
  "closing_rank": 8000,
  "is_preparatory": false
}
```

## 12. Suggested Technical Approach

### 12.1 Prototype Architecture

Use a static frontend app:

- React or Next.js frontend
- Static JSON files for NIRF ranking and JoSAA cutoff data
- Client-side filtering and sorting

This is enough for V1 because the dataset is modest and the main interaction is filtering.

### 12.2 Data Pipeline

Build a data ingestion script that:

1. Downloads or captures JoSAA opening/closing rank data for all IITs, rounds, programs, seat types, and gender pools.
2. Normalizes institute names and program names.
3. Parses rank values and preparatory suffixes.
4. Joins cutoff rows with NIRF institute ranking data.
5. Exports clean JSON for the frontend.

For V1, the ingestion target is JoSAA 2025 only. The ingestion design should still accept `year` as a parameter so later sources, such as JoSAA 2024 from a different website or archive, can be added without changing the frontend filtering model.

### 12.3 Name Mapping

Maintain an explicit mapping file:

```json
{
  "Indian Institute of Technology (Banaras Hindu University) Varanasi": {
    "id": "iit-bhu-varanasi",
    "nirf_name": "Indian Institute of Technology (Banaras Hindu University) Varanasi"
  },
  "Indian Institute of Technology (Indian School of Mines)": {
    "id": "iit-ism-dhanbad",
    "nirf_name": "Indian Institute of Technology (Indian School of Mines)"
  }
}
```

## 13. Milestone Plan

### Milestone 1 - Data Proof of Concept

- Confirm all JoSAA dropdown values can be programmatically accessed.
- Extract IIT rows for JoSAA 2025 Round 1 and one seat type.
- Extract NIRF Engineering 2025 IIT ordering.
- Produce a sample merged JSON file.

Deliverable:

- `data/sample-cutoffs.json`
- `data/institutes.json`

### Milestone 2 - Predictor UI Prototype

- Build the first screen with rank, round, institute type, seat type, gender, and rank window controls.
- Render grouped results by NIRF order.
- Add classification labels: aspirational, in range, very safe by rank.

Deliverable:

- Working local website prototype.

### Milestone 3 - Full IIT Dataset

- Populate all IIT data for all rounds and relevant seat types, keeping Round 1 as the default user-facing view.
- Add institute name mapping coverage.
- Add data validation checks for missing NIRF matches and invalid ranks.

Deliverable:

- Complete IIT-only static dataset.

### Milestone 4 - Polish and Parent UX

- Improve mobile layout.
- Add result summaries and empty states.
- Add source/disclaimer panel.
- Add CSV export or shortlist feature if needed.

Deliverable:

- Parent-ready IIT branch predictor.

## 14. Open Decisions

These should be decided before final implementation:

- Should female-only seats be shown together with gender-neutral seats, or separated by a gender filter?
- Should the default rank window be fixed at `2000`, or configurable by parent?
- Should results show only `closing_rank >= user_rank`, or include aspirational branches down to `user_rank - 2000`?

## 15. V1 Success Criteria

The V1 is successful if a parent can:

1. Enter a rank, such as `8000`.
2. Select round, institute type, and seat type.
3. See matching IIT branches immediately.
4. Read results in NIRF order, starting with IIT Madras when applicable.
5. Understand whether each branch is aspirational or in range.
6. Trust where the data came from.
