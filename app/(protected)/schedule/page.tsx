import {
  getMonthSchedule,
  autoCompletePassedSessions,
} from "@/lib/services/sessions";
import { listTutors } from "@/lib/data/tutors";
import { listSubjects } from "@/lib/data/subjects";
import { listEnrollments } from "@/lib/data/enrollments";
import { format, startOfMonth, parse } from "date-fns";
import { ScheduleView } from "./components/schedule-view";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;

  const monthStart = params.month
    ? startOfMonth(parse(params.month, "yyyy-MM-dd", new Date()))
    : startOfMonth(new Date());

  autoCompletePassedSessions().catch(console.error); // fire-and-forget

  const [
    { realSessions: sessions, virtualSessions, paidMonths },
    tutorsData,
    subjects,
    enrollments,
  ] = await Promise.all([
    getMonthSchedule(monthStart),
    listTutors({ status: "ACTIVE" }),
    listSubjects(),
    listEnrollments({ status: "ACTIVE" }),
  ]);

  return (
    <ScheduleView
      monthStart={monthStart}
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
          student: {
            firstName: a.student.firstName,
            lastName: a.student.lastName,
          },
        })),
        enrollmentId: s.enrollmentId,
        recurrenceRuleId: s.recurrenceRuleId,
        virtual: false as const,
        ruleId: s.recurrenceRuleId,
        startTime: s.recurrenceRule?.startTime ?? null,
        dayOfWeek: s.recurrenceRule?.dayOfWeek ?? null,
        intervalWeeks: s.recurrenceRule?.intervalWeeks ?? null,
        color: s.recurrenceRule?.color ?? null,
        isPaid: s.enrollmentId
          ? paidMonths.has(`${s.enrollmentId}:${format(s.scheduledFor, "yyyy-MM")}`)
          : null as boolean | null,
      }))}
      virtualSessions={virtualSessions.map((v) => ({
        ...v,
        isPaid: paidMonths.has(`${v.enrollmentId}:${format(new Date(v.scheduledFor), "yyyy-MM")}`),
      }))}
      tutors={tutorsData.tutors.map((t) => ({
        id: t.id,
        name: `${t.firstName} ${t.lastName}`,
        subjectIds: t.subjects.map((ts) => ts.subjectId),
      }))}
      subjects={subjects}
      enrollments={enrollments.map((e) => ({
        id: e.id,
        label: `${e.student.firstName} ${e.student.lastName} — ${e.subject.name}`,
        studentId: e.studentId,
        tutorId: e.tutorId,
        subjectId: e.subjectId,
        sessionsPerWeek: e.package?.sessionsPerWeek ?? null,
        packageName: e.package?.name ?? null,
      }))}
    />
  );
}
