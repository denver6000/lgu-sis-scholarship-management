# Session Architecture And Handoff Directives

Last updated: 2026-06-02

This document records implementation history, architecture choices, bug context, and working directives from the `public/` static SIS migration into `apps/sis-next/`. Treat it as project memory for future agents and human reviewers.

Related architecture notes:

- [Renewal Cycle Architecture](./renewal-cycle-architecture.md): recommended model for school-year/semester requirements, cycle membership, payroll qualification, internal `payout_type`, `payroll_status`, and payroll linkage.

## 2026-06-02 Session Development Log

This session moved the product from a payroll-first interpretation toward a requirements-first scholarship workflow.

Implemented and verified:

- Browser persistence was added for shell/form state so refreshes do not reset drafts.
- Scroll position is persisted per path so scrollable UIs do not jump to top after refresh/navigation.
- Register Student now shows a summary confirmation modal before save.
- Registry requirements were converted into a map.
- Semester records were introduced on students as the bridge for per-school-year/per-semester requirement tracking.
- `systemConfig/currentCycle` was introduced with API/repository support.
- `/requirements` was added as a first-class route and nav item.
- Requirements has a top school-year timeline, a two-semester spinner, and local filters near the student list.
- Requirements filters support student name, student ID, school, and barangay.
- Requirements lists `Non-Payrolled` and `Payrolled` students for the selected school year/semester.
- Initial payout requirements and renewal requirements are edited separately.
- Requirement maps are now semester-separated; new semesters start empty.
- Renewal requirements are skipped/disabled for initial-payout students and require initial payroll for renewal students.
- User-facing `Renewal Status` was removed from the requirement editor.
- User-facing `Payroll Qualification Type` was removed; `payout_type` is internal only.
- `payroll_status` was introduced as the derived bridge field: `not_qualified`, `qualified`, `payrolled`.
- Payrolls now lists requirement-qualified unpaid candidates for the selected school year/semester.
- Fresh/no-initial-payroll students qualify from initial requirements and skip renewal requirements for their first payroll.
- Renewal students qualify from initial payroll existence plus renewal requirements.
- Payroll export writes `initial_payout_payroll` or `renewal_payroll`, sets semester `payroll_status: "payrolled"`, records payroll metadata on that student semester record, and does not set `renewed`.
- Mutating UI actions now use confirmation dialogs, a shared loading overlay, and `operationLogs` audit records for inserts, updates, deletes, restores, and payroll exports.
- Encoder permissions were expanded to include `/requirements` and `/register`, while `/payrolls`, payout records, payroll history, payroll filters, payroll operation logs, `/users`, `/catalogs`, and `/trash` remain admin-only.
- Encoder requirement edits preserve existing payroll metadata and cannot set top-level or semester-level payroll state.
- Student lifecycle philosophy was clarified: semester payroll status is cycle-specific history, but a student who has ever been payrolled is permanently treated as a renewal student by the system.
- Initial payout requirements are global student-level requirements from `students/{studentId}.requirements`; they supersede school-year/semester selection and must not reset per year.
- Register Student, Requirements, Payrolls, and the student model now read initial requirements from the same global map. Legacy semester `initial_payout_requirements` snapshots are used only as a migration fallback when the global map is empty.
- Saving Requirements writes the initial map back to `students/{studentId}.requirements` and syncs old semester snapshots, so records created during earlier per-semester iterations self-heal when touched.
- Renewal requirements remain semester-specific and are stored on the selected `semester_records[]` entry.
- `apps/sis-next/app/lib/models/student.ts` now documents the student doc shape through `StudentDocShape` and exposes `StudentModel` helpers for permanent payroll lifecycle and timeline debug snapshots.
- Requirements and Payrolls timeline views now log collapsed console tables showing each visible student's top-level `payrolled`, legacy `renewed`, permanent lifecycle, and selected-cycle payroll status.
- Firebase Auth `auth/network-request-failed` is caught in the auth provider and shown as friendly login copy.
- Session architecture docs were updated to preserve the corrected model.

Important caveats:

- `/payrolls` separates payroll candidates into `New` and `Renewal` tabs.
- `students/{studentId}.semester_records[]` is a bridge model; the fuller future model may move cycle data to `cycles/{cycleKey}/studentCycles/{studentId}`.
- `renewed`, `renewal_status`, and `requirements` on semester records remain only for compatibility with older data.
- `payoutRecords` is still the compatibility collection for payroll trace records.
- `school_id` remains legacy only and is not part of the active initial payout requirement list.

## Current Product Shape

The active app is `apps/sis-next`, a Next.js App Router application replacing the legacy static `public/` app. The legacy static app remains useful as behavior reference, especially `public/js/store.js` and route HTML pages, but new user-facing SIS work should land in `apps/sis-next`.

The application uses a sidebar/nav rail with explicit App Router pages:

- `/dashboard`
- `/catalogs`
- `/register`
- `/requirements`
- `/records`
- `/users`
- `/payrolls`
- `/trash`

Legacy or removed routes:

- `/exports` redirects to `/payrolls`.
- `/setup` redirects to `/catalogs`.
- `/renewal` redirects to `/requirements`.
- `Import`, `Payouts`, `Setup`, and the standalone `Renewal` tab are removed from visible navigation.

## Authentication And Roles

Authentication is SSR-aware and Firebase-backed.

- Server session cookie: `__session`
- Short-lived ID-token cookie: `__session_id_token`
- Server auth helpers live under `apps/sis-next/app/lib/server/auth.ts`
- Client auth/session refresh is handled through `apps/sis-next/app/auth-provider.tsx` and `/api/auth/session`

Important login stability fix:

- Firebase Auth `auth/network-request-failed` can happen while `onIdTokenChanged` refreshes a token.
- `apps/sis-next/app/auth-provider.tsx` catches `nextUser.getIdToken()` failures so `/login` does not crash with an unhandled client error.
- `apps/sis-next/app/login/page.tsx` maps `auth/network-request-failed` to a friendly network message.

Roles:

- `admin`: full administrative role.
- `encoder`: normal non-admin role.
- Legacy custom claim `user` is recognized only for backward compatibility and normalized as `encoder`.

Important role decision:

- New non-admin users must use custom claims `{ role: "encoder", encoder: true }`.
- Do not create new `{ role: "user", user: true }` accounts.
- Keep backward compatibility until all old users are migrated.
- Encoders can work in Registry, Requirements, Records, and Dashboard unless a later role split changes the visible navigation.
- Encoders can create student records and manage semester requirement maps.
- Encoders cannot access Payrolls, payout record APIs, payroll history lookup, payroll operation logs, user management, catalogs, or trash.
- Server-side student writes sanitize encoder input so payroll fields and payroll metadata cannot be changed outside admin workflows.

## Emulator Behavior

`APP_ENV=dev` in `apps/sis-next/.env.local` means the app should connect to local Firebase emulators.

Expected emulator ports:

- Auth: `127.0.0.1:9099`
- Firestore: `127.0.0.1:8080`

Server code reads `process.env.APP_ENV`. Client code receives the mirrored public value through Next config.

Root `npm run emulators` was updated to import/export local emulator state:

```json
--import=./emulator-data/local-suite --export-on-exit=./emulator-data/local-suite
```

Operational note:

- Stop emulators cleanly with `Ctrl+C` so Auth users and Firestore data are exported.
- Do not hard-kill the emulator process if preserving local state matters.

Reusable emulator toolbox. A project-local skill for this workflow lives at `.agents/skills/sis-emulator-suite`; invoke/use `$sis-emulator-suite` for emulator data debugging.

```bash
npm run emu:status
npm run emu:collections
npm run emu:students -- --limit 20 --filter "juan"
npm run emu:student -- STU001
npm run emu:requirements -- --limit 20 --filter "juan"
npm run emu:auth-users
npm run emu:logs -- --limit 20
```

The toolbox lives at `apps/sis-next/scripts/emulator-suite.mjs`. Prefer these commands before creating one-off inspection scripts.

Known local admin emulator user:

- Email: `admin@gmail.com`
- Password: `admin123`
- Claims: `{ admin: true, role: "admin" }`

Helper created:

- `migration/bin/ensure_emulator_admin_user.js`

## Firestore And SSR Data Loading

The app originally tried Firebase Server App user-context reads during SSR and then fell back to Admin SDK reads. In local emulator/dev and admin sessions, that produced slow page loads because Firestore rules denied the user-context read first:

- `permission-denied` on `students`
- `permission-denied` on `payoutRecords`

Decision:

- In `APP_ENV=dev`, skip user-context Firestore probes and go straight to Admin-backed repositories.
- For admin sessions, also skip user-context probes.
- This avoids paying for a failed rules check before the real load.

Relevant file:

- `apps/sis-next/app/lib/server/app-data.ts`

Also important:

- SSR Firestore user-context reads were moved to `firebase/firestore/lite` to avoid the heavier `grpc/protobuf` path and related warnings.

## Backend Migration

Callable functions and direct client Firestore access were migrated into Next backend APIs.

Primary backend API areas:

- `/api/students`
- `/api/trash`
- `/api/users`
- `/api/options/[collection]`
- `/api/school-courses`
- `/api/payout-records`
- `/api/auth/session`

Old import/seed APIs still exist but are no longer exposed in the UI:

- `/api/import/batch-options`
- `/api/seed/firestore`

Unless explicitly requested, avoid re-exposing Import or Seed controls in the app.

## UI And Routing Decisions

Early migration used a single client shell with local `activeView`. It was converted to real App Router pages.

Important stability decision:

- Dynamic `[view]` route caused repeated dev-server vendor chunk errors.
- It was replaced with explicit route pages and shared `app/view-page.tsx`.

Known stale Next dev errors:

- Missing `.next/server/vendor-chunks/@grpc.js`
- Missing `.next/server/vendor-chunks/@opentelemetry.js`
- Missing `.next/server/vendor-chunks/lucide-react.js`
- Browser `Cannot read properties of undefined (reading 'call')`

When these appear after code changes:

1. Stop the Next dev server.
2. Remove `apps/sis-next/.next`.
3. Restart the dev server.

These have been stale build artifact issues, not direct evidence of compromise.

## Removed Or Renamed Product Areas

Removed from nav/UI:

- Import
- Payout Records
- Setup

Renamed:

- Exports -> Payrolls

Kept as redirects:

- `/exports` -> `/payrolls`
- `/setup` -> `/catalogs`

Catalogs:

- Barangays
- Schools
- Courses
- Batches

`Setup` used to contain school-course mappings. That separate Setup tab was removed. Be careful before reintroducing it; the current desired product shape is simpler.

## Student Data Model Decisions

Removed from student model/UI:

- Generic `status`
- `academic_status`

Current student state should be expressed through concrete workflow data, not broad status labels.

Stable operational flags:

- `claimed`
- `payrolled`

Compatibility-only fields:

- `renewed`
- `renewal_status`

Do not reintroduce broad fake status fields unless the user explicitly changes the domain model.

Current requirement-centered bridge model:

- `students/{studentId}.requirements` stores the global six-item initial payout requirement map. This is the live source of truth for initial requirements across all school years and semesters.
- `students/{studentId}.semester_records[]` is the active per-semester requirements bridge.
- Each semester record stores `school_year`, `sem_number`, `cycle_key`, internal `payout_type`, derived `payroll_status`, `renewal_requirements`, payroll metadata, timestamps, updater fields, and notes. `initial_payout_requirements` may remain only as a compatibility/snapshot field.
- Renewal requirement maps are semester-separated. A new semester starts with empty renewal requirements and must not automatically inherit another semester.
- Initial requirements do not belong to a semester; they are read from the student record and apply globally.
- `payout_type` is internal only. Do not expose a UI control for it.
- New/no-initial-payroll students default internally to `payout_type: "initial"` so renewal requirements are skipped for first payroll.
- Once initial payroll exists, renewal qualification requires the three renewal requirements.
- `payroll_status` is derived as `not_qualified`, `qualified`, or `payrolled`.
- `renewal_status` is legacy compatibility only and must not be exposed as a user-editable selector.

Initial payout requirements:

- Certificate of Residency
- Pagpapatunay Form
- Picture of the House
- Good Moral Certificate
- Original Certificate of Grades
- Proof of Enrollment

Renewal requirements:

- Liquidation
- Proof of Enrollment
- Latest Grades

Legacy note:

- `school_id` may still exist on old records but is not part of the active six-item initial payout checklist.

## Requirements Workspace Decisions

`/requirements` is the primary workspace for managing semester requirement maps.

Current behavior:

- School-year timeline appears at the top.
- The school-year timeline generates 10 school years and is horizontally scrollable.
- Semester selection is a two-semester spinner only.
- The selected-cycle subtitle was intentionally removed from the timeline surface.
- Student filters live near the student list, not above the timeline.
- Requirements filters are local to the Requirements page: student name, student ID, school, and barangay.
- The list has `Non-Payrolled` and `Payrolled` tabs for the selected school year and semester.
- `Manage Requirements` opens the cycle-aware semester record modal.
- The modal edits initial payout and renewal requirement maps separately.
- Renewal requirement checkboxes are skipped/disabled automatically for initial-payout students.
- Renewal requirement checkboxes require an initial payroll for renewal students.
- There is no user-facing `Payroll Qualification Type`, `payout_type`, or `Renewal Status` control.
- Encoders see a requirements-focused version of the page: one student list, no payrolled/non-payrolled switch, no payroll qualification column, and no payroll wording in the requirement editor.
- Admins keep the payroll-aware requirement buckets and qualification indicators.

UI persistence and refresh resilience:

- Shell state is persisted in browser `localStorage` so forms survive refresh.
- Scroll position is stored in `sessionStorage` to avoid scrollable UIs jumping back to top after refresh/navigation.
- Register Student has a summary confirmation modal before save.

## Payroll Domain Rules

Payroll is a document-bound government workflow. Treat it as stricter than normal UI flags.

Key rule:

- Payroll state should be changed through `/payrolls`, because payroll changes are bound to generated files and signed government documents.
- Do not expose manual `Mark Payrolled` actions in `/records`.

Current Payrolls behavior:

- Route: `/payrolls`
- The actionable tabs are `New` and `Renewal`.
- `New` shows initial payout candidates for the selected school year/semester.
- `Renewal` shows renewal payout candidates for the selected school year/semester.
- Fresh/no-initial-payroll students qualify from the six initial payout requirements and skip renewal requirements for their first payroll.
- Renewal students qualify from initial payroll existence plus the three renewal requirements.
- Creating payroll is available from both `New` and `Renewal` tabs.
- Creating payroll only accepts qualified unpaid candidates for the selected cycle.
- Payroll creation writes `payroll_status: "payrolled"` to that semester record.
- Payroll creation also records `payroll_id`, `payroll_record_type`, `payrolled_at`, `payrolled_by_uid`, and `payrolled_by_email` on that semester record in the student doc.
- Payroll creation sets `payrolled: true` only as the broad compatibility flag that initial payroll exists.
- Payroll creation does not set `renewed` as a side effect.
- Payroll trace records use `type: "initial_payout_payroll"` or `type: "renewal_payroll"` based on the internal selected-cycle payout type.

Payroll records are stored in the existing `payoutRecords` collection for compatibility, but are now used as payroll trace records.

Operation logs:

- Stored in `operationLogs`.
- Written through `/api/operation-logs`.
- The Dashboard shows recent operations.
- UI handlers should record successful insert, update, delete, restore, and export actions.
- Do not log operation-log inserts themselves.

Added payroll record fields:

- `payroll_id`
- `payroll_group_count`
- `payroll_student_count`

Important conceptual distinction:

- Payrolls have a qualification system.
- Initial payout qualification comes from the six initial payout requirements.
- Renewal payout qualification comes from initial payroll existence plus the three renewal requirements.
- Renewal requirements prove the student is still enrolled.
- `renewed` is not the source of truth for payroll qualification.
- Payroll trace records are history.
- Semester `payroll_status` plus requirements are the current bridge source of payroll qualification.

## Records Page Decisions

`/records` is a student lookup and review surface, not the place where payroll state mutates.

Current table behavior:

- Shows payroll count per student immediately.
- Shows total payroll amount per student.
- Has one `Actions` button per row.

Record Actions dialog:

- Edit Student
- Show Payroll History
- Move To Trash for admins

Removed from Record Actions:

- Mark Claimed
- Mark Payrolled

Reason:

- Payroll changes must happen through `/payrolls`.
- Claim/payroll flags should not be casually toggled from records when they are tied to formal documents.

Payroll History Lookup:

- `/records` includes a lookup section for payroll traces by student.
- It reads from `payoutRecords`.
- Payroll count, total, status filters, and Payroll History Lookup are admin-only in the UI.
- Encoders see only the student lookup and requirements record view.

## React Event Bug Pattern

Several crashes came from reading `event.currentTarget.value` or `.checked` inside state updater closures after React had nulled the event object.

Fix pattern:

```tsx
onChange={(event) => {
  const value = event.currentTarget.value;
  setState((current) => ({ ...current, value }));
}}
```

Use the same pattern for checkboxes:

```tsx
const checked = event.currentTarget.checked;
```

Do not read `event.currentTarget` inside a delayed updater.

## Build Verification

Use:

```bash
npm run build
```

from:

```text
apps/sis-next
```

The build has been used as the main verification step after each migration change.

Latest verified build:

- `npm run build` from `apps/sis-next` passed on 2026-06-02 after the Requirements, payroll qualification, login network handling, semester-separated requirements, internal initial-payout flag, requirement-qualified Payrolls, operation logging, and encoder requirements-access permission changes.

## Future Agent Directives

1. Prefer `apps/sis-next` for new implementation.
2. Use `public/` only as a legacy behavior reference.
3. Do not reintroduce removed navigation areas unless explicitly requested.
4. Keep Payrolls as the only place that mutates payrolled state.
5. Preserve payroll trace records for audit/history.
6. Keep `encoder` as the non-admin role name.
7. Treat `.next` vendor chunk errors as likely stale build artifacts first.
8. For Firestore work, be careful with SSR user-context reads because rules failures can cause slow fallback behavior.
9. Keep admin-only actions guarded both in UI and backend where possible.
10. Run `npm run build` after meaningful changes.
11. Before changing Renewal, Requirements, or Payrolls, read `docs/session/renewal-cycle-architecture.md`.
12. Do not reintroduce user-editable `renewal_status` or `payout_type` controls.
13. Payrolls should list both initial and renewal candidates when they are requirement-qualified and unpaid for the selected cycle.
