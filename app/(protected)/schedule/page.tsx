import { getMonthSchedule } from "@/lib/services/sessions";
import { listTutors } from "@/lib/data/tutors";
import { listSubjects } from "@/lib/data/subjects";
import { listEnrollments } from "@/lib/data/enrollments";
import { listGroups } from "@/lib/data/groups";
import {
  getCalendarMonthKey,
  getConfiguredCenterTimeZone,
} from "@/lib/services/session-dates";
import { ScheduleView } from "./components/schedule-view";
import { getSchedulePaymentStatus } from "@/lib/services/schedule-payment-status";
import { idSchema, monthSchema } from "@/lib/validators/common";

export const dynamic = "force-dynamic";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    session?: string;
    recurrence?: string;
  }>;
}) {
  const centerTimeZone = getConfiguredCenterTimeZone();
  const query = await searchParams;
  const fallbackMonthKey = getCalendarMonthKey(new Date(), centerTimeZone);
  const parsedMonth = monthSchema.safeParse(query.month);
  const monthKey = parsedMonth.success ? parsedMonth.data : fallbackMonthKey;
  const parsedSessionId = idSchema.safeParse(query.session);
  const parsedRecurrenceId = idSchema.safeParse(query.recurrence);

  const [
    {
      realSessions: sessions,
      virtualSessions,
      paidMonths,
      subscriptionEnrollmentIds,
    },
    tutorsData,
    subjects,
    enrollments,
    groups,
  ] = await Promise.all([
    getMonthSchedule(monthKey),
    listTutors({ status: "ACTIVE" }),
    listSubjects(),
    listEnrollments({ status: "ACTIVE" }),
    listGroups(),
  ]);
  const privateEnrollments = enrollments.filter(
    (enrollment) => enrollment.package.lessonType === "PRIVATE"
  );

  return (
    <ScheduleView
      monthKey={monthKey}
      initialSessionId={parsedSessionId.success ? parsedSessionId.data : null}
      initialRecurrenceId={
        parsedRecurrenceId.success ? parsedRecurrenceId.data : null
      }
      centerTimeZone={centerTimeZone}
      sessions={sessions.map((s) => ({
        id: s.id,
        scheduledFor: s.scheduledFor.toISOString(),
        durationMinutes: s.durationMinutes,
        status: s.status as string,
        room: s.room,
        notes: s.notes,
        tutor: { firstName: s.tutor.firstName, lastName: s.tutor.lastName },
        subject: { name: s.subject.name },
        enrollmentStudent: s.enrollment?.student
          ? {
              firstName: s.enrollment.student.firstName,
              lastName: s.enrollment.student.lastName,
            }
          : null,
        attendance: s.attendance.map((a) => ({
          studentId: a.studentId,
          status: a.status,
          billable: a.billable,
          student: {
            firstName: a.student.firstName,
            lastName: a.student.lastName,
          },
        })),
        enrollmentId: s.enrollmentId,
        groupId: s.recurrenceRule?.groupId ?? null,
        groupName: s.recurrenceRule?.group?.name ?? null,
        recurrenceRuleId: s.recurrenceRuleId,
        virtual: false as const,
        ruleId: s.recurrenceRuleId,
        startTime: s.recurrenceRule?.startTime ?? null,
        dayOfWeek: s.recurrenceRule?.dayOfWeek ?? null,
        intervalWeeks: s.recurrenceRule?.intervalWeeks ?? null,
        color: s.recurrenceRule?.color ?? null,
        isPaid: getSchedulePaymentStatus({
          enrollmentId: s.enrollmentId,
          monthKey: getCalendarMonthKey(
            s.scheduledFor,
            centerTimeZone,
          ),
          subscriptionEnrollmentIds,
          paidMonths,
        }),
      }))}
      virtualSessions={virtualSessions.map((v) => ({
        ...v,
        isPaid: getSchedulePaymentStatus({
          enrollmentId: v.enrollmentId,
          monthKey: getCalendarMonthKey(
            new Date(v.scheduledFor),
            centerTimeZone,
          ),
          subscriptionEnrollmentIds,
          paidMonths,
        }),
      }))}
      tutors={tutorsData.tutors.map((t) => ({
        id: t.id,
        name: `${t.firstName} ${t.lastName}`,
        subjectIds: t.subjects.map((ts) => ts.subjectId),
      }))}
      subjects={subjects}
      enrollments={privateEnrollments.map((e) => ({
        id: e.id,
        label: `${e.student.firstName} ${e.student.lastName} — ${e.package.name}`,
        studentName: `${e.student.firstName} ${e.student.lastName}`,
        studentId: e.studentId,
        tutorId: e.tutorId,
        tutorName: `${e.tutor.firstName} ${e.tutor.lastName}`,
        subjectId: e.subjectId,
        subjectName: e.subject.name,
        sessionsPerWeek: e.package?.sessionsPerWeek ?? null,
        packageName: e.package?.name ?? null,
        packageType: e.package.type,
        lessonType: e.package.lessonType,
      }))}
      groups={groups.map((g) => ({
        ...(() => {
          const packageNames = [...new Set(g.enrollments.map((e) => e.package.name))];
          const firstPackage = g.enrollments[0]?.package;
          return {
            packageName: packageNames.join(", "),
            packageType: firstPackage?.type ?? null,
            sessionsPerWeek: firstPackage?.sessionsPerWeek ?? null,
          };
        })(),
        id: g.id,
        label: g.name,
        tutorId: g.tutorId,
        tutorName: `${g.tutor.firstName} ${g.tutor.lastName}`,
        subjectId: g.subjectId,
        subjectName: g.subject.name,
        memberCount: g.enrollments.length,
      }))}
    />
  );
}
