# Academic Year & Year-End Promotion

## What this adds

The academic year is now a first-class entity. Schools roll over to a new year
with one admin action instead of re-entering data, and all history is preserved.

### Data model (`backend/app/models/academic/promotion.py`)
- **`AcademicYear`** — per institution, one `is_active`. `is_active` (not
  `status`) decides which year new academic writes attach to, so a year can be
  `PROMOTION_COMPLETED` (corrections still allowed) without being the write
  target. Lifecycle: `ACTIVE → PROMOTION_COMPLETED → CLOSED`.
- **`Enrollment`** — one row per student per year; the historical roster of
  record. Carries immutable `grade_name_snapshot` / `section_name_snapshot` /
  `class_name_snapshot` so renames never rewrite history. `Student.school_class_id`
  remains the denormalised "current" pointer (hot login/roster path unchanged).
- **`PromotionRun`** — audit + idempotency, unique `(institution_id, from_year_id)`.
- **`Student.admission_number`** — stable, unique-per-institution identity
  (backfilled `ADM-{institution_id}-{id}`), used as the export key.
- **`academic_year_id`** stamped on `attendance`, `marks`, `exams`,
  `student_fees` — gives the clean year boundary and arrears labelling.

### Write-path stamping
New academic writes are stamped with the active year via
`academic_year_service.resolve_active_year_id`. Edits to existing rows keep
their original year (so the old year stays correctable after promotion).

### Promotion (`backend/app/services/academic/promotion_service.py`)
- `preview_promotion` — dry-run: per-class overall %, per-student %, arrears,
  default promote/retain decisions, graduates, classes to auto-create.
- `execute_promotion` — single transaction, idempotent. Promotes (auto-creating
  missing next-grade classes), retains (re-enrolled into the same class for the
  new year, fees re-stamped current), graduates the top grade (kept, not
  deleted). Old fees are left in place as arrears.
- Routes: `GET /api/academic/years`, `POST /api/academic/promotion/preview`,
  `GET /api/academic/promotion/preview/export?format=xlsx|csv`,
  `POST /api/academic/promotion/execute`.

### Arrears visibility
Dues queries split current-year vs previous-year arrears
(`StudentDuesResponse.previous_year_due` / `arrears`). Admin sees a
"carried-forward arrears" banner on the Finance dashboard
(`GET /api/finance/arrears`); parents see a "due from last year" line on the
web payment page and the mobile fees screen.

## Operational note: applying the migration
Migration `e2d4f6a8b0c1` chains on the current `versions/` lineage
(`…→ c8f2a1b4d6e7`). A database stamped at an **archived** revision (e.g.
`q5f6a7b8c9d0`, from `versions_archive_*`) is on a different lineage and must be
reconciled first — confirm its schema already matches the clean baseline, then
`alembic stamp c8f2a1b4d6e7` before `alembic upgrade head`. Verified clean from
scratch + reversible + no autogenerate drift on a throwaway database.

## Future year-scoping backlog (not yet implemented)

Each should eventually carry `academic_year_id` (same pattern as above) so it is
year-filterable and preserved as history:

- **Timetables** (`TimetableSlot`) — nearest-term candidate; rebuilt every year.
- **Report Cards** — once stored as entities; year-stamp + snapshot names.
- **Lesson Plans** & **Homework** — year-scope when they become persisted,
  recurring artifacts.
- **Announcements** — lower priority (already time-stamped).
- **Teacher Planning / future academic-planning modules** — design year-scoped
  from the start.
