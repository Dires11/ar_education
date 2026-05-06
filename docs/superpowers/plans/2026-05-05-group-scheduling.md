# Group Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow GROUP package enrollments to be tagged to a named group, and let users schedule one session for the whole group from the existing new-session dialog — creating one `Session` with one `SessionAttendance` per member.

**Architecture:** Add a `Group` model that multiple enrollments can belong to. `RecurrenceRule.enrollmentId` becomes optional; group rules carry `groupId` instead. A new `materializeGroupSessions` function creates sessions + fan-out attendance for group rules. The enrollment and session forms are extended to show group context.

**Tech Stack:** Next.js App Router, Prisma (Neon Postgres), Zod, Shadcn/ui, TailwindCSS. No test framework — verify each task with `npx tsc --noEmit` and manual smoke test noted per task.

---

## File Map

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `Group` model; update `Enrollment`, `RecurrenceRule` |
| `lib/data/groups.ts` | **New** — group CRUD queries |
| `lib/data/enrollments.ts` | Accept `groupId` in `createEnrollment` |
| `lib/data/sessions.ts` | `createRecurrenceRule` accepts optional `enrollmentId`+`groupId`; add `getGroupRecurringRulesInRange`, `getGroupRecurrenceRulesForMonth`, `createManySessionAttendances`, `deleteFutureGroupAttendanceForStudent`, `getActiveRecurrenceRulesForGroup`; fix `autoCompletePassedSessions` |
| `lib/services/groups.ts` | **New** — `findOrCreateGroup`, `listGroupsForTutorSubject`, `removeStudentFromGroup` |
| `lib/services/sessions.ts` | Add `materializeGroupSessions`; update `createRecurringSchedule`, `createAdHocSession`, `splitRecurrenceRule` to handle group rules |
| `lib/validators/enrollments.ts` | Add `groupId` field |
| `lib/validators/sessions.ts` | Accept `groupId` as alternative to `enrollmentId` in both schemas |
| `app/actions/enrollments.ts` | Add `createGroupAction`, `listGroupsForTutorSubjectAction` |
| `app/actions/sessions.ts` | Add `getActiveRecurrenceRulesForGroupAction` |
| `app/(protected)/enrollments/page.tsx` | Fetch and pass groups to dialog |
| `app/(protected)/enrollments/components/new-enrollment-dialog.tsx` | Accept and pass groups |
| `app/(protected)/enrollments/components/new-enrollment-form.tsx` | Group field for GROUP packages |
| `app/(protected)/schedule/page.tsx` | Fetch and pass groups |
| `app/(protected)/schedule/components/schedule-view.tsx` | Accept and pass groups |
| `app/(protected)/schedule/components/new-session-dialog.tsx` | Accept and pass groups |
| `app/(protected)/schedule/components/new-session-form.tsx` | Groups section in enrollment dropdown |

---

## Task 1: Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `Group` model and update `Enrollment` and `RecurrenceRule`**

In `prisma/schema.prisma`, add the back-relations on `Tutor` and `Subject`, add the `Group` model, and update `Enrollment` and `RecurrenceRule`:

In the `Tutor` model, add after `sessions Session[]`:
```
groups      Group[]
```

In the `Subject` model, add after `enrollments Enrollment[]`:
```
groups      Group[]
```

In the `Enrollment` model, add after `updatedAt DateTime @updatedAt`:
```
groupId   String?
```
And add after `discounts Discount[]`:
```
group Group? @relation(fields: [groupId], references: [id])
```

Replace the `RecurrenceRule` model entirely with:
```prisma
model RecurrenceRule {
  id              String    @id @default(cuid())
  enrollmentId    String?
  groupId         String?
  dayOfWeek       Int
  startTime       String
  durationMinutes Int
  intervalWeeks   Int       @default(1)
  room            String?
  color           String?
  startsOn        DateTime  @db.Date
  endsOn          DateTime? @db.Date
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  enrollment Enrollment? @relation(fields: [enrollmentId], references: [id], onDelete: Cascade)
  group      Group?      @relation(fields: [groupId], references: [id])
  sessions   Session[]
}
```

Add the `Group` model after `RecurrenceRule`:
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

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add_groups
```

Expected output: migration file created and applied, Prisma client regenerated.

- [ ] **Step 3: Verify TypeScript compilation**

```bash
npx tsc --noEmit
```

Expected: some errors due to `createRecurrenceRule` callers passing `enrollmentId` as required — that's fine, we'll fix them in later tasks. For now the schema change itself is what we're validating.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add Group model, make RecurrenceRule.enrollmentId optional"
```

---

## Task 2: Group data layer

**Files:**
- Create: `lib/data/groups.ts`

- [ ] **Step 1: Create the file**

```ts
import { prisma } from "@/lib/prisma";

export async function createGroup(data: {
  name: string;
  tutorId: string;
  subjectId: string;
}) {
  return prisma.group.create({ data });
}

export async function listGroups() {
  return prisma.group.findMany({
    include: {
      tutor: true,
      subject: true,
      enrollments: { include: { student: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function listGroupsByTutorAndSubject(
  tutorId: string,
  subjectId: string
) {
  return prisma.group.findMany({
    where: { tutorId, subjectId },
    include: { enrollments: { include: { student: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getGroupWithMembers(groupId: string) {
  return prisma.group.findUnique({
    where: { id: groupId },
    include: {
      tutor: true,
      subject: true,
      enrollments: {
        where: { status: { in: ["ACTIVE", "PAUSED"] } },
        include: { student: true },
      },
    },
  });
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add lib/data/groups.ts
git commit -m "feat: add group data layer"
```

---

## Task 3: Session data layer updates

**Files:**
- Modify: `lib/data/sessions.ts`

- [ ] **Step 1: Update `createRecurrenceRule` to accept optional `enrollmentId` and new `groupId`**

Replace the existing `createRecurrenceRule` function:

```ts
export async function createRecurrenceRule(data: {
  enrollmentId?: string;
  groupId?: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  intervalWeeks?: number;
  room?: string;
  color?: string;
  startsOn: Date;
  endsOn?: Date;
}) {
  return prisma.recurrenceRule.create({ data });
}
```

- [ ] **Step 2: Fix `autoCompletePassedSessions` to also update attendance records**

Replace:
```ts
export async function autoCompletePassedSessions() {
  return prisma.session.updateMany({
    where: { status: "SCHEDULED", scheduledFor: { lt: new Date() } },
    data: { status: "COMPLETED" },
  });
}
```

With:
```ts
export async function autoCompletePassedSessions() {
  const pastSessions = await prisma.session.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lt: new Date() } },
    select: { id: true },
  });

  if (pastSessions.length === 0) return { count: 0 };

  const ids = pastSessions.map((s) => s.id);

  await prisma.sessionAttendance.updateMany({
    where: { sessionId: { in: ids }, status: "SCHEDULED" },
    data: { status: "COMPLETED", billable: true },
  });

  return prisma.session.updateMany({
    where: { id: { in: ids } },
    data: { status: "COMPLETED" },
  });
}
```

- [ ] **Step 3: Add `createManySessionAttendances`**

After `createSessionAttendance`, add:
```ts
export async function createManySessionAttendances(
  data: Array<{ sessionId: string; studentId: string; enrollmentId: string }>
) {
  return prisma.sessionAttendance.createMany({ data, skipDuplicates: true });
}
```

- [ ] **Step 4: Add `getGroupRecurringRulesInRange`**

After `getRecurringRulesInRange`, add:
```ts
export async function getGroupRecurringRulesInRange(
  from: Date,
  to: Date,
  options?: { recurrenceRuleIds?: string[] }
) {
  const rules = await prisma.recurrenceRule.findMany({
    where: {
      groupId: { not: null },
      id: options?.recurrenceRuleIds?.length
        ? { in: options.recurrenceRuleIds }
        : undefined,
      startsOn: { lte: to },
      OR: [{ endsOn: null }, { endsOn: { gte: from } }],
    },
    include: {
      group: {
        include: {
          tutor: true,
          subject: true,
          enrollments: {
            where: { status: { in: ["ACTIVE", "PAUSED"] } },
            include: { student: true },
          },
        },
      },
    },
    orderBy: { startsOn: "asc" },
  });
  return rules.filter((r) => !r.endsOn || r.endsOn >= r.startsOn);
}
```

- [ ] **Step 5: Add `getGroupRecurrenceRulesForMonth`**

After `getRecurrenceRulesForMonth`, add:
```ts
export async function getGroupRecurrenceRulesForMonth(monthStart: Date) {
  const monthEnd = endOfMonth(monthStart);
  const rules = await prisma.recurrenceRule.findMany({
    where: {
      groupId: { not: null },
      startsOn: { lte: monthEnd },
      OR: [{ endsOn: null }, { endsOn: { gte: monthStart } }],
    },
    include: {
      group: {
        include: {
          tutor: true,
          subject: true,
          enrollments: {
            where: { status: { in: ["ACTIVE", "PAUSED"] } },
            include: { student: true },
          },
        },
      },
    },
    orderBy: { startsOn: "asc" },
  });
  return rules.filter((r) => !r.endsOn || r.endsOn >= r.startsOn);
}
```

- [ ] **Step 6: Add `deleteFutureGroupAttendanceForStudent`**

Add after `deleteFutureSessionsForRecurrenceRule`:
```ts
export async function deleteFutureGroupAttendanceForStudent(
  studentId: string,
  fromDate: Date
) {
  return prisma.sessionAttendance.deleteMany({
    where: {
      studentId,
      status: "SCHEDULED",
      session: {
        scheduledFor: { gte: startOfDay(fromDate) },
        enrollmentId: null,
      },
    },
  });
}
```

- [ ] **Step 7: Add `getActiveRecurrenceRulesForGroup`**

Add after `getActiveRecurrenceRulesForEnrollment` (or at end of file if that function doesn't exist there — look for it):
```ts
export async function getActiveRecurrenceRulesForGroup(groupId: string) {
  const today = new Date();
  return prisma.recurrenceRule.findMany({
    where: {
      groupId,
      startsOn: { lte: today },
      OR: [{ endsOn: null }, { endsOn: { gte: today } }],
    },
    include: {
      group: { include: { subject: true } },
    },
    orderBy: { dayOfWeek: "asc" },
  });
}
```

- [ ] **Step 8: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: errors only in callers that still pass `enrollmentId` as positional (we fix those in later tasks).

- [ ] **Step 9: Commit**

```bash
git add lib/data/sessions.ts
git commit -m "feat: update session data layer for group rule and attendance support"
```

---

## Task 4: Enrollment data layer update

**Files:**
- Modify: `lib/data/enrollments.ts`

- [ ] **Step 1: Add `groupId` to `createEnrollment`**

Replace the existing `createEnrollment` function:
```ts
export async function createEnrollment(data: {
  studentId: string;
  packageId: string;
  tutorId: string;
  subjectId: string;
  startDate: Date;
  endDate?: Date | null;
  customPriceOverride?: string | null;
  groupId?: string | null;
}) {
  return prisma.enrollment.create({ data });
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/data/enrollments.ts
git commit -m "feat: add groupId to createEnrollment"
```

---

## Task 5: Group service

**Files:**
- Create: `lib/services/groups.ts`

- [ ] **Step 1: Create the file**

```ts
import {
  createGroup,
  listGroupsByTutorAndSubject,
  getGroupWithMembers,
} from "@/lib/data/groups";
import { deleteFutureGroupAttendanceForStudent } from "@/lib/data/sessions";

export async function findOrCreateGroup(
  input:
    | { existingGroupId: string }
    | { name: string; tutorId: string; subjectId: string }
): Promise<string> {
  if ("existingGroupId" in input) return input.existingGroupId;
  const group = await createGroup({
    name: input.name,
    tutorId: input.tutorId,
    subjectId: input.subjectId,
  });
  return group.id;
}

export async function listGroupsForTutorSubject(
  tutorId: string,
  subjectId: string
) {
  return listGroupsByTutorAndSubject(tutorId, subjectId);
}

export async function removeStudentFromGroup(
  studentId: string,
  fromDate: Date
) {
  await deleteFutureGroupAttendanceForStudent(studentId, fromDate);
}

export { getGroupWithMembers };
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/services/groups.ts
git commit -m "feat: add group service layer"
```

---

## Task 6: Validators update

**Files:**
- Modify: `lib/validators/enrollments.ts`
- Modify: `lib/validators/sessions.ts`

- [ ] **Step 1: Add `groupId` to enrollment schema**

In `lib/validators/enrollments.ts`, update `createEnrollmentSchema`:
```ts
export const createEnrollmentSchema = z.object({
  studentId: z.string().min(1, "Student is required"),
  packageId: z.string().min(1, "Package is required"),
  tutorId: z.string().min(1, "Tutor is required"),
  subjectId: z.string().min(1, "Subject is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  customPriceOverride: z.string().optional(),
  groupId: z.string().optional(),
  newGroupName: z.string().optional(),
});
```

Update the export types:
```ts
export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;
```

- [ ] **Step 2: Update recurrence schema to accept `groupId` as alternative to `enrollmentId`**

In `lib/validators/sessions.ts`, replace `createRecurrenceSchema`:
```ts
export const createRecurrenceSchema = z
  .object({
    enrollmentId: z.string().optional(),
    groupId: z.string().optional(),
    daysOfWeek: z.array(z.string()).min(1, "Select at least one day"),
    startTime: z.string().min(1, "Time is required"),
    startTimes: z.record(z.string(), z.string()).optional(),
    durationMinutes: z.string().min(1, "Duration is required"),
    intervalWeeks: z.string().optional(),
    room: z.string().optional(),
    color: z.string().optional(),
    startsOn: z.string().min(1, "Start date is required"),
    endsOn: z.string().optional(),
  })
  .refine((d) => d.enrollmentId || d.groupId, {
    message: "Enrollment or group is required",
    path: ["enrollmentId"],
  });
```

Update `createAdHocSessionSchema` to accept `groupId`:
```ts
export const createAdHocSessionSchema = z.object({
  enrollmentId: z.string().optional(),
  groupId: z.string().optional(),
  tutorId: z.string().min(1, "Tutor is required"),
  subjectId: z.string().min(1, "Subject is required"),
  scheduledFor: z.string().min(1, "Date & time is required"),
  durationMinutes: z.string().min(1, "Duration is required"),
  room: z.string().optional(),
  notes: z.string().optional(),
  studentIds: z.array(z.string()),
});
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add lib/validators/enrollments.ts lib/validators/sessions.ts
git commit -m "feat: update validators to support group scheduling"
```

---

## Task 7: Enrollment service update

**Files:**
- Modify: `lib/services/enrollments.ts`

- [ ] **Step 1: Update `createEnrollmentForStudent` to handle group**

Add import at the top:
```ts
import { findOrCreateGroup } from "@/lib/services/groups";
import { listGroups } from "@/lib/data/groups";
```

Replace `createEnrollmentForStudent`:
```ts
export async function createEnrollmentForStudent(input: CreateEnrollmentInput) {
  const parsed = createEnrollmentSchema.parse(input);

  const tutorSubject = await prisma.tutorSubject.findUnique({
    where: {
      tutorId_subjectId: {
        tutorId: parsed.tutorId,
        subjectId: parsed.subjectId,
      },
    },
  });
  if (!tutorSubject) {
    throw new Error("Tutor does not teach the selected subject");
  }

  const selectedPackage = await prisma.package.findUnique({
    where: { id: parsed.packageId },
  });

  let groupId: string | null = null;
  if (selectedPackage?.lessonType === "GROUP") {
    if (!parsed.groupId && !parsed.newGroupName) {
      throw new Error("Group is required for group packages");
    }
    groupId = await findOrCreateGroup(
      parsed.groupId
        ? { existingGroupId: parsed.groupId }
        : {
            name: parsed.newGroupName!,
            tutorId: parsed.tutorId,
            subjectId: parsed.subjectId,
          }
    );
  }

  return createEnrollment({
    studentId: parsed.studentId,
    packageId: parsed.packageId,
    tutorId: parsed.tutorId,
    subjectId: parsed.subjectId,
    startDate: new Date(parsed.startDate),
    endDate: parsed.endDate ? new Date(parsed.endDate) : null,
    customPriceOverride: parsed.customPriceOverride || null,
    groupId,
  });
}
```

Add `listGroups` re-export at the bottom:
```ts
export { getEnrollment, listEnrollments, listGroups };
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/services/enrollments.ts
git commit -m "feat: enrollment service creates or assigns group for GROUP packages"
```

---

## Task 8: Session service — group materialization and schedule creation

**Files:**
- Modify: `lib/services/sessions.ts`

- [ ] **Step 1: Add imports for new data functions**

At the top of `lib/services/sessions.ts`, add to the existing import from `@/lib/data/sessions`:
```ts
  getGroupRecurringRulesInRange,
  getGroupRecurrenceRulesForMonth,
  createManySessionAttendances,
  getActiveRecurrenceRulesForGroup,
```

Also add a new import from `@/lib/data/groups`:
```ts
import { getGroupWithMembers } from "@/lib/data/groups";
```

Also add `endOfDay` to the existing `date-fns` import at the top of the file (needed by `materializeGroupSessions`):
```ts
import {
  addDays,
  endOfDay,   // ← add this
  format,
  // ... rest unchanged
} from "date-fns";
```

- [ ] **Step 2: Add `materializeGroupSessions` function**

Add this function after `materializeSessions`:
```ts
export async function materializeGroupSessions(
  fromDate: Date,
  toDate: Date,
  options?: { recurrenceRuleIds?: string[] }
): Promise<number> {
  const rules = await getGroupRecurringRulesInRange(fromDate, toDate, options);
  if (rules.length === 0) return 0;

  const existingSessions = await getSessionsForRecurrenceRulesInRange(
    rules.map((r) => r.id),
    fromDate,
    toDate
  );
  const coveredSlots = new Set(
    existingSessions
      .filter((s) => s.recurrenceRuleId)
      .map((s) => `${s.recurrenceRuleId}:${format(s.scheduledFor, "yyyyMMddHHmm")}`)
  );

  const sessionsToCreate: Array<{
    tutorId: string;
    subjectId: string;
    scheduledFor: Date;
    durationMinutes: number;
    room?: string;
    recurrenceRuleId: string;
  }> = [];

  for (const rule of rules) {
    if (!rule.group) continue;
    const searchStart =
      new Date(rule.startsOn) > fromDate ? new Date(rule.startsOn) : fromDate;
    let current = getFirstMatchingDate(searchStart, rule.dayOfWeek);

    while (current <= toDate) {
      if (rule.endsOn && current > new Date(rule.endsOn)) break;
      const scheduledFor = combineDateAndTime(current, rule.startTime);
      const slotKey = `${rule.id}:${format(scheduledFor, "yyyyMMddHHmm")}`;
      if (!coveredSlots.has(slotKey)) {
        sessionsToCreate.push({
          tutorId: rule.group.tutorId,
          subjectId: rule.group.subjectId,
          scheduledFor,
          durationMinutes: rule.durationMinutes,
          room: rule.room ?? undefined,
          recurrenceRuleId: rule.id,
        });
        coveredSlots.add(slotKey);
      }
      current = addDays(current, rule.intervalWeeks * 7);
    }
  }

  if (sessionsToCreate.length === 0) return 0;

  await createManySessions(sessionsToCreate);

  // Fan-out attendance for each newly created (or pre-existing) group session in range
  const groupRuleIds = rules.map((r) => r.id);
  const allGroupSessions = await prisma.session.findMany({
    where: {
      recurrenceRuleId: { in: groupRuleIds },
      scheduledFor: { gte: startOfDay(fromDate), lte: endOfDay(toDate) },
    },
    select: { id: true, recurrenceRuleId: true },
  });

  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const attendanceRows: Array<{
    sessionId: string;
    studentId: string;
    enrollmentId: string;
  }> = [];

  for (const session of allGroupSessions) {
    const rule = ruleById.get(session.recurrenceRuleId!);
    if (!rule?.group) continue;
    for (const enrollment of rule.group.enrollments) {
      attendanceRows.push({
        sessionId: session.id,
        studentId: enrollment.studentId,
        enrollmentId: enrollment.id,
      });
    }
  }

  if (attendanceRows.length > 0) {
    await createManySessionAttendances(attendanceRows);
  }

  return sessionsToCreate.length;
}
```

- [ ] **Step 3: Update `materializeSessions` call sites to also call `materializeGroupSessions`**

Find every call to `materializeSessions(` in `lib/services/sessions.ts` and, immediately after each one, add a matching call to `materializeGroupSessions` with the same arguments. There are two call sites in `createRecurringSchedule` and one in `getMonthSchedule` / the large month-fetch function.

Search for them:
```bash
grep -n "await materializeSessions" lib/services/sessions.ts
```

For each `await materializeSessions(args)` line, add directly below it:
```ts
await materializeGroupSessions(args); // same args
```

- [ ] **Step 4: Update `createRecurringSchedule` to handle group input**

The existing function starts with:
```ts
export async function createRecurringSchedule(input: CreateRecurrenceInput) {
  const preview = await getRecurringSchedulePreview(input);
  ...
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: input.enrollmentId },
  });
  if (!enrollment) throw new Error("Enrollment not found");

  const ruleColor = input.color ?? hashEnrollmentColor(input.enrollmentId);

  const rules = [];
  for (const dayOfWeek of daysOfWeek) {
    const rule = await createRecurrenceRule({
      enrollmentId: input.enrollmentId,
      ...
    });
```

Replace the enrollment lookup, color hash, and rule creation section with:
```ts
  let ruleEnrollmentId: string | undefined;
  let ruleGroupId: string | undefined;
  let ruleColor = input.color;

  if (input.groupId) {
    ruleGroupId = input.groupId;
    ruleColor = ruleColor ?? hashEnrollmentColor(input.groupId);
  } else {
    ruleEnrollmentId = input.enrollmentId;
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: input.enrollmentId },
    });
    if (!enrollment) throw new Error("Enrollment not found");
    ruleColor = ruleColor ?? hashEnrollmentColor(input.enrollmentId!);
  }

  const rules = [];
  for (const dayOfWeek of daysOfWeek) {
    const rule = await createRecurrenceRule({
      enrollmentId: ruleEnrollmentId,
      groupId: ruleGroupId,
      dayOfWeek,
      startTime: input.startTimes?.[String(dayOfWeek)] ?? input.startTime,
      durationMinutes: duration,
      intervalWeeks,
      room: input.room || undefined,
      color: ruleColor,
      startsOn,
      endsOn,
    });
    rules.push(rule);
  }
```

Also update `getRecurringSchedulePreview` to skip the enrollment limit check when a group is selected (groups don't have a package-level sessions-per-week limit check at rule creation time):

At the start of `getRecurringSchedulePreview`, add an early return for group inputs:
```ts
export async function getRecurringSchedulePreview(
  input: CreateRecurrenceInput,
  fromDate = new Date(),
  toDate = addDays(fromDate, 30)
): Promise<RecurringSchedulePreview> {
  // Group schedules have no package-level session limit to preview
  if (input.groupId) {
    return {
      hasLimit: false,
      sessionsPerWeek: null,
      proposedSessions: input.daysOfWeek.length,
      materializableSessions: input.daysOfWeek.length,
      firstExceededDate: null,
      suggestedEndsOn: null,
      periodLabel: null,
      existingPlannedInWeek: 0,
    };
  }
  // ... rest of existing function unchanged
```

- [ ] **Step 5: Update `createAdHocSession` to handle group input**

In `createAdHocSession`, after the tutor conflict check and before `createSession`, add group handling:

```ts
  // Resolve group members if groupId is provided
  let sessionEnrollmentId: string | undefined = input.enrollmentId || undefined;
  let resolvedStudentIds = input.studentIds;

  if (input.groupId) {
    const group = await getGroupWithMembers(input.groupId);
    if (!group) throw new Error("Group not found");
    sessionEnrollmentId = undefined;
    resolvedStudentIds = group.enrollments.map((e) => e.studentId);
  }
```

Then update the session creation and attendance fan-out to use the resolved values:
```ts
  const session = await createSession({
    enrollmentId: sessionEnrollmentId,
    tutorId: input.tutorId,
    subjectId: input.subjectId,
    scheduledFor,
    durationMinutes: duration,
    room: input.room || undefined,
    notes: input.notes || undefined,
  });

  if (input.groupId) {
    const group = await getGroupWithMembers(input.groupId);
    for (const enrollment of group!.enrollments) {
      await createSessionAttendance({
        sessionId: session.id,
        studentId: enrollment.studentId,
        enrollmentId: enrollment.id,
      });
    }
  } else {
    const enrollment = sessionEnrollmentId
      ? await prisma.enrollment.findUnique({ where: { id: sessionEnrollmentId } })
      : null;
    for (const studentId of resolvedStudentIds) {
      await createSessionAttendance({
        sessionId: session.id,
        studentId,
        enrollmentId: enrollment?.id,
      });
    }
  }
```

- [ ] **Step 6: Fix `splitRecurrenceRule` to handle group rules**

In `splitRecurrenceRule`, find the part that creates the new rule after a split:
```ts
  return createRecurrenceRule({
    enrollmentId: rule.enrollmentId,
    dayOfWeek: newParams.dayOfWeek ?? rule.dayOfWeek,
    ...
  });
```

Replace with:
```ts
  return createRecurrenceRule({
    enrollmentId: rule.enrollmentId ?? undefined,
    groupId: rule.groupId ?? undefined,
    dayOfWeek: newParams.dayOfWeek ?? rule.dayOfWeek,
    startTime: newParams.startTime ?? rule.startTime,
    durationMinutes: newParams.durationMinutes ?? rule.durationMinutes,
    intervalWeeks: newParams.intervalWeeks ?? rule.intervalWeeks,
    room:
      newParams.room !== undefined
        ? newParams.room ?? undefined
        : rule.room ?? undefined,
    color: rule.color ?? undefined,
    startsOn: splitDay,
    endsOn: rule.endsOn ? new Date(rule.endsOn) : undefined,
  });
```

Also fix the in-place update case (split at or before rule start):
```ts
  if (splitDay <= ruleStart) {
    return prisma.recurrenceRule.update({
      where: { id: ruleId },
      data: {
        startTime: newParams.startTime ?? rule.startTime,
        durationMinutes: newParams.durationMinutes ?? rule.durationMinutes,
        room: newParams.room !== undefined ? newParams.room : rule.room,
        intervalWeeks: newParams.intervalWeeks ?? rule.intervalWeeks,
        dayOfWeek: newParams.dayOfWeek ?? rule.dayOfWeek,
      },
    });
  }
```
(This part is already fine — it doesn't touch `enrollmentId` or `groupId`.)

- [ ] **Step 7: Export `getActiveRecurrenceRulesForGroup` from service**

At the bottom of `lib/services/sessions.ts`, add to the export list:
```ts
export { getSession, getSessionsByWeek, getSessionsByMonth, autoCompletePassedSessions, getActiveRecurrenceRulesForGroup };
```

- [ ] **Step 8: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: clean or only remaining errors in UI files not yet updated.

- [ ] **Step 9: Commit**

```bash
git add lib/services/sessions.ts
git commit -m "feat: add group session materialization and group-aware schedule creation"
```

---

## Task 9: Server actions

**Files:**
- Modify: `app/actions/enrollments.ts`
- Modify: `app/actions/sessions.ts`

- [ ] **Step 1: Add group actions to `app/actions/enrollments.ts`**

Add imports:
```ts
import { listGroups } from "@/lib/data/groups";
import { listGroupsForTutorSubject } from "@/lib/services/groups";
```

Add actions at the bottom:
```ts
export async function listGroupsForTutorSubjectAction(
  tutorId: string,
  subjectId: string
) {
  await requireAdmin();
  return listGroupsForTutorSubject(tutorId, subjectId);
}

export async function listAllGroupsAction() {
  await requireAdmin();
  return listGroups();
}
```

- [ ] **Step 2: Add group recurrence rule action to `app/actions/sessions.ts`**

Add import:
```ts
import { getActiveRecurrenceRulesForGroup } from "@/lib/data/sessions";
```

Add action at the bottom:
```ts
export async function getActiveRecurrenceRulesForGroupAction(groupId: string) {
  await requireAdmin();
  return getActiveRecurrenceRulesForGroup(groupId);
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/actions/enrollments.ts app/actions/sessions.ts
git commit -m "feat: add group server actions"
```

---

## Task 10: Enrollment form — group field

**Files:**
- Modify: `app/(protected)/enrollments/components/new-enrollment-form.tsx`

- [ ] **Step 1: Add `Group` type and update `Package` type**

At the top of the file, update the existing `type Package` to include `lessonType`:
```ts
type Package = {
  id: string;
  name: string;
  type: string;
  lessonType: string;
  basePrice: string;
  subjectId: string | null;
};
```

After the `Package` type, add:
```ts
type Group = {
  id: string;
  name: string;
  tutorId: string;
  subjectId: string;
  memberCount: number;
};
```

Add `groups` to the function props:
```ts
export function NewEnrollmentForm({
  students,
  tutors,
  subjects,
  packages,
  groups,
  defaultStudentId,
  onSuccess,
}: {
  students: Student[];
  tutors: Tutor[];
  subjects: Subject[];
  packages: Package[];
  groups: Group[];
  defaultStudentId?: string;
  onSuccess?: () => void;
}) {
```

- [ ] **Step 2: Add state and watchers for group field**

Inside the component, after the `selectedPackage` line:
```ts
  const selectedTutorId = useWatch({ control: form.control, name: "tutorId" });
  const selectedSubjectId2 = useWatch({ control: form.control, name: "subjectId" });

  const isGroupPackage = selectedPackage?.lessonType === "GROUP";

  // For the group field: track whether user is creating a new group
  const [creatingNewGroup, setCreatingNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const availableGroups = groups.filter(
    (g) =>
      (!selectedTutorId || g.tutorId === selectedTutorId) &&
      (!selectedSubjectId2 || g.subjectId === selectedSubjectId2)
  );
```

- [ ] **Step 3: Clear group when tutor/subject changes**

Add inside the existing `useEffect` that fires when `selectedPackageId` changes:
```ts
  useEffect(() => {
    form.setValue("groupId", "");
    setCreatingNewGroup(false);
    setNewGroupName("");
  }, [selectedTutorId, selectedSubjectId2]);
```

- [ ] **Step 4: Add group field JSX after the Tutor field**

After the closing `</FormField>` for the tutor field and before the dates grid, add:
```tsx
        {/* Group — only for GROUP packages */}
        {isGroupPackage && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Group</label>
            {!creatingNewGroup ? (
              <div className="flex gap-2">
                <SearchableSelect
                  options={[
                    ...availableGroups.map((g) => ({
                      value: g.id,
                      label: `${g.name} (${g.memberCount} student${g.memberCount !== 1 ? "s" : ""})`,
                    })),
                  ]}
                  value={form.watch("groupId") ?? ""}
                  onChange={(v) => form.setValue("groupId", v)}
                  placeholder={
                    !selectedTutorId || !selectedSubjectId2
                      ? "Select tutor & subject first"
                      : availableGroups.length === 0
                      ? "No groups yet — create one"
                      : "Select a group..."
                  }
                  disabled={!selectedTutorId || !selectedSubjectId2}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCreatingNewGroup(true);
                    form.setValue("groupId", "");
                  }}
                >
                  New
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={newGroupName}
                  onChange={(e) => {
                    setNewGroupName(e.target.value);
                    form.setValue("newGroupName", e.target.value);
                  }}
                  placeholder="Group name (e.g. Monday Math Beginners)"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCreatingNewGroup(false);
                    setNewGroupName("");
                    form.setValue("newGroupName", "");
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
            {isGroupPackage && !form.watch("groupId") && !newGroupName && (
              <p className="text-xs text-destructive">Group is required for group packages</p>
            )}
          </div>
        )}
```

You will need to add `"newGroupName"` handling to `useForm` defaultValues:
```ts
    defaultValues: {
      studentId: defaultStudentId ?? "",
      packageId: "",
      tutorId: "",
      subjectId: "",
      startDate: new Date().toISOString().split("T")[0],
      endDate: "",
      customPriceOverride: "",
      groupId: "",
      newGroupName: "",
    },
```

- [ ] **Step 5: Guard the submit against missing group**

In the `onSubmit` function, add before calling `createEnrollmentAction`:
```ts
    if (isGroupPackage && !values.groupId && !values.newGroupName) {
      toast.error("Please select or create a group for this enrollment");
      return;
    }
```

- [ ] **Step 6: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add "app/(protected)/enrollments/components/new-enrollment-form.tsx"
git commit -m "feat: add group field to enrollment form for GROUP packages"
```

---

## Task 11: Enrollment page + dialog — pass groups

**Files:**
- Modify: `app/(protected)/enrollments/page.tsx`
- Modify: `app/(protected)/enrollments/components/new-enrollment-dialog.tsx`

- [ ] **Step 1: Fetch groups and include `lessonType` in packages mapping in `enrollments/page.tsx`**

Add import:
```ts
import { listGroups } from "@/lib/data/groups";
```

Add to the `Promise.all` array:
```ts
  const [enrollments, studentsData, tutorsData, subjects, packages, groups] =
    await Promise.all([
      listEnrollments({ status: "ACTIVE" }),
      listStudents({ status: "ACTIVE", pageSize: 200 }),
      listTutors({ status: "ACTIVE" }),
      listSubjects(),
      listPackages(true),
      listGroups(),
    ]);
```

Update the packages mapping passed to `NewEnrollmentDialog` to include `lessonType`:
```tsx
            packages={packages.map((p) => ({
              id: p.id,
              name: p.name,
              type: p.type,
              lessonType: p.lessonType,
              basePrice: p.basePrice.toString(),
              subjectId: p.subjectId,
            }))}
```

Pass groups to `NewEnrollmentDialog`:
```tsx
            groups={groups.map((g) => ({
              id: g.id,
              name: g.name,
              tutorId: g.tutorId,
              subjectId: g.subjectId,
              memberCount: g.enrollments.filter(e => e.status === "ACTIVE").length,
            }))}
```

- [ ] **Step 2: Update `new-enrollment-dialog.tsx` to accept and pass groups**

Add `Group` type and prop:
```ts
type Group = { id: string; name: string; tutorId: string; subjectId: string; memberCount: number };
```

Add `groups` to props of `NewEnrollmentDialog` and thread it through to `NewEnrollmentForm`:
```tsx
export function NewEnrollmentDialog({ ..., groups }: { ...; groups: Group[] }) {
  ...
  <NewEnrollmentForm
    ...
    groups={groups}
  />
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "app/(protected)/enrollments/page.tsx" "app/(protected)/enrollments/components/new-enrollment-dialog.tsx"
git commit -m "feat: pass groups data to enrollment form"
```

---

## Task 12: Session form — groups in enrollment dropdown

**Files:**
- Modify: `app/(protected)/schedule/components/new-session-form.tsx`

- [ ] **Step 1: Add `Group` type and prop**

After the existing `type Enrollment`:
```ts
type Group = {
  id: string;
  label: string;
  tutorId: string;
  subjectId: string;
  memberCount: number;
};
```

Add `groups` to `NewSessionForm` props:
```ts
export function NewSessionForm({
  tutors,
  subjects,
  enrollments,
  groups,
  defaultDate,
  onSuccess,
}: {
  tutors: Tutor[];
  subjects: Subject[];
  enrollments: Enrollment[];
  groups: Group[];
  defaultDate?: Date;
  onSuccess?: () => void;
}) {
```

- [ ] **Step 2: Add state for selected group and active group rules**

Add alongside `activeRules` state:
```ts
  const [activeGroupRules, setActiveGroupRules] = useState<any[]>([]);
```

Add alongside `recurringEnrollmentId` watcher:
```ts
  const recurringGroupId = useWatch({
    control: recurringForm.control,
    name: "groupId",
  });
  const adHocGroupId = useWatch({
    control: adHocForm.control,
    name: "groupId",
  });
```

- [ ] **Step 3: Add default values for new fields**

In `adHocForm` defaultValues, add:
```ts
      groupId: "",
```

In `recurringForm` defaultValues, add:
```ts
      groupId: "",
```

- [ ] **Step 4: Auto-fill tutor+subject when group is selected in recurring form**

Add a `useEffect` after the existing enrollment auto-fill effects:
```ts
  useEffect(() => {
    if (!recurringGroupId) {
      setActiveGroupRules([]);
      return;
    }
    const group = groups.find((g) => g.id === recurringGroupId);
    if (group) {
      // No enrollment to auto-fill, but clear enrollmentId
      recurringForm.setValue("enrollmentId", "");
    }
    let cancelled = false;
    getActiveRecurrenceRulesForGroupAction(recurringGroupId)
      .then((rules) => { if (!cancelled) setActiveGroupRules(rules); })
      .catch(() => { if (!cancelled) setActiveGroupRules([]); });
    return () => { cancelled = true; };
  }, [recurringGroupId]);
```

Also add the import at the top of the file:
```ts
import { getActiveRecurrenceRulesForGroupAction } from "@/app/actions/sessions";
```

- [ ] **Step 5: Update the recurring enrollment dropdown to show groups**

Find the `<FormField ... name="enrollmentId"` in the recurring tab. Replace the `<SearchableSelect>` inside it with a version that renders two sections — enrollments first, then a divider, then groups. Since `SearchableSelect` uses `Command`, add a second `CommandGroup`:

Replace the `<SearchableSelect>` in the recurring enrollment field with direct `Popover/Command` markup:

```tsx
                  <FormControl>
                    <Popover open={recurEnrollOpen} onOpenChange={setRecurEnrollOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between font-normal"
                        >
                          {recurringGroupId
                            ? groups.find((g) => g.id === recurringGroupId)?.label ?? "Group"
                            : field.value
                            ? enrollments.find((e) => e.id === field.value)?.label ?? "Enrollment"
                            : <span className="text-muted-foreground">Search enrollments or groups...</span>}
                          <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search..." />
                          <CommandEmpty>No results found.</CommandEmpty>
                          <CommandGroup heading="Individual Enrollments" className="max-h-40 overflow-y-auto">
                            {enrollments.map((e) => (
                              <CommandItem
                                key={e.id}
                                value={e.label}
                                onSelect={() => {
                                  field.onChange(e.id);
                                  recurringForm.setValue("groupId", "");
                                  setRecurEnrollOpen(false);
                                }}
                              >
                                <CheckIcon className={cn("mr-2 h-4 w-4 shrink-0", field.value === e.id ? "opacity-100" : "opacity-0")} />
                                {e.label}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                          {groups.length > 0 && (
                            <CommandGroup heading="Groups" className="max-h-40 overflow-y-auto">
                              {groups.map((g) => (
                                <CommandItem
                                  key={g.id}
                                  value={g.label}
                                  onSelect={() => {
                                    recurringForm.setValue("groupId", g.id);
                                    field.onChange("");
                                    setRecurEnrollOpen(false);
                                  }}
                                >
                                  <CheckIcon className={cn("mr-2 h-4 w-4 shrink-0", recurringGroupId === g.id ? "opacity-100" : "opacity-0")} />
                                  <span>{g.label}</span>
                                  <Badge variant="outline" className="ml-auto text-[10px]">Group · {g.memberCount}</Badge>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </FormControl>
```

Add `const [recurEnrollOpen, setRecurEnrollOpen] = useState(false);` to state declarations.

Import `Badge` if not already imported:
```ts
import { Badge } from "@/components/ui/badge";
```

- [ ] **Step 6: Update the `onRecurringSubmit` to pass `groupId`**

In `onRecurringSubmit`, the `submitValues` construction already spreads `values`. Since `groupId` is now in the form values, it will be included automatically. But ensure the `createRecurringScheduleAction` receives it (it already does since we updated the validator and service).

Also update the submit button disabled condition. Currently:
```ts
disabled={
  recurringForm.formState.isSubmitting ||
  recurringExceedsLimit ||
  hasExistingRecurring
}
```

Update:
```ts
const hasExistingGroupRecurring = activeGroupRules.length > 0;

disabled={
  recurringForm.formState.isSubmitting ||
  (recurringExceedsLimit && !recurringGroupId) ||
  (hasExistingRecurring && !recurringGroupId) ||
  hasExistingGroupRecurring
}
```

- [ ] **Step 7: Similarly update the ad-hoc form enrollment dropdown to show groups**

Apply the same two-section `Popover/Command` pattern to the ad-hoc enrollment field. When a group is selected:
- Set `adHocForm.setValue("groupId", g.id)`
- Clear `enrollmentId`
- Set `tutorId` and `subjectId` from the group

```tsx
// In the onSelect for a group in the ad-hoc dropdown:
onSelect={() => {
  adHocForm.setValue("groupId", g.id);
  field.onChange("");
  adHocForm.setValue("tutorId", g.tutorId);
  adHocForm.setValue("subjectId", g.subjectId);
  adHocForm.setValue("studentIds", []);
  setAdHocEnrollOpen(false);
}}
```

Add `const [adHocEnrollOpen, setAdHocEnrollOpen] = useState(false);`.

- [ ] **Step 8: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add "app/(protected)/schedule/components/new-session-form.tsx"
git commit -m "feat: add groups section to session scheduling form"
```

---

## Task 13: Schedule page + dialog — pass groups

**Files:**
- Modify: `app/(protected)/schedule/page.tsx`
- Modify: `app/(protected)/schedule/components/schedule-view.tsx`
- Modify: `app/(protected)/schedule/components/new-session-dialog.tsx`

- [ ] **Step 1: Fetch groups in `schedule/page.tsx`**

Add import:
```ts
import { listGroups } from "@/lib/data/groups";
```

Add to `Promise.all`:
```ts
  const [
    { realSessions: sessions, virtualSessions, paidMonths },
    tutorsData,
    subjects,
    enrollments,
    groups,
  ] = await Promise.all([
    getMonthSchedule(monthStart),
    listTutors({ status: "ACTIVE" }),
    listSubjects(),
    listEnrollments({ status: "ACTIVE" }),
    listGroups(),
  ]);
```

Pass to `ScheduleView`:
```tsx
      groups={groups.map((g) => ({
        id: g.id,
        label: `${g.name} · ${g.enrollments.length} students`,
        tutorId: g.tutorId,
        subjectId: g.subjectId,
        memberCount: g.enrollments.length,
      }))}
```

- [ ] **Step 2: Update `schedule-view.tsx` to accept and forward groups**

Add `Group` type and prop, thread through to `NewSessionDialog`:
```ts
type Group = { id: string; label: string; tutorId: string; subjectId: string; memberCount: number };

export function ScheduleView({
  ...
  groups,
}: {
  ...
  groups: Group[];
}) {
```

Pass to `NewSessionDialog`:
```tsx
<NewSessionDialog
  ...existing props...
  groups={groups}
/>
```

- [ ] **Step 3: Update `new-session-dialog.tsx` to accept and forward groups**

Add `Group` type and prop, thread through to `NewSessionForm`:
```ts
type Group = { id: string; label: string; tutorId: string; subjectId: string; memberCount: number };

export function NewSessionDialog({ ..., groups }: { ...; groups: Group[] }) {
  ...
  <NewSessionForm
    ...
    groups={groups}
  />
```

- [ ] **Step 4: Verify TypeScript — full clean build**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(protected)/schedule/page.tsx" "app/(protected)/schedule/components/schedule-view.tsx" "app/(protected)/schedule/components/new-session-dialog.tsx"
git commit -m "feat: pass groups to schedule session form"
```

---

## Task 14: Smoke test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Create a GROUP package (if one doesn't exist)**

Go to Packages, create a package with lesson type GROUP.

- [ ] **Step 3: Create two enrollments for the same group**

Go to Enrollments → New Enrollment.
- Select a student, pick the GROUP package, select a tutor and subject.
- The Group field should appear. Type a name (e.g. "Test Group A") and click New.
- Submit. Enrollment 1 created.

Create a second enrollment for a different student:
- Same package, tutor, subject.
- The Group field should show "Test Group A" in the dropdown — pick it.
- Submit. Enrollment 2 created.

- [ ] **Step 4: Schedule a recurring group session**

Go to Schedule → New Session → Recurring tab.
- The enrollment dropdown should show a "Groups" section.
- Select "Test Group A · 2 students".
- Pick Monday, set time 10:00, duration 60, start today.
- Submit.

Verify in the calendar: one session block appears for Monday at 10:00.
Click it → session detail should show both students in attendance.

- [ ] **Step 5: Verify auto-complete sets attendance to COMPLETED**

The auto-complete runs on page load for past sessions. Manually set `scheduledFor` to a past time in the DB or wait — or check the `autoCompletePassedSessions` logic is correct by reviewing what it does.

- [ ] **Step 6: Verify session counts**

Go to each student's enrollment. Their session count for the week should reflect the group session.
