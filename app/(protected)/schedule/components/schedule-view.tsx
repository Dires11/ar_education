"use client";

import { useState, useTransition, useRef } from "react";
import { format } from "date-fns";
import { MonthCalendar, type CalendarSession } from "./week-calendar";
import { NewSessionDialog } from "./new-session-dialog";
import { PageHero } from "@/components/page-hero";
import { fetchScheduleForMonth } from "@/app/actions/sessions";
import type { VirtualSession } from "@/lib/services/sessions";
import {
  CalendarDaysIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  UsersIcon,
} from "lucide-react";

type Tutor = { id: string; name: string; subjectIds: string[] };
type Subject = { id: string; name: string };
type Enrollment = {
  id: string;
  label: string;
  studentId: string;
  tutorId: string;
  subjectId: string;
  sessionsPerWeek?: number | null;
  packageName?: string | null;
};

function mergeAll(
  sessions: CalendarSession[],
  virtualSessions: VirtualSession[]
): CalendarSession[] {
  return [
    ...sessions,
    ...virtualSessions.map((v) => ({
      ...v,
      notes: null as string | null,
      recurrenceRuleId: null as string | null,
      virtual: true as const,
    })),
  ];
}

export function ScheduleView({
  monthStart: initialMonthStart,
  sessions: initialSessions,
  virtualSessions: initialVirtual,
  tutors,
  subjects,
  enrollments,
}: {
  monthStart: Date;
  sessions: CalendarSession[];
  virtualSessions: VirtualSession[];
  tutors: Tutor[];
  subjects: Subject[];
  enrollments: Enrollment[];
}) {
  const [isPending, startTransition] = useTransition();
  const [monthStart, setMonthStart] = useState(initialMonthStart);
  const [allSessions, setAllSessions] = useState<CalendarSession[]>(
    mergeAll(initialSessions, initialVirtual)
  );
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const navVersion = useRef(0);

  function navigate(newMonth: Date) {
    setSelectedDay(null);
    const param = format(newMonth, "yyyy-MM-dd");
    window.history.replaceState(null, "", `/schedule?month=${param}`);
    const version = ++navVersion.current;
    startTransition(async () => {
      const data = await fetchScheduleForMonth(param);
      if (navVersion.current !== version) return;
      setMonthStart(newMonth);
      setAllSessions(mergeAll(data.sessions as CalendarSession[], data.virtual as VirtualSession[]));
    });
  }

  function refresh() {
    const param = format(monthStart, "yyyy-MM-dd");
    startTransition(async () => {
      const data = await fetchScheduleForMonth(param);
      setAllSessions(mergeAll(data.sessions as CalendarSession[], data.virtual as VirtualSession[]));
    });
  }

  const completedCount = allSessions.filter((s) => s.status === "COMPLETED").length;
  const upcomingCount = allSessions.filter((s) =>
    ["SCHEDULED", "VIRTUAL_UPCOMING"].includes(s.status)
  ).length;
  const missedOrCanceledCount = allSessions.filter((s) =>
    [
      "NO_SHOW",
      "CANCELLED_BY_TUTOR",
      "CANCELLED_BY_STUDENT",
    ].includes(s.status)
  ).length;

  return (
    <div className="space-y-6">
      <PageHero
        label="Session Calendar"
        title="Schedule"
        description="Plan one-time and recurring sessions, track package limits, and manage attendance from the monthly calendar."
        gradient="from-cyan-50 via-background to-teal-50"
        stats={[
          { icon: CalendarDaysIcon, label: "This Month", value: format(monthStart, "MMM yyyy") },
          { icon: CheckCircle2Icon, label: "Completed", value: completedCount },
          { icon: UsersIcon, label: "Upcoming", value: upcomingCount },
          { icon: AlertCircleIcon, label: "Missed/Cancelled", value: missedOrCanceledCount },
        ]}
        action={
          <NewSessionDialog
            tutors={tutors}
            subjects={subjects}
            enrollments={enrollments}
            defaultDate={selectedDay ?? undefined}
            onSuccess={refresh}
          />
        }
      />

      <MonthCalendar
        monthStart={monthStart}
        sessions={allSessions}
        selectedDay={selectedDay}
        onDaySelect={setSelectedDay}
        onNavigate={navigate}
        onRefresh={refresh}
        isPending={isPending}
      />
    </div>
  );
}
