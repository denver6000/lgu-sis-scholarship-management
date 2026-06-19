# Codex Continuation Notes

Last updated: 2026-06-02

Use this as a directive when continuing this project as Codex. The main session memory is in `docs/session/agents.md`; this file highlights the decisions most likely to matter during implementation.

Read `docs/session/renewal-cycle-architecture.md` before changing Renewal or Payrolls. It records the recommended cycle-based model for school-year/semester renewals, `is_active`, and payroll linkage.

## Working Style For This Repo

Read before editing. This project changed rapidly during migration, and `apps/sis-next/app/app-shell.tsx` carries a lot of behavior. Use `rg` and focused reads before touching it.

Prefer small, direct edits. The user is actively shaping product behavior, so avoid broad refactors unless the request asks for them or the file becomes impossible to maintain.

Run builds from:

```text
apps/sis-next
```

Command:

```bash
npm run build
```

## Product Rules To Preserve

The app is now the Next.js app under `apps/sis-next`. Do not put new product logic back into `public/` or `functions/` unless the user explicitly asks.

Visible pages:

- Dashboard
- Catalogs
- Registry
- Requirements
- Records
- Users
- Payrolls
- Trash

Role visibility:

- Encoders can access Dashboard, Registry, Requirements, and Records.
- Encoders can create student records and manage semester requirement maps.
- Encoders should not see Payrolls, payout records, payroll history, payroll operation logs, Users, Catalogs, or Trash.
- Admins keep full navigation and payroll-aware requirement controls.

Removed from visible navigation:

- Import
- Payout Records
- Setup
- Renewal

Redirects:

- `/exports` redirects to `/payrolls`.
- `/setup` redirects to `/catalogs`.
- `/renewal` redirects to `/requirements`.

## Payroll Is Strict

Payrolls are tied to generated government documents. Do not casually mutate payroll state from records.

Only `/payrolls` should create payroll files and set `payrolled: true`.

`/records` may show payroll history, counts, and totals, but should not include manual `Mark Payrolled` or `Mark Claimed` controls in Record Actions.

Current Payrolls behavior:

- `New`: initial payout candidates whose selected-semester initial requirements are complete and who are not yet payrolled for that selected school year/semester.
- `Renewal`: renewal payout candidates whose selected-semester renewal requirements are complete and who are not yet payrolled for that selected school year/semester.
- Fresh/no-initial-payroll students qualify from the six initial payout requirements and skip renewal requirements for their first payroll.
- Renewal students qualify from initial payroll existence plus Liquidation, Proof of Enrollment, and Latest Grades.

Creating payroll from `New` or `Renewal`:

- Generate payroll files.
- Set the selected semester record `payroll_status: "payrolled"`.
- Store `payroll_id`, `payroll_record_type`, `payrolled_at`, `payrolled_by_uid`, and `payrolled_by_email` on that selected semester record in the student doc.
- Set student `payrolled: true` only as the broad compatibility flag that initial payroll exists.
- Do not set `renewed` as a side effect.
- Save payroll trace records with `type: "initial_payout_payroll"` or `type: "renewal_payroll"` based on the internal selected-cycle payout type.

Payroll traces currently use `payoutRecords` for compatibility.

Payroll qualification rules:

- Initial payout qualification comes from the six global student-level initial payout requirements.
- Renewal payout qualification comes from initial payroll existence plus Liquidation, Proof of Enrollment, and Latest Grades.
- `renewal_status` and `payout_type` are not user-facing controls.
- New/no-initial-payroll students default internally to initial payout, which skips renewal requirements for first payroll.
- Once a student has ever been payrolled, they are permanently a renewal student in system lifecycle terms.
- A selected semester can still have its own `payroll_status` and payroll trace, but that cycle-local status must not reset the student's permanent renewal lifecycle.
- Initial requirements supersede school-year/semester selection and are read from `students/{studentId}.requirements`.
- For compatibility, old `semester_records[].initial_payout_requirements` snapshots may be read only when the global initial requirement map is empty.
- Saving from Requirements rewrites the chosen initial requirement map to `students/{studentId}.requirements` and syncs semester snapshots so old per-semester initial data does not keep drifting.
- Renewal requirements are the only requirement map that resets per semester.
- The student doc shape and lifecycle helpers live in `apps/sis-next/app/lib/models/student.ts`.

## Requirements Workspace

`/requirements` is the primary place to manage semester requirements.

Current behavior:

- School-year timeline appears at the top and is horizontally scrollable.
- It generates up to 10 school years.
- Semester selector is a two-semester spinner only.
- Student filters are local to Requirements and sit near the student list: name, student ID, school, and barangay.
- Each semester has separate renewal requirement maps. New semesters start with empty renewal checks.
- Initial payout requirements and renewal requirements are edited separately, but initial requirements save globally to the student record.
- Renewal requirements are skipped/disabled for initial-payout students and require initial payroll for renewal students.
- Encoders see one requirements-focused student list without payrolled/non-payrolled tabs, payroll qualification columns, or payroll wording in the requirement editor.
- Admins still see payroll-aware buckets and qualification indicators.
- Requirements logs a collapsed console table when the selected timeline/cycle list changes, including top-level `payrolled`, legacy `renewed`, permanent lifecycle, and selected-cycle payroll status.

## Records Page

Records must immediately show payroll count and total payroll amount per student.

Record Actions dialog should remain uncluttered:

- Edit Student
- Show Payroll History
- Move To Trash for admins

Payroll History Lookup is in `/records` and reads from payroll trace records.

Payroll count, totals, payroll filters, and Payroll History Lookup are admin-only. Encoders should see the student lookup/requirements view only.

Payrolls logs a collapsed console table when the selected timeline/cycle list changes, using the same lifecycle fields as Requirements.

## Auth And Roles

Non-admin role is `encoder`.

Legacy `user` claims are recognized only for compatibility. New users should get:

```json
{ "role": "encoder", "encoder": true }
```

Encoder student writes are sanitized server-side so they cannot change top-level payroll flags or semester payroll metadata while updating requirements.

Admin users should get:

```json
{ "role": "admin", "admin": true }
```

The emulator admin user is:

- `admin@gmail.com`
- `admin123`

## Emulator And `.env.local`

`APP_ENV=dev` in `apps/sis-next/.env.local` drives emulator use.

Server reads `process.env.APP_ENV`.

Client gets the mirrored public value through Next config.

Expected emulator ports:

- Firestore: `127.0.0.1:8080`
- Auth: `127.0.0.1:9099`

Use the checked-in emulator toolbox before writing one-off inspection scripts. A project-local skill for this workflow lives at `.agents/skills/sis-emulator-suite`; invoke/use `$sis-emulator-suite` for emulator data debugging.

```bash
npm run emu:status
npm run emu:collections
npm run emu:students -- --limit 20 --filter "juan"
npm run emu:student -- STU001
npm run emu:requirements -- --limit 20 --filter "juan"
npm run emu:auth-users
npm run emu:logs -- --limit 20
```

Toolbox file:

```text
apps/sis-next/scripts/emulator-suite.mjs
```

## Firestore SSR Caution

The SSR loader once attempted user-context Firebase Server App reads first. In emulator/dev and admin sessions this caused permission-denied roundtrips before Admin fallback.

Current choice:

- Dev/admin SSR data loading should go straight to Admin-backed repository reads.

Do not reintroduce slow user-context probes without a strong reason.

## Known Next Dev Cache Failure

If the dev server throws missing vendor chunks such as:

- `lucide-react.js`
- `@grpc.js`
- `@opentelemetry.js`

then the likely fix is:

1. Stop dev server.
2. Delete `apps/sis-next/.next`.
3. Restart dev server.

This has repeatedly been stale local build output.

## React Event Handler Rule

Never use `event.currentTarget.value` or `event.currentTarget.checked` inside a state updater closure. Capture it first.

Good:

```tsx
onChange={(event) => {
  const value = event.currentTarget.value;
  setDraft((current) => ({ ...current, role: value }));
}}
```

Same for checkbox `checked`.

## Removed Fields

Do not reintroduce:

- student `status`
- `academic_status`

Use real operational flags:

- `claimed`
- `payrolled`

Compatibility-only fields:

- `renewed`
- `renewal_status`

Do not expose:

- user-editable `renewal_status`
- user-editable `payout_type`

## Files Most Often Touched

- `apps/sis-next/app/app-shell.tsx`
- `apps/sis-next/app/globals.css`
- `apps/sis-next/app/lib/shared/views.ts`
- `apps/sis-next/app/lib/shared/student.ts`
- `apps/sis-next/app/lib/server/repositories/students.ts`
- `apps/sis-next/app/lib/server/app-data.ts`
- `apps/sis-next/app/lib/shared/payout-record.ts`
- `apps/sis-next/app/lib/server/repositories/payout-records.ts`

## Before Final Response

After implementation, summarize:

- what changed
- why it changed if architectural
- verification result

Keep the final concise and practical.
