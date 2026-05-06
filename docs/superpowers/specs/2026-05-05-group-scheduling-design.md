# Group Scheduling Design

**Date:** 2026-05-05
**Status:** Approved

## Problem

Every enrollment is one student. Recurrence rules and sessions are tied to individual enrollments, so scheduling a group class requires creating separate schedules per student. There is no way to schedule a session for multiple students at once.

## Goal

Allow enrollments to be tagged as members of a named group, and let users schedule sessions for the whole group from the existing new-session dialog — creating one session with one attendance record per member.

---

## Data Model

### New: `Group` model

```prisma
model Group {
  id        String   @id @default(cuid())
  name      String
  tutorId   String
  subjectId String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tutor           Tutor            @relation(fields: [tutorId], references: [id])
  subject         Subject          @relation(fields: [subjectId], references: [id])
  enrollments     Enrollment[]
  recurrenceRules RecurrenceRule[]
}
```

A group is tied to exactly one tutor and one subject, because all members share the same physical session.

### Changes to `Enrollment`

- Add `groupId String?` — null for PRIVATE enrollments, required for GROUP package enrollments.
- Add relation: `group Group? @relation(fields: [groupId], references: [id])`

### Changes to `RecurrenceRule`

- Make `enrollmentId String?` (was required).
- Add `groupId String?`.
- Exactly one of `enrollmentId` or `groupId` must be non-null (enforced in service layer, not at DB level).

### `Session` — no changes

`Session.enrollmentId` is already optional. Group sessions will have `enrollmentId = null`.

### `SessionAttendance` — no changes

Already supports `sessionId + studentId + enrollmentId?`. Group sessions get one row per member, each with their own `enrollmentId`.

---

## Enrollment Form

When a GROUP package is selected, a required "Group" field appears below the package selector.

- **Pick existing group:** searchable dropdown filtered to groups matching the currently selected tutor and subject.
- **Create new group:** type a name to create a new `Group` record alongside the enrollment.

Constraints:
- If the tutor or subject is changed after a group is selected, the group field is cleared.
- The group field is hidden entirely for PRIVATE packages.

---

## Scheduling Flow

### New session dialog — enrollment selector

The enrollment dropdown gains two labelled sections:

1. **Individual enrollments** — same as today.
2. **Groups** — each shown with a "Group" badge and member count (e.g., "Monday Math Beginners · 3 students").

Selecting a group auto-fills tutor and subject from the group (same behaviour as selecting a single enrollment). All other form fields (days, time, duration, room, color, start/end date) are unchanged.

### On submit — recurring

Creates one `RecurrenceRule` with `groupId` set and `enrollmentId = null`. The rule generates one `Session` per occurrence. Each session creation also creates one `SessionAttendance` per active group member enrollment, with:
- `sessionId` → the new session
- `studentId` → the member's student
- `enrollmentId` → the member's enrollment (for session counting)
- `status: SCHEDULED`
- `billable: false`

### On submit — one-time (ad-hoc)

Same outcome: one `Session` + one `SessionAttendance` per active group member.

### Session counting

No changes needed. The existing `EnrollmentMonthSummary` logic counts sessions via `SessionAttendance.enrollmentId`, so each group member's package limit is tracked automatically.

---

## Attendance

### Session detail view

The existing `AttendanceForm` already renders one row per entry in the attendance array. Group sessions will surface all members' rows automatically — no UI changes required.

### Manual attendance marking

Staff can update each member's attendance status and billable flag independently (COMPLETED, NO_SHOW, CANCELLED_BY_TUTOR, CANCELLED_BY_STUDENT).

### Auto-completion

When `autoCompletePassedSessions` runs, it must:
1. Bulk-update `Session.status → COMPLETED` for all past SCHEDULED sessions (existing behaviour).
2. Also bulk-update `SessionAttendance.status → COMPLETED, billable → true` for all attendance records belonging to those sessions.

---

## Edge Cases

### New student added to an existing group

Only future `Session` records (scheduled after the enrollment's `startDate`) get a new `SessionAttendance` row. Past sessions are not retroactively updated.

### Student leaves a group (enrollment cancelled or paused)

Delete all future `SessionAttendance` records for that student from today onward. The group's `RecurrenceRule` and remaining sessions are unaffected. Past attendance stays intact for billing history.

### Calendar display

Group sessions appear as a single calendar block, identical to private sessions. The session detail view shows all attendees via the attendance relation (already implemented).

### No standalone Groups management page

Groups are created and discovered through the enrollment form. There is no separate groups list or CRUD page.

---

## Files Affected

| Layer | File | Change |
|---|---|---|
| Schema | `prisma/schema.prisma` | Add `Group` model; update `Enrollment`, `RecurrenceRule` |
| Data | `lib/data/enrollments.ts` | Queries for group creation and lookup |
| Data | `lib/data/sessions.ts` | Group-aware session/attendance creation; updated `autoCompletePassedSessions` |
| Service | `lib/services/enrollments.ts` | Group validation on enrollment create |
| Service | `lib/services/sessions.ts` | Group recurrence rule creation; member attendance fan-out |
| Actions | `app/actions/enrollments.ts` | Thin wrapper for group-aware create |
| Actions | `app/actions/sessions.ts` | Thin wrapper; pass group context |
| UI | `app/(protected)/enrollments/components/new-enrollment-dialog.tsx` | Group field for GROUP packages |
| UI | `app/(protected)/schedule/components/new-session-form.tsx` | Group section in enrollment dropdown |
