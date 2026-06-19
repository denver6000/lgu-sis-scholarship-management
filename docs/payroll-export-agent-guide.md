# Payroll Export Agent Guide

This document is for future agents working on the Student Information System payroll export flow. Treat this mechanism as template-sensitive business logic, not generic table export code.

## Core Contract

Users may select any number of students for payroll export. The payroll templates can only hold 15 students per generated file set, so selected students must be split into groups of 15 before files are produced.

Each group must generate both files:

- `payroll-group-01.docx`
- `payroll-group-01.xlsx`
- `payroll-group-02.docx`
- `payroll-group-02.xlsx`

Do not restore the old behavior that limited selection to 15 students. The correct behavior is unlimited selection with 15-student output chunking.

## Current Implementation

The export implementation lives in:

- `apps/sis-next/app/lib/payroll-export.ts`
- `apps/sis-next/app/app-shell.tsx`
- `apps/sis-next/app/globals.css`

The templates are served from:

- `apps/sis-next/public/templates/PAYROLL_WORD_TEMPLATE.docx`
- `apps/sis-next/public/templates/PAYROLL_TEMPLATE.xlsx`

The client export utility uses:

- `pizzip` for reading and writing `.docx` / `.xlsx` zip containers.
- `docxtemplater` for replacing placeholders inside the Word template.

## Selection, Filtering, And Sorting

The Payroll & Exports screen derives export rows from the student list.

Before export:

- Rows may be filtered by batch.
- Rows are sorted by year level first.
- Rows are sorted by last name second.
- `Select All Filtered` selects the currently filtered payroll rows.
- The export button exports selected rows in the current filtered/sorted payroll order.

Keep sorting before chunking. If sorting happens after chunking, the generated files can have inconsistent grouping.

## Fifteen-Student Chunking

The key limit is:

```ts
const PAYROLL_MAX_STUDENTS = 15;
```

The exporter splits selected students like this conceptually:

```ts
for (let index = 0; index < students.length; index += 15) {
  groups.push(students.slice(index, index + 15));
}
```

Every group is exported independently. A group should never contain more than 15 students.

## The `X-X-X-X` Sentinel

The `X-X-X-X` marker is required. It is an end-of-list signal used by the payroll templates and downstream readers. Do not remove it, rename it, translate it, or make it optional.

The constant is:

```ts
const PAYROLL_END_MARKER = "X-X-X-X";
```

The marker must be placed immediately after the last real student in each group.

For a full group of 15 students, the marker goes in the next available marker slot. For a partial group, the marker goes directly after the final student in that partial group.

## Word Template Behavior

The Word template is rendered with `Docxtemplater`.

Before filling students, the exporter clears all known placeholder rows:

```ts
student_1_fname
student_1_name
student_1_year_level
student_1_school
...
student_16_fname
student_16_name
student_16_year_level
student_16_school
```

Then it fills actual students into rows starting at `1`.

After that, it writes the sentinel:

```ts
const markerRow = Math.min(students.length + 1, PAYROLL_MARKER_ROW);
data[`student_${markerRow}_fname`] = PAYROLL_END_MARKER;
data[`student_${markerRow}_name`] = PAYROLL_END_MARKER;
```

`PAYROLL_MARKER_ROW` is currently `16`.

Do not change placeholder names unless the Word template is also changed.

## Excel Template Behavior

The Excel template is edited directly by changing `xl/worksheets/sheet1.xml` inside the `.xlsx` zip.

The relevant constants are:

```ts
const PAYROLL_EXCEL_START_ROW = 10;
const PAYROLL_EXCEL_END_ROW = 24;
const PAYROLL_DEFAULT_AMOUNT = 5000;
```

Current cell behavior:

- Student names are written to column `B`.
- Payroll amount is written to columns `E` and `J`.
- Student rows start at row `10`.
- Student rows end at row `24`.
- `O3` is updated to `Sheet X of Y Sheets`.
- `J25` is updated to the group total, currently `students.length * 5000`.

The sentinel is written to column `B` immediately after the last student:

```ts
const markerRow = PAYROLL_EXCEL_START_ROW + students.length;
xml = replaceCellXml(xml, `B${markerRow}`, PAYROLL_END_MARKER);
```

If the Excel template layout changes, review all hard-coded cell addresses before touching export behavior.

## Template Fragility

This flow depends on the exact structure of the Word and Excel templates.

Be careful with:

- Placeholder names in the Word template.
- Excel sheet path: `xl/worksheets/sheet1.xml`.
- Excel row ranges.
- Excel cells `B`, `E`, `J`, `J25`, and `O3`.
- The `X-X-X-X` sentinel.

If a template is replaced, verify exports manually with:

- 1 selected student.
- 15 selected students.
- 16 selected students.
- More than 30 selected students.

These cases prove partial groups, exact full groups, and multiple output groups.

## Client-Side Download Considerations

The export currently runs in the browser. Large selections will trigger multiple downloads, two files per group of 15.

For example:

- 15 students: 2 downloads.
- 16 students: 4 downloads.
- 45 students: 6 downloads.

Browsers may warn users about multiple downloads. This is expected for the current client-side implementation.

If this becomes painful, future work can move export generation server-side and return a single `.zip`, but the internal grouping and sentinel rules must stay the same.

## Do Not Break These Rules

- Do not cap selection at 15.
- Do not export more than 15 students into one template.
- Do not omit `X-X-X-X`.
- Do not place `X-X-X-X` at a fixed final row for partial groups; it must come immediately after the last real student.
- Do not sort after chunking.
- Do not change Excel cell addresses without checking the actual template.
- Do not move this into a generic CSV exporter; the Word and Excel templates are part of the business requirement.
