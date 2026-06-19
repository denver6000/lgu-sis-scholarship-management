# Claude Handoff Directives

Last updated: 2026-06-02

This file is for Claude or any assistant continuing the SIS migration. The canonical architecture/session memory is `docs/session/agents.md`. Follow these directives to avoid undoing important decisions.

Before changing Renewal or Payrolls, read `docs/session/renewal-cycle-architecture.md`. It records the planned cycle-based model for school-year/semester renewals, `is_active`, renewal limits, and payroll linkage.

## High-Level Context

The project is migrating a legacy static Firebase SIS in `public/` into a Next.js App Router app in `apps/sis-next`.

The Next app is now the active product surface. The static app should be treated as historical reference, not the place for new implementation.

## Current Navigation

The visible nav rail should contain:

- Dashboard
- Catalogs
- Registry
- Requirements
- Renewal
- Records
- Users
- Payrolls
- Trash

Do not restore these removed nav items without explicit user request:

- Import
- Payout Records
- Setup

Existing compatibility redirects:

- `/exports` -> `/payrolls`
- `/setup` -> `/catalogs`

## Domain Language

Use `Payrolls`, not `Exports`, for the payroll document workflow.

Use `encoder`, not `user`, for the non-admin role.

Avoid generic student status fields. The app intentionally removed:

- `status`
- `academic_status`

Use explicit workflow flags:

- `claimed`
- `payrolled`

Compatibility-only fields:

- `renewed`
- `renewal_status`

Do not expose user-editable `renewal_status` or `payout_type`.

## Payroll Rules

Payroll is document-bound and sensitive because it represents generated government-signed documents.

Only the `/payrolls` page should mutate payroll state or create payroll traces.

The `/records` page is allowed to display payroll history and totals, but must not manually mark students claimed/payrolled.

Record Actions currently should include:

- Edit Student
- Show Payroll History
- Move To Trash for admins

Record Actions should not include:

- Mark Claimed
- Mark Payrolled

## Requirements Workspace

`/requirements` is the main semester requirement management surface.

Current behavior:

- School-year timeline at the top.
- Two-semester spinner only.
- Local student filters near the list: name, student ID, school, and barangay.
- Initial payout requirements and renewal requirements are separate maps.
- Requirement maps are separated per semester and new semester records start empty.
- Renewal requirements are skipped/disabled for initial payout students.
- Renewal requirements require existing initial payroll for renewal students.
- No user-facing Payroll Qualification Type control.
- No user-facing Renewal Status selector.

## Payroll Workflows

The Payrolls page has two tabs:

- `New`
- `Renewal`

`New` behavior:

- Shows initial payout candidates for the selected school year/semester.
- Fresh/no-initial-payroll students qualify from the six initial payout requirements and skip renewal requirements for their first payroll.

`Renewal` behavior:

- Shows renewal payout candidates for the selected school year/semester.
- Renewal students qualify from initial payroll existence plus Liquidation, Proof of Enrollment, and Latest Grades.

Both tabs:

- Generates payroll files.
- Sets selected semester record `payroll_status: "payrolled"`.
- Stores `payroll_id`, `payroll_record_type`, `payrolled_at`, `payrolled_by_uid`, and `payrolled_by_email` on that selected semester record in the student doc.
- Sets student `payrolled: true` only as the broad compatibility flag that initial payroll exists.
- Creates payroll trace records with `type: "initial_payout_payroll"` or `type: "renewal_payroll"` based on the internal selected-cycle payout type.
- Does not set `renewed` as a side effect.

Payroll trace records live in `payoutRecords` for compatibility.

Payroll qualification rules:

- Initial payout qualification comes from the six initial payout requirements.
- Renewal payout qualification comes from initial payroll existence plus Liquidation, Proof of Enrollment, and Latest Grades.
- `payout_type` is internal only. New/no-initial-payroll students default to `initial`.

Useful payroll record fields:

- `payroll_id`
- `student_id`
- `student_name`
- `amount`
- `type`
- `status`
- `payroll_group_count`
- `payroll_student_count`
- `created_at`
- `notes`

## Records Page

The Records table should immediately show:

- payroll count per student
- total payroll amount per student

It also includes Payroll History Lookup backed by `payoutRecords`.

## Auth And Emulator

SSR auth uses Firebase session cookies and server verification.

Environment:

- `APP_ENV=dev` means use Firebase emulators.
- Server reads `process.env.APP_ENV`.
- Client receives public mirrored value from Next config.

Emulator ports:

- Auth: `127.0.0.1:9099`
- Firestore: `127.0.0.1:8080`

Local admin user:

- Email: `admin@gmail.com`
- Password: `admin123`
- Claims: `{ admin: true, role: "admin" }`

Root `npm run emulators` imports/exports state at:

```text
emulator-data/local-suite
```

Stop emulators cleanly so export-on-exit runs.

## SSR Firestore Performance Decision

The app once attempted user-context SSR reads before Admin fallback. In dev/admin sessions this caused slow permission-denied Firestore calls.

Preserve the current behavior:

- Dev/admin SSR paths should use Admin-backed repository reads directly.
- Do not reintroduce slow user-context probes unless there is a clear reason.

## Known Development Error

Missing `.next/server/vendor-chunks/*.js` errors are usually stale local Next output.

Examples:

- `lucide-react.js`
- `@grpc.js`
- `@opentelemetry.js`

Fix:

1. Stop Next dev server.
2. Delete `apps/sis-next/.next`.
3. Restart dev server.

## Code Safety Notes

React event handlers must capture values before using functional state updates.

Correct:

```tsx
const value = event.currentTarget.value;
setDraft((current) => ({ ...current, value }));
```

Correct for checkbox:

```tsx
const checked = event.currentTarget.checked;
```

Avoid reading `event.currentTarget` inside updater callbacks.

## Verification

Run builds from:

```text
apps/sis-next
```

Command:

```bash
npm run build
```

Use build success as the minimum verification after touching app code.
