# Renewal Cycle Architecture

Last updated: 2026-06-19
Implementation checkpoint: 2026-06-19

This note records the recommended implementation model for scholarship renewals, school-year changes, semester limits, and payroll linkage. It exists because renewal state is not a permanent student property. Renewals are per semester and per school year, so the data model must track time-bound participation instead of relying on a single `student.renewed` boolean.

## Problem

The current app has historical fields such as `student.renewed` and `student.payrolled`. Those fields are convenient for display, but they become inaccurate once renewal is understood as a recurring process:

- a student can renew in Semester 1 and Semester 2 of the same school year
- scholarship offices may treat renewals as a twice-per-school-year process, but this app should not hard-enforce that limit yet
- admins need enough renewal history to decide whether another renewal is valid for the real-world case in front of them
- a student's year level can change across school years
- payroll generation must be tied to a specific cycle and document event

The app needs to show users the active school year and semester, enforce renewal limits, preserve old renewal history, and make payroll decisions from cycle-aware records.

## Recommended Model

Use a cycle-centered model:

```txt
students/{studentId}
cycles/{cycleKey}
cycles/{cycleKey}/studentCycles/{studentId}
renewalRecords/{renewalId}
payrollRecords/{payrollId}
systemConfig/currentCycle
```

Do not create separate top-level collections for year levels such as `year1Students`, `year2Students`, `year3Students`, or `year4Students`. A student changes year level over time. Copying the full student record into year-level collections creates competing sources of truth.

Instead:

- `students` stores identity and relatively stable student details.
- `cycles` stores active school-year/semester periods.
- `cycles/{cycleKey}/studentCycles` stores per-cycle participation, including `is_active`, `year_level`, payout type, requirement maps, and payroll qualification status.
- `renewalRecords` stores renewal history and limit enforcement evidence.
- `payrollRecords` stores generated payroll/document traces.
- `systemConfig/currentCycle` tells the UI which cycle the office is currently operating in.

## Current Cycle Config

```ts
systemConfig/currentCycle = {
  school_year: "2026-2027",
  sem_number: 1,
  cycle_key: "2026-2027__1",
  status: "open", // open | locked | archived
  updated_at: "...",
  updated_by: "uid"
}
```

The UI should load this config through SSR/API and display it in operational pages such as Dashboard, Renewal, Records, and Payrolls.

When an admin changes the school year or semester, the app should update this config. Old cycle records must remain untouched.

## Student Master Record

```ts
students/{studentId} = {
  student_id: "STU001",
  full_name: "...",
  student_number: "...",
  barangay: "...",
  address: "...",
  school_address: "...",
  school_course: "...",
  current_year_level: "2",
  batch: "7",
  created_at: "...",
  updated_at: "..."
}
```

Keep the master record focused on identity and stable details. Avoid using it as the source of truth for time-bound renewal status.

Current implementation note:

- `students/{studentId}` now keeps a lightweight `year_level_history` array.
- New student creation records the initial year level when present.
- Admin edits append a history entry only when `year_level` actually changes.
- Entries include `from_year_level`, `to_year_level`, `changed_at`, `changed_by_uid`, `changed_by_email`, and `reason`.
- This audit trail is surfaced in the Records student action/info dialog.

Current requirements implementation:

- The app is now requirements-centered, with `/requirements` as the primary workspace for semester requirement tracking.
- Semester selection is intentionally a two-semester spinner. The UI should not expose 3rd or 4th semester choices unless the real program policy changes.
- Initial payout requirements are a six-item map: Certificate of Residency, Pagpapatunay Form, Picture of the House, Good Moral Certificate, Original Certificate of Grades, and Proof of Enrollment.
- Renewal requirements are a separate three-item map: Liquidation, Proof of Enrollment, and Latest Grades.
- Payroll qualification is derived, not manually selected. The system should not expose a user-editable `renewal_status` selector.
- Each semester record has internal `payout_type: "initial" | "renewal"`. Do not expose this as a user-facing control. Newly registered/no-initial-payroll students should default to `initial`, which protects them from being required to submit renewal requirements on their first payroll.
- Initial payout qualification means the six initial payout requirements are complete.
- Renewal payroll qualification means the student has an initial payroll recorded and the three semester renewal requirements are complete. These requirements prove the student is still enrolled.
- `students/{studentId}.semester_records[]` currently stores both maps directly on the semester record:
- Requirement maps are semester-separated. A new semester starts with empty maps; it must not automatically inherit checks from the Registry tab or another semester. Legacy records may be normalized from old global fields only as migration compatibility.

## Current Bridge Philosophy: For Renewal

The current bridge implementation has one important lifecycle rule:

> A student becomes a renewal student after their initial payout is considered complete.

In normal operation, this happens through `/payrolls`. A newly registered student starts as an initial-payout student. Once the office generates the initial payout payroll, the payroll flow writes:

- `student.payrolled: true`
- `student.payrolled_at`
- a semester record with `payroll_status: "payrolled"`
- payroll trace fields such as `payroll_id`, `payroll_record_type`, `payrolled_at`, `payrolled_by_uid`, and `payrolled_by_email`
- a `payrollRecords` document

The UI then treats that student as renewal-eligible in later cycles. The source of truth for this broad renewal eligibility is the initial-payout marker, currently represented by top-level `student.payrolled` / `student.payrolled_at`, plus compatibility checks for payrolled semester records.

Do not use `student.renewed` as the lifecycle source of truth. It is legacy/import/audit data. It may still appear in old records and history views, but Requirements and Payroll qualification must not depend on it.

### Manual For Renewal Toggle

Some students are entered into the Registry after they have already received their initial payout outside this app. For those cases, the Register Student and Requirements Management "For Renewal" checkbox intentionally reuses the existing lifecycle marker:

- checked means set top-level `student.payrolled: true` and `student.payrolled_at`
- unchecked means clear the top-level compatibility marker only when there is no actual payroll history

This is not meant to fabricate a payroll document event. The manual toggle must not create `payrollRecords`, must not add `payroll_id`, and must not create or erase a semester record that says `payroll_status: "payrolled"`.

If a student already has an actual payrolled semester record, that history wins. The manual toggle should display as enabled/true because the student is renewal-eligible, but it must be locked from undoing that generated payroll history. Generated payroll events are document/audit events, not casual profile flags.

In short:

- `student.payrolled/payrolled_at`: broad "initial payout already happened" compatibility marker.
- payrolled `semester_records[]`: cycle-specific generated payroll evidence.
- `payrollRecords`: document-generation trace.
- `student.renewed`: legacy/audit compatibility only.
- "For Renewal" UI: a controlled way to set the same initial-payout marker for students entered after their initial payout already happened.

```ts
{
  school_year: "2026-2027",
  sem_number: 1,
  cycle_key: "2026-2027__1",
  payout_type: "initial", // initial | renewal
  payroll_status: "not_qualified", // not_qualified | qualified | payrolled
  // Legacy compatibility only. New code should derive from payroll_status and requirements.
  renewal_status: "pending",
  payroll_id: "",
  payroll_record_type: "", // initial_payout_payroll | renewal_payroll
  payrolled_at: "",
  payrolled_by_uid: "",
  payrolled_by_email: "",
  initial_payout_requirements: {
    certificate_of_residency: true,
    pagpapatunay_form: true,
    picture_of_the_house: false,
    good_moral_certificate: true,
    original_certificate_of_grades: true,
    proof_of_enrollment: true
  },
  renewal_requirements: {
    liquidation: false,
    proof_of_enrollment: false,
    latest_grades: false
  },
  // Legacy compatibility only. New code should read renewal_requirements.
  requirements: {
    liquidation: false,
    proof_of_enrollment: false,
    latest_grades: false
  }
}
```

- Renewal requirements must stay locked until the student has an initial payroll flag. In the bridge implementation, that means `student.payrolled === true` or at least one semester record with `payroll_status: "payrolled"`.
- The current Payrolls tab consumes requirement-qualified students for the selected school year/semester. It should list students who are qualified and not yet payrolled for that exact cycle.
- `/payrolls` separates those candidates into `New` for initial payout and `Renewal` for renewal payout.
- Initial payout candidates qualify from the six initial requirements and do not need renewal requirements when they have no initial payroll yet.
- Renewal candidates qualify from initial payroll existence plus the three renewal requirements.
- Payroll generation should write `payroll_status: "payrolled"` for that semester, store `payroll_id`, `payroll_record_type`, `payrolled_at`, and payrolling admin fields on the student doc's semester record, and save the trace as `initial_payout_payroll` or `renewal_payroll` based on the cycle record's internal payout type.
- `school_id` is a legacy field only. Do not add it back to the active six-item initial payout checklist unless the product owner explicitly changes the requirement list.

This is a practical bridge toward the fuller cycle model. In the future, per-cycle year level should live on `cycles/{cycleKey}/studentCycles/{studentId}`, but the current student-level history remains useful as an audit trail for pre-cycle migration edits.

## Cycle Membership

```ts
cycles/2026-2027__1/studentCycles/STU001 = {
  student_id: "STU001",
  school_year: "2026-2027",
  sem_number: 1,
  cycle_key: "2026-2027__1",
  year_level: "2",
  batch: "7",
  is_active: true,
  payout_type: "initial", // initial | renewal
  payroll_status: "not_qualified", // not_qualified | qualified | payrolled
  initial_payout_requirements: {},
  renewal_requirements: {},
  renewal_id: "",
  payroll_id: "",
  created_at: "...",
  updated_at: "..."
}
```

This is where the proposed `is_active` toggle belongs. Activity is cycle-specific. A student may be active in one school year/semester and inactive in another.

Useful UI queries:

- active students for current cycle: `studentCycles where is_active == true`
- year-level scope: add `where year_level == "1"` or similar
- payroll-qualified students: records whose requirements derive `payroll_status == "qualified"`
- initial payroll candidates: current-cycle records with `payout_type == "initial"`, `payroll_status == "qualified"`, and no prior initial payroll
- already payrolled this cycle: `where payroll_status == "payrolled"`

## Renewal Records

```ts
renewalRecords/{renewalId} = {
  student_id: "STU001",
  school_year: "2026-2027",
  sem_number: 1,
  cycle_key: "2026-2027__1",
  status: "renewed", // pending | renewed | payrolled | rejected | void
  created_at: "...",
  renewed_at: "...",
  payrolled_at: "",
  created_by: "uid",
  updated_by: "uid",
  payroll_id: "",
  notes: "",
  snapshot: {
    school_address: "...",
    school_course: "...",
    year_level: "2",
    batch: "7"
  }
}
```

Renewal records are the long-term target for renewal history and decision support. In the current bridge implementation, semester requirement maps and derived `payroll_status` are the practical source of payroll qualification.

Backend constraints once the office formalizes cycle policy:

- maximum one renewal record per `student_id + cycle_key`
- do not allow renewal creation when the current cycle is locked or archived

The backend should not enforce a maximum number of renewals per school year or semester until the office explicitly requests that policy. The UI should show prior renewals clearly so admins can make the decision.

Current implementation note:

- `students/{studentId}` now keeps a lightweight `renewal_history` array.
- Renewal history remains useful for legacy/audit context.
- New payroll qualification should not depend on `student.renewed`.
- Payroll creation should not mark a student `renewed` as a side effect.
- The Records table and Record Actions dialog may show legacy renewal history, but requirement/payroll qualification should come from semester records.
- There is intentionally no two-renewal hard limit in the current implementation.

## Payroll Linkage

Payroll generation should consume current-cycle requirement/qualification records, not `student.renewed`.

When creating payroll:

- generate the `.docx` and `.xlsx` documents
- create `payrollRecords`
- link each affected semester/cycle record with `payroll_id` when that field exists
- update the current-cycle semester/cycle record with `payroll_status: "payrolled"` and `payroll_id`
- set `student.payrolled: true` only as the broad compatibility flag that initial payroll exists

Payrolls are government document events. Do not allow Records actions or manual toggles to mutate generated payroll evidence such as `payrollRecords`, `payroll_id`, `payroll_record_type`, or payrolled semester records. A manual "For Renewal" toggle may only set or clear the broad top-level initial-payout marker when no generated payroll history exists.

## UI Communication

Every page that deals with renewal or payroll should know the current cycle:

- Dashboard: show current school year and semester summary.
- Renewal: default to current cycle and show status within that cycle.
- Payrolls: generate only from the selected/current cycle.
- Records: show renewal and payroll history by school year and semester.
- Catalogs or Settings: expose an admin-only current-cycle editor.

Recommended UI labels:

- `Current Cycle: 2026-2027, 1st Semester`
- `Initial payout qualified`
- `Renewal qualified`
- `Payrolled this semester`
- `Renewal history`
- `Cycle inactive`

Avoid labels that imply permanent state, such as `Student is renewed`, unless scoped to a school year and semester. Prefer requirement and payroll qualification labels.

## Migration Path

1. Add `systemConfig/currentCycle`.
2. Add `cycles/{cycleKey}/studentCycles`.
3. Add `renewalRecords`.
4. Keep `student.renewed` temporarily only as compatibility display data.
5. Make Requirements/Renewal write cycle-scoped requirement maps and derived payroll qualification instead of mutating only `student.renewed`.
6. Make Payrolls consume requirement-qualified cycle records for the active cycle.
7. Backfill existing `student.renewed === true` into inferred renewal records for a chosen school year/semester.
8. Stop showing or remove `student.renewed` once migrated.

## Key Decision

Create collections per cycle, not per year level.

Year level is an attribute inside a cycle membership record. The cycle is the historical boundary that matters for renewals and payrolls.
