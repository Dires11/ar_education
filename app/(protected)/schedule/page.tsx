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

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const centerTimeZone = getConfiguredCenterTimeZone();
  const monthKey = getCalendarMonthKey(new Date(), centerTimeZone);

  const [
    { realSessions: sessions, virtualSessions, paidMonths },
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
        isPaid: s.enrollmentId
          ? paidMonths.has(
              `${s.enrollmentId}:${getCalendarMonthKey(
                s.scheduledFor,
                centerTimeZone,
              )}`,
            )
          : null as boolean | null,
      }))}
      virtualSessions={virtualSessions.map((v) => ({
        ...v,
        isPaid: v.enrollmentId
          ? paidMonths.has(
              `${v.enrollmentId}:${getCalendarMonthKey(
                new Date(v.scheduledFor),
                centerTimeZone,
              )}`,
            )
          : null,
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
